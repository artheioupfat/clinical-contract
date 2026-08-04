"""
Core DataContract model.
"""
from __future__ import annotations

import math
import os
import re
import tempfile
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import Optional

import duckdb
from pydantic import (
    BaseModel,
    Field,
    ValidationError,
    field_validator,
    model_validator,
)

from .models import (
    CheckStatus,
    BetweenExpectation,
    ComparisonOperator,
    ColumnCheckResult,
    ColumnCheckStatus,
    ContractReport,
    FieldValidation,
    QualityResult,
    QualityExpectation,
    NumericValue,
    SchemaCheckReport,
    ValidateReport,
)

# ------------------------------------------------------------------ #
# Type matching                                                       #
# ------------------------------------------------------------------ #

STRING_TYPES = {"string", "large_string", "utf8", "large_utf8", "text", "varchar", "uuid"}
INTEGER_TYPES = {
    "int8",
    "int16",
    "int32",
    "int64",
    "uint8",
    "uint16",
    "uint32",
    "uint64",
    "tinyint",
    "smallint",
    "integer",
    "bigint",
    "utinyint",
    "usmallint",
    "uinteger",
    "ubigint",
}
DECIMAL_TYPES = {"decimal", "decimal128"}
FLOAT_TYPES = {
    "float",
    "float16",
    "float32",
    "float64",
    "double",
    "real",
} | DECIMAL_TYPES
DATE_TYPES = {"date", "date32", "date64"}
TIME_TYPES = {"time"}
INTERVAL_TYPES = {"interval"}
ARRAY_TYPES = {"array"}
DATETIME_TYPES = {
    "datetime",
    "timestamp",
    "timestamp_s",
    "timestamp_ms",
    "timestamp_us",
    "timestamp_ns",
    "timestamp with time zone",
    "timestamptz",
}
BOOLEAN_TYPES = {"bool", "boolean", "binary", "large_binary", "blob"}
BINARY_TYPES = {"binary", "large_binary"}

TYPE_MAP: dict[str, set[str]] = {
    # Generic logical families.
    "string": STRING_TYPES,
    "integer": INTEGER_TYPES,
    "float": FLOAT_TYPES,
    "decimal": DECIMAL_TYPES,
    "date": DATE_TYPES | DATETIME_TYPES,
    "time": TIME_TYPES,
    "interval": INTERVAL_TYPES,
    "array": ARRAY_TYPES,
    "boolean": BOOLEAN_TYPES,
    "binary": BINARY_TYPES,

    # Explicit integer widths are strict.
    "int8": {"tinyint"},
    "int16": {"smallint"},
    "int32": {"integer"},
    "int64": {"bigint"},
    "uint8": {"utinyint"},
    "uint16": {"usmallint"},
    "uint32": {"uinteger"},
    "uint64": {"ubigint"},
    "float32": {"float32"},
    "float64": {"float64", "double"},
    "double": {"double", "float64"},
    "date32": {"date32"},
    "date64": {"date64"},
}

LOGICAL_TYPE_ALIASES: dict[str, str] = {
    "int": "integer",
    "datetime": "date",
    "timestamp": "date",
    "bool": "boolean",
    "boolen": "boolean",
}


DUCKDB_TO_CONTRACT_TYPE_DISPLAY_MAP: dict[str, str] = {
    "string": "string",
    "large_string": "string",
    "utf8": "string",
    "large_utf8": "string",
    "uuid": "uuid",
    "text": "text",
    "varchar": "varchar",
    "tinyint": "int8",
    "smallint": "int16",
    "integer": "int32",
    "bigint": "int64",
    "utinyint": "uint8",
    "usmallint": "uint16",
    "uinteger": "uint32",
    "ubigint": "uint64",
    "float16": "float32",
    "float32": "float32",
    "float64": "float64",
    "real": "float32",
    "double": "float64",
    "decimal": "decimal",
    "interval": "interval",
    "timestamp": "timestamp",
    "timestamp with time zone": "timestamp with time zone",
    "timestamptz": "timestamp with time zone",
    "date32": "date",
    "date64": "date",
    "date": "date",
    "time": "time",
    "array": "array",
    "bool": "boolean",
    "boolean": "boolean",
    "binary": "binary",
    "large_binary": "binary",
    "blob": "binary",
}

