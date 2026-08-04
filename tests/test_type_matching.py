"""Logical and physical type compatibility tests."""

import pytest

from clinical_contract import load_contract
from clinical_contract.models import ColumnCheckStatus

from tests.helpers import (
    _write_parquet_from_select,
    _write_parquet_ids,
    _write_parquet_single_typed_column,
    _yaml_single_event_timestamp,
    _yaml_single_typed_column,
)


def test_check_schema_timestamp_tz_compatible(tmp_path):
    parquet_file = _write_parquet_from_select(
        tmp_path,
        "patients.parquet",
        "patients",
        "SELECT TIMESTAMPTZ '2023-11-14 12:34:56+01:00' AS event_ts",
    )
    contract, _ = load_contract(
        _yaml_single_event_timestamp("timestamp[us, tz=Europe/Paris]")
    )
    reports = contract.check_schema(str(parquet_file))

    assert reports[0].success is True
    assert reports[0].columns[0].status == ColumnCheckStatus.ok


def test_check_schema_time_matches_duckdb_time(tmp_path):
    parquet_file = _write_parquet_from_select(
        tmp_path,
        "patients_time.parquet",
        "patients",
        "SELECT TIME '12:34:56' AS event_ts",
    )
    contract, _ = load_contract(_yaml_single_event_timestamp("time", "time"))
    reports = contract.check_schema(str(parquet_file))

    assert reports[0].success is True
    assert reports[0].columns[0].yaml_type == "time"
    assert reports[0].columns[0].parquet_type == "time"
    assert reports[0].columns[0].status == ColumnCheckStatus.ok


def test_check_schema_time_rejects_timestamp(tmp_path):
    parquet_file = _write_parquet_from_select(
        tmp_path,
        "patients_time_as_timestamp.parquet",
        "patients",
        "SELECT TIMESTAMP '2024-01-01 12:34:56' AS event_ts",
    )
    contract, _ = load_contract(_yaml_single_event_timestamp("time"))
    reports = contract.check_schema(str(parquet_file))

    assert reports[0].success is False
    assert reports[0].columns[0].yaml_type == "time"
    assert reports[0].columns[0].parquet_type == "timestamp"
    assert reports[0].columns[0].status == ColumnCheckStatus.type_mismatch


def test_check_schema_array_matches_duckdb_list(tmp_path):
    parquet_file = _write_parquet_from_select(
        tmp_path,
        "patients_array.parquet",
        "patients",
        "SELECT [1, 2, 3] AS measurements",
    )
    contract, _ = load_contract(
        _yaml_single_typed_column("measurements", "array", "array")
    )
    reports = contract.check_schema(str(parquet_file))

    assert reports[0].success is True
    assert reports[0].columns[0].yaml_type == "array"
    assert reports[0].columns[0].parquet_type == "array"
    assert reports[0].columns[0].status == ColumnCheckStatus.ok


def test_check_schema_array_rejects_scalar_column(tmp_path):
    parquet_file = _write_parquet_from_select(
        tmp_path,
        "patients_scalar.parquet",
        "patients",
        "SELECT 1 AS measurements",
    )
    contract, _ = load_contract(_yaml_single_typed_column("measurements", "array"))
    reports = contract.check_schema(str(parquet_file))

    assert reports[0].success is False
    assert reports[0].columns[0].yaml_type == "array"
    assert reports[0].columns[0].parquet_type == "int32"
    assert reports[0].columns[0].status == ColumnCheckStatus.type_mismatch


def test_check_schema_generic_float_matches_duckdb_float(tmp_path):
    parquet_file = _write_parquet_from_select(
        tmp_path,
        "measurements_float.parquet",
        "patients",
        "SELECT CAST(1.5 AS FLOAT) AS measurement",
    )
    contract, _ = load_contract(_yaml_single_typed_column("measurement", "float"))
    reports = contract.check_schema(str(parquet_file))

    assert reports[0].success is True
    assert reports[0].columns[0].yaml_type == "float"
    assert reports[0].columns[0].parquet_type == "float"
    assert reports[0].columns[0].status == ColumnCheckStatus.ok


