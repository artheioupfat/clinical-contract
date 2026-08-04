"""Raw contract structure-validation tests."""

import pytest

from clinical_contract import DataContract, load_raw

from tests.helpers import (
    YAML_COMPLET,
    YAML_INCOMPLET,
)


def test_validate_structure_complet():
    raw = load_raw(YAML_COMPLET)
    report = DataContract.validate_structure(raw)
    assert report.success is True
    assert len(report.missing()) == 0


def test_validate_structure_incomplet():
    raw = load_raw(YAML_INCOMPLET)
    report = DataContract.validate_structure(raw)
    assert report.success is False
    missing_fields = [f.field for f in report.missing()]
    assert "id" in missing_fields
    assert "name" in missing_fields
    assert "version" in missing_fields
    assert "status" in missing_fields
    assert "description" in missing_fields


def test_validate_structure_racine_non_mapping():
    report = DataContract.validate_structure(["not", "a", "mapping"])
    assert report.success is False
    assert len(report.missing()) == len(report.fields)


@pytest.mark.parametrize(
    "expected",
    [
        {},
        {"equal": 0, "lessThan": 2},
        {"between": {"min": 10, "max": 1}},
        {"greaterThan": True},
    ],
)
def test_validate_structure_rejects_invalid_quality_expectations(expected):
    raw = load_raw(YAML_COMPLET)
    quality = raw["schema"][0]["properties"][0]["quality"][0]
    quality.pop("mustBe")
    quality["expected"] = expected

    report = DataContract.validate_structure(raw)

    assert report.success is False
    schema_field = next(field for field in report.fields if field.field == "schema")
    assert "quality[0] invalid" in schema_field.display_value


def test_validate_structure_rejects_must_be_with_expected():
    raw = load_raw(YAML_COMPLET)
    quality = raw["schema"][0]["properties"][0]["quality"][0]
    quality["expected"] = {"equal": 0}

    report = DataContract.validate_structure(raw)

    assert report.success is False
    schema_field = next(field for field in report.fields if field.field == "schema")
    assert "mustBe and expected cannot be used together" in schema_field.display_value


def test_validate_structure_schema_missing_fields():
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
    # physicalType manquant
    description: table
    properties:
      - name: id
        logicalType: string
        physicalType: TEXT
        description: ok
"""
    raw = load_raw(yaml_invalid)
    report = DataContract.validate_structure(raw)

    assert report.success is False

    schema_field = next(f for f in report.fields if f.field == "schema")
    assert "error(s)" in schema_field.display_value


def test_validate_structure_properties_invalid():
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
      - # name manquant
        physicalType: TEXT
        description: ok
"""
    raw = load_raw(yaml_invalid)
    report = DataContract.validate_structure(raw)

    assert report.success is False
    schema_field = next(f for f in report.fields if f.field == "schema")
    assert "schema[0].properties[0] missing name" in schema_field.display_value


def test_validate_structure_description_subfields_are_optional():
    yaml_valid = """
apiVersion: v1.0.0
kind: DataContract
id: test
name: Test
version: 1.0.0
status: active
description:
  purpose: ok
schema:
  - name: patients
    physicalType: TABLE
    description: table
    properties:
      - name: id
        logicalType: string
        physicalType: TEXT
        description: ok
"""
    raw = load_raw(yaml_valid)
    report = DataContract.validate_structure(raw)

    assert report.success is True
    desc_field = next(f for f in report.fields if f.field == "description")
    assert desc_field.display_value == "structure valid"


def test_validate_structure_description_not_object():
    yaml_invalid = """
apiVersion: v1.0.0
kind: DataContract
id: test
name: Test
version: 1.0.0
status: active
description: "oops"
schema:
  - name: patients
    physicalType: TABLE
    description: table
    properties:
      - name: id
        logicalType: string
        physicalType: TEXT
        description: ok
"""
    raw = load_raw(yaml_invalid)
    report = DataContract.validate_structure(raw)

    assert report.success is False
    desc_field = next(f for f in report.fields if f.field == "description")
    assert desc_field.display_value == "invalid (not an object)"


def test_validate_structure_accepts_standard_optional_column_metadata():
    yaml_valid = """
apiVersion: v3.1.0
kind: DataContract
id: orders
name: Orders
version: 1.0.0
status: active
description:
  purpose: ok
  usage: ok
  limitations: ok
schema:
  - name: orders
    physicalType: TABLE
    description: table
    properties:
      - name: order_id
        logicalType: string
        physicalType: UUID
        examples:
          - 99e8bb10-3785-4634-9664-8dc79eb69d43
      - name: order_timestamp
        logicalType: timestamp
        physicalType: TIMESTAMPTZ
"""
    raw = load_raw(yaml_valid)
    report = DataContract.validate_structure(raw)

    assert report.success is True
