"""
YAML loader for clinical-contract.
"""
from __future__ import annotations

from pathlib import Path
import yaml

from .contract import DataContract


def load_contract(source: str | Path | bytes) -> tuple[DataContract, dict]:
    """
    Charge et parse un DataContract depuis un fichier YAML.

    Parameters
    ----------
    source : str | Path | bytes
        - Path ou str avec '\\n' → parsé directement comme YAML inline
        - str sans '\\n'         → chemin vers un fichier
        - bytes                  → parsé directement (PyScript)

    Returns
    -------
    (DataContract, raw_dict)
        Le modèle validé ET le dict brut (utile pour validate_structure).

    Raises
    ------
    FileNotFoundError
        Si le fichier n'existe pas.
    pydantic.ValidationError
        Si la structure ne correspond pas au schéma attendu.
    """
    if isinstance(source, bytes):
        raw = yaml.safe_load(source)
    elif isinstance(source, Path):
        raw = yaml.safe_load(source.read_text(encoding="utf-8"))
    elif isinstance(source, str) and "\n" in source:
        raw = yaml.safe_load(source)
    else:
        raw = yaml.safe_load(Path(source).read_text(encoding="utf-8"))

    return DataContract(**raw), raw


def load_raw(source: str | Path | bytes) -> dict:
    """
    Charge uniquement le dict brut YAML sans valider avec Pydantic.
    Utilisé par la commande 'validate' pour afficher les champs manquants
    même si le YAML est incomplet.
    """
    if isinstance(source, bytes):
        return yaml.safe_load(source) or {}
    elif isinstance(source, Path):
        return yaml.safe_load(source.read_text(encoding="utf-8")) or {}
    elif isinstance(source, str) and "\n" in source:
        return yaml.safe_load(source) or {}
    else:
        return yaml.safe_load(Path(source).read_text(encoding="utf-8")) or {}
