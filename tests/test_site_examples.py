"""Regression tests for the contract/dataset examples bundled with the site."""

from pathlib import Path

from clinical_contract import DataContract, load_contract, load_raw


EXAMPLES_DIR = Path(__file__).resolve().parents[1] / "site" / "examples"
DATA_EXTENSIONS = {".csv", ".parquet"}


def _paired_dataset(contract_path: Path) -> Path:
    candidates = [
        path
        for path in EXAMPLES_DIR.glob(f"{contract_path.stem}.*")
        if path.suffix.lower() in DATA_EXTENSIONS
    ]
    assert len(candidates) == 1, (
        f"{contract_path.name} must have exactly one homonymous CSV or Parquet file"
    )
    return candidates[0]


def test_bundled_contracts_have_homonymous_datasets():
    contracts = sorted(EXAMPLES_DIR.glob("*.yaml"))
    assert len(contracts) >= 4

    for contract_path in contracts:
        _paired_dataset(contract_path)


def test_bundled_examples_pass_validation_schema_and_quality_checks():
    for contract_path in sorted(EXAMPLES_DIR.glob("*.yaml")):
        data_path = _paired_dataset(contract_path)

        structure_report = DataContract.validate_structure(load_raw(contract_path))
        assert structure_report.success, contract_path.name

        contract, _ = load_contract(contract_path)
        schema_reports = contract.check_schema(str(data_path))
        assert all(report.success for report in schema_reports), contract_path.name

        quality_report = contract.check(str(data_path))
        assert quality_report.success, (
            f"{contract_path.name}: {quality_report.summary}"
        )
