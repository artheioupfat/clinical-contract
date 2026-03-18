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
    ValueError
        Si le YAML est vide ou si la racine n'est pas un objet.
    pydantic.ValidationError
        Si la structure ne correspond pas au schéma attendu.
    """
    raw = _read_yaml_source(source)
    if raw is None:
        raise ValueError("Le YAML est vide.")
    if not isinstance(raw, dict):
        raise ValueError(
            "Le contenu YAML racine doit être un objet (mapping clé/valeur)."
        )

    return DataContract(**raw), raw


def load_raw(source: str | Path | bytes) -> dict:
    """
    Charge uniquement le dict brut YAML sans valider avec Pydantic.
    Utilisé par la commande 'validate' pour afficher les champs manquants
    même si le YAML est incomplet.
    """
    raw = _read_yaml_source(source)
    if raw is None:
        return {}
    if not isinstance(raw, dict):
        return {}
    return raw
