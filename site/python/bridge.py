from __future__ import annotations

import json
import uuid
from pathlib import Path
from time import perf_counter

from pyscript import ffi, window

from clinical_contract.loader import load_contract, load_raw
from clinical_contract.contract import DataContract
from clinical_contract.data_source import _cleanup_temp_path, _materialize_data_source

_PREVIEW_SESSIONS: dict[str, dict[str, object]] = {}
_PREVIEW_MAX_PAGE_SIZE = 200


def _buffer_to_bytes(buffer_proxy):
    if hasattr(buffer_proxy, "to_bytes"):
        return buffer_proxy.to_bytes()
    if hasattr(buffer_proxy, "to_py"):
        converted = buffer_proxy.to_py()
        return bytes(converted)
    return bytes(buffer_proxy)


def _proxy_to_list(proxy) -> list:
    if hasattr(proxy, "to_py"):
        try:
            converted = proxy.to_py()
            return list(converted)
        except (TypeError, ValueError):
            pass
    try:
        return list(proxy)
    except TypeError:
        return [proxy]


def _browser_data_sources(contract, data_names_or_buffer, data_buffers=None):
    """Convert browser buffers into the public DataSources input shape."""
    if data_buffers is None:
        return _buffer_to_bytes(data_names_or_buffer)

    file_names = json.loads(str(data_names_or_buffer))
    if not isinstance(file_names, list):
        raise ValueError("Data file names must be provided as a JSON list.")

    buffers = _proxy_to_list(data_buffers)
    if len(file_names) != len(buffers):
        raise ValueError("Data file names and buffers must have the same length.")
    if len(contract.schema_) == 1 and len(buffers) == 1:
        return _buffer_to_bytes(buffers[0])

    data_sources = {}
    for file_name, buffer in zip(file_names, buffers):
        schema_name = Path(str(file_name)).stem
        if schema_name in data_sources:
            raise ValueError(
                f"Multiple data files resolve to schema '{schema_name}'. "
                "Each schema accepts exactly one file."
            )
        data_sources[schema_name] = _buffer_to_bytes(buffer)
    return data_sources


def _safe_path_literal(source_path: str) -> str:
    return source_path.replace("'", "''")

def _quote_identifier(identifier: str) -> str:
    escaped = str(identifier).replace('"', '""')
    return f'"{escaped}"'


def _resolve_source_relation(conn, source_path_literal: str, ext: str, file_name: str = "") -> tuple[str, list[tuple]]:
    preferred_ext = file_name.lower().rsplit(".", 1)[-1] if "." in file_name else ""

    if preferred_ext == "parquet" or ext == ".parquet":
        read_specs = [
            ("parquet", f"read_parquet('{source_path_literal}')"),
        ]
    elif preferred_ext == "csv" or ext == ".csv":
        read_specs = [
            ("csv", f"read_csv_auto('{source_path_literal}')"),
        ]
    else:
        read_specs = [
            ("parquet", f"read_parquet('{source_path_literal}')"),
            ("csv", f"read_csv_auto('{source_path_literal}')"),
        ]

    errors: list[str] = []
    for reader_name, relation_sql in read_specs:
        try:
            describe_rows = conn.execute(
                f"DESCRIBE SELECT * FROM {relation_sql}"
            ).fetchall()
            return relation_sql, describe_rows
        except Exception as exc:
            errors.append(f"{reader_name}: {exc}")

    raise ValueError(f"Unable to detect data file format ({'; '.join(errors)})")


def _to_jsonable(value):
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def _validate_payload(raw_text: str):
    raw = load_raw(raw_text)
    report = DataContract.validate_structure(raw)
    return {
        "success": report.success,
        "fields": [
            {
                "field": field.field,
                "present": field.present,
                "value": field.display_value,
            }
            for field in report.fields
        ],
    }


def py_validate_contract(yaml_text: str) -> str:
    payload = _validate_payload(yaml_text)
    return json.dumps(payload)


