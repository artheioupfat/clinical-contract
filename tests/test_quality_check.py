"""SQL quality execution and comparison tests."""

import pytest

from clinical_contract import load_contract
from clinical_contract.models import CheckStatus, ComparisonOperator

from tests.helpers import (
    YAML_COMPLET,
    YAML_SANS_QUALITY,
    _write_csv_ids,
    _write_parquet_ids,
    _yaml_with_quality_expectation,
)


def test_check_tous_passes(tmp_path):
    parquet_file = _write_parquet_ids(tmp_path, ["A001", "A002", "A003"])

    contract, _ = load_contract(YAML_COMPLET)
    report = contract.check(str(parquet_file), backend="duckdb")

    assert report.success is True
    assert report.code == 0
    assert len(report.passed()) == 1
    assert len(report.failed()) == 0


def test_check_echec_si_null(tmp_path):
    # Un id null → le check doit échouer
    parquet_file = _write_parquet_ids(tmp_path, ["A001", None, "A003"])

    contract, _ = load_contract(YAML_COMPLET)
    report = contract.check(str(parquet_file), backend="duckdb")

    assert report.success is False
    assert report.code == 1
    failures = report.failed()
    assert len(failures) == 1
    assert failures[0].status == CheckStatus.failed
    assert failures[0].obtained == 1
    assert failures[0].expected == 0


@pytest.mark.parametrize(
    ("expectation_yaml", "operator", "expected_display"),
    [
        ("expected:\n  equal: 3", ComparisonOperator.equal, "= 3"),
        ("expected:\n  notEqual: 4", ComparisonOperator.not_equal, "!= 4"),
        ("expected:\n  greaterThan: 2", ComparisonOperator.greater_than, "> 2"),
        (
            "expected:\n  greaterThanOrEqual: 3",
            ComparisonOperator.greater_than_or_equal,
            ">= 3",
        ),
        ("expected:\n  lessThan: 4", ComparisonOperator.less_than, "< 4"),
        (
            "expected:\n  lessThanOrEqual: 3",
            ComparisonOperator.less_than_or_equal,
            "<= 3",
        ),
        (
            "expected:\n  between:\n    min: 3\n    max: 3",
            ComparisonOperator.between,
            "3 <= value <= 3",
        ),
    ],
)
def test_check_supports_quality_comparison_operators(
    tmp_path,
    expectation_yaml,
    operator,
    expected_display,
):
    parquet_file = _write_parquet_ids(tmp_path, ["A001", "A002", "A003"])
    contract, _ = load_contract(_yaml_with_quality_expectation(expectation_yaml))

    report = contract.check(str(parquet_file), backend="duckdb")

    assert report.success is True
    assert report.results[0].operator == operator
    assert report.results[0].expected_display == expected_display


def test_check_comparison_failure_returns_code_1(tmp_path):
    parquet_file = _write_parquet_ids(tmp_path, ["A001", "A002", "A003"])
    contract, _ = load_contract(
        _yaml_with_quality_expectation("expected:\n  greaterThan: 3")
    )

    report = contract.check(str(parquet_file), backend="duckdb")

    assert report.success is False
    assert report.code == 1
    assert report.results[0].obtained == 3
    assert report.results[0].expected_display == "> 3"


def test_check_preserves_fractional_query_results(tmp_path):
    parquet_file = _write_parquet_ids(tmp_path, ["A001", "A002", "A003"])
    contract, _ = load_contract(
        _yaml_with_quality_expectation(
            "expected:\n  greaterThan: 1.4",
            query="SELECT AVG(value) FROM (VALUES (1), (2)) AS sample(value)",
        )
    )

    report = contract.check(str(parquet_file), backend="duckdb")

    assert report.success is True
    assert report.results[0].obtained == 1.5


@pytest.mark.parametrize(
    ("query", "error_message"),
    [
        ("SELECT 1, 2", "exactly one column"),
        ("SELECT * FROM (VALUES (1), (2))", "exactly one row"),
        ("SELECT NULL", "returned NULL"),
    ],
)
def test_check_rejects_non_scalar_quality_results(tmp_path, query, error_message):
    parquet_file = _write_parquet_ids(tmp_path, ["A001"])
    contract, _ = load_contract(
        _yaml_with_quality_expectation("expected:\n  equal: 1", query=query)
    )

    report = contract.check(str(parquet_file), backend="duckdb")

    assert report.code == 2
    assert error_message in report.errors()[0].error_message


