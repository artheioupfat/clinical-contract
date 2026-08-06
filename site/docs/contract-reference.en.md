## Minimal valid contract

Clinical-Contract uses YAML inspired by the **Open Data Contract Standard
(ODCS) 3.1.0**. This is the smallest recommended structure:

```yaml
apiVersion: v3.1.0
kind: DataContract
id: urn:datacontract:patients:v1
name: Patients
version: 1.0.0
status: active
description:
  purpose: ""
  usage: ""
  limitations: ""
schema:
  - name: patients
    physicalType: table
    description: Patient reference table
    properties:
      - name: patient_id
        logicalType: string
        physicalType: varchar
        required: true
        description: Stable patient identifier
```

The root `description` must be an object, but its three strings may be empty.
A table must currently contain at least one column to pass structural
validation.

> Clinical-Contract implements the ODCS subset needed to write, validate, and
> check CSV/Parquet exchanges. It does not yet validate every field available
> in the complete ODCS specification.

## Root metadata

```yaml
apiVersion: v3.1.0
kind: DataContract
id: urn:datacontract:covid-cohort:v1
name: COVID diagnosis cohort
version: 1.2.0
status: active
```

| Field | Required | Purpose |
|---|---|---|
| `apiVersion` | yes | target standard version; the editor writes `v3.1.0` |
| `kind` | yes | document kind; use `DataContract` |
| `id` | yes | stable identifier, preferably a URN |
| `name` | yes | human-readable contract name and suggested download name |
| `version` | yes | contract version, independent of the package version |
| `status` | yes | contract lifecycle, for example `active` or `inactive` |

Structural validation currently checks that these fields exist. The values
above are the project conventions recommended for interoperability.

## Contract description

```yaml
description:
  purpose: Define the COVID cohort expected by the study
  usage: Epidemiological analyses across participating hospitals
  limitations: Historical diagnoses may be incomplete before 2020
```

`description` is required and must be an object. Its three children are
optional and may be omitted or empty.

| Child field | Question answered |
|---|---|
| `purpose` | Why is this data requested? |
| `usage` | How may consumers use it? |
| `limitations` | Which caveats should consumers know? |

## Study context

The editor can retain optional study context:

```yaml
study:
  startDate: 2020-01-01
  endDate: 2026-12-31
  type: cohort
  objective: epidemiological
  healthDomain: infectious diseases
```

This block documents the project but is not evaluated by the Python engine. It
remains available in the raw YAML returned by `load_raw()` and by the second
item returned from `load_contract()`.

## Tables and files

The `schema` field contains a list of tables:

```yaml
schema:
  - name: patients
    physicalType: table
    description: Patient reference table
    properties:
      - name: patient_id
        required: true

  - name: diagnoses
    physicalType: table
    description: Diagnoses recorded for the cohort
    properties:
      - name: diagnosis_code
        required: true
```

Resolution rules are:

- table names must be unique;
- one table maps to one CSV or Parquet file;
- one file maps to one table;
- for multiple tables, **each filename stem must exactly match its table
  name**, such as `patients.csv` and `diagnoses.parquet`;
- an explicit Python mapping supports different filenames;
- CSV and Parquet files may be mixed in one check.

Always use `physicalType: table`. It describes the ODCS schema shape, not the
file format.

## Columns

A column is declared under `properties`:

```yaml
properties:
  - name: diagnosis_date
    logicalType: date
    physicalType: timestamp
    required: true
    description: Date and time of the first qualifying diagnosis
    examples:
      - "2025-02-14 08:30:00"
```

| Field | Required | Behavior |
|---|---|---|
| `name` | yes | expected name in the data file |
| `logicalType` | no | semantic family used when no physical type is set |
| `physicalType` | no | exact DuckDB type expected |
| `required` | no | a missing column fails only when this is `true` |
| `description` | no | business definition of the column |
| `examples` | no | documentation examples, not evaluated by the engine |
| `quality` | no | SQL quality rules attached to the column |

Column names are matched case-insensitively, with an exact match taking
priority. If several data columns differ only by case, the result is
`ambiguous`.

### Column without a type constraint

Types are optional:

```yaml
- name: local_comment
  required: false
  description: Optional free-text comment
```

In this case, Clinical-Contract checks only column presence.

## Logical and physical types

A logical type defines a family. A physical type defines the precise type
expected when DuckDB reads the file.

| Logical type | Proposed physical types |
|---|---|
| `string` | `varchar`, `text`, `string`, `char`, `uuid` |
| `date` | `datetime`, `timestamp`, `timestamp with timezone` |
| `time` | `time` |
| `interval` | `interval` |
| `array` | `array` |
| `integer` | `int8`, `int16`, `int32`, `int64`, `uint8`, `uint16`, `uint32`, `uint64` |
| `float` | `float32`, `float64` |
| `decimal` | `decimal` |
| `boolean` | `boolean`, `binary` |

Matching follows these rules:

1. when `physicalType` is present, it controls a strict physical comparison
   after alias normalization;
2. otherwise, `logicalType` accepts any detected type in its broader family;
3. when both are absent, no type constraint is applied.

