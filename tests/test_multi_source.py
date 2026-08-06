"""Multi-schema and multi-file contract checks."""

from __future__ import annotations

import sys
from pathlib import Path

import duckdb
import pytest
import yaml

from clinical_contract import DataContract
import clinical_contract.cli as cli
from clinical_contract.sources import resolve_schema_sources


def _contract() -> DataContract:
    return DataContract.model_validate(
        {
            "apiVersion": "v3.1.0",
            "kind": "DataContract",
            "id": "multi-table-contract",
            "name": "Orders and line items",
            "version": "1.0.0",
            "status": "active",
            "description": {},
            "schema": [
                {
                    "name": "orders",
                    "physicalType": "table",
                    "description": "Order headers",
                    "properties": [
                        {
                            "name": "order_id",
                            "logicalType": "string",
                            "required": True,
                        }
                    ],
                },
                {
                    "name": "line_items",
                    "physicalType": "table",
                    "description": "Order lines",
                    "properties": [
                        {
                            "name": "order_id",
                            "logicalType": "string",
                            "required": True,
                            "quality": [
                                {
                                    "type": "sql",
                                    "description": "Every line references an order",
                                    "query": """
                                        SELECT COUNT(*)
                                        FROM line_items AS lines
                                        LEFT JOIN orders
                                          ON orders.order_id = lines.order_id
                                        WHERE orders.order_id IS NULL
                                    """,
                                    "expected": {"equal": 0},
                                }
                            ],
                        },
                        {
                            "name": "sku",
                            "logicalType": "string",
                            "required": True,
                        },
                    ],
                },
            ],
        }
    )


def _write_sources(
    tmp_path: Path,
    *,
    orphan_line: bool = False,
) -> tuple[Path, Path]:
    orders_path = tmp_path / "orders.parquet"
    line_items_path = tmp_path / "line_items.csv"
    orders_literal = str(orders_path).replace("'", "''")
    lines_literal = str(line_items_path).replace("'", "''")

    with duckdb.connect() as conn:
        conn.execute("CREATE TABLE orders (order_id VARCHAR)")
        conn.execute("INSERT INTO orders VALUES ('O-1'), ('O-2')")
        conn.execute(f"COPY orders TO '{orders_literal}' (FORMAT PARQUET)")

        conn.execute("CREATE TABLE line_items (order_id VARCHAR, sku VARCHAR)")
        conn.execute("INSERT INTO line_items VALUES ('O-1', 'SKU-1')")
        if orphan_line:
            conn.execute("INSERT INTO line_items VALUES ('O-404', 'SKU-2')")
        conn.execute(
            f"COPY line_items TO '{lines_literal}' (HEADER, DELIMITER ',')"
        )

    return orders_path, line_items_path


def test_multi_source_schema_and_cross_table_quality_pass(tmp_path: Path):
    contract = _contract()
    orders_path, line_items_path = _write_sources(tmp_path)
    sources = [line_items_path, orders_path]

    schema_reports = contract.check_schema(sources)
    quality_report = contract.check(sources)

    assert [report.schema_name for report in schema_reports] == [
        "orders",
        "line_items",
    ]
    assert all(report.success for report in schema_reports)
    assert quality_report.success
    assert quality_report.results[0].obtained == 0


def test_cross_table_quality_detects_orphan_row(tmp_path: Path):
    contract = _contract()
    sources = _write_sources(tmp_path, orphan_line=True)

    report = contract.check(sources)

    assert not report.success
    assert report.code == 1
    assert report.results[0].obtained == 1


def test_missing_source_fails_only_its_schema(tmp_path: Path):
    contract = _contract()
    orders_path, _ = _write_sources(tmp_path)

    reports = contract.check_schema([orders_path])

    assert reports[0].schema_name == "orders"
    assert reports[0].success
    assert reports[1].schema_name == "line_items"
    assert not reports[1].success
    assert "No data file is mapped" in (reports[1].error_message or "")


def test_explicit_mapping_supports_arbitrary_names_and_bytes(tmp_path: Path):
    contract = _contract()
    orders_path, line_items_path = _write_sources(tmp_path)
    mapping = {
        "orders": orders_path.read_bytes(),
        "line_items": line_items_path.read_bytes(),
    }

    reports = contract.check_schema(mapping)
    quality_report = contract.check(mapping)

    assert all(report.success for report in reports)
    assert quality_report.success


def test_unmatched_filename_is_rejected(tmp_path: Path):
    contract = _contract()
    unknown_path = tmp_path / "unknown.parquet"
    unknown_path.write_bytes(b"unused")

    with pytest.raises(ValueError, match="No schema matches.*unknown.parquet"):
        resolve_schema_sources(contract.schema_, [unknown_path])


def test_multiple_in_memory_sources_require_explicit_mapping():
    contract = _contract()

    with pytest.raises(ValueError, match="explicit schema-to-source mapping"):
        resolve_schema_sources(contract.schema_, [b"orders", b"line-items"])


def test_cli_check_accepts_multiple_data_files(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
):
    contract = _contract()
    orders_path, line_items_path = _write_sources(tmp_path)
    contract_path = tmp_path / "contract.yaml"
    contract_path.write_text(
        yaml.safe_dump(
            contract.model_dump(
                by_alias=True,
                exclude_none=True,
                mode="json",
            ),
            sort_keys=False,
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "clinical-contract",
            "check",
            str(contract_path),
            str(orders_path),
            str(line_items_path),
        ],
    )

    cli.main()

    output = capsys.readouterr().out
    assert "orders.parquet" in output
    assert "line_items.csv" in output
    assert "Schema: orders" in output
    assert "Schema: line_items" in output
    assert "All checks passed." in output