def test_check_tous_passes_depuis_bytes(tmp_path):
    parquet_file = _write_parquet_ids(tmp_path, ["A001", "A002", "A003"])
    parquet_bytes = parquet_file.read_bytes()

    contract, _ = load_contract(YAML_COMPLET)
    report = contract.check(parquet_bytes, backend="duckdb")

    assert report.success is True
    assert report.code == 0
    assert len(report.passed()) == 1


def test_check_tous_passes_depuis_csv(tmp_path):
    csv_file = _write_csv_ids(tmp_path, ["A001", "A002", "A003"])

    contract, _ = load_contract(YAML_COMPLET)
    report = contract.check(str(csv_file), backend="duckdb")

    assert report.success is True
    assert report.code == 0
    assert len(report.passed()) == 1


def test_check_tous_passes_depuis_csv_bytes(tmp_path):
    csv_file = _write_csv_ids(tmp_path, ["A001", "A002", "A003"])
    csv_bytes = csv_file.read_bytes()

    contract, _ = load_contract(YAML_COMPLET)
    report = contract.check(csv_bytes, backend="duckdb")

    assert report.success is True
    assert report.code == 0
    assert len(report.passed()) == 1


def test_check_backend_inconnu():
    contract, _ = load_contract(YAML_COMPLET)
    with pytest.raises(ValueError, match="Unknown backend"):
        contract.check("fake.parquet", backend="mysql")


def test_check_rejects_unknown_include_schema():
    contract, _ = load_contract(YAML_COMPLET)

    with pytest.raises(ValueError, match="include_schemas contains unknown"):
        contract.check("unused.parquet", include_schemas={"patient"})


def test_check_sans_quality_rules():
    contract, _ = load_contract(YAML_SANS_QUALITY)
    report = contract.check("unused.parquet", backend="duckdb")
    assert report.success is True
    assert report.code == 0
    assert report.results == []
    assert "No executable SQL quality checks" in report.summary


def test_check_ignores_non_sql_quality_rule_even_when_query_is_present():
    yaml_non_sql_quality = YAML_SANS_QUALITY.replace(
        "required: true",
        """required: true
        quality:
          - type: library
            description: Managed by another quality engine
            query: SELECT 1
            expected:
              equal: 1""",
    )
    contract, _ = load_contract(yaml_non_sql_quality)

    report = contract.check("unused.parquet", backend="duckdb")

    assert report.success is True
    assert report.code == 0
    assert report.results == []


def test_check_treats_missing_quality_type_as_sql(tmp_path):
    parquet_file = _write_parquet_ids(tmp_path, ["A001", "A002", "A003"])
    yaml_implicit_sql = YAML_COMPLET.replace("          - type: sql\n", "          -\n")
    contract, _ = load_contract(yaml_implicit_sql)

    report = contract.check(parquet_file, backend="duckdb")

    assert report.success is True
    assert len(report.passed()) == 1


def test_check_ignores_non_sql_quality_rules_without_query():
    yaml_standard_quality = """
apiVersion: v1.0.0
kind: DataContract
id: standard-quality
name: Standard Quality
version: 1.0.0
status: active
description:
  purpose: ok
  usage: ok
  limitations: ok
schema:
  - name: patients
    physicalType: TABLE
    description: table
    properties:
      - name: id
        logicalType: string
        physicalType: TEXT
        description: ok
        required: true
        quality:
          - type: library
            metric: invalidValues
            mustBe: 0
            description: Standard metric not executed by the SQL engine.
"""
    contract, _ = load_contract(yaml_standard_quality)
    report = contract.check("unused.parquet", backend="duckdb")

    assert report.success is True
    assert report.code == 0
    assert report.results == []
    assert "No executable SQL quality checks" in report.summary


def test_check_execution_error_returns_code_2(tmp_path):
    parquet_file = _write_parquet_ids(tmp_path, ["A001", "A002", "A003"])

    yaml_sql_error = """
apiVersion: v1.0.0
kind: DataContract
id: error-contract
name: Error Contract
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
        description: Identifiant
        required: true
        quality:
          - type: sql
            description: Trigger SQL error
            query: "SELECT * FROM unknown_table"
            mustBe: 0
"""
    contract, _ = load_contract(yaml_sql_error)
    report = contract.check(str(parquet_file), backend="duckdb")

    assert report.success is False
    assert report.code == 2
    assert len(report.errors()) == 1
    assert "Execution errors" in report.summary
