"""
YAML loader for clinical-contract.
"""
from __future__ import annotations

from pathlib import Path
import yaml

from .contract import DataContract


def _read_yaml_source(source: str | Path | bytes):
    if isinstance(source, bytes):
        return yaml.safe_load(source)
    if isinstance(source, Path):
        return yaml.safe_load(source.read_text(encoding="utf-8"))
    if isinstance(source, str) and "\n" in source:
        return yaml.safe_load(source)
    return yaml.safe_load(Path(source).read_text(encoding="utf-8"))


def load_contract(source: str | Path | bytes) -> tuple[DataContract, dict]:
    """
    Load and parse a DataContract from YAML.

    Parameters
    ----------
    source : str | Path | bytes
        - Path: read as a UTF-8 YAML file.
        - str containing a newline: parsed as inline YAML.
        - str without a newline: interpreted as a file path.
        - bytes: parsed directly, including from the PyScript bridge.

    Returns
    -------
    (DataContract, raw_dict)
        The validated model and raw mapping used by structural validation.

    Raises
    ------
    FileNotFoundError
        If the source path does not exist.
    ValueError
        If the YAML is empty or its root is not a mapping.
    pydantic.ValidationError
        If the document cannot be represented by the DataContract model.
    """
    raw = _read_yaml_source(source)
    if raw is None:
        raise ValueError("YAML content is empty.")
    if not isinstance(raw, dict):
        raise ValueError(
            "YAML root content must be an object (key/value mapping)."
        )

    return DataContract(**raw), raw


def load_raw(source: str | Path | bytes) -> dict:
    """
    Load a raw YAML mapping without Pydantic model validation.

    The validate command uses this representation to report missing fields
    even when the document is incomplete.
    """
    raw = _read_yaml_source(source)
    if raw is None:
        return {}
    if not isinstance(raw, dict):
        return {}
    return raw