PHYSICAL_TYPE_ALIASES: dict[str, str] = {
    "char": "varchar",
    "string": "varchar",
    "text": "varchar",
    "uuid": "uuid",
    "varchar": "varchar",
    "datetime": "timestamp",
    "timestamp": "timestamp",
    "timestamp with time zone": "timestamp with time zone",
    "timestamp with timezone": "timestamp with time zone",
    "timestamptz": "timestamp with time zone",
    "timestamp_s": "timestamp_s",
    "timestamp_ms": "timestamp_ms",
    "timestamp_us": "timestamp_us",
    "timestamp_ns": "timestamp_ns",
    "date": "date",
    "time": "time",
    "decimal": "decimal",
    "interval": "interval",
    "array": "array",
    "date32": "date32",
    "date64": "date64",
    "int8": "tinyint",
    "tinyint": "tinyint",
    "int16": "smallint",
    "smallint": "smallint",
    "int": "integer",
    "int32": "integer",
    "integer": "integer",
    "int64": "bigint",
    "bigint": "bigint",
    "uint8": "utinyint",
    "utinyint": "utinyint",
    "uint16": "usmallint",
    "usmallint": "usmallint",
    "uint32": "uinteger",
    "uinteger": "uinteger",
    "uint64": "ubigint",
    "ubigint": "ubigint",
    "float32": "float",
    "float": "float",
    "real": "float",
    "float64": "double",
    "double": "double",
    "bool": "boolean",
    "boolean": "boolean",
    "binary": "binary",
    "blob": "binary",
}


def _normalize_type_name(type_name: str) -> str:
    type_lower = type_name.lower().strip()
    if re.search(r"\[\d*\]$", type_lower):
        return "array"
    if type_lower.startswith("timestamp["):
        return "timestamp"
    if type_lower.startswith("decimal("):
        return "decimal"
    return type_lower


def _normalize_physical_type(physical_type: str) -> str:
    normalized = _normalize_type_name(physical_type)
    return PHYSICAL_TYPE_ALIASES.get(normalized, normalized)


def _normalize_logical_type(logical_type: str) -> str:
    logical_lower = logical_type.lower().strip()
    if logical_lower.startswith("timestamp["):
        return "date"
    if logical_lower.startswith("decimal("):
        return "decimal"
    return LOGICAL_TYPE_ALIASES.get(logical_lower, logical_lower)




def _is_supported_logical_type(logical_type: str) -> bool:
    logical_lower = _normalize_logical_type(logical_type)
    return logical_lower in TYPE_MAP


def _is_supported_physical_type(physical_type: str) -> bool:
    physical_lower = _normalize_physical_type(physical_type)
    return physical_lower in PHYSICAL_TYPE_ALIASES.values()


def _types_compatible(yaml_type: str, parquet_type: str) -> bool:
    """Return True if YAML type matches Parquet type based on TYPE_MAP."""
    yaml_lower = _normalize_logical_type(yaml_type)
    parquet_lower = _normalize_type_name(parquet_type)

    allowed_types = TYPE_MAP.get(yaml_lower)
    if not allowed_types:
        return False  # type YAML non supporté

    return parquet_lower in allowed_types


def _physical_types_compatible(contract_type: str, detected_type: str) -> bool:
    return _normalize_physical_type(contract_type) == _normalize_physical_type(detected_type)


def _property_types_compatible(logical_type: str, physical_type: str, detected_type: str) -> bool:
    if not logical_type and not physical_type:
        return True
    if physical_type:
        normalized_logical = _normalize_logical_type(logical_type)
        normalized_physical = _normalize_physical_type(physical_type)
        normalized_detected = _normalize_type_name(detected_type)
        if (
            normalized_logical == "boolean"
            and normalized_physical == "binary"
            and normalized_detected in BOOLEAN_TYPES
        ):
            return True
        return _physical_types_compatible(physical_type, detected_type)
    return _types_compatible(logical_type, detected_type)


