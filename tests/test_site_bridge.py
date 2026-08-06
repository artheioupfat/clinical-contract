"""Browser bridge tests without starting PyScript."""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path
from types import SimpleNamespace

import duckdb
import pytest
import yaml


def _load_bridge(monkeypatch):
    window = SimpleNamespace(
        CustomEvent=SimpleNamespace(new=lambda name: name),
        dispatchEvent=lambda _event: None,
    )
    pyscript = SimpleNamespace(
        ffi=SimpleNamespace(create_proxy=lambda function: function),
        window=window,
    )
    monkeypatch.setitem(sys.modules, "pyscript", pyscript)
    bridge_path = Path(__file__).parents[1] / "site" / "python" / "bridge.py"
    spec = importlib.util.spec_from_file_location("clinical_contract_site_bridge", bridge_path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _data_bytes(tmp_path: Path) -> tuple[bytes, bytes]:
    orders_path = tmp_path / "orders.parquet"
    lines_path = tmp_path / "line_items.csv"
    with duckdb.connect() as conn:
        conn.execute("CREATE TABLE orders (order_id VARCHAR)")
        conn.execute("INSERT INTO orders VALUES ('O-1')")
        conn.execute(
            f"COPY orders TO '{str(orders_path).replace(chr(39), chr(39) * 2)}' "
            "(FORMAT PARQUET)"
        )
        conn.execute("CREATE TABLE line_items (order_id VARCHAR)")
        conn.execute("INSERT INTO line_items VALUES ('O-1')")
        conn.execute(
            f"COPY line_items TO '{str(lines_path).replace(chr(39), chr(39) * 2)}' "
            "(HEADER, DELIMITER ',')"
        )
    return orders_path.read_bytes(), lines_path.read_bytes()


def test_browser_bridge_checks_multiple_in_memory_files(tmp_path, monkeypatch):
    bridge = _load_bridge(monkeypatch)
    orders, lines = _data_bytes(tmp_path)
    contract = """
apiVersion: v3.1.0
kind: DataContract
id: multi-table
name: Multi table
version: 1.0.0
status: active
description: {}
schema:
  - name: orders
    physicalType: table
    description: Orders
    properties:
      - name: order_id
        logicalType: string
        required: true
  - name: line_items
    physicalType: table
    description: Lines
    properties:
      - name: order_id
        logicalType: string
        required: true
        quality:
          - type: sql
            description: Every line references an order
            query: |
              SELECT COUNT(*)
              FROM line_items AS lines
              LEFT JOIN orders ON orders.order_id = lines.order_id
              WHERE orders.order_id IS NULL
            expected:
              equal: 0
"""

    payload = json.loads(
        bridge.py_run_contract_check(
            contract,
            json.dumps(["orders.parquet", "line_items.csv"]),
            [orders, lines],
        )
    )

    assert payload["validate"]["success"]
    assert payload["schema_success"]
    assert payload["report_success"]
    assert {row["schema_name"] for row in payload["schema_rows"]} == {
        "orders",
        "line_items",
    }
    assert payload["quality_rows"][0]["obtained"] == 0


def test_browser_bridge_keeps_single_table_filename_compatibility(
    tmp_path,
    monkeypatch,
):
    bridge = _load_bridge(monkeypatch)
    orders, _ = _data_bytes(tmp_path)
    contract = """
apiVersion: v3.1.0
kind: DataContract
id: single-table
name: Single table
version: 1.0.0
status: active
description: {}
schema:
  - name: export
    physicalType: table
    description: Export table
    properties:
      - name: order_id
        logicalType: string
        required: true
"""

    payload = json.loads(
        bridge.py_run_contract_check(
            contract,
            json.dumps(["sample-with-a-different-name.parquet"]),
            [orders],
        )
    )

    assert payload["schema_success"]
    assert payload["schema_rows"][0]["schema_name"] == "export"


def test_browser_bridge_reports_duplicate_schema_file_names(tmp_path, monkeypatch):
    bridge = _load_bridge(monkeypatch)
    orders, lines = _data_bytes(tmp_path)
    contract = """
apiVersion: v3.1.0
kind: DataContract
id: duplicate-source
name: Duplicate source
version: 1.0.0
status: active
description: {}
schema:
  - name: orders
    physicalType: table
    description: Orders
    properties:
      - name: order_id
        logicalType: string
        required: true
  - name: line_items
    physicalType: table
    description: Lines
    properties:
      - name: order_id
        logicalType: string
        required: true
"""

    payload = json.loads(
        bridge.py_run_contract_check(
            contract,
            json.dumps(["orders.csv", "orders.parquet"]),
            [lines, orders],
        )
    )

    assert not payload["schema_success"]
    assert payload["schema_rows"] == []
    assert "Multiple data files resolve to schema 'orders'" in payload["error"]


@pytest.mark.parametrize(
    ("contract_name", "data_names"),
    [
        ("clinical-template.yaml", ("clinical_template.parquet",)),
        ("covid-diagnosis-cohort.yaml", ("patients.csv", "covid.csv")),
        ("laboratory-results.yaml", ("laboratory_results.parquet",)),
        ("medication-administration.yaml", ("medication_administration.parquet",)),
    ],
)
def test_browser_bridge_checks_bundled_examples(
    monkeypatch,
    contract_name,
    data_names,
):
    bridge = _load_bridge(monkeypatch)
    examples_path = Path(__file__).parents[1] / "site" / "examples"
    contract_text = (examples_path / contract_name).read_text(encoding="utf-8")
    contract_raw = yaml.safe_load(contract_text)

    assert {Path(name).stem for name in data_names} == {
        schema["name"] for schema in contract_raw["schema"]
    }

    payload = json.loads(
        bridge.py_run_contract_check(
            contract_text,
            json.dumps(data_names),
            [(examples_path / name).read_bytes() for name in data_names],
        )
    )

    assert payload["validate"]["success"]
    assert payload["schema_success"]
    assert payload["schema_rows"]
    assert payload["report_success"]
