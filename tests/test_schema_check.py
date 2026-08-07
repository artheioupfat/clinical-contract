"""Data-source and required-column schema checks."""

from clinical_contract import load_contract
from clinical_contract.models import ColumnCheckStatus
from clinical_contract.schema_check import _resolve_data_column

from tests.helpers import (
    YAML_OPTIONAL_COLUMN,
    _write_csv_ids,
    _write_parquet_ids,
    _write_parquet_single_typed_column,
)


def test_check_schema_colonne_optionnelle_absente(tmp_path):
    parquet_file = _write_parquet_ids(tmp_path, ["A001", "A002"])

    contract, _ = load_contract(YAML_OPTIONAL_COLUMN)
    reports = contract.check_schema(str(parquet_file))
    assert len(reports) == 1

    cols = {c.column: c for c in reports[0].columns}
    assert cols["id"].status == ColumnCheckStatus.ok
    assert cols["id"].parquet_type == "varchar"
    assert cols["notes"].status == ColumnCheckStatus.optional_missing
    assert reports[0].success is True


def test_check_schema_depuis_bytes(tmp_path):
    parquet_file = _write_parquet_ids(tmp_path, ["A001", "A002"])
    parquet_bytes = parquet_file.read_bytes()

    contract, _ = load_contract(YAML_OPTIONAL_COLUMN)
    reports = contract.check_schema(parquet_bytes)
    cols = {c.column: c for c in reports[0].columns}

    assert cols["id"].status == ColumnCheckStatus.ok
    assert cols["notes"].status == ColumnCheckStatus.optional_missing
    assert reports[0].success is True


def test_check_schema_depuis_csv(tmp_path):
    csv_file = _write_csv_ids(tmp_path, ["A001", "A002"])

    contract, _ = load_contract(YAML_OPTIONAL_COLUMN)
    reports = contract.check_schema(str(csv_file))
    cols = {c.column: c for c in reports[0].columns}

    assert cols["id"].status == ColumnCheckStatus.ok
    assert cols["notes"].status == ColumnCheckStatus.optional_missing
    assert reports[0].success is True


def test_check_schema_depuis_csv_bytes(tmp_path):
    csv_file = _write_csv_ids(tmp_path, ["A001", "A002"])
    csv_bytes = csv_file.read_bytes()

    contract, _ = load_contract(YAML_OPTIONAL_COLUMN)
    reports = contract.check_schema(csv_bytes)
    cols = {c.column: c for c in reports[0].columns}

    assert cols["id"].status == ColumnCheckStatus.ok
    assert cols["notes"].status == ColumnCheckStatus.optional_missing
    assert reports[0].success is True


def test_check_schema_column_names_are_case_insensitive(tmp_path):
    parquet_file = _write_parquet_ids(tmp_path, ["A001", "A002"])
    uppercase_contract = YAML_OPTIONAL_COLUMN.replace("- name: id", "- name: ID")

    contract, _ = load_contract(uppercase_contract)
    reports = contract.check_schema(str(parquet_file))
    cols = {column.column: column for column in reports[0].columns}

    assert cols["ID"].status == ColumnCheckStatus.ok
    assert cols["ID"].parquet_type == "varchar"
    assert reports[0].success is True


def test_case_insensitive_column_resolution_rejects_ambiguous_matches():
    data_columns = {"id": "VARCHAR", "Id": "INTEGER"}

    resolved_type, ambiguous_columns = _resolve_data_column(data_columns, "ID")

    assert resolved_type is None
    assert ambiguous_columns == ["id", "Id"]


def test_exact_column_name_takes_priority_over_case_insensitive_matches():
    data_columns = {"id": "VARCHAR", "Id": "INTEGER"}

    resolved_type, ambiguous_columns = _resolve_data_column(data_columns, "id")

    assert resolved_type == "VARCHAR"
    assert ambiguous_columns == []


def test_check_schema_csv_path_with_single_quote(tmp_path):
    csv_file = _write_csv_ids(tmp_path, ["A001", "A002"], filename="patients'2026.csv")

    contract, _ = load_contract(YAML_OPTIONAL_COLUMN)
    reports = contract.check_schema(str(csv_file))
    cols = {c.column: c for c in reports[0].columns}

    assert cols["id"].status == ColumnCheckStatus.ok
    assert cols["notes"].status == ColumnCheckStatus.optional_missing
    assert reports[0].success is True


def test_check_schema_csv_type_mismatch():
    yaml_invalid = """
apiVersion: v1.0.0
kind: DataContract
id: csv-int-contract
name: CSV Int Contract
version: 1.0.0
status: active
description:
  purpose: test
  usage: test
  limitations: none
schema:
  - name: patients
    physicalType: TABLE
    description: table
    properties:
      - name: id
        logicalType: int32
        physicalType: INTEGER
        description: id
        required: true
"""
    contract, _ = load_contract(yaml_invalid)
    reports = contract.check_schema(b"id\nA001\nA002\n")

    assert reports[0].success is False
    assert reports[0].columns[0].status == ColumnCheckStatus.type_mismatch


def test_check_schema_column_without_type_specification_checks_presence_only(tmp_path):
    parquet_file = _write_parquet_single_typed_column(
        tmp_path=tmp_path,
        table_name="orders",
        column_name="status_code",
        duckdb_type="UINTEGER",
    )
    yaml_without_type = """
apiVersion: v1.0.0
kind: DataContract
id: no-type-contract
name: No Type Contract
version: 1.0.0
status: active
description:
  purpose: "Test"
schema:
  - name: orders
    physicalType: TABLE
    description: Orders table
    properties:
      - name: status_code
        description: Status
        required: true
"""
    contract, _ = load_contract(yaml_without_type)
    reports = contract.check_schema(str(parquet_file))

    assert reports[0].success is True
    assert reports[0].columns[0].yaml_type == "not specified"
    assert reports[0].columns[0].parquet_type == "uint32"
    assert reports[0].columns[0].status == ColumnCheckStatus.ok


def test_check_schema_whitespace_types_are_treated_as_unspecified(tmp_path):
    parquet_file = _write_parquet_single_typed_column(
        tmp_path=tmp_path,
        table_name="orders",
        column_name="status_code",
        duckdb_type="UINTEGER",
    )
    yaml_without_type = """
apiVersion: v1.0.0
kind: DataContract
id: whitespace-type-contract
name: Whitespace Type Contract
version: 1.0.0
status: active
description:
  purpose: Test
schema:
  - name: orders
    physicalType: TABLE
    description: Orders table
    properties:
      - name: status_code
        logicalType: "  "
        physicalType: "  "
        required: true
"""
    contract, _ = load_contract(yaml_without_type)

    reports = contract.check_schema(parquet_file)

    assert reports[0].success is True
    assert reports[0].columns[0].yaml_type == "not specified"
    assert reports[0].columns[0].status == ColumnCheckStatus.ok
