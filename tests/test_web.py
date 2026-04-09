"""
Unit tests for the web bridge used by the static editor page.
"""
from __future__ import annotations

import importlib.util
import json
import sys
import types
from pathlib import Path

import pytest


YAML_VALID = """
apiVersion: v1.0.0
kind: DataContract
id: web-contract
name: Web Contract
version: 1.0.0
status: active
description:
  purpose: "Web tests"
  usage: "Bridge validation"
  limitations: "None"
schema:
  - name: patients
    physicalType: TABLE
    description: Patients table
    properties:
      - name: id
        logicalType: string
        physicalType: TEXT
        description: Patient id
        required: true
        quality:
          - type: sql
            description: No null id
            query: "SELECT COUNT(*) FROM patients WHERE id IS NULL"
            mustBe: 0
"""

YAML_INVALID = """
apiVersion: v1.0.0
kind: DataContract
schema:
  - name: patients
    physicalType: TABLE
    description: Patients table
    properties: []
"""


def _write_data_file(tmp_path: Path, rows: list[tuple[object]], ext: str) -> Path:
    duckdb = pytest.importorskip("duckdb")
    file_path = tmp_path / f"patients.{ext}"
    file_path_literal = str(file_path).replace("'", "''")

    with duckdb.connect() as conn:
        conn.execute("CREATE TABLE patients (id VARCHAR)")
        conn.executemany("INSERT INTO patients VALUES (?)", rows)
        if ext == "parquet":
            conn.execute(f"COPY patients TO '{file_path_literal}' (FORMAT PARQUET)")
        else:
            conn.execute(
                f"COPY patients TO '{file_path_literal}' (HEADER, DELIMITER ',')"
            )

    return file_path


@pytest.fixture(scope="module")
def bridge_module():
    bridge_path = Path(__file__).resolve().parents[1] / "site" / "python" / "bridge.py"
    module_name = "clinical_contract_site_bridge_test"

    saved_pyscript = sys.modules.get("pyscript")

    fake_pyscript = types.ModuleType("pyscript")

    class FakeFFI:
        @staticmethod
        def create_proxy(func):
            return func

    class FakeWindow:
        def __init__(self):
            self.CustomEvent = types.SimpleNamespace(new=lambda name: {"type": name})
            self.dispatched_events: list[dict[str, str]] = []

        def dispatchEvent(self, event):
            self.dispatched_events.append(event)

    fake_window = FakeWindow()
    fake_pyscript.ffi = FakeFFI()
    fake_pyscript.window = fake_window
    sys.modules["pyscript"] = fake_pyscript

    spec = importlib.util.spec_from_file_location(module_name, bridge_path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)

    try:
        yield module
    finally:
        # Cleanup preview sessions and temp files created during tests.
        handles = list(module._PREVIEW_SESSIONS.keys())
        for handle in handles:
            module.py_release_data_preview(handle)

        sys.modules.pop(module_name, None)
        if saved_pyscript is not None:
            sys.modules["pyscript"] = saved_pyscript
        else:
            sys.modules.pop("pyscript", None)


@pytest.fixture(autouse=True)
def clear_preview_sessions(bridge_module):
    bridge_module._PREVIEW_SESSIONS.clear()
    yield
    handles = list(bridge_module._PREVIEW_SESSIONS.keys())
    for handle in handles:
        bridge_module.py_release_data_preview(handle)


def test_bridge_bootstrap_registers_proxies_and_ready_event(bridge_module):
    assert callable(bridge_module.window.pyValidateContract)
    assert callable(bridge_module.window.pyRunContractCheck)
    assert callable(bridge_module.window.pyAnalyzeDataFile)
    assert callable(bridge_module.window.pyPrepareDataPreview)
    assert callable(bridge_module.window.pyFetchDataPreviewPage)
    assert callable(bridge_module.window.pyReleaseDataPreview)
    assert {"type": "clinical-python-ready"} in bridge_module.window.dispatched_events


