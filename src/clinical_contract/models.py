from __future__ import annotations

from decimal import Decimal
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, field_validator, model_validator


NumericValue = int | float | Decimal


class ComparisonOperator(str, Enum):
    equal = "equal"
    not_equal = "notEqual"
    greater_than = "greaterThan"
    greater_than_or_equal = "greaterThanOrEqual"
    less_than = "lessThan"
    less_than_or_equal = "lessThanOrEqual"
    between = "between"


class BetweenExpectation(BaseModel):
    min: NumericValue
    max: NumericValue

    @field_validator("min", "max", mode="before")
    @classmethod
    def reject_boolean_bounds(cls, value):
        if isinstance(value, bool):
            raise ValueError("comparison values must be numeric, not boolean")
        return value

    @model_validator(mode="after")
    def validate_bounds(self):
        if Decimal(str(self.min)) > Decimal(str(self.max)):
            raise ValueError("between.min must be less than or equal to between.max")
        return self


class QualityExpectation(BaseModel):
    equal: Optional[NumericValue] = None
    not_equal: Optional[NumericValue] = Field(default=None, alias="notEqual")
    greater_than: Optional[NumericValue] = Field(default=None, alias="greaterThan")
    greater_than_or_equal: Optional[NumericValue] = Field(
        default=None,
        alias="greaterThanOrEqual",
    )
    less_than: Optional[NumericValue] = Field(default=None, alias="lessThan")
    less_than_or_equal: Optional[NumericValue] = Field(
        default=None,
        alias="lessThanOrEqual",
    )
    between: Optional[BetweenExpectation] = None

    model_config = {"populate_by_name": True}

    @field_validator(
        "equal",
        "not_equal",
        "greater_than",
        "greater_than_or_equal",
        "less_than",
        "less_than_or_equal",
        mode="before",
    )
    @classmethod
    def reject_boolean_values(cls, value):
        if isinstance(value, bool):
            raise ValueError("comparison values must be numeric, not boolean")
        return value

    @model_validator(mode="after")
    def validate_single_operator(self):
        if len(self.configured_comparisons()) != 1:
            raise ValueError("expected must define exactly one comparison operator")
        return self

    def configured_comparisons(
        self,
    ) -> list[tuple[ComparisonOperator, NumericValue | BetweenExpectation]]:
        candidates = (
            (ComparisonOperator.equal, self.equal),
            (ComparisonOperator.not_equal, self.not_equal),
            (ComparisonOperator.greater_than, self.greater_than),
            (ComparisonOperator.greater_than_or_equal, self.greater_than_or_equal),
            (ComparisonOperator.less_than, self.less_than),
            (ComparisonOperator.less_than_or_equal, self.less_than_or_equal),
            (ComparisonOperator.between, self.between),
        )
        return [
            (operator, value) for operator, value in candidates if value is not None
        ]

    def resolve(
        self,
    ) -> tuple[ComparisonOperator, NumericValue | BetweenExpectation]:
        return self.configured_comparisons()[0]


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


def _format_numeric(value: NumericValue) -> str:
    if isinstance(value, Decimal):
        return format(value, "f")
    return str(value)


class CheckStatus(str, Enum):
    passed = "passed"
    failed = "failed"
    error = "error"


class QualityResult(BaseModel):
    """Result of a single quality check."""

    schema_name: str
    property_name: str
    description: str
    query: str
    status: CheckStatus
    operator: ComparisonOperator = ComparisonOperator.equal
    expected: NumericValue | BetweenExpectation
    obtained: Optional[NumericValue] = None
    error_message: Optional[str] = None

    @property
    def ok(self) -> bool:
        return self.status == CheckStatus.passed

    @property
    def expected_display(self) -> str:
        if self.operator == ComparisonOperator.between:
            bounds = self.expected
            if not isinstance(bounds, BetweenExpectation):
                return str(bounds)
            return (
                f"{_format_numeric(bounds.min)} <= value <= "
                f"{_format_numeric(bounds.max)}"
            )

        symbols = {
            ComparisonOperator.equal: "=",
            ComparisonOperator.not_equal: "!=",
            ComparisonOperator.greater_than: ">",
            ComparisonOperator.greater_than_or_equal: ">=",
            ComparisonOperator.less_than: "<",
            ComparisonOperator.less_than_or_equal: "<=",
        }
        expected = self.expected
        if isinstance(expected, BetweenExpectation):
            return str(expected)
        return f"{symbols[self.operator]} {_format_numeric(expected)}"


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
        if self.value:
            return self.value
        if not self.present:
            return "missing"
        return "present"


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
    parquet_type: str  # "column not found" si absente
    required: bool
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
            c
            for c in self.columns
            if c.status
            not in {ColumnCheckStatus.ok, ColumnCheckStatus.optional_missing}
        ]
