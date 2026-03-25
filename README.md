# clinical-contract

> Ensure your data matches the expectations defined in YAML contracts — check schemas, data types, and quality rules automatically on Parquet files.



---

## Overview

`clinical-contract` is a data contract validation library designed for clinical and healthcare data pipelines. It bridges the gap between data documentation and data quality enforcement by allowing teams to define their data expectations in a human-readable YAML contract and automatically verify those expectations against real Parquet files.

A contract defines:
- **Schema** — which columns exist, their logical and physical types
- **Quality rules** — SQL-based assertions that must hold true on the data

The library is DuckDB-first and is compatible with [PyScript](https://pyscript.net), making it suitable for both server-side pipelines and browser-based tooling.

---

## Features

- **YAML contract validation** — verify that a contract file is structurally complete before running it against data
- **Schema verification** — check that required columns exist in the Parquet file with compatible types
- **SQL quality checks** — execute custom SQL assertions and report pass/fail with obtained vs expected values
- **Flexible type mapping** — loose type family matching (`string`, `varchar`, `text` are treated as equivalent; `int32`, `int64`, `integer` likewise)
- **DuckDB engine** — one execution path for schema checks and SQL quality checks
- **PyScript compatible** — runs in the browser via Pyodide/WebAssembly
- **Clean CLI output** — formatted tables with ✅/❌ indicators directly in the terminal
- **Programmable API** — use as a Python library in your own pipelines and CI workflows

---

## Installation


```bash
pip install clinical-contract
```

> `duckdb` is installed as a core dependency.  


---

## Quick Start

### 1. Write a contract

```yaml
# datacontract.yaml
apiVersion: v3.1.0
kind: DataContract
id: export-contract
name: Export Contract
version: 1.0.0
status: active
description:
  purpose: "Export dataset containing medical events and sampling data"
  usage: "Analytics and downstream processing"
  limitations: "Historical data may contain legacy timestamps"

schema:
  - name: S
    physicalType: TABLE
    description: Exported dataset containing patient event data
    properties:
      - name: IPP
        logicalType: string
        physicalType: TEXT
        description: Permanent patient identifier
        required: true
        quality:
          - type: sql
            description: IPP must not be null
            query: "SELECT COUNT(*) FROM export WHERE IPP IS NULL"
            mustBe: 0
          - type: sql
            description: IPP length must be between 35 and 37 characters
            query: "SELECT COUNT(*) FROM export WHERE LENGTH(IPP) NOT BETWEEN 35 AND 37"
            mustBe: 0

      - name: EVENT_DATE
        logicalType: date
        physicalType: DATE
        description: Medical event date
        required: true
        quality:
          - type: sql
            description: No dates in the future
            query: "SELECT COUNT(*) FROM export WHERE EVENT_DATE > CURRENT_DATE"
            mustBe: 0
```

### 2. Validate the contract structure

```bash
clinical-contract validate datacontract.yaml
```

```
📋  Validation de la structure : datacontract.yaml

┌─────────────┬────────┬──────────────────────┐
│ Champ       │ Statut │ Valeur               │
├─────────────┼────────┼──────────────────────┤
│ apiVersion  │ ✅     │ v1.0.0              │
│ kind        │ ✅     │ DataContract        │
│ id          │ ✅     │ export-contract     │
│ name        │ ✅     │ Export Contract     │
│ version     │ ✅     │ 1.0.0               │
│ status      │ ✅     │ active              │
│ description │ ✅     │ présent             │
│ schema      │ ✅     │ 6 colonnes détectées│
└─────────────┴────────┴──────────────────────┘

✅  Structure valide — tous les champs sont présents.
```

### 3. Run checks against a Parquet file

```bash
clinical-contract check datacontract.yaml export.parquet
```

```
🔍  Vérification du contrat
    Contrat : datacontract.yaml
    Parquet : export.parquet

── Vérification du schéma ──────────────────────────────────────

  Schema : export
  ┌─────────────┬───────────┬──────────────┬──────────┐
  │ Colonne     │ Type YAML │ Type Parquet │ Statut   │
  ├─────────────┼───────────┼──────────────┼──────────┤
  │ IPP         │ string    │ string       │ ✅       │
  │ EVENT_DATE  │ date      │ date32       │ ✅       │
  └─────────────┴───────────┴──────────────┴──────────┘

  ✅ 2/2 colonnes valides

── Quality checks ──────────────────────────────────────────────

  ┌────────┬────────────┬──────────────────────────────┬──────────┬────────┬─────────┐
  │ Schema │ Property   │ Description                  │ Résultat │ Obtenu │ Attendu │
  ├────────┼────────────┼──────────────────────────────┼──────────┼────────┼─────────┤
  │ export │ IPP        │ IPP must not be null         │ ✅       │ 0      │ 0       │
  │ export │ IPP        │ IPP length 35-37 characters  │ ❌       │ 3      │ 0       │
  │ export │ EVENT_DATE │ No dates in the future       │ ✅       │ 0      │ 0       │
  └────────┴────────────┴──────────────────────────────┴──────────┴────────┴─────────┘

  2/3 checks passés.
```

---

## CLI Reference

### `clinical-contract validate <contract.yaml>`

The validate command verifies that a YAML contract file is correctly written and conforms to the Open Data Contract Standard v3.1.0.
This ensures that all required fields are present and correctly structured.

**Required top-level fields:** `apiVersion`, `kind`, `id`, `name`, `version`, `status`, `description`, `schema`

**Expected sub-fields:**

- description must include: `purpose`, `usage`, `limitations`
- schema must include for each item: `name`, `physicalType`, `description`, `properties`
- properties (inside each schema) must include: `name`, `logicalType`, `physicalType`, `description`


**Exit codes:** `0` if valid, `1` if any required field is missing or invalid (including unsupported `logicalType`).

---

### `clinical-contract check <contract.yaml> <data.parquet> [backend]`

Runs a full validation pipeline in three stages:

1. **YAML structure** — same checks as `validate`
2. **Schema compatibility** — verifies that required columns exist in the Parquet file with compatible types. Quality checks are **blocked** if this step fails.
3. **Quality checks** — executes each SQL assertion and reports the result

**Backend options:** `auto` (default), `duckdb`


**Exit codes:** `0` if all checks pass, `1` if any check fails or a column is missing/mistyped, `2` if an execution error occurs.

---

## Type Mapping

Types in the YAML contract are matched with a hybrid strategy:

- **Strict integer-width matching** for explicit integer types:
  `int8`, `int16`, `int32`, `int64`, `uint8`, `uint16`, `uint32`, `uint64`
- **Family-based matching** for generic types like `integer`, `string`, `timestamp`, etc.

`uint32` is accepted in YAML and normalized to DuckDB canonical `uinteger` before comparison.

| YAML logical type | Compatible Parquet types |
|---|---|
| `string`, `text`, `varchar` | `string`, `large_string`, `utf8`, `large_utf8` |
| `integer`, `int` | `int8`, `int16`, `int32`, `int64`, `uint8`, `uint16`, `uint32`, `uint64`, `tinyint`, `smallint`, `integer`, `bigint`, `utinyint`, `usmallint`, `uinteger`, `ubigint` |
| `int8`, `int16`, `int32`, `int64`, `uint8`, `uint16`, `uint32`, `uint64` | **Strict canonical match** (`int32` ↔ `integer`, `uint32` ↔ `uinteger`, etc.) |
| `float`, `double`, `decimal` | `float32`, `float64`, `double`, `decimal128` |
| `boolean`, `bool` | `bool`, `boolean` |
| `date`, `date32` | `date32`, `date64` |
| `datetime`, `timestamp` | `timestamp[ms]`, `timestamp[us]`, `timestamp[ns]`, `timestamp[s]`, timezone variants |
| `binary`, `bytes` | `binary`, `large_binary` |

---

## Python API

Beyond the CLI, `clinical-contract` can be used directly in Python pipelines:

```python
from clinical_contract import load_contract

# Load and parse the contract
contract, raw = load_contract("datacontract.yaml")

# Validate structure only
from clinical_contract import DataContract
validate_report = DataContract.validate_structure(raw)
if not validate_report.success:
    for f in validate_report.missing():
        print(f"Missing field: {f.field}")

# Check schema compatibility
schema_reports = contract.check_schema("export.parquet")
for report in schema_reports:
    if not report.success:
        for col in report.failures():
            print(f"{col.column}: {col.status_icon}")

# Run quality checks
report = contract.check("export.parquet", backend="duckdb")

print(f"Success: {report.success}")
print(f"Code: {report.code}")  # 0 = pass, 1 = fail, 2 = error

for result in report.failed():
    print(f"  ❌ {result.description}")
    print(f"     obtained={result.obtained}, expected={result.expected}")
```

---


## Contract Schema Reference

```yaml
apiVersion: string        # Contract specification version (e.g. v3.1.0)
kind: DataContract        # Must be "DataContract"
id: string                # Unique identifier for this contract
name: string              # Human-readable name
version: string           # Data version (semver recommended)
status: string            # active | draft | deprecated

description:
  purpose: string         # Why this dataset exists
  usage: string           # How it should be used
  limitations: string     # Known limitations or caveats

schema:
  - name: string          # Table/view name (used in SQL queries)
    physicalType: TABLE   # TABLE | VIEW
    description: string
    properties:
      - name: string          # Column name (case-sensitive)
        logicalType: string   # Semantic type (string, integer, date…)
        physicalType: string  # Storage type (TEXT, INT, DATE…)
        description: string
        required: bool        # Default: false (missing optional columns do not fail schema check)
        quality:              # Optional list of SQL assertions
          - type: sql
            description: string   # Human-readable description of the rule
            query: string         # SQL returning a single COUNT(*)
            mustBe: integer       # Expected result (usually 0)
```

---

## Development

```bash
# Clone the repository
git clone https://github.com/artheioupfat/clinical-contract.git
cd clinical-contract

# Create a virtual environment
uv venv
source .venv/bin/activate

# Install in editable mode with all dependencies
uv pip install -e ".[dev]"

#Installer les dépendances dev
uv sync --extra dev

#lancer les tests 
pytest -v
```

---


## License

MIT — see [LICENSE](LICENSE) for details.

---

## Author

**Arthur PRIGENT** — [GitHub](https://github.com/artheioupfat)
