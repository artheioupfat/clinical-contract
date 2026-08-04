"""Type-catalog support and early-validation tests."""

import json
import re
from pathlib import Path

import pytest

from clinical_contract import DataContract, load_raw
from clinical_contract.type_catalog import EDITOR_TYPE_CATALOG
from clinical_contract.type_system import (
    _is_supported_logical_type,
    _is_supported_physical_type,
)

from tests.helpers import (
    _yaml_single_event_timestamp,
    _yaml_single_typed_column,
)


def test_validate_structure_boolen_alias_supported():
    yaml_boolen = """
apiVersion: v1.0.0
kind: DataContract
id: test
name: Test
version: 1.0.0
status: active
description:
  purpose: ok
  usage: ok
  limitations: ok
schema:
  - name: patients
    physicalType: TABLE
    description: table
    properties:
      - name: is_active
        logicalType: boolen
        physicalType: boolean
        description: ok
        required: true
"""
    raw = load_raw(yaml_boolen)
    report = DataContract.validate_structure(raw)
    assert report.success is True


def test_validate_structure_timestamp_with_timezone_physical_supported():
    raw = load_raw(_yaml_single_event_timestamp("date", "timestamp with timezone"))
    report = DataContract.validate_structure(raw)

    assert report.success is True


def test_validate_structure_unknown_logical_type_fails_early():
    yaml_invalid = """
apiVersion: v1.0.0
kind: DataContract
id: test
name: Test
version: 1.0.0
status: active
description:
  purpose: ok
  usage: ok
  limitations: ok
schema:
  - name: patients
    physicalType: TABLE
    description: table
    properties:
      - name: id
        logicalType: unknown_type
        physicalType: TEXT
        description: ok
        required: true
"""
    raw = load_raw(yaml_invalid)
    report = DataContract.validate_structure(raw)

    assert report.success is False
    schema_field = next(f for f in report.fields if f.field == "schema")
    assert (
        "schema[0].properties[0].logicalType unsupported" in schema_field.display_value
    )


def test_validate_structure_accepts_physical_type_without_logical_type():
    yaml_valid = """
apiVersion: v1.0.0
kind: DataContract
id: test
name: Test
version: 1.0.0
status: active
description:
  purpose: ok
  usage: ok
  limitations: ok
schema:
  - name: patients
    physicalType: TABLE
    description: table
    properties:
      - name: id
        physicalType: TEXT
        description: ok
        required: true
"""
    raw = load_raw(yaml_valid)
    report = DataContract.validate_structure(raw)

    assert report.success is True


def test_validate_structure_accepts_column_without_type_specification():
    yaml_valid = """
apiVersion: v1.0.0
kind: DataContract
id: test
name: Test
version: 1.0.0
status: active
description:
  purpose: ok
  usage: ok
  limitations: ok
schema:
  - name: patients
    physicalType: TABLE
    description: table
    properties:
      - name: id
        description: ok
        required: true
"""
    raw = load_raw(yaml_valid)
    report = DataContract.validate_structure(raw)

    assert report.success is True
    schema_field = next(f for f in report.fields if f.field == "schema")
    assert schema_field.display_value == "1 column detected"


def test_validate_structure_accepts_time_logical_and_physical_types():
    raw = load_raw(_yaml_single_event_timestamp("time", "time"))
    report = DataContract.validate_structure(raw)

    assert report.success is True


def test_validate_structure_accepts_array_logical_and_physical_types():
    raw = load_raw(_yaml_single_typed_column("measurements", "array", "array"))
    report = DataContract.validate_structure(raw)

    assert report.success is True


@pytest.mark.parametrize(
    ("logical_type", "physical_type"),
    [("decimal", "decimal"), ("interval", "interval")],
)
def test_validate_structure_accepts_decimal_and_interval_types(
    logical_type,
    physical_type,
):
    raw = load_raw(
        _yaml_single_typed_column("typed_value", logical_type, physical_type)
    )
    report = DataContract.validate_structure(raw)

    assert report.success is True


def test_site_type_catalog_matches_python_type_support():
    catalog_path = (
        Path(__file__).resolve().parents[1] / "site" / "js" / "type-catalog.js"
    )
    catalog_source = catalog_path.read_text(encoding="utf-8")
    match = re.search(
        r"const catalog = (\{.*?\});\s*// TYPE_CATALOG_JSON_END",
        catalog_source,
        flags=re.DOTALL,
    )
    assert match, (
        "Unable to extract the site type catalog JSON. Run: npm run generate:site-types"
    )

    catalog = json.loads(match.group(1))
    assert catalog == EDITOR_TYPE_CATALOG

    logical_options = catalog["logicalTypeOptions"]
    physical_options = [
        physical_type
        for options in catalog["physicalTypeByLogical"].values()
        for physical_type in options
    ]

    assert logical_options
    assert physical_options
    for logical_type in logical_options:
        assert _is_supported_logical_type(logical_type), logical_type
    for physical_type in physical_options:
        assert _is_supported_physical_type(physical_type), physical_type
