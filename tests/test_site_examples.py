"""Regression tests for the contract/dataset examples bundled with the site."""

from pathlib import Path

from clinical_contract import DataContract, load_contract, load_raw


EXAMPLES_DIR = Path(__file__).resolve().parents[1] / "site" / "examples"
DATA_EXTENSIONS = {".csv", ".parquet"}


def _schema_datasets(contract_path: Path) -> list[Path]:
    raw = load_raw(contract_path)
    datasets = []
    for schema in raw.get("schema", []):
        schema_name = schema.get("name", "")
        candidates = [
            path
            for path in EXAMPLES_DIR.glob(f"{schema_name}.*")
            if path.suffix.lower() in DATA_EXTENSIONS
        ]
        assert len(candidates) == 1, (
            f"Schema '{schema_name}' in {contract_path.name} must have exactly "
            "one CSV or Parquet file with the same name"
        )
        datasets.append(candidates[0])
    return datasets


def test_bundled_contract_schemas_have_matching_datasets():
    contracts = sorted(EXAMPLES_DIR.glob("*.yaml"))
    assert len(contracts) >= 4

    for contract_path in contracts:
        _schema_datasets(contract_path)


def test_bundled_examples_pass_validation_schema_and_quality_checks():
    for contract_path in sorted(EXAMPLES_DIR.glob("*.yaml")):
        data_paths = _schema_datasets(contract_path)

        structure_report = DataContract.validate_structure(load_raw(contract_path))
        assert structure_report.success, contract_path.name

        contract, _ = load_contract(contract_path)
        schema_reports = contract.check_schema(data_paths)
        assert all(report.success for report in schema_reports), contract_path.name

        quality_report = contract.check(data_paths)
        assert quality_report.success, (
            f"{contract_path.name}: {quality_report.summary}"
        )
