"""
Core DataContract model.
"""
from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field

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
from .backends import BaseBackend, auto_backend, BACKENDS

# ------------------------------------------------------------------ #
# Mapping souple des types YAML → familles de types Parquet           #
# ------------------------------------------------------------------ #

TYPE_FAMILIES: dict[str, set[str]] = {
    "string":    {"string", "large_string", "utf8", "large_utf8", "text", "varchar"},
    "text":      {"string", "large_string", "utf8", "large_utf8", "text", "varchar"},
    "varchar":   {"string", "large_string", "utf8", "large_utf8", "text", "varchar"},
    "integer":   {"int8", "int16", "int32", "int64", "uint8", "uint16", "uint32", "uint64"},
    "int":       {"int8", "int16", "int32", "int64", "uint8", "uint16", "uint32", "uint64"},
    "int32":     {"int8", "int16", "int32", "int64", "uint8", "uint16", "uint32", "uint64"},
    "int64":     {"int8", "int16", "int32", "int64", "uint8", "uint16", "uint32", "uint64"},
    "float":     {"float16", "float32", "float64", "double", "decimal128", "decimal"},
    "double":    {"float16", "float32", "float64", "double", "decimal128", "decimal"},
    "decimal":   {"float16", "float32", "float64", "double", "decimal128", "decimal"},
    "boolean":   {"bool", "boolean"},
    "bool":      {"bool", "boolean"},
    "date":      {"date32", "date64", "date"},
    "date32":    {"date32", "date64", "date"},
    "datetime":  {"timestamp[ms]", "timestamp[us]", "timestamp[ns]", "timestamp[s]"},
    "timestamp": {"timestamp[ms]", "timestamp[us]", "timestamp[ns]", "timestamp[s]"},
    "binary":    {"binary", "large_binary"},
    "bytes":     {"binary", "large_binary"},
}


def _types_compatible(yaml_type: str, parquet_type: str) -> bool:
    """Retourne True si parquet_type appartient à la famille de yaml_type."""
    yaml_lower    = yaml_type.lower()
    parquet_lower = parquet_type.lower()
    if yaml_lower == parquet_lower:
        return True
    return parquet_lower in TYPE_FAMILIES.get(yaml_lower, set())

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
    description: Description
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
        fields = []
        for field in REQUIRED_FIELDS:
            value = raw.get(field)
            present = value is not None

            # Valeur affichable dans le tableau
            if not present:
                display = None
            elif field == "schema":
                n = len(value) if isinstance(value, list) else 0
                display = f"{n} schema{'s' if n > 1 else ''}"
            elif field == "description":
                display = "présent"
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
        - chaque property existe comme colonne dans le parquet
        - le type de la colonne est compatible avec logicalType du YAML

        Returns
        -------
        list[SchemaCheckReport]
            Un rapport par schema. success=True si tout est ok.
        """
        import pyarrow.parquet as pq
        import io

        if isinstance(parquet_path, (bytes, bytearray)):
            pq_schema = pq.read_schema(io.BytesIO(parquet_path))
        else:
            pq_schema = pq.read_schema(parquet_path)

        # Construit un dict {nom_colonne: type_string} depuis le parquet
        parquet_columns: dict[str, str] = {
            pq_schema.field(i).name: str(pq_schema.field(i).type)
            for i in range(len(pq_schema))
        }

        reports = []
        for schema_item in self.schema_:
            column_results = []

            for prop in schema_item.properties:
                parquet_type = parquet_columns.get(prop.name)

                if parquet_type is None:
                    # Colonne absente
                    column_results.append(ColumnCheckResult(
                        column=prop.name,
                        yaml_type=prop.logicalType,
                        parquet_type="—",
                        status=ColumnCheckStatus.missing,
                    ))
                elif not _types_compatible(prop.logicalType, parquet_type):
                    # Colonne présente mais type incompatible
                    column_results.append(ColumnCheckResult(
                        column=prop.name,
                        yaml_type=prop.logicalType,
                        parquet_type=parquet_type,
                        status=ColumnCheckStatus.type_mismatch,
                    ))
                else:
                    column_results.append(ColumnCheckResult(
                        column=prop.name,
                        yaml_type=prop.logicalType,
                        parquet_type=parquet_type,
                        status=ColumnCheckStatus.ok,
                    ))

            reports.append(SchemaCheckReport(
                schema_name=schema_item.name,
                success=all(c.status == ColumnCheckStatus.ok for c in column_results),
                columns=column_results,
            ))

        return reports

    # ---------------------------------------------------------------- #
    # check() — exécute les quality checks sur le parquet              #
    # ---------------------------------------------------------------- #

    def check(
        self,
        parquet_path: str | bytes,
        backend: str | BaseBackend = "auto",
    ) -> ContractReport:
        """
        Exécute tous les quality checks du contrat sur le fichier parquet.

        Parameters
        ----------
        parquet_path : str | bytes
            Chemin vers le .parquet ou bytes bruts (PyScript).
        backend : str | BaseBackend
            "auto" | "duckdb" | "polars" | "pyarrow"

        Returns
        -------
        ContractReport
            code 0 — tous les checks passent
            code 1 — au moins un check échoue
            code 2 — au moins une erreur d'exécution
        """
        # Résolution du backend
        if isinstance(backend, str):
            if backend == "auto":
                _backend = auto_backend()
            else:
                cls = BACKENDS.get(backend)
                if cls is None:
                    raise ValueError(
                        f"Backend inconnu : '{backend}'. "
                        f"Choix possibles : {list(BACKENDS.keys())}"
                    )
                _backend = cls()
        else:
            _backend = backend

        results: list[QualityResult] = []

        for schema_item in self.schema_:
            for prop in schema_item.properties:
                if not prop.quality:
                    continue

                for q in prop.quality:
                    try:
                        obtained = _backend.run_query(
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

        if all_ok:
            code, summary = 0, "Tous les checks sont passés."
        elif has_error:
            code, summary = 2, "Des erreurs d'exécution ont été rencontrées."
        else:
            n_fail = sum(1 for r in results if r.status == CheckStatus.failed)
            n_total = len(results)
            code    = 1
            summary = f"{n_total - n_fail}/{n_total} checks passés."

        return ContractReport(
            success=all_ok,
            code=code,
            results=results,
            summary=summary,
        )
