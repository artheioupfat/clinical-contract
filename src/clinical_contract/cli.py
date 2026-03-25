"""
CLI for clinical-contract.

Available commands:
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
# Table helpers                                                        #
# ------------------------------------------------------------------ #

def _col_widths(*rows: list[str], headers: list[str]) -> list[int]:
    """Compute width for each table column."""
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
# Command: validate                                                    #
# ------------------------------------------------------------------ #

def cmd_validate(yaml_path: str) -> None:
    """
    Validate required fields in the YAML contract.
    Does not touch parquet data.
    """
    path = Path(yaml_path)
    if not path.exists():
        print(f"❌  File not found: {yaml_path}")
        sys.exit(1)

    print(f"\n📋  Structure validation: {path.name}\n")

    # Raw load, without Pydantic, to show missing fields clearly
    raw = load_raw(path)
    report = DataContract.validate_structure(raw)

    headers = ["Field", "Status", "Value"]
    rows = [
        [f.field, f.status_icon, f.display_value]
        for f in report.fields
    ]
    _print_table(headers, rows)

    missing = report.missing()
    if report.success:
        print("\n✅  Valid structure — all required fields are present.\n")
    else:
        names = ", ".join(f.field for f in missing)
        print(f"\n❌  {len(missing)} missing field(s): {names}\n")
        sys.exit(1)


# ------------------------------------------------------------------ #
# Command: check                                                       #
# ------------------------------------------------------------------ #

def cmd_check(yaml_path: str, parquet_path: str, backend: str = "auto") -> None:
    """
    1. Validate YAML structure
    2. Validate required parquet columns (name + type)
    3. Run SQL quality checks if schema is valid
    """
    yaml_file    = Path(yaml_path)
    parquet_file = Path(parquet_path)

    if not yaml_file.exists():
        print(f"❌  YAML file not found: {yaml_path}")
        sys.exit(1)
    if not parquet_file.exists():
        print(f"❌  Parquet file not found: {parquet_path}")
        sys.exit(1)

    print("\n🔍  Contract check")
    print(f"    Contract: {yaml_file.name}")
    print(f"    Parquet: {parquet_file.name}")

    # ── 1. YAML structure validation ────────────────────────────────
    raw = load_raw(yaml_file)
    val_report = DataContract.validate_structure(raw)
    if not val_report.success:
        missing = ", ".join(f.field for f in val_report.missing())
        print(f"\n❌  Invalid YAML — missing fields: {missing}")
        print(f"    Run 'clinical-contract validate {yaml_path}' for details.\n")
        sys.exit(1)

    # Load and validate contract with Pydantic
    try:
        contract, _ = load_contract(yaml_file)
    except Exception as exc:
        print(f"\n❌  Failed to load contract:\n    {exc}\n")
        sys.exit(1)

    # ── 2. Schema validation (columns + types) ──────────────────────
    print("\n── Schema validation ────────────────────────────────────────────\n")
    try:
        schema_reports = contract.check_schema(str(parquet_file))
    except Exception as exc:
        print(f"❌  Failed to read parquet schema:\n    {exc}\n")
        sys.exit(1)

    schema_ok = True
    for sr in schema_reports:
        print(f"  Schema: {sr.schema_name}")
        headers = ["Column", "YAML Type", "Parquet Type", "Status"]
        rows = [
            [c.column, c.yaml_type, c.parquet_type, c.status_icon]
            for c in sr.columns
        ]
        _print_table(headers, rows)

        if not sr.success:
            schema_ok = False
            failures = sr.failures()
            print(f"\n  ❌ {len(failures)} issue(s) detected:")
            for f in failures:
                if f.parquet_type == "—":
                    print(f"     • '{f.column}' is missing in parquet")
                else:
                    print(
                        f"     • '{f.column}': YAML type '{f.yaml_type}' "
                        f"is incompatible with parquet type '{f.parquet_type}'"
                    )
        else:
            n = len(sr.columns)
            print(f"\n  ✅ {n}/{n} columns valid")
        print()

    # Stop if schema validation failed
    if not schema_ok:
        print("❌  Invalid schema — quality checks cancelled.\n")
        sys.exit(1)

    # ── 3. SQL quality checks ────────────────────────────────────────
    print(f"── Quality checks ──────────────────────────────────────────────\n")
    try:
        report = contract.check(str(parquet_file), backend=backend)
    except Exception as exc:
        print(f"❌  Error while running checks:\n    {exc}\n")
        sys.exit(1)

    headers = ["Schema", "Property", "Description", "Result", "Obtained", "Expected"]
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
            obtained = "error"

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
        print("  (no quality checks defined in this contract)")

    # Summary
    n_errors = len(report.errors())

    print(f"\n  {report.summary}")
    if n_errors:
        print(f"  💥 {n_errors} execution error(s):")
        for r in report.errors():
            print(f"     [{r.schema_name}.{r.property_name}] {r.error_message}")
    print()

    if not report.success:
        sys.exit(1)


# ------------------------------------------------------------------ #
# Entry point                                                          #
# ------------------------------------------------------------------ #

def main() -> None:
    args = sys.argv[1:]

    if not args or args[0] in ("-h", "--help"):
        _print_help()
        return

    command = args[0]

    if command == "validate":
        if len(args) < 2:
            print("❌  Usage: clinical-contract validate <contract.yaml>")
            sys.exit(1)
        cmd_validate(args[1])

    elif command == "check":
        if len(args) < 3:
            print("❌  Usage: clinical-contract check <contract.yaml> <data.parquet>")
            sys.exit(1)
        backend = args[3] if len(args) > 3 else "auto"
        cmd_check(args[1], args[2], backend=backend)

    else:
        print(f"❌  Unknown command: '{command}'")
        _print_help()
        sys.exit(1)


def _print_help() -> None:
    print("""
clinical-contract - clinical data contract validator

Usage:
  clinical-contract validate <contract.yaml>
      Validate that required fields are present in the YAML contract.

  clinical-contract check <contract.yaml> <data.parquet> [backend]
      Run schema and quality checks against the parquet file.
      backend: auto (default) | duckdb

Examples:
  clinical-contract validate my_contract.yaml
  clinical-contract check my_contract.yaml patients.parquet
  clinical-contract check my_contract.yaml patients.parquet duckdb
""")
