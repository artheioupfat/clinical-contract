"""
Tests pour clinical-contract.
"""
import pytest
from clinical_contract import load_contract, load_raw
from clinical_contract.contract import DataContract
from clinical_contract.models import CheckStatus

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
        physicalType: TEXT
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


# ------------------------------------------------------------------ #
# Tests validate_structure                                             #
# ------------------------------------------------------------------ #

def test_validate_structure_complet():
    raw = load_raw(YAML_COMPLET)
    report = DataContract.validate_structure(raw)
    assert report.success is True
    assert len(report.missing()) == 0


def test_validate_structure_incomplet():
    raw = load_raw(YAML_INCOMPLET)
    report = DataContract.validate_structure(raw)
    assert report.success is False
    missing_fields = [f.field for f in report.missing()]
    assert "id"          in missing_fields
    assert "name"        in missing_fields
    assert "version"     in missing_fields
    assert "status"      in missing_fields
    assert "description" in missing_fields


# ------------------------------------------------------------------ #
# Tests load_contract                                                  #
# ------------------------------------------------------------------ #

def test_load_contract_depuis_string():
    contract, raw = load_contract(YAML_COMPLET)
    assert contract.name == "Test Contract"
    assert len(contract.schema_) == 1
    assert contract.schema_[0].name == "patients"


def test_load_contract_depuis_bytes():
    contract, raw = load_contract(YAML_COMPLET.encode())
    assert contract.id == "test-contract"


# ------------------------------------------------------------------ #
# Tests check() avec DuckDB                                            #
# ------------------------------------------------------------------ #

def test_check_tous_passes(tmp_path):
    pytest.importorskip("duckdb")
    import pyarrow as pa, pyarrow.parquet as pq

    table = pa.table({"id": ["A001", "A002", "A003"]})
    parquet_file = tmp_path / "patients.parquet"
    pq.write_table(table, parquet_file)

    contract, _ = load_contract(YAML_COMPLET)
    report = contract.check(str(parquet_file), backend="duckdb")

    assert report.success is True
    assert report.code == 0
    assert len(report.passed()) == 1
    assert len(report.failed()) == 0


def test_check_echec_si_null(tmp_path):
    pytest.importorskip("duckdb")
    import pyarrow as pa, pyarrow.parquet as pq

    # Un id null → le check doit échouer
    table = pa.table({"id": ["A001", None, "A003"]})
    parquet_file = tmp_path / "patients.parquet"
    pq.write_table(table, parquet_file)

    contract, _ = load_contract(YAML_COMPLET)
    report = contract.check(str(parquet_file), backend="duckdb")

    assert report.success is False
    assert report.code == 1
    failures = report.failed()
    assert len(failures) == 1
    assert failures[0].status == CheckStatus.failed
    assert failures[0].obtained == 1
    assert failures[0].expected == 0


def test_check_backend_inconnu():
    contract, _ = load_contract(YAML_COMPLET)
    with pytest.raises(ValueError, match="Backend inconnu"):
        contract.check("fake.parquet", backend="mysql")
