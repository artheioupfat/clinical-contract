"""
CLI tests for clinical-contract.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

import clinical_contract.cli as cli


YAML_VALID = """
apiVersion: v1.0.0
kind: DataContract
id: test-contract
name: Test Contract
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

YAML_SQL_ERROR = """
apiVersion: v1.0.0
kind: DataContract
id: test-contract
name: Test Contract
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
        quality:
          - type: sql
            description: Trigger SQL error
            query: "SELECT * FROM unknown_table"
            mustBe: 0
"""


def _write_yaml(tmp_path: Path, content: str, filename: str = "contract.yaml") -> Path:
    contract_path = tmp_path / filename
    contract_path.write_text(content, encoding="utf-8")
    return contract_path


def _write_parquet_ids(tmp_path: Path, ids: list[str | None]) -> Path:
    duckdb = pytest.importorskip("duckdb")
    parquet_file = tmp_path / "patients.parquet"
    parquet_path_literal = str(parquet_file).replace("'", "''")

    with duckdb.connect() as conn:
        conn.execute("CREATE TABLE patients (id VARCHAR)")
        conn.executemany("INSERT INTO patients VALUES (?)", [(value,) for value in ids])
        conn.execute(f"COPY patients TO '{parquet_path_literal}' (FORMAT PARQUET)")

    return parquet_file


def _write_csv_ids(tmp_path: Path, ids: list[str | None]) -> Path:
    duckdb = pytest.importorskip("duckdb")
    csv_file = tmp_path / "patients.csv"
    csv_path_literal = str(csv_file).replace("'", "''")

    with duckdb.connect() as conn:
        conn.execute("CREATE TABLE patients (id VARCHAR)")
        conn.executemany("INSERT INTO patients VALUES (?)", [(value,) for value in ids])
        conn.execute(f"COPY patients TO '{csv_path_literal}' (HEADER, DELIMITER ',')")

    return csv_file


def _run_main(monkeypatch: pytest.MonkeyPatch, args: list[str]) -> None:
    monkeypatch.setattr(sys, "argv", ["clinical-contract", *args])
    cli.main()


def test_main_help(capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch):
    _run_main(monkeypatch, ["--help"])
    out = capsys.readouterr().out
    assert "clinical data contract validator" in out
    assert "Usage:" in out


def test_main_unknown_command_exits(
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
):
    with pytest.raises(SystemExit, match="1"):
        _run_main(monkeypatch, ["nope"])
    out = capsys.readouterr().out
    assert "Unknown command" in out


def test_validate_usage_error_exits(
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
):
    with pytest.raises(SystemExit, match="1"):
        _run_main(monkeypatch, ["validate"])
    out = capsys.readouterr().out
    assert "Usage: clinical-contract validate" in out


def test_validate_success_output(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
):
    contract_path = _write_yaml(tmp_path, YAML_VALID)
    _run_main(monkeypatch, ["validate", str(contract_path)])
    out = capsys.readouterr().out
    assert "Structure validation" in out
    assert "Valid structure" in out


def test_validate_failure_exits(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
):
    contract_path = _write_yaml(tmp_path, YAML_INVALID)
    with pytest.raises(SystemExit, match="1"):
        _run_main(monkeypatch, ["validate", str(contract_path)])
    out = capsys.readouterr().out
    assert "missing field(s)" in out


def test_check_success_output(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
):
    contract_path = _write_yaml(tmp_path, YAML_VALID)
    parquet_path = _write_parquet_ids(tmp_path, ["A001", "A002", "A003"])

    _run_main(monkeypatch, ["check", str(contract_path), str(parquet_path)])
    out = capsys.readouterr().out
    assert "Contract check" in out
    assert "Data file" in out
    assert "All checks passed." in out


def test_check_success_output_csv(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
):
    contract_path = _write_yaml(tmp_path, YAML_VALID)
    csv_path = _write_csv_ids(tmp_path, ["A001", "A002", "A003"])

    _run_main(monkeypatch, ["check", str(contract_path), str(csv_path)])
    out = capsys.readouterr().out
    assert "Contract check" in out
    assert "Data file" in out
    assert "All checks passed." in out


def test_check_quality_failure_exits(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
):
    contract_path = _write_yaml(tmp_path, YAML_VALID)
    parquet_path = _write_parquet_ids(tmp_path, ["A001", None, "A003"])

    with pytest.raises(SystemExit, match="1"):
        _run_main(monkeypatch, ["check", str(contract_path), str(parquet_path)])
    out = capsys.readouterr().out
    assert "0/1 checks passed." in out


def test_check_execution_error_exits(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
):
    contract_path = _write_yaml(tmp_path, YAML_SQL_ERROR)
    parquet_path = _write_parquet_ids(tmp_path, ["A001", "A002", "A003"])

    with pytest.raises(SystemExit, match="1"):
        _run_main(monkeypatch, ["check", str(contract_path), str(parquet_path)])
    out = capsys.readouterr().out
    assert "Execution errors were encountered." in out
    assert "execution error(s)" in out
