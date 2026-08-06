## Installation

Clinical-Contract requires Python 3.11 or newer.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install clinical-contract
```

With `uv`:

```bash
uv add clinical-contract
```

Check the installed version:

```bash
clinical-contract --version
```

The PyPI distribution uses a hyphen, while the Python import uses an
underscore:

```python
import clinical_contract

print(clinical_contract.__version__)
```

## API overview

The main functions and classes are importable from `clinical_contract`:

| API | Purpose |
|---|---|
| `load_raw` | Load YAML as a dictionary without building the strict model |
| `load_contract` | Load YAML and build a Pydantic `DataContract` |
| `DataContract.validate_structure` | Validate the structure of a raw dictionary |
| `DataContract.check_schema` | Compare tables, columns, and types with data files |
| `DataContract.check` | Execute SQL quality rules |
| `DataSource` | Type accepted for one CSV or Parquet source |
| `DataSources` | Type accepted for one or several sources |

The complete flow is deliberately split into distinct steps:

```text
YAML
  -> validate_structure()
  -> load_contract()
  -> check_schema()
  -> check()
```

This separation lets an application validate only the contract, check only
the schema, or define its own orchestration.

## Load raw YAML

### `load_raw(source)`

`load_raw` accepts:

- a `str` path;
- a `pathlib.Path`;
- an inline YAML string containing a newline;
- YAML `bytes`.

```python
from clinical_contract import load_raw

raw_contract = load_raw("contract.yaml")
print(raw_contract["name"])
```

This function does not build the Pydantic model. It is useful when an
application needs to display all structural errors in an incomplete contract.

An empty document or a YAML root that is not an object returns `{}`. Invalid
YAML syntax raises `yaml.YAMLError`.

## Validate the structure

### `DataContract.validate_structure(raw)`

```python
from clinical_contract import DataContract, load_raw

raw_contract = load_raw("contract.yaml")
report = DataContract.validate_structure(raw_contract)

if report.success:
    print("Contract structure is valid")
else:
    for field in report.missing():
        print(field.field, field.display_value)
```

Structural validation checks, among other things:

- required root fields;
- the presence of at least one table;
- unique table names;
- required fields for every table;
- the `required` boolean value;
- supported logical and physical types;
- the shape of quality expectations.

It returns a `ValidateReport`:

```python
report.success       # bool
report.fields        # list[FieldValidation]
report.missing()     # invalid or missing fields
```

Every `FieldValidation` exposes `field`, `present`, `value`, `status_icon`,
and `display_value`.

## Load a typed contract

### `load_contract(source)`

```python
from clinical_contract import load_contract

contract, raw_contract = load_contract("contract.yaml")

print(contract.name)
print(contract.version)
print(contract.schema_)
```

The function returns:

```python
(DataContract, dict)
```

The first value is the operational Pydantic model. The second is the raw
document, which is useful for retaining contextual ODCS metadata that is not
used by the checking engine.

Possible errors include:

- `FileNotFoundError` when the path does not exist;
- `yaml.YAMLError` when the YAML syntax is invalid;
- `ValueError` when the document is empty or its root is not an object;
- `pydantic.ValidationError` when the operational model cannot be built.

## Provide data sources

The checking methods accept the public `DataSources` type.

### One table and one file

For a single-table contract, pass a path directly:

```python
schema_reports = contract.check_schema("patients.parquet")
quality_report = contract.check("patients.parquet")
```

This case retains backward compatibility: the filename does not need to match
the table name when exactly one table and one source are supplied.

### Several tables and named files

For a multi-table contract, **every filename stem must exactly match a table
name**:

```python
sources = [
    "patients.csv",
    "observations.parquet",
]

schema_reports = contract.check_schema(sources)
quality_report = contract.check(sources)
```

Source order does not matter. CSV and Parquet files can be mixed.

### Explicit mapping

Use a mapping when filenames differ from table names:

```python
from pathlib import Path

sources = {
    "patients": Path("export_patients_2026.csv"),
    "observations": Path("extract_lab.parquet"),
}
```

A mapping is also required for several in-memory sources:

```python
sources = {
    "patients": patients_csv_bytes,
    "observations": observations_parquet_bytes,
}
```

Values may be paths, `Path` objects, `bytes`, or `bytearray` values.

Source resolution rejects:

- unknown mapping keys;
- two files mapped to the same table;
- a filename that does not match any table;
- duplicate table names;
- several binary sources without an explicit mapping.

## Check the data schema

### `DataContract.check_schema(data_sources)`

```python
schema_reports = contract.check_schema(sources)

for table_report in schema_reports:
    print(table_report.schema_name, table_report.success)

    if table_report.error_message:
        print(table_report.error_message)

    for column in table_report.failures():
        print(column.column, column.status, column.parquet_type)
