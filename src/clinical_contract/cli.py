"""
CLI pour clinical-contract.

Commandes disponibles :
    clinical-contract validate contract.yaml
    clinical-contract check    contract.yaml data.parquet
"""
from __future__ import annotations

import sys
from pathlib import Path

from .loader import load_raw, load_contract
from .contract import DataContract
from .models import CheckStatus


# ------------------------------------------------------------------ #
# Helpers tableau                                                      #
# ------------------------------------------------------------------ #

def _col_widths(*rows: list[str], headers: list[str]) -> list[int]:
    """Calcule la largeur de chaque colonne."""
    widths = [len(h) for h in headers]
    for row in rows:
        for i, cell in enumerate(row):
            widths[i] = max(widths[i], len(cell))
    return widths


def _hline(widths: list[int], left="┌", mid="┬", right="┐", fill="─") -> str:
    return left + mid.join(fill * (w + 2) for w in widths) + right


def _row(cells: list[str], widths: list[int]) -> str:
    parts = [f" {c:<{w}} " for c, w in zip(cells, widths)]
    return "│" + "│".join(parts) + "│"


def _print_table(headers: list[str], rows: list[list[str]]) -> None:
    widths = _col_widths(*rows, headers=headers)
    print(_hline(widths, "┌", "┬", "┐"))
    print(_row(headers, widths))
    print(_hline(widths, "├", "┼", "┤"))
    for r in rows:
        print(_row(r, widths))
    print(_hline(widths, "└", "┴", "┘"))


# ------------------------------------------------------------------ #
# Commande : validate                                                  #
# ------------------------------------------------------------------ #

def cmd_validate(yaml_path: str) -> None:
    """
    Vérifie que le YAML contient tous les champs obligatoires.
    Ne touche pas au parquet.
    """
    path = Path(yaml_path)
    if not path.exists():
        print(f"❌  Fichier introuvable : {yaml_path}")
        sys.exit(1)

    print(f"\n📋  Validation de la structure : {path.name}\n")

    # Chargement brut — sans Pydantic pour voir les champs manquants
    raw = load_raw(path)
    report = DataContract.validate_structure(raw)

    headers = ["Champ", "Statut", "Valeur"]
    rows = [
        [f.field, f.status_icon, f.display_value]
        for f in report.fields
    ]
    _print_table(headers, rows)

    missing = report.missing()
    if report.success:
        print(f"\n✅  Structure valide — tous les champs sont présents.\n")
    else:
        names = ", ".join(f.field for f in missing)
        print(f"\n❌  {len(missing)} champ(s) manquant(s) : {names}\n")
        sys.exit(1)


# ------------------------------------------------------------------ #
# Commande : check                                                     #
# ------------------------------------------------------------------ #

