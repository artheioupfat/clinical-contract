"""DuckDB quality-query security and resource-reuse tests."""

import pytest

import clinical_contract.quality_check as quality_module
from clinical_contract import load_contract

from tests.helpers import (
    YAML_COMPLET,
    _write_csv_ids,
    _write_parquet_ids,
    _yaml_with_quality_expectation,
)


def test_check_reuses_one_materialization_connection_and_view(
    tmp_path,
    monkeypatch,
):
    parquet_file = _write_parquet_ids(tmp_path, ["A001", "A002", "A003"])
    contract, _ = load_contract(YAML_COMPLET)
    quality_rules = contract.schema_[0].properties[0].quality
    assert quality_rules is not None
    quality_rules.append(
        quality_rules[0].model_copy(
            update={
                "description": "Expected row count",
                "query": "SELECT COUNT(*) FROM patients",
                "mustBe": 3,
            }
        )
    )

    calls = {
        "file_materialization": 0,
        "table_materialization": 0,
        "connect": 0,
        "view": 0,
    }
    real_materialize = quality_module._materialize_data_source
    real_materialize_table = quality_module._materialize_data_source_table
    real_connect = quality_module.duckdb.connect
    real_create_view = quality_module._create_data_source_view

    def counted_materialize(source):
        calls["file_materialization"] += 1
        return real_materialize(source)

    def counted_materialize_table(*args, **kwargs):
        calls["table_materialization"] += 1
        return real_materialize_table(*args, **kwargs)

    def counted_connect(*args, **kwargs):
        calls["connect"] += 1
        return real_connect(*args, **kwargs)

    def counted_create_view(*args, **kwargs):
        calls["view"] += 1
        return real_create_view(*args, **kwargs)

    monkeypatch.setattr(
        quality_module,
        "_materialize_data_source",
        counted_materialize,
    )
    monkeypatch.setattr(
        quality_module,
        "_materialize_data_source_table",
        counted_materialize_table,
    )
    monkeypatch.setattr(quality_module.duckdb, "connect", counted_connect)
    monkeypatch.setattr(
        quality_module,
        "_create_data_source_view",
        counted_create_view,
    )

    report = contract.check(parquet_file.read_bytes(), backend="duckdb")

    assert report.success is True
    assert len(report.passed()) == 2
    assert calls == {
        "file_materialization": 1,
        "table_materialization": 1,
        "connect": 1,
        "view": 1,
    }


@pytest.mark.parametrize(
    "query",
    [
        "SELECT COUNT(*) FROM patients; DELETE FROM patients",
        "DELETE FROM patients",
        "CREATE TABLE stolen AS SELECT * FROM patients",
        "COPY patients TO '/tmp/stolen.csv'",
        "ATTACH '/tmp/stolen.duckdb'",
        "SET threads = 8",
        "PRAGMA enable_profiling",
        "INSTALL httpfs",
        "LOAD httpfs",
        "CALL checkpoint()",
    ],
)
def test_check_rejects_unsafe_quality_sql(tmp_path, query):
    parquet_file = _write_parquet_ids(tmp_path, ["A001", "A002", "A003"])
    contract, _ = load_contract(
        _yaml_with_quality_expectation(
            "expected:\n  equal: 3",
            query=query,
        )
    )

    report = contract.check(str(parquet_file), backend="duckdb")

    assert report.code == 2
    assert report.success is False
    assert report.errors()[0].error_message == (
        "Unsafe quality SQL: exactly one read-only SELECT statement is required."
    )


@pytest.mark.parametrize(
    "query",
    [
        "WITH source AS (SELECT * FROM patients) SELECT COUNT(*) FROM source",
        "FROM patients SELECT COUNT(*)",
    ],
)
def test_check_accepts_read_only_select_variants(tmp_path, query):
    parquet_file = _write_parquet_ids(tmp_path, ["A001", "A002", "A003"])
    contract, _ = load_contract(
        _yaml_with_quality_expectation(
            "expected:\n  equal: 3",
            query=query,
        )
    )

    report = contract.check(str(parquet_file), backend="duckdb")

    assert report.success is True
    assert report.code == 0


def test_check_blocks_quality_sql_from_reading_another_file(tmp_path):
    parquet_file = _write_parquet_ids(tmp_path, ["A001"])
    other_file = _write_csv_ids(tmp_path, ["SECRET"], filename="private.csv")
    escaped_path = str(other_file).replace("'", "''")
    contract, _ = load_contract(
        _yaml_with_quality_expectation(
            "expected:\n  equal: 1",
            query=f"SELECT COUNT(*) FROM read_csv_auto('{escaped_path}')",
        )
    )

    report = contract.check(str(parquet_file), backend="duckdb")

    assert report.code == 2
    assert "Cannot access file" in report.errors()[0].error_message


def test_check_locks_duckdb_security_configuration(
    tmp_path,
    monkeypatch,
):
    parquet_file = _write_parquet_ids(tmp_path, ["A001"])
    contract, _ = load_contract(YAML_COMPLET)
    real_run_query = quality_module._run_duckdb_scalar_query
    observed = {}

    def inspect_connection(conn, sql):
        settings = dict(
            conn.execute(
                "SELECT name, value FROM duckdb_settings() "
                "WHERE name IN ("
                "'allow_community_extensions', "
                "'autoinstall_known_extensions', "
                "'autoload_known_extensions', "
                "'enable_external_access', "
                "'lock_configuration'"
                ")"
            ).fetchall()
        )
        observed.update(settings)
        try:
            conn.execute("SET threads = 8")
        except Exception as exc:
            observed["lock_error"] = str(exc)
        return real_run_query(conn, sql)

    monkeypatch.setattr(
        quality_module,
        "_run_duckdb_scalar_query",
        inspect_connection,
    )

    report = contract.check(str(parquet_file), backend="duckdb")

    assert report.success is True
    assert observed["allow_community_extensions"] == "false"
    assert observed["autoinstall_known_extensions"] == "false"
    assert observed["autoload_known_extensions"] == "false"
    assert observed["enable_external_access"] == "false"
    assert observed["lock_configuration"] == "true"
    assert "configuration has been locked" in observed["lock_error"]
