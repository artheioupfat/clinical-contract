"""Shared contract-test fixtures and data-source builders."""

import pytest

# ------------------------------------------------------------------ #
# YAML de test                                                         #
# ------------------------------------------------------------------ #

YAML_COMPLET = """
apiVersion: v1.0.0
kind: DataContract
id: test-contract
name: Test Contract
version: 1.0.0
status: active
description:
  purpose: "Test"
  usage: "Tests unitaires"
  limitations: "Aucune"
schema:
  - name: patients
    physicalType: TABLE
    description: Table patients
    properties:
      - name: id
        logicalType: string
        physicalType: VARCHAR
        description: Identifiant patient
        required: true
        quality:
          - type: sql
            description: Pas d'id null
            query: "SELECT COUNT(*) FROM patients WHERE id IS NULL"
            mustBe: 0
"""

YAML_INCOMPLET = """
apiVersion: v1.0.0
kind: DataContract
schema:
  - name: patients
    physicalType: TABLE
    description: Table patients
    properties: []
"""

YAML_OPTIONAL_COLUMN = """
apiVersion: v1.0.0
kind: DataContract
id: optional-contract
name: Optional Contract
version: 1.0.0
status: active
description:
  purpose: "Test"
  usage: "Tests unitaires"
  limitations: "Aucune"
schema:
  - name: patients
    physicalType: TABLE
    description: Table patients
    properties:
      - name: id
        logicalType: string
        physicalType: VARCHAR
        description: Identifiant
        required: true
      - name: notes
        logicalType: string
        physicalType: VARCHAR
        description: Colonne optionnelle
        required: false
"""

YAML_SANS_QUALITY = """
apiVersion: v1.0.0
kind: DataContract
id: no-quality
name: No Quality Contract
version: 1.0.0
status: active
description:
  purpose: "Test"
  usage: "Tests unitaires"
  limitations: "Aucune"
schema:
  - name: patients
    physicalType: TABLE
    description: Table patients
    properties:
      - name: id
        logicalType: string
        physicalType: VARCHAR
        description: Identifiant
        required: true
"""


def _write_parquet_ids(tmp_path, ids):
    duckdb = pytest.importorskip("duckdb")
    parquet_file = tmp_path / "patients.parquet"
    parquet_path_literal = str(parquet_file).replace("'", "''")

    with duckdb.connect() as conn:
        conn.execute("CREATE TABLE patients (id VARCHAR)")
        conn.executemany(
            "INSERT INTO patients VALUES (?)",
            [(value,) for value in ids],
        )
        conn.execute(f"COPY patients TO '{parquet_path_literal}' (FORMAT PARQUET)")

    return parquet_file


def _write_csv_ids(tmp_path, ids, filename="patients.csv"):
    duckdb = pytest.importorskip("duckdb")
    csv_file = tmp_path / filename
    csv_path_literal = str(csv_file).replace("'", "''")

    with duckdb.connect() as conn:
        conn.execute("CREATE TABLE patients (id VARCHAR)")
        conn.executemany(
            "INSERT INTO patients VALUES (?)",
            [(value,) for value in ids],
        )
        conn.execute(f"COPY patients TO '{csv_path_literal}' (HEADER, DELIMITER ',')")

    return csv_file


def _yaml_with_quality_expectation(
    expectation_yaml, query="SELECT COUNT(*) FROM patients"
):
    expectation = "\n".join(
        f"            {line}" for line in expectation_yaml.splitlines()
    )
    return f"""
apiVersion: v1.0.0
kind: DataContract
id: comparison-contract
name: Comparison Contract
version: 1.0.0
status: active
description:
  purpose: Test
  usage: Unit tests
  limitations: None
schema:
  - name: patients
    physicalType: TABLE
    description: Patients table
    properties:
      - name: id
        logicalType: string
        physicalType: VARCHAR
        required: true
        quality:
          - type: sql
            description: Scalar comparison
            query: "{query}"
{expectation}
"""


def _write_parquet_single_typed_column(tmp_path, table_name, column_name, duckdb_type):
    duckdb = pytest.importorskip("duckdb")
    parquet_file = (
        tmp_path / f"{table_name}_{column_name}_{duckdb_type.lower()}.parquet"
    )
    parquet_path_literal = str(parquet_file).replace("'", "''")

    with duckdb.connect() as conn:
        conn.execute(
            f"CREATE TABLE {table_name} AS "
            f"SELECT CAST(1 AS {duckdb_type}) AS {column_name}"
        )
        conn.execute(f"COPY {table_name} TO '{parquet_path_literal}' (FORMAT PARQUET)")

    return parquet_file


def _write_parquet_from_select(tmp_path, filename, table_name, select_sql):
    duckdb = pytest.importorskip("duckdb")
    parquet_file = tmp_path / filename
    parquet_path_literal = str(parquet_file).replace("'", "''")

    with duckdb.connect() as conn:
        conn.execute(f"CREATE TABLE {table_name} AS {select_sql}")
        conn.execute(f"COPY {table_name} TO '{parquet_path_literal}' (FORMAT PARQUET)")

    return parquet_file


def _yaml_single_typed_column(column_name, logical_type, physical_type=None):
    physical_type_line = (
        f"        physicalType: {physical_type}\n" if physical_type else ""
    )
    return f"""
apiVersion: v1.0.0
kind: DataContract
id: ts-contract
name: Timestamp Contract
version: 1.0.0
status: active
description:
  purpose: "Test"
  usage: "Unit tests"
  limitations: "None"
schema:
  - name: patients
    physicalType: TABLE
    description: Table patients
    properties:
      - name: {column_name}
        logicalType: {logical_type}
{physical_type_line}        description: Typed test column
        required: true
"""


def _yaml_single_event_timestamp(logical_type, physical_type=None):
    return _yaml_single_typed_column("event_ts", logical_type, physical_type)
