"""YAML loader tests."""

import pytest
from pydantic import ValidationError

from clinical_contract import (
    DataContract,
    Description,
    SchemaItem,
    load_contract,
    load_raw,
)

from tests.helpers import YAML_COMPLET


def test_load_contract_depuis_string():
    contract, raw = load_contract(YAML_COMPLET)
    assert contract.name == "Test Contract"
    assert len(contract.schema_) == 1
    assert contract.schema_[0].name == "patients"


def test_load_contract_depuis_bytes():
    contract, raw = load_contract(YAML_COMPLET.encode())
    assert contract.id == "test-contract"


def test_load_contract_yaml_vide():
    with pytest.raises(ValueError, match="YAML content is empty"):
        load_contract(b"")


def test_load_contract_enforces_structural_validation():
    raw = load_raw(YAML_COMPLET)
    raw["schema"][0]["properties"][0]["logicalType"] = "unknown_type"

    with pytest.raises(ValidationError, match="Invalid data contract structure"):
        DataContract.model_validate(raw)


def test_data_contract_accepts_python_schema_field_name():
    contract = DataContract(
        apiVersion="v3.1.0",
        kind="DataContract",
        id="python-construction",
        name="Python Construction",
        version="1.0.0",
        status="active",
        description=Description(),
        schema_=[
            SchemaItem(
                name="patients",
                physicalType="table",
                description="Patients",
                properties=[{"name": "patient_id"}],
            )
        ],
    )

    assert contract.schema_[0].name == "patients"