def _data_type_for_display(data_type: str) -> str:
    normalized = _normalize_type_name(data_type)
    return DUCKDB_TO_CONTRACT_TYPE_DISPLAY_MAP.get(normalized, normalized)


def _quote_identifier(identifier: str) -> str:
    escaped = identifier.replace('"', '""')
    return f'"{escaped}"'


def _materialize_data_source(path_or_bytes: str | bytes) -> tuple[str, str | None, str]:
    """
    Return (file_path, temp_path_to_cleanup, extension).
    Bytes are written to a temporary file with unknown extension (.bin)
    so parquet/csv detection can be attempted safely.
    """
    if isinstance(path_or_bytes, (bytes, bytearray)):
        fd, temp_path = tempfile.mkstemp(suffix=".bin")
        os.close(fd)
        with open(temp_path, "wb") as handle:
            handle.write(bytes(path_or_bytes))
        return temp_path, temp_path, ".bin"

    file_path = str(path_or_bytes)
    return file_path, None, Path(file_path).suffix.lower()


def _read_data_source(path_or_bytes: str | bytes):
    """
    Retourne un mapping {col_name: type_name} pour Parquet ou CSV,
    et fournit un "chemin temporaire" si nécessaire pour DuckDB.
    """
    file_path, cleanup, ext = _materialize_data_source(path_or_bytes)
    file_path_literal = file_path.replace("'", "''")

    try:
        with duckdb.connect() as conn:
            if ext == ".parquet":
                rows = conn.execute(
                    f"DESCRIBE SELECT * FROM read_parquet('{file_path_literal}')"
                ).fetchall()
            elif ext == ".csv":
                rows = conn.execute(
                    f"DESCRIBE SELECT * FROM read_csv_auto('{file_path_literal}')"
                ).fetchall()
            else:
                try:
                    rows = conn.execute(
                        f"DESCRIBE SELECT * FROM read_parquet('{file_path_literal}')"
                    ).fetchall()
                except Exception as parquet_exc:
                    try:
                        rows = conn.execute(
                            f"DESCRIBE SELECT * FROM read_csv_auto('{file_path_literal}')"
                        ).fetchall()
                    except Exception as csv_exc:
                        raise ValueError(
                            "Unsupported or unreadable data source. "
                            "Use a .parquet/.csv file, or valid parquet/csv bytes."
                        ) from csv_exc
        return {str(r[0]): str(r[1]) for r in rows}
    finally:
        if cleanup:
            try:
                os.remove(cleanup)
            except FileNotFoundError:
                pass


def _cleanup_temp_path(temp_path: str | None) -> None:
    if not temp_path:
        return
    try:
        os.remove(temp_path)
    except FileNotFoundError:
        pass


def _create_data_source_view(
    conn: duckdb.DuckDBPyConnection,
    table_name: str,
    source_path: str,
    ext: str,
) -> None:
    source_path_literal = source_path.replace("'", "''")
    quoted_table_name = _quote_identifier(table_name)

    if ext == ".parquet":
        conn.execute(
            f"CREATE VIEW {quoted_table_name} AS "
            f"SELECT * FROM read_parquet('{source_path_literal}')"
        )
        return
    if ext == ".csv":
        conn.execute(
            f"CREATE VIEW {quoted_table_name} AS "
            f"SELECT * FROM read_csv_auto('{source_path_literal}')"
        )
        return

    try:
        conn.execute(
            f"CREATE VIEW {quoted_table_name} AS "
            f"SELECT * FROM read_parquet('{source_path_literal}')"
        )
    except Exception:
        try:
            conn.execute(
                f"CREATE VIEW {quoted_table_name} AS "
                f"SELECT * FROM read_csv_auto('{source_path_literal}')"
            )
        except Exception as csv_exc:
            raise ValueError(
                "Unsupported or unreadable data source. "
                "Use a .parquet/.csv file, or valid parquet/csv bytes."
            ) from csv_exc


def _run_duckdb_scalar_query(
    conn: duckdb.DuckDBPyConnection,
    sql: str,
) -> NumericValue:
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

# Champs obligatoires au niveau racine du YAML
REQUIRED_FIELDS = [
    "apiVersion",
    "kind",
    "id",
    "name",
    "version",
    "status",
    "description",
    "schema",
]