Explicit integer widths are strict. For example, `uint32` matches `UINTEGER`
but not `UBIGINT`. The generic logical type `integer` accepts signed and
unsigned integer types.

`timestamp with timezone` requires timezone-aware temporal data. A plain
`timestamp` does not satisfy this physical constraint.

## Required and optional columns

```yaml
- name: patient_id
  logicalType: string
  required: true

- name: icu_discharge_date
  logicalType: date
  required: false
```

- `required: true`: a missing column fails schema checking;
- `required: false` or an omitted field: the column may be absent;
- when an optional column exists, its type is still checked.

`required` controls **column presence**, not `NULL` values. Use a SQL quality
rule to check missing values.

## SQL quality rule

A rule is stored under the column it documents:

```yaml
- name: patient_id
  logicalType: string
  required: true
  quality:
    - type: sql
      description: Patient identifiers must not be null
      query: |
        SELECT COUNT(*)
        FROM patients
        WHERE patient_id IS NULL
      expected:
        equal: 0
```

The query must return **one row, one column, and one finite numeric value**.
The SQL table name is the value of `schema[].name`.

The result is compared with exactly one expectation:

| YAML operator | Symbol | Example |
|---|---|---|
| `equal` | `=` | `equal: 0` |
| `notEqual` | `!=` | `notEqual: 0` |
| `greaterThan` | `>` | `greaterThan: 100` |
| `greaterThanOrEqual` | `>=` | `greaterThanOrEqual: 100` |
| `lessThan` | `<` | `lessThan: 10` |
| `lessThanOrEqual` | `<=` | `lessThanOrEqual: 10` |
| `between` | inclusive | `min` and `max` |

Inclusive range example:

```yaml
expected:
  between:
    min: 900
    max: 1100
```

A rule must define only one operator. Boolean comparison values are rejected.

### `mustBe` compatibility

The legacy syntax remains accepted as an alias for `expected.equal`:

```yaml
mustBe: 0
```

Prefer this form in new contracts:

```yaml
expected:
  equal: 0
```

## Multi-table quality

All resolved tables are available in one DuckDB session, so a rule may check a
relationship between files:

```yaml
- name: patient_id
  quality:
    - type: sql
      description: Every diagnosis must reference a known patient
      query: |
        SELECT COUNT(*)
        FROM diagnoses AS d
        LEFT JOIN patients AS p
          ON p.patient_id = d.patient_id
        WHERE p.patient_id IS NULL
      expected:
        equal: 0
```

The rule remains attached to one column for readable reports, but its query may
read several tables.

## SQL security and limits

The engine accepts exactly one read-only `SELECT` statement. A query cannot:

- contain several statements;
- change a table or configuration;
- load an extension;
- read an external file after authorized sources are prepared.

DuckDB resources are also limited. Complex queries may still be expensive, so
keep checks simple, deterministic, and appropriate for expected file sizes.

## Team

The editor can document responsibilities:

```yaml
team:
  name: Clinical Data Office
  description: Maintains the cohort definition
  members:
    - name: Jane Doe
      role: Data owner
      email: jane.doe@example.org
```

This block is informational. It remains in raw YAML but is not evaluated by
Python checks.

## Complete multi-table example

```yaml
apiVersion: v3.1.0
kind: DataContract
id: urn:datacontract:covid-cohort:v1
name: COVID diagnosis cohort
version: 1.0.0
status: active

description:
  purpose: Define a reproducible COVID diagnosis cohort
  usage: Multi-centre epidemiological analysis
  limitations: Diagnoses before 2020 may be incomplete

schema:
  - name: patients
    physicalType: table
    description: One row per patient
    properties:
      - name: patient_id
        logicalType: string
        physicalType: varchar
        required: true
        description: Stable patient identifier
        quality:
          - type: sql
            description: Patient identifiers are unique
            query: |
              SELECT COUNT(*) - COUNT(DISTINCT patient_id)
              FROM patients
            expected:
              equal: 0
      - name: sex
        logicalType: string
        required: true
        description: M, F, or O

  - name: diagnoses
    physicalType: table
    description: Qualifying COVID diagnoses
    properties:
      - name: patient_id
        logicalType: string
        physicalType: varchar
        required: true
        quality:
          - type: sql
            description: Every diagnosis references a known patient
            query: |
              SELECT COUNT(*)
              FROM diagnoses AS d
              LEFT JOIN patients AS p
                ON p.patient_id = d.patient_id
              WHERE p.patient_id IS NULL
            expected:
              equal: 0
      - name: diagnosis_code
        logicalType: string
        required: true
      - name: diagnosis_date
        logicalType: date
        physicalType: timestamp
        required: true
```

This contract expects `patients.csv` or `patients.parquet` and
`diagnoses.csv` or `diagnoses.parquet`.

## What each step checks

| Step | Validation |
|---|---|
| `validate` | required fields, tables, columns, types, and quality expectation structure |
| `check_schema` | table/file mapping, column presence, and type compatibility |
| `check` | SQL quality execution and result comparison |

`check()` does not automatically rerun structural validation or schema
checking. The CLI and editor orchestrate these steps. For a custom integration,
read the [Python API documentation](./docs.html?page=python-api&lang=en).
