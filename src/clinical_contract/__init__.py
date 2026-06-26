"""
clinical-contract
=================
Validate clinical YAML data contracts against Parquet and CSV files.

CLI usage:
    clinical-contract validate contract.yaml
    clinical-contract check    contract.yaml data.parquet

Python usage:
    from clinical_contract import load_contract

    contract, raw = load_contract("contract.yaml")
    report = contract.check("data.parquet")

    if not report.success:
        for r in report.failed():
            print(r.description, r.obtained, "!=", r.expected)
"""

from .loader import load_contract, load_raw
from .contract import DataContract, SchemaItem, Property, Quality, Description
from .type_catalog import EDITOR_TYPE_CATALOG
from .models import (
    ContractReport,
    ValidateReport,
    QualityResult,
    FieldValidation,
    CheckStatus,
    ColumnCheckResult,
    ColumnCheckStatus,
    SchemaCheckReport,
)

__all__ = [
    "load_contract",
    "load_raw",
    "DataContract",
    "SchemaItem",
    "Property",
    "Quality",
    "Description",
    "EDITOR_TYPE_CATALOG",
    "ContractReport",
    "ValidateReport",
    "QualityResult",
    "FieldValidation",
    "CheckStatus",
    "ColumnCheckResult",
    "ColumnCheckStatus",
    "SchemaCheckReport",
]

from importlib.metadata import version, PackageNotFoundError
try:
    __version__ = version("clinical-contract")
except PackageNotFoundError:
    __version__ = "unknown"