def _serialize_check_response(validate, validate_duration_ms: float, **payload) -> str:
    return json.dumps(
        {
            "validate": validate,
            "validate_duration_ms": validate_duration_ms,
            **payload,
        }
    )


def py_run_contract_check(
    yaml_text: str,
    data_names_or_buffer,
    data_buffers=None,
) -> str:
    validate_started_at = perf_counter()
    validate = _validate_payload(yaml_text)
    validate_duration_ms = (perf_counter() - validate_started_at) * 1000

    if not validate["success"]:
        return _serialize_check_response(
            validate,
            validate_duration_ms,
            schema_rows=[],
            quality_rows=[],
            schema_success=False,
            report_summary="Validation failed.",
            error="YAML structure is invalid.",
        )

    try:
        contract, _ = load_contract(yaml_text)
    except Exception as exc:
        return _serialize_check_response(
            validate,
            validate_duration_ms,
            schema_rows=[],
            quality_rows=[],
            schema_success=False,
            report_summary="Contract loading failed.",
            error=str(exc),
        )

    try:
        data_sources = _browser_data_sources(
            contract,
            data_names_or_buffer,
            data_buffers,
        )
    except Exception as exc:
        return _serialize_check_response(
            validate,
            validate_duration_ms,
            schema_rows=[],
            quality_rows=[],
            schema_success=False,
            report_summary="Data file mapping failed.",
            error=str(exc),
        )

    try:
        schema_reports = contract.check_schema(data_sources)
    except Exception as exc:
        return _serialize_check_response(
            validate,
            validate_duration_ms,
            schema_rows=[],
            quality_rows=[],
            schema_success=False,
            report_summary="Schema validation failed.",
            error=str(exc),
        )

    schema_rows = []
    schema_success = True
    valid_schema_names: set[str] = set()
    for schema_report in schema_reports:
        if not schema_report.success:
            schema_success = False
        else:
            valid_schema_names.add(schema_report.schema_name)
        if schema_report.error_message:
            schema_rows.append(
                {
                    "schema_name": schema_report.schema_name,
                    "column": "—",
                    "required": True,
                    "yaml_type": "—",
                    "parquet_type": schema_report.error_message,
                    "status": "missing",
                }
            )
        for column in schema_report.columns:
            schema_rows.append(
                {
                    "schema_name": schema_report.schema_name,
                    "column": column.column,
                    "required": column.required,
                    "yaml_type": column.yaml_type,
                    "parquet_type": column.parquet_type,
                    "status": column.status.value,
                }
            )

    report = contract.check(
        data_sources,
        backend="duckdb",
        include_schemas=valid_schema_names,
    )
    quality_rows = []
    for result in report.results:
        quality_rows.append(
            {
                "schema_name": result.schema_name,
                "property_name": result.property_name,
                "description": result.description,
                "status": result.status.value,
                "obtained": (
                    _to_jsonable(result.obtained)
                    if result.obtained is not None
                    else "error"
                ),
                "operator": result.operator.value,
                "expected": result.expected_display,
                "log": result.error_message or "",
            }
        )

    return _serialize_check_response(
        validate,
        validate_duration_ms,
        schema_rows=schema_rows,
        quality_rows=quality_rows,
        schema_success=schema_success,
        report_summary=(
            report.summary
            if schema_success
            else f"One or more schemas failed. {report.summary}"
        ),
        report_success=schema_success and report.success,
        report_code=report.code,
        error="",
    )

def _get_query_columns(conn, relation_sql: str) -> list[str]:
    cursor = conn.execute(f"SELECT * FROM {relation_sql} LIMIT 0")
    if not cursor.description:
        return []
    return [str(desc[0]) for desc in cursor.description]


