"""Logical and physical type normalization and compatibility."""

from __future__ import annotations

import re

# ------------------------------------------------------------------ #
# Type matching                                                       #
# ------------------------------------------------------------------ #

STRING_TYPES = {
    "string",
    "large_string",
    "utf8",
    "large_utf8",
    "text",
    "varchar",
    "uuid",
}
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
        return False

    return parquet_lower in allowed_types


def _physical_types_compatible(contract_type: str, detected_type: str) -> bool:
    return _normalize_physical_type(contract_type) == _normalize_physical_type(
        detected_type
    )


def _property_types_compatible(
    logical_type: str, physical_type: str, detected_type: str
) -> bool:
    logical_type = logical_type.strip()
    physical_type = physical_type.strip()
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
