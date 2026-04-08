from __future__ import annotations

import json
import uuid

from pyscript import ffi, window

from clinical_contract.loader import load_contract, load_raw
from clinical_contract.contract import DataContract, _materialize_data_source, _cleanup_temp_path

_PREVIEW_SESSIONS: dict[str, dict[str, object]] = {}
_PREVIEW_MAX_PAGE_SIZE = 200


def _buffer_to_bytes(buffer_proxy):
    if hasattr(buffer_proxy, "to_bytes"):
        return buffer_proxy.to_bytes()
    if hasattr(buffer_proxy, "to_py"):
        converted = buffer_proxy.to_py()
        return bytes(converted)
    return bytes(buffer_proxy)


def _safe_path_literal(source_path: str) -> str:
    return source_path.replace("'", "''")


def _resolve_source_relation(conn, source_path_literal: str, ext: str, file_name: str = "") -> tuple[str, list[tuple]]:
    preferred_ext = file_name.lower().rsplit(".", 1)[-1] if "." in file_name else ""

    read_specs = []
    if preferred_ext == "parquet" or ext == ".parquet":
        read_specs.extend(
            [
                ("parquet", f"read_parquet('{source_path_literal}')"),
                ("csv", f"read_csv_auto('{source_path_literal}')"),
            ]
        )
    elif preferred_ext == "csv" or ext == ".csv":
        read_specs.extend(
            [
                ("csv", f"read_csv_auto('{source_path_literal}')"),
                ("parquet", f"read_parquet('{source_path_literal}')"),
            ]
        )
    else:
        read_specs.extend(
            [
                ("parquet", f"read_parquet('{source_path_literal}')"),
                ("csv", f"read_csv_auto('{source_path_literal}')"),
            ]
        )

    errors: list[str] = []
    for reader_name, relation_sql in read_specs:
        try:
            describe_rows = conn.execute(f"DESCRIBE SELECT * FROM {relation_sql}").fetchall()
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


def py_run_contract_check(yaml_text: str, data_buffer) -> str:
    validate = _validate_payload(yaml_text)
    if not validate["success"]:
        return json.dumps(
            {
                "validate": validate,
                "schema_rows": [],
                "quality_rows": [],
                "schema_success": False,
                "report_summary": "Validation failed.",
                "error": "YAML structure is invalid.",
            }
        )

    try:
        contract, _ = load_contract(yaml_text)
    except Exception as exc:
        return json.dumps(
            {
                "validate": validate,
                "schema_rows": [],
                "quality_rows": [],
                "schema_success": False,
                "report_summary": "Contract loading failed.",
                "error": str(exc),
            }
        )

    data_bytes = _buffer_to_bytes(data_buffer)

    try:
        schema_reports = contract.check_schema(data_bytes)
    except Exception as exc:
        return json.dumps(
            {
                "validate": validate,
                "schema_rows": [],
                "quality_rows": [],
                "schema_success": False,
                "report_summary": "Schema validation failed.",
                "error": str(exc),
            }
        )

    schema_rows = []
    schema_success = True
    for schema_report in schema_reports:
        if not schema_report.success:
            schema_success = False
        for column in schema_report.columns:
            schema_rows.append(
                {
                    "schema_name": schema_report.schema_name,
                    "column": column.column,
                    "yaml_type": column.yaml_type,
                    "parquet_type": column.parquet_type,
                    "status": column.status.value,
                }
            )

    if not schema_success:
        return json.dumps(
            {
                "validate": validate,
                "schema_rows": schema_rows,
                "quality_rows": [],
                "schema_success": False,
                "report_summary": "Schema invalid — quality checks cancelled.",
                "error": "At least one required column is missing or has an incompatible type.",
            }
        )

    report = contract.check(data_bytes, backend="duckdb")
    quality_rows = []
    for result in report.results:
        quality_rows.append(
            {
                "schema_name": result.schema_name,
                "property_name": result.property_name,
                "description": result.description,
                "status": result.status.value,
                "obtained": result.obtained if result.obtained is not None else "error",
                "expected": result.expected,
            }
        )

    return json.dumps(
        {
            "validate": validate,
            "schema_rows": schema_rows,
            "quality_rows": quality_rows,
            "schema_success": True,
            "report_summary": report.summary,
            "report_success": report.success,
            "report_code": report.code,
            "error": "",
        }
    )




def py_analyze_data_file(data_buffer) -> str:
    data_bytes = _buffer_to_bytes(data_buffer)
    source_path, temp_path, ext = _materialize_data_source(data_bytes)
    source_path_literal = _safe_path_literal(source_path)

    try:
        import duckdb
        with duckdb.connect() as conn:
            relation_sql, describe_rows = _resolve_source_relation(conn, source_path_literal, ext)
            count_row = conn.execute(
                f"SELECT COUNT(*) FROM {relation_sql}"
            ).fetchone()

        payload = {
            "columns": len(describe_rows),
            "rows": int(count_row[0] or 0),
            "summary": f"Detected {len(describe_rows)} column(s) and {int(count_row[0] or 0)} row(s)",
        }
        return json.dumps(payload)
    finally:
        _cleanup_temp_path(temp_path)


def py_prepare_data_preview(data_buffer, file_name: str = "") -> str:
    data_bytes = _buffer_to_bytes(data_buffer)
    source_path, temp_path, ext = _materialize_data_source(data_bytes)
    source_path_literal = _safe_path_literal(source_path)

    try:
        import duckdb
        with duckdb.connect() as conn:
            relation_sql, describe_rows = _resolve_source_relation(
                conn, source_path_literal, ext, file_name=file_name
            )
            count_row = conn.execute(f"SELECT COUNT(*) FROM {relation_sql}").fetchone()

        total_rows = int(count_row[0] or 0)
        columns = [str(row[0]) for row in describe_rows]
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
            rows = conn.execute(
                f"SELECT * FROM {source_relation} LIMIT {safe_page_size} OFFSET {offset}"
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
window.pyAnalyzeDataFile = ffi.create_proxy(py_analyze_data_file)
window.pyPrepareDataPreview = ffi.create_proxy(py_prepare_data_preview)
window.pyFetchDataPreviewPage = ffi.create_proxy(py_fetch_data_preview_page)
window.pyReleaseDataPreview = ffi.create_proxy(py_release_data_preview)
window.dispatchEvent(window.CustomEvent.new("clinical-python-ready"))