# ------------------------------------------------------------------ #
# YAML sub-models                                                      #
# ------------------------------------------------------------------ #

class Description(BaseModel):
    purpose: str = ""
    usage: str = ""
    limitations: str = ""


class Quality(BaseModel):
    type: str
    description: str = ""
    query: str = ""
    mustBe: Optional[NumericValue] = None
    expected: Optional[QualityExpectation] = None

    @field_validator("mustBe", mode="before")
    @classmethod
    def reject_boolean_must_be(cls, value):
        if isinstance(value, bool):
            raise ValueError("mustBe must be numeric, not boolean")
        return value

    @model_validator(mode="after")
    def validate_expectation(self):
        if self.mustBe is not None and self.expected is not None:
            raise ValueError("mustBe and expected cannot be used together")
        return self

    def resolved_expectation(
        self,
    ) -> tuple[ComparisonOperator, NumericValue | BetweenExpectation]:
        if self.expected is not None:
            return self.expected.resolve()
        fallback = self.mustBe if self.mustBe is not None else 0
        return ComparisonOperator.equal, fallback


@dataclass(frozen=True)
class _QualityJob:
    schema_name: str
    property_name: str
    quality: Quality
    operator: ComparisonOperator
    expected: NumericValue | BetweenExpectation


class Property(BaseModel):
    name: str
    logicalType: str = ""
    physicalType: str = ""
    description: str = ""
    required: bool = False
    quality: Optional[list[Quality]] = None


class SchemaItem(BaseModel):
    name: str
    physicalType: str
    description: str
    properties: list[Property]


# ------------------------------------------------------------------ #
# Main DataContract                                                    #
# ------------------------------------------------------------------ #