def py_prepare_data_preview(data_buffer, file_name: str = "") -> str:
    data_bytes = _buffer_to_bytes(data_buffer)
    source_path, temp_path, ext = _materialize_data_source(data_bytes)
    source_path_literal = _safe_path_literal(source_path)

    try:
        import duckdb
        with duckdb.connect() as conn:
            relation_sql, _ = _resolve_source_relation(
                conn, source_path_literal, ext, file_name=file_name
            )
            query_columns = _get_query_columns(conn, relation_sql)
            count_row = conn.execute(f"SELECT COUNT(*) FROM {relation_sql}").fetchone()

            total_rows = int(count_row[0] or 0)
            columns = query_columns
        handle = uuid.uuid4().hex
        _PREVIEW_SESSIONS[handle] = {
            "source_relation": relation_sql,
            "temp_path": temp_path,
            "columns": columns,
            "total_rows": total_rows,
        }

        return json.dumps(
            {
                "handle": handle,
                "columns": columns,
                "total_rows": total_rows,
                "page_size": 50,
                "total_pages": ((total_rows + 49) // 50) if total_rows else 0,
                "error": "",
            }
        )
    except Exception as exc:
        _cleanup_temp_path(temp_path)
        return json.dumps(
            {
                "handle": "",
                "columns": [],
                "total_rows": 0,
                "page_size": 50,
                "total_pages": 0,
                "error": str(exc),
            }
        )


def py_fetch_data_preview_page(handle: str, page: int = 1, page_size: int = 50) -> str:
    session = _PREVIEW_SESSIONS.get(str(handle))
    if not session:
        return json.dumps(
            {
                "handle": handle,
                "columns": [],
                "rows": [],
                "page": 1,
                "page_size": 50,
                "total_rows": 0,
                "total_pages": 0,
                "error": "Preview session not found. Load a data file again.",
            }
        )

    try:
        source_relation = str(session.get("source_relation") or "")
        columns = list(session.get("columns") or [])
        total_rows = int(session.get("total_rows") or 0)

        safe_page_size = int(page_size)
        if safe_page_size <= 0:
            safe_page_size = 50
        safe_page_size = min(safe_page_size, _PREVIEW_MAX_PAGE_SIZE)

        total_pages = ((total_rows + safe_page_size - 1) // safe_page_size) if total_rows else 0
        safe_page = int(page)
        if total_pages == 0:
            safe_page = 1
        else:
            safe_page = max(1, min(safe_page, total_pages))
        offset = (safe_page - 1) * safe_page_size

        import duckdb
        with duckdb.connect() as conn:
            if columns:
                select_list = ", ".join(
                    f"CAST({_quote_identifier(col)} AS VARCHAR) AS {_quote_identifier(col)}"
                    for col in columns
                )
            else:
                select_list = "*"

            rows = conn.execute(
                f"SELECT {select_list} FROM {source_relation} "
                f"LIMIT {safe_page_size} OFFSET {offset}"
            ).fetchall()

        serializable_rows = [[_to_jsonable(value) for value in row] for row in rows]

        return json.dumps(
            {
                "handle": handle,
                "columns": columns,
                "rows": serializable_rows,
                "page": safe_page,
                "page_size": safe_page_size,
                "total_rows": total_rows,
                "total_pages": total_pages,
                "error": "",
            }
        )
    except Exception as exc:
        return json.dumps(
            {
                "handle": handle,
                "columns": [],
                "rows": [],
                "page": 1,
                "page_size": 50,
                "total_rows": 0,
                "total_pages": 0,
                "error": str(exc),
            }
        )


def py_release_data_preview(handle: str) -> str:
    session = _PREVIEW_SESSIONS.pop(str(handle), None)
    if not session:
        return json.dumps({"released": False})

    _cleanup_temp_path(session.get("temp_path"))  # type: ignore[arg-type]
    return json.dumps({"released": True})


window.pyValidateContract = ffi.create_proxy(py_validate_contract)
window.pyRunContractCheck = ffi.create_proxy(py_run_contract_check)
window.pyPrepareDataPreview = ffi.create_proxy(py_prepare_data_preview)
window.pyFetchDataPreviewPage = ffi.create_proxy(py_fetch_data_preview_page)
window.pyReleaseDataPreview = ffi.create_proxy(py_release_data_preview)
window.dispatchEvent(window.CustomEvent.new("clinical-python-ready"))
