"""YAML loader tests."""

import pytest

from clinical_contract import load_contract

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
