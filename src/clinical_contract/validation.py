"""Structural validation for raw data-contract mappings."""

from __future__ import annotations

from typing import Any

from pydantic import ValidationError

from .models import FieldValidation, Quality, ValidateReport
from .type_system import (
    _is_supported_logical_type,
    _is_supported_physical_type,
)

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
REQUIRED_SCHEMA_FIELDS = ["name", "physicalType", "description", "properties"]


def _non_empty_string(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _validate_quality_rules(rules: Any, path: str) -> list[str]:
    if not isinstance(rules, list):
        return [f"{path} must be a list"]

    errors = []
    for index, rule in enumerate(rules):
        rule_path = f"{path}[{index}]"
        if not isinstance(rule, dict):
            errors.append(f"{rule_path} invalid (not an object)")
            continue
        try:
            Quality.model_validate({"type": "sql", **rule})
        except ValidationError as exc:
            errors.append(f"{rule_path} invalid: {exc.errors()[0]['msg']}")
    return errors


def _validate_property(value: Any, path: str) -> tuple[list[str], bool]:
    if not isinstance(value, dict):
        return [f"{path} invalid (not an object)"], False
    if "name" not in value:
        return [f"{path} missing name"], False

    required = value.get("required")
    if required is not None and type(required) is not bool:
        return [f"{path}.required must be true or false"], False

    logical_type = value.get("logicalType")
    if _non_empty_string(logical_type) and not _is_supported_logical_type(logical_type):
        return [f"{path}.logicalType unsupported: {logical_type!r}"], False

    physical_type = value.get("physicalType")
    if _non_empty_string(physical_type) and not _is_supported_physical_type(
        physical_type
    ):
        return [f"{path}.physicalType unsupported: {physical_type!r}"], False

    quality_rules = value.get("quality")
    if quality_rules is None:
        return [], True
    return _validate_quality_rules(quality_rules, f"{path}.quality"), True


def _validate_schema(value: Any) -> tuple[bool, str]:
    if not isinstance(value, list) or not value:
        return False, "empty or invalid"

    errors = []
    total_columns = 0
    for schema_index, schema in enumerate(value):
        schema_path = f"schema[{schema_index}]"
        if not isinstance(schema, dict):
            errors.append(f"{schema_path} invalid (not an object)")
            continue

        missing = [field for field in REQUIRED_SCHEMA_FIELDS if field not in schema]
        if missing:
            errors.append(f"{schema_path} missing {', '.join(missing)}")
            continue

        properties = schema.get("properties")
        if not isinstance(properties, list) or not properties:
            errors.append(f"{schema_path}.properties empty or invalid")
            continue

        for property_index, prop in enumerate(properties):
            property_errors, is_column = _validate_property(
                prop,
                f"{schema_path}.properties[{property_index}]",
            )
            errors.extend(property_errors)
            total_columns += int(is_column)

    if errors:
        return False, f"{len(errors)} error(s): {errors[0]}"
    suffix = "s" if total_columns != 1 else ""
    return True, f"{total_columns} column{suffix} detected"


def validate_contract_structure(raw: dict) -> ValidateReport:
    """Validate required fields and nested schema definitions."""
    if not isinstance(raw, dict):
        raw = {}

    fields = []
    for field in REQUIRED_FIELDS:
        value = raw.get(field)
        if value is None:
            present, display = False, None
        elif field == "schema":
            present, display = _validate_schema(value)
        elif field == "description":
            present = isinstance(value, dict)
            display = "structure valid" if present else "invalid (not an object)"
        else:
            present, display = True, str(value)

        fields.append(FieldValidation(field=field, present=present, value=display))

    return ValidateReport(
        success=all(field.present for field in fields),
        fields=fields,
    )
