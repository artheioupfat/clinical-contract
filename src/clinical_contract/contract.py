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

    def check_schema(self, data_path: str | bytes) -> list[SchemaCheckReport]:
        """Compare contract columns and types with a CSV or Parquet source."""
        return check_contract_schema(self.schema_, data_path)

    def check(
        self,
        data_path: str | bytes,
        backend: str = "auto",
    ) -> ContractReport:
        """Execute SQL quality rules against a CSV or Parquet source."""
        return run_quality_checks(self.schema_, data_path, backend=backend)
