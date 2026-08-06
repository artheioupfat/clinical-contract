"""Public DataContract model and compatibility exports."""

from __future__ import annotations

from pydantic import BaseModel, Field

from .models import (
    ContractReport,
    Description,
    Property,
    Quality,
    SchemaCheckReport,
    SchemaItem,
    ValidateReport,
)
from .quality_check import run_quality_checks
from .schema_check import check_contract_schema
from .sources import DataSources
from .validation import validate_contract_structure


class DataContract(BaseModel):
    """Validated data contract with schema and quality-check operations."""

    apiVersion: str
    kind: str
    id: str
    name: str
    version: str
    status: str
    description: Description
    schema_: list[SchemaItem] = Field(alias="schema")

    model_config = {"populate_by_name": True}

    @classmethod
    def validate_structure(cls, raw: dict) -> ValidateReport:
        """Validate the required structure of a raw contract mapping."""
        return validate_contract_structure(raw)

    def check_schema(self, data_sources: DataSources) -> list[SchemaCheckReport]:
        """Compare each contract schema with its CSV or Parquet source."""
        return check_contract_schema(self.schema_, data_sources)

    def check(
        self,
        data_sources: DataSources,
        backend: str = "auto",
        include_schemas: set[str] | None = None,
    ) -> ContractReport:
        """Execute SQL quality rules across resolved CSV or Parquet tables."""
        return run_quality_checks(
            self.schema_,
            data_sources,
            backend=backend,
            include_schemas=include_schemas,
        )
