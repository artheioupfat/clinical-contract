from __future__ import annotations

from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class CheckStatus(str, Enum):
    passed = "passed"
    failed = "failed"
    error  = "error"


class QualityResult(BaseModel):
    """Result of a single quality check."""
    schema_name: str
    property_name: str
    description: str
    query: str
    status: CheckStatus
    expected: int
    obtained: Optional[int] = None
    error_message: Optional[str] = None

    @property
    def ok(self) -> bool:
        return self.status == CheckStatus.passed


class ContractReport(BaseModel):
    """
    Top-level report returned by contract.check().

    code 0 — all checks passed
    code 1 — one or more checks failed
    code 2 — one or more execution errors
    """
    success: bool
    code: int
    results: list[QualityResult] = Field(default_factory=list)
    summary: str = ""

    def passed(self) -> list[QualityResult]:
        return [r for r in self.results if r.status == CheckStatus.passed]

    def failed(self) -> list[QualityResult]:
        return [r for r in self.results if r.status == CheckStatus.failed]

    def errors(self) -> list[QualityResult]:
        return [r for r in self.results if r.status == CheckStatus.error]


class FieldValidation(BaseModel):
    """Result of a single field validation in 'validate' command."""
    field: str
    present: bool
    value: Optional[str] = None

    @property
    def status_icon(self) -> str:
        return "✅" if self.present else "❌"

    @property
    def display_value(self) -> str:
        if not self.present:
            return "manquant"
        return self.value or "présent"


class ValidateReport(BaseModel):
    """Report returned by the validate command."""
    success: bool
    fields: list[FieldValidation] = Field(default_factory=list)

    def missing(self) -> list[FieldValidation]:
        return [f for f in self.fields if not f.present]


class ColumnCheckStatus(str, Enum):
    ok = "ok"  # colonne présente et type compatible
    missing = "missing"  # colonne absente du parquet
    optional_missing = "optional_missing"  # colonne absente mais optionnelle
    type_mismatch = "type_mismatch"  # colonne présente mais type incompatible


class ColumnCheckResult(BaseModel):
    """Result of a single column check (schema vs parquet)."""
    column: str
    yaml_type: str
    parquet_type: str   # "—" si absente
    status: ColumnCheckStatus

    @property
    def status_icon(self) -> str:
        if self.status == ColumnCheckStatus.ok:
            return "✅"
        if self.status == ColumnCheckStatus.optional_missing:
            return "⚪ optionnel"
        if self.status == ColumnCheckStatus.missing:
            return "❌ absent"
        return "❌ type"


class SchemaCheckReport(BaseModel):
    """Report of schema compatibility check (columns + types)."""
    success: bool
    schema_name: str
    columns: list[ColumnCheckResult] = Field(default_factory=list)

    def failures(self) -> list[ColumnCheckResult]:
        return [
            c for c in self.columns
            if c.status not in {ColumnCheckStatus.ok, ColumnCheckStatus.optional_missing}
        ]
