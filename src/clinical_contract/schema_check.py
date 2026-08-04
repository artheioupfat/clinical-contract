"""Schema compatibility checks for CSV and Parquet data sources."""

from __future__ import annotations

from .data_source import _read_data_source
from .models import (
    ColumnCheckResult,
    ColumnCheckStatus,
    SchemaCheckReport,
    SchemaItem,
)
from .type_system import _data_type_for_display, _property_types_compatible


def check_contract_schema(
    schemas: list[SchemaItem],
    data_path: str | bytes,
) -> list[SchemaCheckReport]:
    """Compare required columns and declared types with a data source."""
    parquet_columns = _read_data_source(data_path)
    reports = []
    for schema_item in schemas:
        column_results = []
        for prop in schema_item.properties:
            parquet_type = parquet_columns.get(prop.name)
            expected_type = (
                prop.physicalType.strip() or prop.logicalType.strip() or "not specified"
            )
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
                success=all(
                    c.status
                    in {ColumnCheckStatus.ok, ColumnCheckStatus.optional_missing}
                    for c in column_results
                ),
                columns=column_results,
            )
        )
    return reports
