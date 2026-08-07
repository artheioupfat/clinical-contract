"""Schema compatibility checks for CSV and Parquet data sources."""

from __future__ import annotations

from .data_source import _read_data_source
from .models import (
    ColumnCheckResult,
    ColumnCheckStatus,
    SchemaCheckReport,
    SchemaItem,
)
from .sources import DataSources, data_source_name, resolve_schema_sources
from .type_system import _data_type_for_display, _property_types_compatible


def _resolve_data_column(
    data_columns: dict[str, str],
    expected_name: str,
) -> tuple[str | None, list[str]]:
    """Resolve a column case-insensitively and report ambiguous matches."""
    if expected_name in data_columns:
        return data_columns[expected_name], []

    matches = [
        name for name in data_columns if name.casefold() == expected_name.casefold()
    ]
    if len(matches) == 1:
        return data_columns[matches[0]], []
    if len(matches) > 1:
        return None, matches
    return None, []


def check_contract_schema(
    schemas: list[SchemaItem],
    data_sources: DataSources,
) -> list[SchemaCheckReport]:
    """Compare every schema with its resolved CSV or Parquet source."""
    resolved_sources = resolve_schema_sources(schemas, data_sources)
    reports = []
    for schema_item in schemas:
        source = resolved_sources.get(schema_item.name)
        if source is None:
            reports.append(
                SchemaCheckReport(
                    schema_name=schema_item.name,
                    success=False,
                    error_message=(
                        f"No data file is mapped to schema '{schema_item.name}'."
                    ),
                )
            )
            continue

        source_name = data_source_name(source)
        try:
            data_columns = _read_data_source(source)
        except Exception as exc:
            reports.append(
                SchemaCheckReport(
                    schema_name=schema_item.name,
                    source_name=source_name,
                    success=False,
                    error_message=str(exc),
                )
            )
            continue

        column_results = []
        for prop in schema_item.properties:
            parquet_type, ambiguous_columns = _resolve_data_column(
                data_columns,
                prop.name,
            )
            expected_type = (
                prop.physicalType.strip() or prop.logicalType.strip() or "not specified"
            )
            if ambiguous_columns:
                column_results.append(
                    ColumnCheckResult(
                        column=prop.name,
                        yaml_type=expected_type,
                        parquet_type=(
                            "ambiguous columns: " + ", ".join(ambiguous_columns)
                        ),
                        required=prop.required,
                        status=ColumnCheckStatus.ambiguous,
                    )
                )
                continue
            if parquet_type is None:
                column_results.append(
                    ColumnCheckResult(
                        column=prop.name,
                        yaml_type=expected_type,
                        parquet_type="column not found",
                        required=prop.required,
                        status=ColumnCheckStatus.missing
                        if prop.required
                        else ColumnCheckStatus.optional_missing,
                    )
                )
                continue

            detected_type = _data_type_for_display(parquet_type)
            type_matches = _property_types_compatible(
                prop.logicalType,
                prop.physicalType,
                parquet_type,
            )

            if not type_matches:
                column_results.append(
                    ColumnCheckResult(
                        column=prop.name,
                        yaml_type=expected_type,
                        parquet_type=detected_type,
                        required=prop.required,
                        status=ColumnCheckStatus.type_mismatch,
                    )
                )
            else:
                column_results.append(
                    ColumnCheckResult(
                        column=prop.name,
                        yaml_type=expected_type,
                        parquet_type=detected_type,
                        required=prop.required,
                        status=ColumnCheckStatus.ok,
                    )
                )
        reports.append(
            SchemaCheckReport(
                schema_name=schema_item.name,
                source_name=source_name,
                success=all(
                    c.status
                    in {ColumnCheckStatus.ok, ColumnCheckStatus.optional_missing}
                    for c in column_results
                ),
                columns=column_results,
            )
        )
    return reports
