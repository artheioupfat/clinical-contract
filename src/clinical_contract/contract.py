"""
Core DataContract model.
"""
from __future__ import annotations

import os
import tempfile
from typing import Optional
from pydantic import BaseModel, Field
from pathlib import Path
import duckdb

from .models import (
    CheckStatus,
    ColumnCheckResult,
    ColumnCheckStatus,
    ContractReport,
    FieldValidation,
    QualityResult,
    SchemaCheckReport,
    ValidateReport,
)

# ------------------------------------------------------------------ #
# Mapping souple des types YAML → familles de types Parquet           #
# ------------------------------------------------------------------ #

TYPE_MAP: dict[str, set[str]] = {
    # GENÉRIQUES
    "string":   {"string", "large_string", "utf8", "large_utf8", "text", "varchar"},
    "int":      {"int8","int16","int32","int64","uint8","uint16","uint32","uint64",
                 "tinyint","smallint","integer","bigint","utinyint","usmallint","uinteger","ubigint"},
    "float":    {"float16","float32","float64","double","real","decimal128","decimal"},
    "datetime": {"timestamp","timestamp with time zone","timestamptz",
                 "timestamp[ms]","timestamp[us]","timestamp[ns]","timestamp[s]",
                 "date32","date64","date"},
    "boolean":  {"bool","boolean"},
    "binary":   {"binary","large_binary"},

    # SPÉCIFIQUES
    "int8":   {"tinyint"},
    "int16":  {"smallint"},
    "int32":  {"integer"},
    "int64":  {"bigint"},
    "uint8":  {"utinyint"},
    "uint16": {"usmallint"},
    "uint32": {"uinteger"},
    "uint64": {"ubigint"},
    "float32":{"float32"},
    "float64":{"float64","double"},
    "double": {"double","float64"},
    "date32": {"date32"},
    "date64": {"date64"},
    "date":   {"date"},
}


PARQUET_TO_LOGICAL_DISPLAY_MAP: dict[str, str] = {
    "string": "string",
    "large_string": "string",
    "utf8": "string",
    "large_utf8": "string",
    "text": "string",
    "varchar": "string",
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
    "timestamp": "timestamp",
    "timestamp with time zone": "timestamp with time zone",
    "timestamptz": "timestamp with time zone",
    "date32": "date",
    "date64": "date",
    "date": "date",
    "bool": "boolean",
    "boolean": "boolean",
    "binary": "binary",
    "large_binary": "binary",
    "blob": "binary",
}


def _normalize_type_name(type_name: str) -> str:
    type_lower = type_name.lower().strip()
    if type_lower.startswith("timestamp["):
        return "timestamp"
    if type_lower.startswith("decimal("):
        return "decimal"
    return type_lower




def _is_supported_logical_type(logical_type: str) -> bool:
    logical_lower = logical_type.lower().strip()
    if logical_lower.startswith("timestamp["):
        logical_lower = "datetime"
    if logical_lower.startswith("decimal("):
        logical_lower = "float"
    return logical_lower in TYPE_MAP


def _types_compatible(yaml_type: str, parquet_type: str) -> bool:
    """Return True if YAML type matches Parquet type based on TYPE_MAP."""
    yaml_lower = yaml_type.lower().strip()
    parquet_lower = _normalize_type_name(parquet_type)

    # Normalisation
    if yaml_lower.startswith("timestamp["):
        yaml_lower = "datetime"
    if yaml_lower.startswith("decimal("):
        yaml_lower = "float"

    allowed_types = TYPE_MAP.get(yaml_lower)
    if not allowed_types:
        return False  # type YAML non supporté

    return parquet_lower in allowed_types


def _logical_type_for_display(parquet_type: str) -> str:
    normalized = _normalize_type_name(parquet_type)
    return PARQUET_TO_LOGICAL_DISPLAY_MAP.get(normalized, normalized)


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


