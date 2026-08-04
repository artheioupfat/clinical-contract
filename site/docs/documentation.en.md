## What is a data contract?

A data contract is a document, usually written in *YAML*, that defines the expectations for a dataset exchanged between a producer and its consumers.

Ideally written at the beginning of a project, it describes the expected structure, columns, data types and quality rules. It provides a shared, versionable reference and makes it possible to check automatically whether a delivered file meets the agreed requirements.

Clinical-Contract is based on the **Open Data Contract Standard (ODCS) 3.1.0**, an open specification for describing data contracts. This improves interoperability with other compatible tools.

## Create a contract

Clinical-Contract guides you through contract authoring step by step. Start with the general information, then define the expected table, its columns and any quality rules.

Each editor section corresponds to part of the generated YAML contract. YAML remains the source of truth: you can use the guided editor or edit the YAML directly.

Bundled examples are available from the editor to demonstrate a complete contract and its matching dataset.

## Describe the context, purpose and use

Start by naming the contract, assigning a **version** and choosing whether it is **active**. These fields identify the contract and make its lifecycle explicit.

The **Purpose**, **Usage** and **Limitations** fields are optional but recommended. They document why the dataset exists, how it should be used and which caveats consumers need to know.

You can also document study-specific information: the inclusion period, study type, objective and health domain.

## Define the expected table

The table name is independent from the contract name. It represents the dataset described by the contract and is used as the relation name in SQL quality rules.

Choose a concise, explicit name and add a description of the table's content and role.

## Define columns

For each expected column, provide a **name**, indicate whether it is **required**, and optionally select a logical and physical data type.

Use the description and examples to explain the meaning of the field and clarify the expected values for data producers.

## Understand data types

Columns can use two complementary types:

- **Logical type** describes the semantic family of the information.
- **Physical type** describes how the value is represented in the source file.

| Logical type | Meaning | Compatible physical types |
| :----------: | :------ | :------------------------ |
| `string` | Text values | `varchar`, `text`, `string`, `char`, `uuid` |
| `integer` | Integer values | `int8`, `int16`, `int32`, `int64`, `uint8`, `uint16`, `uint32`, `uint64` |
| `float` | Floating-point values | `float32`, `float64` |
| `decimal` | Exact decimal values | `decimal` |
| `boolean` | Boolean values | `boolean`, `binary` |
| `date` | Dates and date-times | `datetime`, `timestamp`, `timestamp with timezone` |
| `time` | Time without a date | `time` |
| `interval` | Time intervals | `interval` |
| `array` | Collections of values | `array` |

Explicit integer widths are matched strictly. For example, `uint32` matches a DuckDB `UINTEGER`, but not a `UBIGINT`. Generic types such as `integer` use broader family matching.

The `array` type accepts variable-size and fixed-size DuckDB collections. Element types are not constrained yet.

The `decimal` type checks the DuckDB `DECIMAL` family. Precision and scale, such as `DECIMAL(18, 4)`, are not compared yet.

Both types are optional. If neither is provided, Clinical-Contract checks that the column exists without enforcing a type constraint.

## Add quality rules

Quality rules execute read-only SQL queries against the loaded dataset. Each rule contains a query, an expected comparison and an optional description.

The query must return one numeric value: one row and one column. The result can be checked with `equal`, `notEqual`, `greaterThan`, `greaterThanOrEqual`, `lessThan`, `lessThanOrEqual`, or an inclusive `between` range.

Use the table name defined in the contract in every SQL rule.

### Examples

Check that `STAY` contains no null values:

```sql
SELECT COUNT(*)
FROM export
WHERE STAY IS NULL;
```

```yaml
expected:
  equal: 0
```

Check that the dataset contains exactly 1,000 rows:

```sql
SELECT COUNT(*)
FROM export;
```

```yaml
expected:
  equal: 1000
```

Accept a value within a range:

```yaml
expected:
  between:
    min: 90000
    max: 110000
```

The legacy `mustBe` field remains supported as an alias for `expected.equal`.

### SQL rule security

Clinical-Contract treats loaded contracts as untrusted input. Quality rules must contain one read-only `SELECT` statement. Commands that modify data, write files, load extensions or change DuckDB configuration are rejected.

The CSV or Parquet file is first loaded into an internal temporary table. External filesystem and network access are disabled before quality rules execute. In the web application, contracts and data remain inside the browser and are never sent to a server.

A read-only query can still be computationally expensive. Review rules received from external organizations before running them automatically on shared infrastructure.

## Validate a data contract

Select **Validate** to verify that the contract structure is complete and supported.

The Validation tab lists valid, missing and invalid fields. Required fields are also highlighted in the guided editor so they can be corrected before the contract is shared.

## Load a data file

Load a **CSV** or **Parquet** file in the Checker panel. A paginated preview lets you inspect the dataset without rendering every row at once.

All processing happens locally in the browser. The file is not uploaded to Clinical-Contract or another server.

## Check data compliance

Select **Run checks** to compare the loaded data with the current contract.

Clinical-Contract first validates the contract, then checks the dataset schema. Expected columns, required columns and configured data types are compared with the detected file schema.

If the schema is compatible, quality rules run through **DuckDB**. The Schema and Quality tabs display each result and any technical SQL error returned by the engine.

## Use the command-line interface

Clinical-Contract can validate contracts and check files from a terminal.

### Install the CLI

```bash
uv tool install --python python3.11 clinical-contract
```

### Validate a contract

```bash
clinical-contract validate site/examples/contract.yaml
```

### Check a data file

```bash
clinical-contract check site/examples/contract.yaml site/examples/template.parquet
```

Use `clinical-contract --help` to list the available commands and options.

## Python API

Install the library from PyPI:

Python 3.11 or newer is required.

```bash
pip install clinical-contract
```

### Validate a contract structure

```python
from clinical_contract import DataContract, load_raw

raw_contract = load_raw("contract.yaml")
report = DataContract.validate_structure(raw_contract)

print(report.success)
```

### Check a data file

```python
from clinical_contract import load_contract

contract, _ = load_contract("contract.yaml")
report = contract.check("data.parquet")

print(report.success)
```

## Current limitations

- A contract describes one table.
- Dataset checks currently support CSV and Parquet files.
- Quality rules are expressed as SQL queries.
- Logical and physical types are limited to the types exposed by Clinical-Contract.

## About the project

Clinical-Contract is an open-source project developed by the **Clinical Data Center of Brest University Hospital** to improve the definition, validation and exchange of health data.

The project follows the **Open Data Contract Standard (ODCS) 3.1.0** and welcomes suggestions and bug reports on [GitHub](https://github.com/artheioupfat/clinical-contract/issues/new).