def cmd_check(yaml_path: str, parquet_path: str, backend: str = "auto") -> None:
    """
    1. Vérifie la structure du YAML
    2. Vérifie que les colonnes obligatoires du parquet correspondent au contrat (nom + type)
    3. Si le schéma est valide, exécute les quality checks SQL
    """
    yaml_file    = Path(yaml_path)
    parquet_file = Path(parquet_path)

    if not yaml_file.exists():
        print(f"❌  Fichier YAML introuvable : {yaml_path}")
        sys.exit(1)
    if not parquet_file.exists():
        print(f"❌  Fichier Parquet introuvable : {parquet_path}")
        sys.exit(1)

    print(f"\n🔍  Vérification du contrat")
    print(f"    Contrat : {yaml_file.name}")
    print(f"    Parquet : {parquet_file.name}")

    # ── 1. Validation structure YAML ────────────────────────────────
    raw = load_raw(yaml_file)
    val_report = DataContract.validate_structure(raw)
    if not val_report.success:
        missing = ", ".join(f.field for f in val_report.missing())
        print(f"\n❌  YAML invalide — champs manquants : {missing}")
        print(f"    Lance 'clinical-contract validate {yaml_path}' pour le détail.\n")
        sys.exit(1)

    # Chargement du contrat Pydantic
    try:
        contract, _ = load_contract(yaml_file)
    except Exception as exc:
        print(f"\n❌  Erreur lors du chargement du contrat :\n    {exc}\n")
        sys.exit(1)

    # ── 2. Vérification schéma colonnes + types ──────────────────────
    print(f"\n── Vérification du schéma ──────────────────────────────────────\n")
    try:
        schema_reports = contract.check_schema(str(parquet_file))
    except Exception as exc:
        print(f"❌  Impossible de lire le schéma parquet :\n    {exc}\n")
        sys.exit(1)

    schema_ok = True
    for sr in schema_reports:
        print(f"  Schema : {sr.schema_name}")
        headers = ["Colonne", "Type YAML", "Type Parquet", "Statut"]
        rows = [
            [c.column, c.yaml_type, c.parquet_type, c.status_icon]
            for c in sr.columns
        ]
        _print_table(headers, rows)

        if not sr.success:
            schema_ok = False
            failures = sr.failures()
            print(f"\n  ❌ {len(failures)} problème(s) détecté(s) :")
            for f in failures:
                if f.parquet_type == "—":
                    print(f"     • '{f.column}' est absent du parquet")
                else:
                    print(f"     • '{f.column}' : type YAML='{f.yaml_type}' incompatible avec parquet='{f.parquet_type}'")
        else:
            n = len(sr.columns)
            print(f"\n  ✅ {n}/{n} colonnes valides")
        print()

    # Blocage si schéma invalide
    if not schema_ok:
        print("❌  Schéma invalide — quality checks annulés.\n")
        sys.exit(1)

    # ── 3. Quality checks SQL ────────────────────────────────────────
    print(f"── Quality checks ──────────────────────────────────────────────\n")
    try:
        report = contract.check(str(parquet_file), backend=backend)
    except Exception as exc:
        print(f"❌  Erreur lors de l'exécution des checks :\n    {exc}\n")
        sys.exit(1)

    headers = ["Schema", "Property", "Description", "Résultat", "Obtenu", "Attendu"]
    rows = []
    for r in report.results:
        if r.status == CheckStatus.passed:
            icon     = "✅"
            obtained = str(r.obtained)
        elif r.status == CheckStatus.failed:
            icon     = "❌"
            obtained = str(r.obtained)
        else:
            icon     = "💥"
            obtained = "erreur"

        rows.append([
            r.schema_name,
            r.property_name,
            r.description,
            icon,
            obtained,
            str(r.expected),
        ])

    if rows:
        _print_table(headers, rows)
    else:
        print("  (aucun quality check défini dans le contrat)")

    # Résumé
    n_total  = len(report.results)
    n_passed = len(report.passed())
    n_errors = len(report.errors())

    print(f"\n  {report.summary}")
    if n_errors:
        print(f"  💥 {n_errors} erreur(s) d'exécution :")
        for r in report.errors():
            print(f"     [{r.schema_name}.{r.property_name}] {r.error_message}")
    print()

    if not report.success:
        sys.exit(1)


# ------------------------------------------------------------------ #
# Point d'entrée                                                       #
# ------------------------------------------------------------------ #

def main() -> None:
    args = sys.argv[1:]

    if not args or args[0] in ("-h", "--help"):
        _print_help()
        return

    command = args[0]

    if command == "validate":
        if len(args) < 2:
            print("❌  Usage : clinical-contract validate <contract.yaml>")
            sys.exit(1)
        cmd_validate(args[1])

    elif command == "check":
        if len(args) < 3:
            print("❌  Usage : clinical-contract check <contract.yaml> <data.parquet>")
            sys.exit(1)
        backend = args[3] if len(args) > 3 else "auto"
        cmd_check(args[1], args[2], backend=backend)

    else:
        print(f"❌  Commande inconnue : '{command}'")
        _print_help()
        sys.exit(1)


def _print_help() -> None:
    print("""
clinical-contract — validateur de data contracts cliniques

Usage :
  clinical-contract validate <contract.yaml>
      Vérifie que le YAML contient tous les champs obligatoires.

  clinical-contract check <contract.yaml> <data.parquet> [backend]
      Exécute les quality checks du contrat sur le fichier parquet.
      backend : auto (défaut) | duckdb | polars | pyarrow

Exemples :
  clinical-contract validate my_contract.yaml
  clinical-contract check my_contract.yaml patients.parquet
  clinical-contract check my_contract.yaml patients.parquet duckdb
""")