```

The method returns one `SchemaCheckReport` per table, in contract order. Each
report exposes:

```python
table_report.success
table_report.schema_name
table_report.source_name
table_report.error_message
table_report.columns
table_report.failures()
```

Column statuses are:

| Status | Meaning |
|---|---|
| `ok` | column exists and its type is compatible |
| `missing` | required column is missing |
| `optional_missing` | optional column is missing without failing the report |
| `type_mismatch` | column exists but its type is incompatible |
| `ambiguous` | several columns differ only by letter case |

Column names are matched case-insensitively, with an exact match taking
priority.

When a column defines `physicalType`, it is checked strictly. Otherwise, the
engine checks the broader `logicalType` family. If neither type is specified,
only column presence is checked.

## Execute quality rules

### `DataContract.check(data_sources, backend="auto")`

```python
report = contract.check(sources)

print(report.success)
print(report.code)
print(report.summary)

for result in report.results:
    print(
        result.schema_name,
        result.property_name,
        result.status,
        result.obtained,
        result.expected_display,
    )
```

`check()` executes quality rules but does not automatically call
`check_schema()`. The CLI and browser editor orchestrate both steps explicitly.

All mapped tables are loaded into the same DuckDB connection, so a rule may
join tables:

```sql
SELECT COUNT(*)
FROM observations AS o
LEFT JOIN patients AS p
  ON p.patient_id = o.patient_id
WHERE p.patient_id IS NULL
```

`backend` is retained for compatibility. Only `auto` and `duckdb` are
accepted, and both use DuckDB.

The advanced `include_schemas` parameter restricts execution to selected
tables:

```python
report = contract.check(sources, include_schemas={"patients"})
```

It is intended for orchestrators that need to skip rules attached to tables
whose data schema is already invalid.

## Understand `ContractReport`

Quality reports use three codes:

| Code | Meaning |
|---|---|
| `0` | every rule passes, or there is no executable SQL rule |
| `1` | at least one result does not satisfy its expectation |
| `2` | at least one rule produces an execution error |

Available helpers:

```python
report.passed()
report.failed()
report.errors()
```

Every `QualityResult` contains:

```python
result.schema_name
result.property_name
result.description
result.query
result.status
result.operator
result.expected
result.expected_display
result.obtained
result.error_message
result.ok
```

A functional mismatch has status `failed`. Invalid or non-executable SQL has
status `error`.

## Recommended complete orchestration

This function follows the CLI flow:

```python
from clinical_contract import DataContract, load_contract, load_raw


def validate_and_check(contract_path, data_sources):
    raw = load_raw(contract_path)
    validation = DataContract.validate_structure(raw)
    if not validation.success:
        return {
            "validation": validation,
            "schemas": [],
            "quality": None,
        }

    contract, _ = load_contract(contract_path)
    schema_reports = contract.check_schema(data_sources)
    valid_tables = {
        report.schema_name
        for report in schema_reports
        if report.success
    }
    quality_report = contract.check(
        data_sources,
        include_schemas=valid_tables,
    )

    return {
        "validation": validation,
        "schemas": schema_reports,
        "quality": quality_report,
    }
```

An application may stop all quality checks after one invalid table, or follow
the CLI behavior and run rules for tables that remain valid.

## SQL query security

Contracts are treated as untrusted input. A quality query must:

- contain exactly one read-only `SELECT` statement;
- return exactly one row and one column;
- return a finite numeric value that is not SQL `NULL`;
- avoid changing data or DuckDB configuration;
- avoid reading external files after authorized sources are loaded.

Extensions, external access, and configuration changes are disabled. Memory,
temporary storage, and thread count are limited. These controls reduce risk
but do not replace an application-level timeout when contracts come from an
untrusted source.

## Public typing and models

The package ships `py.typed`, allowing Pyright and mypy to consume its type
annotations.

Public models include:

- `DataContract`, `SchemaItem`, `Property`, `Quality`, `Description`;
- `QualityExpectation`, `BetweenExpectation`, `ComparisonOperator`;
- `ValidateReport`, `SchemaCheckReport`, `ContractReport`;
- `FieldValidation`, `ColumnCheckResult`, `QualityResult`.

They are Pydantic models and can be serialized with `model_dump()` or
`model_dump_json()`.

## API or CLI?

Use the CLI for manual checks, shell scripts, and simple CI jobs.

Use the Python API to integrate reports into an application, check in-memory
content, customize orchestration, persist results, or decide how invalid tables
should be handled.

For the complete YAML structure, read the
[contract reference](./docs.html?page=contract-reference&lang=en).
