"""Secure DuckDB execution for SQL quality rules."""

from __future__ import annotations

import math
import sys
from dataclasses import dataclass
from decimal import Decimal

import duckdb

from .data_source import (
    _cleanup_temp_path,
    _materialize_data_source,
    _quote_identifier,
)
from .models import (
    BetweenExpectation,
    CheckStatus,
    ComparisonOperator,
    ContractReport,
    NumericValue,
    Quality,
    QualityResult,
    SchemaItem,
)
from .sources import DataSources, resolve_schema_sources

_UNSAFE_QUALITY_SQL_MESSAGE = (
    "Unsafe quality SQL: exactly one read-only SELECT statement is required."
)
_QUALITY_MEMORY_LIMIT = "2GB"
_QUALITY_TEMP_DIRECTORY_LIMIT = "2GB"
_QUALITY_THREADS = 1 if sys.platform == "emscripten" else 2


def _configure_quality_connection(
    conn: duckdb.DuckDBPyConnection,
) -> None:
    conn.execute("SET allow_community_extensions = false")
    conn.execute("SET autoinstall_known_extensions = false")
    conn.execute("SET autoload_known_extensions = false")
    conn.execute("SET allow_persistent_secrets = false")
    conn.execute("SET allow_unredacted_secrets = false")
    conn.execute(f"SET threads = {_QUALITY_THREADS}")
    conn.execute(f"SET memory_limit = '{_QUALITY_MEMORY_LIMIT}'")
    conn.execute(f"SET max_temp_directory_size = '{_QUALITY_TEMP_DIRECTORY_LIMIT}'")


def _lock_quality_connection(conn: duckdb.DuckDBPyConnection) -> None:
    conn.execute("SET enable_external_access = false")
    conn.execute("SET lock_configuration = true")


def _materialize_data_source_table(
    conn: duckdb.DuckDBPyConnection,
    table_name: str,
    source_path: str,
    ext: str,
) -> None:
    source_path_literal = source_path.replace("'", "''")
    quoted_table_name = _quote_identifier(table_name)

    if ext == ".parquet":
        conn.execute(
            f"CREATE TEMP TABLE {quoted_table_name} AS "
            f"SELECT * FROM read_parquet('{source_path_literal}')"
        )
        return
    if ext == ".csv":
        conn.execute(
            f"CREATE TEMP TABLE {quoted_table_name} AS "
            f"SELECT * FROM read_csv_auto('{source_path_literal}')"
        )
        return

    try:
        conn.execute(
            f"CREATE TEMP TABLE {quoted_table_name} AS "
            f"SELECT * FROM read_parquet('{source_path_literal}')"
        )
    except Exception:
        conn.execute(f"DROP TABLE IF EXISTS {quoted_table_name}")
        try:
            conn.execute(
                f"CREATE TEMP TABLE {quoted_table_name} AS "
                f"SELECT * FROM read_csv_auto('{source_path_literal}')"
            )
        except Exception as csv_exc:
            raise ValueError(
                "Unsupported or unreadable data source. "
                "Use a .parquet/.csv file, or valid parquet/csv bytes."
            ) from csv_exc


def _create_data_source_view(
    conn: duckdb.DuckDBPyConnection,
    view_name: str,
    source_table_name: str,
) -> None:
    conn.execute(
        f"CREATE VIEW {_quote_identifier(view_name)} AS "
        f"SELECT * FROM {_quote_identifier(source_table_name)}"
    )


def _validate_quality_sql(
    conn: duckdb.DuckDBPyConnection,
    sql: str,
) -> None:
    try:
        statements = conn.extract_statements(sql)
    except Exception as exc:
        raise ValueError(f"Invalid quality SQL: {exc}") from exc

    if len(statements) != 1:
        raise ValueError(_UNSAFE_QUALITY_SQL_MESSAGE)

    statement_type = getattr(statements[0].type, "name", "")
    if statement_type != "SELECT":
        raise ValueError(_UNSAFE_QUALITY_SQL_MESSAGE)


def _run_duckdb_scalar_query(
    conn: duckdb.DuckDBPyConnection,
    sql: str,
) -> NumericValue:
    _validate_quality_sql(conn, sql)
    cursor = conn.execute(sql)
    if not cursor.description or len(cursor.description) != 1:
        raise ValueError("Quality SQL query must return exactly one column.")

    rows = cursor.fetchmany(2)
    if len(rows) != 1:
        raise ValueError("Quality SQL query must return exactly one row.")

    value = rows[0][0]
    if value is None:
        raise ValueError("Quality SQL query returned NULL.")
    if isinstance(value, bool) or not isinstance(value, (int, float, Decimal)):
        raise ValueError("Quality SQL query must return a numeric value.")
    if isinstance(value, float) and not math.isfinite(value):
        raise ValueError("Quality SQL query returned a non-finite number.")
    if isinstance(value, Decimal) and not value.is_finite():
        raise ValueError("Quality SQL query returned a non-finite number.")
    return value


def _numeric_as_decimal(value: NumericValue) -> Decimal:
    if isinstance(value, bool):
        raise ValueError("Quality comparison values must be numeric.")
    converted = value if isinstance(value, Decimal) else Decimal(str(value))
    if not converted.is_finite():
        raise ValueError("Quality comparison values must be finite.")
    return converted


