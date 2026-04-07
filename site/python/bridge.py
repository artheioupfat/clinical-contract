from __future__ import annotations

import json

from pyscript import ffi, window

from clinical_contract.loader import load_contract, load_raw
from clinical_contract.contract import DataContract, _materialize_data_source, _cleanup_temp_path


def _buffer_to_bytes(buffer_proxy):
    if hasattr(buffer_proxy, "to_bytes"):
        return buffer_proxy.to_bytes()
    if hasattr(buffer_proxy, "to_py"):
        converted = buffer_proxy.to_py()
        return bytes(converted)
    return bytes(buffer_proxy)


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
    source_path_literal = source_path.replace("'", "''")

    try:
        import duckdb
        with duckdb.connect() as conn:
            if ext == ".parquet":
                describe_rows = conn.execute(
                    f"DESCRIBE SELECT * FROM read_parquet('{source_path_literal}')"
                ).fetchall()
                count_row = conn.execute(
                    f"SELECT COUNT(*) FROM read_parquet('{source_path_literal}')"
                ).fetchone()
            elif ext == ".csv":
                describe_rows = conn.execute(
                    f"DESCRIBE SELECT * FROM read_csv_auto('{source_path_literal}')"
                ).fetchall()
                count_row = conn.execute(
                    f"SELECT COUNT(*) FROM read_csv_auto('{source_path_literal}')"
                ).fetchone()
            else:
                try:
                    describe_rows = conn.execute(
                        f"DESCRIBE SELECT * FROM read_parquet('{source_path_literal}')"
                    ).fetchall()
                    count_row = conn.execute(
                        f"SELECT COUNT(*) FROM read_parquet('{source_path_literal}')"
                    ).fetchone()
                except Exception:
                    describe_rows = conn.execute(
                        f"DESCRIBE SELECT * FROM read_csv_auto('{source_path_literal}')"
                    ).fetchall()
                    count_row = conn.execute(
                        f"SELECT COUNT(*) FROM read_csv_auto('{source_path_literal}')"
                    ).fetchone()

        payload = {
            "columns": len(describe_rows),
            "rows": int(count_row[0] or 0),
            "summary": f"Detected {len(describe_rows)} column(s) and {int(count_row[0] or 0)} row(s)",
        }
        return json.dumps(payload)
    finally:
        _cleanup_temp_path(temp_path)


window.pyValidateContract = ffi.create_proxy(py_validate_contract)
window.pyRunContractCheck = ffi.create_proxy(py_run_contract_check)
window.pyAnalyzeDataFile = ffi.create_proxy(py_analyze_data_file)
window.dispatchEvent(window.CustomEvent.new("clinical-python-ready"))