def test_check_schema_decimal_matches_duckdb_decimal(tmp_path):
    parquet_file = _write_parquet_from_select(
        tmp_path,
        "measurements_decimal.parquet",
        "patients",
        "SELECT CAST(123.4567 AS DECIMAL(18, 4)) AS measurement",
    )
    contract, _ = load_contract(
        _yaml_single_typed_column("measurement", "decimal", "decimal")
    )
    reports = contract.check_schema(str(parquet_file))

    assert reports[0].success is True
    assert reports[0].columns[0].yaml_type == "decimal"
    assert reports[0].columns[0].parquet_type == "decimal"
    assert reports[0].columns[0].status == ColumnCheckStatus.ok


def test_check_schema_decimal_rejects_duckdb_double(tmp_path):
    parquet_file = _write_parquet_from_select(
        tmp_path,
        "measurements_double.parquet",
        "patients",
        "SELECT CAST(123.4567 AS DOUBLE) AS measurement",
    )
    contract, _ = load_contract(_yaml_single_typed_column("measurement", "decimal"))
    reports = contract.check_schema(str(parquet_file))

    assert reports[0].success is False
    assert reports[0].columns[0].parquet_type == "float64"
    assert reports[0].columns[0].status == ColumnCheckStatus.type_mismatch


def test_check_schema_decimal_precision_is_not_strict(tmp_path):
    parquet_file = _write_parquet_from_select(
        tmp_path,
        "measurements_decimal_precision.parquet",
        "patients",
        "SELECT CAST(123.4567 AS DECIMAL(18, 4)) AS measurement",
    )
    contract, _ = load_contract(
        _yaml_single_typed_column(
            "measurement",
            "decimal(10, 2)",
            "decimal(10, 2)",
        )
    )
    reports = contract.check_schema(str(parquet_file))

    assert reports[0].success is True
    assert reports[0].columns[0].parquet_type == "decimal"
    assert reports[0].columns[0].status == ColumnCheckStatus.ok


def test_check_schema_interval_matches_duckdb_interval(tmp_path):
    parquet_file = _write_parquet_from_select(
        tmp_path,
        "durations_interval.parquet",
        "patients",
        "SELECT INTERVAL '2 days 03:04:05' AS duration",
    )
    contract, _ = load_contract(
        _yaml_single_typed_column("duration", "interval", "interval")
    )
    reports = contract.check_schema(str(parquet_file))

    assert reports[0].success is True
    assert reports[0].columns[0].yaml_type == "interval"
    assert reports[0].columns[0].parquet_type == "interval"
    assert reports[0].columns[0].status == ColumnCheckStatus.ok


def test_check_schema_interval_rejects_duckdb_time(tmp_path):
    parquet_file = _write_parquet_from_select(
        tmp_path,
        "durations_time.parquet",
        "patients",
        "SELECT TIME '03:04:05' AS duration",
    )
    contract, _ = load_contract(_yaml_single_typed_column("duration", "interval"))
    reports = contract.check_schema(str(parquet_file))

    assert reports[0].success is False
    assert reports[0].columns[0].parquet_type == "time"
    assert reports[0].columns[0].status == ColumnCheckStatus.type_mismatch


def test_check_schema_date_with_timestamp_timezone_physical_matches(tmp_path):
    parquet_file = _write_parquet_from_select(
        tmp_path,
        "patients_tz.parquet",
        "patients",
        "SELECT TIMESTAMPTZ '2023-11-14 12:34:56+01:00' AS event_ts",
    )
    contract, _ = load_contract(
        _yaml_single_event_timestamp("date", "timestamp with timezone")
    )
    reports = contract.check_schema(str(parquet_file))

    assert reports[0].success is True
    assert reports[0].columns[0].yaml_type == "timestamp with timezone"
    assert reports[0].columns[0].parquet_type == "timestamp with time zone"
    assert reports[0].columns[0].status == ColumnCheckStatus.ok


def test_check_schema_timestamptz_physical_alias_matches(tmp_path):
    parquet_file = _write_parquet_from_select(
        tmp_path,
        "patients_timestamptz.parquet",
        "patients",
        "SELECT TIMESTAMPTZ '2023-11-14 12:34:56+01:00' AS event_ts",
    )
    contract, _ = load_contract(_yaml_single_event_timestamp("date", "timestamptz"))
    reports = contract.check_schema(str(parquet_file))

    assert reports[0].success is True
    assert reports[0].columns[0].yaml_type == "timestamptz"
    assert reports[0].columns[0].parquet_type == "timestamp with time zone"
    assert reports[0].columns[0].status == ColumnCheckStatus.ok


