## What is a data contract?

A data contract is a document, usually written in *YAML*, that defines the expectations for a dataset exchanged between a producer and its consumers.

Ideally written at the beginning of a project, it describes the expected structure, columns, data types and quality rules. It provides a shared, versionable reference and makes it possible to check automatically whether a delivered file meets the agreed requirements.

Clinical-Contract is based on the **Open Data Contract Standard (ODCS) 3.1.0**, an open specification for describing data contracts. This improves interoperability with other compatible tools.

## Create a contract

Clinical-Contract guides you through contract authoring step by step. Start with the general information, then define the expected table, its columns and any quality rules.

Each editor section corresponds to part of the generated YAML contract. YAML remains the source of truth: you can use the guided editor or edit the YAML directly.

Several synthetic contract/dataset pairs are bundled with the editor. They cover CSV and Parquet exchanges, simple and advanced types, and different quality comparisons. Files in a matching pair share the same name so they are easy to identify.

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

A column may define a **Logical Type**, which describes its semantic family,
and a **Physical Type**, which specifies its technical representation. The
physical type takes priority; when it is absent, Clinical-Contract uses the
logical family. When neither type is provided, only column presence is checked.

The complete type catalog, DuckDB mappings, and matching rules are documented
in the [contract reference](./docs.html?page=contract-reference&lang=en).

## Add quality rules

A quality rule combines a read-only SQL query with an expected comparison. The
query must return one numeric value and may use one or several contract tables
within the same DuckDB session.

Available operators, `expected` syntax, SQL examples, and `mustBe`
compatibility are documented in the
[contract reference](./docs.html?page=contract-reference&lang=en).

### SQL rule security

Clinical-Contract treats loaded contracts as untrusted input. Quality rules must contain one read-only `SELECT` statement. Commands that modify data, write files, load extensions or change DuckDB configuration are rejected.

The CSV or Parquet file is first loaded into an internal temporary table. External filesystem and network access are disabled before quality rules execute. In the web application, contracts and data remain inside the browser and are never sent to a server.

A read-only query can still be computationally expensive. Review rules received from external organizations before running them automatically on shared infrastructure.

## Validate a data contract

Select **Validate** to verify that the contract structure is complete and supported.

The Validation tab lists valid, missing and invalid fields. Required fields are also highlighted in the guided editor so they can be corrected before the contract is shared.

## Load a data file

Load one **CSV** or **Parquet** file per contract table in the Checker panel. **The filename, without its extension, identifies the matching schema.** A paginated preview lets you inspect the active dataset without rendering every row at once.

All processing happens locally in the browser. The file is not uploaded to Clinical-Contract or another server.

## Check data compliance

Select **Run checks** to compare the loaded files with the current contract.

Clinical-Contract first validates the contract, then checks the dataset schema. Expected columns, required columns and configured data types are compared with the detected file schema.

If the schemas are compatible, quality rules run through one shared **DuckDB** session. A rule may therefore join several contract tables. The Schema and Quality tabs display each result and any technical SQL error returned by the engine.

## Use the command-line interface

The CLI runs the same validations from a terminal, shell script, or CI job.
Python 3.11 or newer is required.

```bash
uv tool install --python python3.11 clinical-contract
clinical-contract validate contract.yaml
clinical-contract check contract.yaml patients.csv diagnoses.parquet
```

CLI options, multi-source inputs, and application integration are covered in
the [Python API documentation](./docs.html?page=python-api&lang=en).

## Go further

Two focused guides extend this introduction:

- the [Python API documentation](./docs.html?page=python-api&lang=en) covers
  installation, reports, multi-table inputs, and application integration;
- the [YAML contract reference](./docs.html?page=contract-reference&lang=en)
  explains every block, supported type, and quality operator.

## Current limitations

- A contract may describe several tables; each table maps to exactly one CSV or Parquet file.
- Dataset checks currently support CSV and Parquet files.
- Quality rules are expressed as SQL queries.
- Logical and physical types are limited to the types exposed by Clinical-Contract.

## About the project

Clinical-Contract is an open-source project developed by the **Clinical Data Center of Brest University Hospital** to improve the definition, validation and exchange of health data.

The project follows the **Open Data Contract Standard (ODCS) 3.1.0** and welcomes suggestions and bug reports on [GitHub](https://github.com/artheioupfat/clinical-contract/issues/new).