def _run_duckdb_query(sql: str, parquet_path: str | bytes, table_name: str) -> int:
    try:
        import duckdb
    except ImportError as exc:
        raise ImportError(
            "DuckDB is required to execute quality checks. "
            "Install with: pip install \"clinical-contract[duckdb]\""
        ) from exc

    source_path, temp_path, ext = _materialize_data_source(parquet_path)
    source_path_literal = source_path.replace("'", "''")

    try:
        with duckdb.connect() as conn:
            if ext == ".parquet":
                conn.execute(
                    f"CREATE VIEW {_quote_identifier(table_name)} AS "
                    f"SELECT * FROM read_parquet('{source_path_literal}')"
                )
            elif ext == ".csv":
                conn.execute(
                    f"CREATE VIEW {_quote_identifier(table_name)} AS "
                    f"SELECT * FROM read_csv_auto('{source_path_literal}')"
                )
            else:
                try:
                    conn.execute(
                        f"CREATE VIEW {_quote_identifier(table_name)} AS "
                        f"SELECT * FROM read_parquet('{source_path_literal}')"
                    )
                except Exception:
                    try:
                        conn.execute(
                            f"CREATE VIEW {_quote_identifier(table_name)} AS "
                            f"SELECT * FROM read_csv_auto('{source_path_literal}')"
                        )
                    except Exception as csv_exc:
                        raise ValueError(
                            "Unsupported or unreadable data source. "
                            "Use a .parquet/.csv file, or valid parquet/csv bytes."
                        ) from csv_exc

            result = conn.execute(sql).fetchone()
            return int(result[0] or 0)
    finally:
        _cleanup_temp_path(temp_path)

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
    purpose: str
    usage: str
    limitations: str


class Quality(BaseModel):
    type: str
    description: str
    query: str
    mustBe: int


class Property(BaseModel):
    name: str
    logicalType: str
    physicalType: str
    description: str
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
                            required_prop_fields = ["name", "logicalType", "description"]
                            for j, prop in enumerate(properties):
                                if not isinstance(prop, dict):
                                    errors.append(f"schema[{i}].properties[{j}] invalid (not an object)")
                                    continue
                                missing_prop_fields = [f for f in required_prop_fields if f not in prop]
                                if missing_prop_fields:
                                    errors.append(f"schema[{i}].properties[{j}] missing {', '.join(missing_prop_fields)}")
                                else:
                                    logical_type = prop.get("logicalType")
                                    if not isinstance(logical_type, str) or not _is_supported_logical_type(logical_type):
                                        errors.append(
                                            f"schema[{i}].properties[{j}].logicalType unsupported: {logical_type!r}"
                                        )
                                    else:
                                        total_columns += 1

                    if errors:
                        present = False
                        display = f"{len(errors)} error(s): {errors[0]}"
                    else:
                        present = True
                        display = f"{total_columns} column{'s' if total_columns != 1 else ''} detected"




            #La description doit être composé de 3 sous-champs : purpose, usage, limitations
            elif field == "description": 
                # Vérification des sous-champs
                subfields = ["purpose", "usage", "limitations"]
                if isinstance(value, dict):
                    missing_sub = [s for s in subfields if s not in value]
                    display = "present" if not missing_sub else f"missing {', '.join(missing_sub)}"
                    present = present and not missing_sub
                else:
                    display = "invalid (not an object)"
                    present = False

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
        - le type de la colonne est compatible avec logicalType du YAML
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
                if parquet_type is None:
                    column_results.append(ColumnCheckResult(
                        column=prop.name,
                        yaml_type=prop.logicalType,
                        parquet_type="—",
                        status=ColumnCheckStatus.missing if prop.required else ColumnCheckStatus.optional_missing,
                    ))
                elif not _types_compatible(prop.logicalType, parquet_type):
                    column_results.append(ColumnCheckResult(
                        column=prop.name,
                        yaml_type=prop.logicalType,
                        parquet_type=_logical_type_for_display(parquet_type),
                        status=ColumnCheckStatus.type_mismatch,
                    ))
                else:
                    column_results.append(ColumnCheckResult(
                        column=prop.name,
                        yaml_type=prop.logicalType,
                        parquet_type=_logical_type_for_display(parquet_type),
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

        results: list[QualityResult] = []

        for schema_item in self.schema_:
            for prop in schema_item.properties:
                if not prop.quality:
                    continue

                for q in prop.quality:
                    try:
                        obtained = _run_duckdb_query(
                            sql=q.query,
                            parquet_path=parquet_path,
                            table_name=schema_item.name,
                        )
                        status = (
                            CheckStatus.passed
                            if obtained == q.mustBe
                            else CheckStatus.failed
                        )
                        results.append(QualityResult(
                            schema_name=schema_item.name,
                            property_name=prop.name,
                            description=q.description,
                            query=q.query,
                            status=status,
                            expected=q.mustBe,
                            obtained=obtained,
                        ))

                    except Exception as exc:
                        results.append(QualityResult(
                            schema_name=schema_item.name,
                            property_name=prop.name,
                            description=q.description,
                            query=q.query,
                            status=CheckStatus.error,
                            expected=q.mustBe,
                            error_message=str(exc),
                        ))

        # Code de retour
        has_error  = any(r.status == CheckStatus.error  for r in results)
        has_failed = any(r.status == CheckStatus.failed for r in results)
        all_ok     = not has_error and not has_failed

        if not results:
            code, summary = 0, "No quality checks defined."
        elif all_ok:
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