def test_check_schema_date_with_timestamp_physical_rejects_timestamp_with_timezone(
    tmp_path,
):
    parquet_file = _write_parquet_from_select(
        tmp_path,
        "patients_timestamp_strict.parquet",
        "patients",
        "SELECT TIMESTAMPTZ '2023-11-14 12:34:56+01:00' AS event_ts",
    )
    contract, _ = load_contract(_yaml_single_event_timestamp("date", "timestamp"))
    reports = contract.check_schema(str(parquet_file))

    assert reports[0].success is False
    assert reports[0].columns[0].yaml_type == "timestamp"
    assert reports[0].columns[0].parquet_type == "timestamp with time zone"
    assert reports[0].columns[0].status == ColumnCheckStatus.type_mismatch


def test_check_schema_physical_text_matches_detected_varchar_alias(tmp_path):
    parquet_file = _write_parquet_ids(tmp_path, ["A001", "A002"])
    yaml_physical_text = """
apiVersion: v1.0.0
kind: DataContract
id: physical-string-contract
name: Physical String Contract
version: 1.0.0
status: active
description:
  purpose: "Test"
  usage: "Unit tests"
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
"""
    contract, _ = load_contract(yaml_physical_text)
    reports = contract.check_schema(str(parquet_file))

    assert reports[0].success is True
    assert reports[0].columns[0].yaml_type == "TEXT"
    assert reports[0].columns[0].parquet_type == "varchar"
    assert reports[0].columns[0].status == ColumnCheckStatus.ok


def test_check_schema_uint32_matches_uinteger(tmp_path):
    parquet_file = _write_parquet_single_typed_column(
        tmp_path=tmp_path,
        table_name="orders",
        column_name="status_code",
        duckdb_type="UINTEGER",
    )
    yaml_uint32 = """
apiVersion: v1.0.0
kind: DataContract
id: uint32-contract
name: UInt32 Contract
version: 1.0.0
status: active
description:
  purpose: "Test"
  usage: "Unit tests"
  limitations: "None"
schema:
  - name: orders
    physicalType: TABLE
    description: Orders table
    properties:
      - name: status_code
        logicalType: uint32
        physicalType: UINTEGER
        description: Status
        required: true
"""
    contract, _ = load_contract(yaml_uint32)
    reports = contract.check_schema(str(parquet_file))
    col = reports[0].columns[0]

    assert reports[0].success is True
    assert col.status == ColumnCheckStatus.ok
    assert col.yaml_type == "UINTEGER"
    assert col.parquet_type == "uint32"


def test_check_schema_uint32_rejects_ubigint(tmp_path):
    parquet_file = _write_parquet_single_typed_column(
        tmp_path=tmp_path,
        table_name="orders",
        column_name="status_code",
        duckdb_type="UBIGINT",
    )
    yaml_uint32 = """
apiVersion: v1.0.0
kind: DataContract
id: uint32-contract
name: UInt32 Contract
version: 1.0.0
status: active
description:
  purpose: "Test"
  usage: "Unit tests"
  limitations: "None"
schema:
  - name: orders
    physicalType: TABLE
    description: Orders table
    properties:
      - name: status_code
        logicalType: uint32
        physicalType: UINTEGER
        description: Status
        required: true
"""
    contract, _ = load_contract(yaml_uint32)
    reports = contract.check_schema(str(parquet_file))
    col = reports[0].columns[0]

    assert reports[0].success is False
    assert col.status == ColumnCheckStatus.type_mismatch
    assert col.yaml_type == "UINTEGER"
    assert col.parquet_type == "uint64"


