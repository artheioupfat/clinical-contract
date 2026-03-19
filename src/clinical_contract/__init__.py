"""
clinical-contract
=================
Valide des data contracts YAML cliniques contre des fichiers Parquet.

Usage CLI :
    clinical-contract validate contract.yaml
    clinical-contract check    contract.yaml data.parquet

Usage Python :
    from clinical_contract import load_contract

    contract, raw = load_contract("contract.yaml")
    report = contract.check("data.parquet")

    if not report.success:
        for r in report.failed():
            print(r.description, r.obtained, "!=", r.expected)
"""

from .loader import load_contract, load_raw
from .contract import DataContract, SchemaItem, Property, Quality, Description
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
from .backends import (
    DuckDBBackend,
    auto_backend,
    available_backends,
)

__all__ = [
    "load_contract",
    "load_raw",
    "DataContract",
    "SchemaItem",
    "Property",
    "Quality",
    "Description",
    "ContractReport",
    "ValidateReport",
    "QualityResult",
    "FieldValidation",
    "CheckStatus",
    "ColumnCheckResult",
    "ColumnCheckStatus",
    "SchemaCheckReport",
    "DuckDBBackend",
    "auto_backend",
    "available_backends",
]

from importlib.metadata import version, PackageNotFoundError
try:
    __version__ = version("clinical-contract")
except PackageNotFoundError:
    __version__ = "unknown"