class DataContract(BaseModel):
    apiVersion: str
    kind: str
    id: str
    name: str
    version: str
    status: str
    description: Description #permet de structurer la description en sous-champs (purpose, usage, limitations)
    schema_: list[SchemaItem] = Field(alias="schema")

    model_config = {"populate_by_name": True}

    # ---------------------------------------------------------------- #
    # validate() — vérifie la structure du YAML                        #
    # ---------------------------------------------------------------- #

    @classmethod
    def validate_structure(cls, raw: dict) -> ValidateReport:
        """
        Vérifie que le dict YAML contient tous les champs obligatoires.
        Ne charge pas le parquet — sert de contrôle avant check().

        Returns
        -------
        ValidateReport
        """
        if not isinstance(raw, dict):
            raw = {}

        fields = []
        for field in REQUIRED_FIELDS:  # On vient verifier si les champs existent 
            value = raw.get(field)
            present = value is not None

            # Valeur affichable dans le tableau
            if not present:
                display = None

            #Permet de vérifier que le champ "schema" est une liste non vide et que chaque item contient les sous-champs requis
            elif field == "schema":
                if not isinstance(value, list) or len(value) == 0:
                    present = False
                    display = "empty or invalid"
                else:
                    required_schema_fields = ["name", "physicalType", "description", "properties"]
                    errors = []
                    total_columns = 0

                    for i, item in enumerate(value):
                        if not isinstance(item, dict):
                            errors.append(f"schema[{i}] invalid (not an object)")
                            continue

                        missing_schema_fields = [f for f in required_schema_fields if f not in item]
                        if missing_schema_fields:
                            errors.append(f"schema[{i}] missing {', '.join(missing_schema_fields)}")
                            continue

                        # Vérification des propriétés
                        properties = item.get("properties")
                        if not isinstance(properties, list) or len(properties) == 0:
                            errors.append(f"schema[{i}].properties empty or invalid")
                        else:
                            required_prop_fields = ["name"]
                            for j, prop in enumerate(properties):
                                if not isinstance(prop, dict):
                                    errors.append(f"schema[{i}].properties[{j}] invalid (not an object)")
                                    continue

                                missing_prop_fields = [f for f in required_prop_fields if f not in prop]
                                if missing_prop_fields:
                                    errors.append(f"schema[{i}].properties[{j}] missing {', '.join(missing_prop_fields)}")
                                    continue

                                required_value = prop.get("required")
                                if required_value is not None and type(required_value) is not bool:
                                    errors.append(
                                        f"schema[{i}].properties[{j}].required must be true or false"
                                    )
                                    continue

                                logical_type = prop.get("logicalType")
                                physical_type = prop.get("physicalType")
                                has_logical_type = isinstance(logical_type, str) and bool(logical_type.strip())
                                has_physical_type = isinstance(physical_type, str) and bool(physical_type.strip())

                                if has_logical_type and not _is_supported_logical_type(logical_type):
                                    errors.append(
                                        f"schema[{i}].properties[{j}].logicalType unsupported: {logical_type!r}"
                                    )
                                    continue

                                if has_physical_type and not _is_supported_physical_type(physical_type):
                                    errors.append(
                                        f"schema[{i}].properties[{j}].physicalType unsupported: {physical_type!r}"
                                    )
                                    continue

                                quality_rules = prop.get("quality")
                                if quality_rules is not None:
                                    if not isinstance(quality_rules, list):
                                        errors.append(
                                            f"schema[{i}].properties[{j}].quality must be a list"
                                        )
                                    else:
                                        for k, quality_rule in enumerate(quality_rules):
                                            quality_path = (
                                                f"schema[{i}].properties[{j}]"
                                                f".quality[{k}]"
                                            )
                                            if not isinstance(quality_rule, dict):
                                                errors.append(
                                                    f"{quality_path} invalid (not an object)"
                                                )
                                                continue
                                            try:
                                                Quality.model_validate(
                                                    {"type": "sql", **quality_rule}
                                                )
                                            except ValidationError as exc:
                                                message = exc.errors()[0]["msg"]
                                                errors.append(
                                                    f"{quality_path} invalid: {message}"
                                                )

                                total_columns += 1

                    if errors:
                        present = False
                        display = f"{len(errors)} error(s): {errors[0]}"
                    else:
                        present = True
                        display = f"{total_columns} column{'s' if total_columns != 1 else ''} detected"




            elif field == "description":
                if not isinstance(value, dict):
                    display = "invalid (not an object)"
                    present = False
                else:
                    display = "structure valid"
                    present = True

            # Pour les autres champs, on affiche simplement leur valeur
            else:
                display = str(value)

            fields.append(FieldValidation(
                field=field,
                present=present,
                value=display,
            ))

        success = all(f.present for f in fields)
        return ValidateReport(success=success, fields=fields)

    # ---------------------------------------------------------------- #
    # check_schema() — vérifie colonnes + types contre le parquet      #
    # ---------------------------------------------------------------- #

    def check_schema(self, parquet_path: str | bytes) -> list[SchemaCheckReport]:
        """
        Pour chaque SchemaItem du contrat, vérifie que :
        - chaque property obligatoire existe comme colonne dans le parquet
        - le type détecté est comparé à physicalType si présent
        - sinon, le type détecté est comparé à logicalType
        Les colonnes optionnelles absentes sont signalées mais n'échouent pas.

        Returns
        -------
        list[SchemaCheckReport]
            Un rapport par schema. success=True si tout est ok.
        """
        parquet_columns = _read_data_source(parquet_path)
        reports = []
        for schema_item in self.schema_:
            column_results = []
            for prop in schema_item.properties:
                parquet_type = parquet_columns.get(prop.name)
                expected_type = prop.physicalType.strip() or prop.logicalType.strip() or "not specified"
                if parquet_type is None:
                    column_results.append(ColumnCheckResult(
                        column=prop.name,
                        yaml_type=expected_type,
                        parquet_type="column not found",
                        required=prop.required,
                        status=ColumnCheckStatus.missing if prop.required else ColumnCheckStatus.optional_missing,
                    ))
                    continue

                detected_type = _data_type_for_display(parquet_type)
                type_matches = _property_types_compatible(
                    prop.logicalType,
                    prop.physicalType,
                    parquet_type,
                )

                if not type_matches:
                    column_results.append(ColumnCheckResult(
                        column=prop.name,
                        yaml_type=expected_type,
                        parquet_type=detected_type,
                        required=prop.required,
                        status=ColumnCheckStatus.type_mismatch,
                    ))
                else:
                    column_results.append(ColumnCheckResult(
                        column=prop.name,
                        yaml_type=expected_type,
                        parquet_type=detected_type,
                        required=prop.required,
                        status=ColumnCheckStatus.ok,
                    ))
            reports.append(SchemaCheckReport(
                schema_name=schema_item.name,
                success=all(c.status in {ColumnCheckStatus.ok, ColumnCheckStatus.optional_missing} for c in column_results),
                columns=column_results,
            ))
        return reports

    # ---------------------------------------------------------------- #
    # check() — exécute les quality checks sur le parquet              #
    # ---------------------------------------------------------------- #

    def check(
        self,
        parquet_path: str | bytes,
        backend: str = "auto",
    ) -> ContractReport:
        """
        Exécute tous les quality checks du contrat sur le fichier parquet.

        Parameters
        ----------
        parquet_path : str | bytes
            Chemin vers le .parquet ou bytes bruts (PyScript).
        backend : str
            "auto" | "duckdb"

        Returns
        -------
        ContractReport
            code 0 — tous les checks passent
            code 1 — au moins un check échoue
            code 2 — au moins une erreur d'exécution
        """
        if backend not in {"auto", "duckdb"}:
            raise ValueError(
                f"Unknown backend: '{backend}'. "
                "Allowed values: ['auto', 'duckdb']"
            )

        quality_jobs: list[_QualityJob] = []
        for schema_item in self.schema_:
            for prop in schema_item.properties:
                if not prop.quality:
                    continue

                for q in prop.quality:
                    if not q.query.strip():
                        continue

                    operator, expected = q.resolved_expectation()
                    quality_jobs.append(_QualityJob(
                        schema_name=schema_item.name,
                        property_name=prop.name,
                        quality=q,
                        operator=operator,
                        expected=expected,
                    ))

        if not quality_jobs:
            return ContractReport(
                success=True,
                code=0,
                results=[],
                summary="No executable SQL quality checks defined.",
            )

        results: list[QualityResult] = []

        def append_error(job: _QualityJob, exc: Exception) -> None:
            results.append(QualityResult(
                schema_name=job.schema_name,
                property_name=job.property_name,
                description=job.quality.description,
                query=job.quality.query,
                status=CheckStatus.error,
                operator=job.operator,
                expected=job.expected,
                error_message=str(exc),
            ))

        temp_path = None
        try:
            source_path, temp_path, ext = _materialize_data_source(parquet_path)
            conn = duckdb.connect()
        except Exception as exc:
            for job in quality_jobs:
                append_error(job, exc)
        else:
            prepared_views: dict[str, Exception | None] = {}
            try:
                for job in quality_jobs:
                    if job.schema_name not in prepared_views:
                        try:
                            _create_data_source_view(
                                conn,
                                job.schema_name,
                                source_path,
                                ext,
                            )
                            prepared_views[job.schema_name] = None
                        except Exception as exc:
                            prepared_views[job.schema_name] = exc

                    view_error = prepared_views[job.schema_name]
                    if view_error is not None:
                        append_error(job, view_error)
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
                        results.append(QualityResult(
                            schema_name=job.schema_name,
                            property_name=job.property_name,
                            description=job.quality.description,
                            query=job.quality.query,
                            status=status,
                            operator=job.operator,
                            expected=job.expected,
                            obtained=obtained,
                        ))

                    except Exception as exc:
                        append_error(job, exc)
            finally:
                conn.close()
        finally:
            _cleanup_temp_path(temp_path)

        # Code de retour
        has_error  = any(r.status == CheckStatus.error  for r in results)
        has_failed = any(r.status == CheckStatus.failed for r in results)
        all_ok     = not has_error and not has_failed

        if all_ok:
            code, summary = 0, "All checks passed."
        elif has_error:
            code, summary = 2, "Execution errors were encountered."
        else:
            n_fail = sum(1 for r in results if r.status == CheckStatus.failed)
            n_total = len(results)
            code    = 1
            summary = f"{n_total - n_fail}/{n_total} checks passed."

        return ContractReport(
            success=all_ok,
            code=code,
            results=results,
            summary=summary,
        )