def test_check_schema_integer_keeps_family_compatibility(tmp_path):
    parquet_file = _write_parquet_single_typed_column(
        tmp_path=tmp_path,
        table_name="orders",
        column_name="status_code",
        duckdb_type="uint8",
    )
    yaml_integer = """
apiVersion: v1.0.0
kind: DataContract
id: integer-contract
name: Integer Contract
version: 1.0.0
status: active
description:
  purpose: "Test"
  usage: "Unit tests"
  limitations: "None"
schema:
  - name: orders
    physicalType: TABLE
    description: Orders table
    properties:
      - name: status_code
        logicalType: int
        description: Status
        required: true
"""
    contract, _ = load_contract(yaml_integer)
    reports = contract.check_schema(str(parquet_file))

    assert reports[0].success is True
    assert reports[0].columns[0].status == ColumnCheckStatus.ok
    assert reports[0].columns[0].yaml_type == "int"
    assert reports[0].columns[0].parquet_type == "uint8"


def test_check_schema_physical_type_takes_precedence(tmp_path):
    parquet_file = _write_parquet_single_typed_column(
        tmp_path=tmp_path,
        table_name="orders",
        column_name="status_code",
        duckdb_type="UTINYINT",
    )
    yaml_physical = """
apiVersion: v1.0.0
kind: DataContract
id: physical-contract
name: Physical Contract
version: 1.0.0
status: active
description:
  purpose: "Test"
  usage: "Unit tests"
  limitations: "None"
schema:
  - name: orders
    physicalType: TABLE
    description: Orders table
    properties:
      - name: status_code
        logicalType: integer
        physicalType: INTEGER
        description: Status
        required: true
"""
    contract, _ = load_contract(yaml_physical)
    reports = contract.check_schema(str(parquet_file))

    assert reports[0].success is False
    assert reports[0].columns[0].yaml_type == "INTEGER"
    assert reports[0].columns[0].parquet_type == "uint8"
    assert reports[0].columns[0].status == ColumnCheckStatus.type_mismatch


def test_check_schema_physical_type_only_matches_detected_type(tmp_path):
    parquet_file = _write_parquet_single_typed_column(
        tmp_path=tmp_path,
        table_name="orders",
        column_name="status_code",
        duckdb_type="UINTEGER",
    )
    yaml_physical_only = """
apiVersion: v1.0.0
kind: DataContract
id: physical-only-contract
name: Physical Only Contract
version: 1.0.0
status: active
description:
  purpose: "Test"
  usage: "Unit tests"
  limitations: "None"
schema:
  - name: orders
    physicalType: TABLE
    description: Orders table
    properties:
      - name: status_code
        physicalType: uint32
        description: Status
        required: true
"""
    contract, _ = load_contract(yaml_physical_only)
    reports = contract.check_schema(str(parquet_file))

    assert reports[0].success is True
    assert reports[0].columns[0].yaml_type == "uint32"
    assert reports[0].columns[0].parquet_type == "uint32"
    assert reports[0].columns[0].status == ColumnCheckStatus.ok


def test_check_schema_boolean_physical_type_matches_detected_boolean(tmp_path):
    parquet_file = _write_parquet_single_typed_column(
        tmp_path=tmp_path,
        table_name="patients",
        column_name="is_active",
        duckdb_type="BOOLEAN",
    )
    yaml_boolean = """
apiVersion: v1.0.0
kind: DataContract
id: boolean-contract
name: Boolean Contract
version: 1.0.0
status: active
description:
  purpose: "Test"
  usage: "Unit tests"
  limitations: "None"
schema:
  - name: patients
    physicalType: TABLE
    description: Patients table
    properties:
      - name: is_active
        logicalType: boolean
        physicalType: boolean
        description: Active flag
        required: true
"""
    contract, _ = load_contract(yaml_boolean)
    reports = contract.check_schema(str(parquet_file))

    assert reports[0].success is True
    assert reports[0].columns[0].yaml_type == "boolean"
    assert reports[0].columns[0].parquet_type == "boolean"
    assert reports[0].columns[0].status == ColumnCheckStatus.ok