def test_buffer_to_bytes_supports_to_bytes_and_to_py(bridge_module):
    class ToBytesProxy:
        @staticmethod
        def to_bytes():
            return b"abc"

    class ToPyProxy:
        @staticmethod
        def to_py():
            return bytearray(b"xyz")

    assert bridge_module._buffer_to_bytes(ToBytesProxy()) == b"abc"
    assert bridge_module._buffer_to_bytes(ToPyProxy()) == b"xyz"


def test_py_validate_contract_success_and_failure(bridge_module):
    payload_ok = json.loads(bridge_module.py_validate_contract(YAML_VALID))
    payload_ko = json.loads(bridge_module.py_validate_contract(YAML_INVALID))

    assert payload_ok["success"] is True
    assert payload_ko["success"] is False
    missing_fields = [item["field"] for item in payload_ko["fields"] if not item["present"]]
    assert "id" in missing_fields


def test_py_run_contract_check_short_circuits_when_yaml_invalid(bridge_module):
    payload = json.loads(bridge_module.py_run_contract_check(YAML_INVALID, b"dummy"))
    assert payload["validate"]["success"] is False
    assert payload["schema_success"] is False
    assert payload["quality_rows"] == []
    assert payload["error"] == "YAML structure is invalid."


def test_py_run_contract_check_success_parquet(bridge_module, tmp_path: Path):
    parquet_bytes = _write_data_file(
        tmp_path,
        rows=[("A001",), ("A002",), ("A003",)],
        ext="parquet",
    ).read_bytes()

    payload = json.loads(bridge_module.py_run_contract_check(YAML_VALID, parquet_bytes))

    assert payload["validate"]["success"] is True
    assert payload["schema_success"] is True
    assert payload["report_success"] is True
    assert payload["report_code"] == 0
    assert len(payload["schema_rows"]) == 1
    assert len(payload["quality_rows"]) == 1
    assert payload["quality_rows"][0]["status"] == "passed"


@pytest.mark.parametrize("ext", ["parquet", "csv"])
def test_py_analyze_data_file_for_parquet_and_csv(
    bridge_module,
    tmp_path: Path,
    ext: str,
):
    data_bytes = _write_data_file(
        tmp_path,
        rows=[("A001",), ("A002",), ("A003",)],
        ext=ext,
    ).read_bytes()

    payload = json.loads(bridge_module.py_analyze_data_file(data_bytes, f"patients.{ext}"))
    assert payload["columns"] == 1
    assert payload["rows"] == 3
    assert "Detected 1 column(s) and 3 row(s)" in payload["summary"]


def test_preview_prepare_fetch_pagination_and_release(bridge_module, tmp_path: Path):
    rows = [(f"A{i:03d}",) for i in range(1, 421)]
    data_bytes = _write_data_file(tmp_path, rows=rows, ext="parquet").read_bytes()

    prepare_payload = json.loads(
        bridge_module.py_prepare_data_preview(data_bytes, "patients.parquet")
    )
    assert prepare_payload["error"] == ""
    assert prepare_payload["total_rows"] == 420
    assert prepare_payload["total_pages"] == 9

    handle = prepare_payload["handle"]
    first_page = json.loads(bridge_module.py_fetch_data_preview_page(handle, page=1, page_size=50))
    assert first_page["error"] == ""
    assert first_page["page"] == 1
    assert first_page["page_size"] == 50
    assert len(first_page["rows"]) == 50
    assert first_page["rows"][0][0] == "A001"

    # Requests above max page size are clamped to bridge max (200).
    clamped_page = json.loads(
        bridge_module.py_fetch_data_preview_page(handle, page=2, page_size=999)
    )
    assert clamped_page["error"] == ""
    assert clamped_page["page_size"] == 200
    assert clamped_page["page"] == 2
    assert len(clamped_page["rows"]) == 200

    release_payload = json.loads(bridge_module.py_release_data_preview(handle))
    assert release_payload == {"released": True}

    missing_payload = json.loads(bridge_module.py_release_data_preview(handle))
    assert missing_payload == {"released": False}


def test_preview_fetch_unknown_handle_returns_explicit_error(bridge_module):
    payload = json.loads(bridge_module.py_fetch_data_preview_page("missing"))
    assert payload["error"] == "Preview session not found. Load a data file again."
    assert payload["rows"] == []