def _quality_comparison_passes(
    obtained: NumericValue,
    operator: ComparisonOperator,
    expected: NumericValue | BetweenExpectation,
) -> bool:
    actual = _numeric_as_decimal(obtained)
    if operator == ComparisonOperator.between:
        if not isinstance(expected, BetweenExpectation):
            raise ValueError("between requires min and max values.")
        return (
            _numeric_as_decimal(expected.min)
            <= actual
            <= _numeric_as_decimal(expected.max)
        )

    if isinstance(expected, BetweenExpectation):
        raise ValueError(f"{operator.value} requires one numeric value.")
    target = _numeric_as_decimal(expected)
    comparisons = {
        ComparisonOperator.equal: actual == target,
        ComparisonOperator.not_equal: actual != target,
        ComparisonOperator.greater_than: actual > target,
        ComparisonOperator.greater_than_or_equal: actual >= target,
        ComparisonOperator.less_than: actual < target,
        ComparisonOperator.less_than_or_equal: actual <= target,
    }
    return comparisons[operator]


@dataclass(frozen=True)
class _QualityJob:
    schema_name: str
    property_name: str
    quality: Quality
    operator: ComparisonOperator
    expected: NumericValue | BetweenExpectation


def run_quality_checks(
    schemas: list[SchemaItem],
    data_sources: DataSources,
    backend: str = "auto",
    include_schemas: set[str] | None = None,
) -> ContractReport:
    """Execute SQL rules across schema views in one hardened DuckDB session."""
    if backend not in {"auto", "duckdb"}:
        raise ValueError(
            f"Unknown backend: '{backend}'. Allowed values: ['auto', 'duckdb']"
        )

    quality_jobs: list[_QualityJob] = []
    for schema_item in schemas:
        if include_schemas is not None and schema_item.name not in include_schemas:
            continue
        for prop in schema_item.properties:
            if not prop.quality:
                continue

            for q in prop.quality:
                if not q.query.strip():
                    continue

                operator, expected = q.resolved_expectation()
                quality_jobs.append(
                    _QualityJob(
                        schema_name=schema_item.name,
                        property_name=prop.name,
                        quality=q,
                        operator=operator,
                        expected=expected,
                    )
                )

    if not quality_jobs:
        return ContractReport(
            success=True,
            code=0,
            results=[],
            summary="No executable SQL quality checks defined.",
        )

    results: list[QualityResult] = []

    def append_error(job: _QualityJob, exc: Exception) -> None:
        results.append(
            QualityResult(
                schema_name=job.schema_name,
                property_name=job.property_name,
                description=job.quality.description,
                query=job.quality.query,
                status=CheckStatus.error,
                operator=job.operator,
                expected=job.expected,
                error_message=str(exc),
            )
        )

    schema_names = {schema.name for schema in schemas}

    resolved_sources = resolve_schema_sources(schemas, data_sources)
    conn = None
    temp_paths: list[str] = []
    try:
        conn = duckdb.connect()
        _configure_quality_connection(conn)
        source_errors: dict[str, Exception] = {}
        prepared_views: set[str] = set()
        for index, schema_item in enumerate(schemas):
            source = resolved_sources.get(schema_item.name)
            if source is None:
                source_errors[schema_item.name] = ValueError(
                    f"No data file is mapped to schema '{schema_item.name}'."
                )
                continue

            table_name = f"__clinical_contract_quality_source_{index}"
            while table_name in schema_names:
                table_name += "_"
            try:
                source_path, temp_path, ext = _materialize_data_source(source)
                if temp_path:
                    temp_paths.append(temp_path)
                _materialize_data_source_table(
                    conn,
                    table_name,
                    source_path,
                    ext,
                )
                _create_data_source_view(conn, schema_item.name, table_name)
                prepared_views.add(schema_item.name)
            except Exception as exc:
                source_errors[schema_item.name] = exc
        _lock_quality_connection(conn)
    except Exception as exc:
        for job in quality_jobs:
            append_error(job, exc)
    else:
        for job in quality_jobs:
            source_error = source_errors.get(job.schema_name)
            if source_error is not None:
                append_error(job, source_error)
                continue
            if job.schema_name not in prepared_views:
                append_error(
                    job,
                    ValueError(
                        f"Data view for schema '{job.schema_name}' is unavailable."
                    ),
                )
                continue

            try:
                obtained = _run_duckdb_scalar_query(
                    conn,
                    job.quality.query,
                )
                status = (
                    CheckStatus.passed
                    if _quality_comparison_passes(
                        obtained,
                        job.operator,
                        job.expected,
                    )
                    else CheckStatus.failed
                )
                results.append(
                    QualityResult(
                        schema_name=job.schema_name,
                        property_name=job.property_name,
                        description=job.quality.description,
                        query=job.quality.query,
                        status=status,
                        operator=job.operator,
                        expected=job.expected,
                        obtained=obtained,
                    )
                )

            except Exception as exc:
                append_error(job, exc)
    finally:
        if conn is not None:
            conn.close()
        for temp_path in temp_paths:
            _cleanup_temp_path(temp_path)

    # Return code
    has_error = any(r.status == CheckStatus.error for r in results)
    has_failed = any(r.status == CheckStatus.failed for r in results)
    all_ok = not has_error and not has_failed

    if all_ok:
        code, summary = 0, "All checks passed."
    elif has_error:
        code, summary = 2, "Execution errors were encountered."
    else:
        n_fail = sum(1 for r in results if r.status == CheckStatus.failed)
        n_total = len(results)
        code = 1
        summary = f"{n_total - n_fail}/{n_total} checks passed."

    return ContractReport(
        success=all_ok,
        code=code,
        results=results,
        summary=summary,
    )