def test_check_schema_binary_physical_type_matches_detected_boolean_when_logical_boolean(
    tmp_path,
):
    parquet_file = _write_parquet_single_typed_column(
        tmp_path=tmp_path,
        table_name="patients",
        column_name="is_active",
        duckdb_type="BOOLEAN",
    )
    yaml_boolean_binary = """
apiVersion: v1.0.0
kind: DataContract
id: boolean-binary-contract
name: Boolean Binary Contract
version: 1.0.0
status: active
description:
  purpose: "Test"
  usage: "Unit tests"
  limitations: "None"
schema:
  - name: patients
    physicalType: TABLE
    description: Patients table
    properties:
      - name: is_active
        logicalType: boolean
        physicalType: binary
        description: Active flag
        required: false
"""
    contract, _ = load_contract(yaml_boolean_binary)
    reports = contract.check_schema(str(parquet_file))

    assert reports[0].success is True
    assert reports[0].columns[0].yaml_type == "binary"
    assert reports[0].columns[0].parquet_type == "boolean"
    assert reports[0].columns[0].status == ColumnCheckStatus.ok


def test_check_schema_displays_bigint_as_int64(tmp_path):
    parquet_file = _write_parquet_single_typed_column(
        tmp_path=tmp_path,
        table_name="orders",
        column_name="patient_count",
        duckdb_type="BIGINT",
    )
    yaml_int64 = """
apiVersion: v1.0.0
kind: DataContract
id: int64-contract
name: Int64 Contract
version: 1.0.0
status: active
description:
  purpose: "Test"
  usage: "Unit tests"
  limitations: "None"
schema:
  - name: orders
    physicalType: TABLE
    description: Orders table
    properties:
      - name: patient_count
        logicalType: integer
        physicalType: int64
        description: Patient count
        required: true
"""
    contract, _ = load_contract(yaml_int64)
    reports = contract.check_schema(str(parquet_file))

    assert reports[0].success is True
    assert reports[0].columns[0].yaml_type == "int64"
    assert reports[0].columns[0].parquet_type == "int64"
    assert reports[0].columns[0].status == ColumnCheckStatus.ok


def test_check_schema_date_with_timestamp_physical_matches_timestamp(tmp_path):
    duckdb = pytest.importorskip("duckdb")
    parquet_file = tmp_path / "events_event_date_timestamp.parquet"
    parquet_path_literal = str(parquet_file).replace("'", "''")
    with duckdb.connect() as conn:
        conn.execute(
            "CREATE TABLE events AS "
            "SELECT TIMESTAMP '2024-01-01 10:30:00' AS event_date"
        )
        conn.execute(f"COPY events TO '{parquet_path_literal}' (FORMAT PARQUET)")
    yaml_timestamp_physical = """
apiVersion: v1.0.0
kind: DataContract
id: timestamp-contract
name: Timestamp Contract
version: 1.0.0
status: active
description:
  purpose: "Test"
  usage: "Unit tests"
  limitations: "None"
schema:
  - name: events
    physicalType: TABLE
    description: Events table
    properties:
      - name: event_date
        logicalType: date
        physicalType: timestamp
        description: Event date
        required: true
"""
    contract, _ = load_contract(yaml_timestamp_physical)
    reports = contract.check_schema(str(parquet_file))

    assert reports[0].success is True
    assert reports[0].columns[0].status == ColumnCheckStatus.ok


def test_check_schema_date_with_date_physical_rejects_timestamp(tmp_path):
    duckdb = pytest.importorskip("duckdb")
    parquet_file = tmp_path / "events_event_date_timestamp.parquet"
    parquet_path_literal = str(parquet_file).replace("'", "''")
    with duckdb.connect() as conn:
        conn.execute(
            "CREATE TABLE events AS "
            "SELECT TIMESTAMP '2024-01-01 10:30:00' AS event_date"
        )
        conn.execute(f"COPY events TO '{parquet_path_literal}' (FORMAT PARQUET)")
    yaml_date = """
apiVersion: v1.0.0
kind: DataContract
id: date-contract
name: Date Contract
version: 1.0.0
status: active
description:
  purpose: "Test"
  usage: "Unit tests"
  limitations: "None"
schema:
  - name: events
    physicalType: TABLE
    description: Events table
    properties:
      - name: event_date
        logicalType: date
        physicalType: date
        description: Event date
        required: true
"""
    contract, _ = load_contract(yaml_date)
    reports = contract.check_schema(str(parquet_file))

    assert reports[0].success is False
    assert reports[0].columns[0].status == ColumnCheckStatus.type_mismatch
