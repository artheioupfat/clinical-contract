"""
Tests pour clinical-contract.
"""
import pytest
from clinical_contract import load_contract, load_raw
from clinical_contract.contract import DataContract
from clinical_contract.models import CheckStatus, ColumnCheckStatus

# ------------------------------------------------------------------ #
# YAML de test                                                         #
# ------------------------------------------------------------------ #

YAML_COMPLET = """
apiVersion: v1.0.0
kind: DataContract
id: test-contract
name: Test Contract
version: 1.0.0
status: active
description:
  purpose: "Test"
  usage: "Tests unitaires"
  limitations: "Aucune"
schema:
  - name: patients
    physicalType: TABLE
    description: Table patients
    properties:
      - name: id
        logicalType: string
        physicalType: TEXT
        description: Identifiant patient
        required: true
        quality:
          - type: sql
            description: Pas d'id null
            query: "SELECT COUNT(*) FROM patients WHERE id IS NULL"
            mustBe: 0
"""

YAML_INCOMPLET = """
apiVersion: v1.0.0
kind: DataContract
schema:
  - name: patients
    physicalType: TABLE
    description: Table patients
    properties: []
"""

YAML_OPTIONAL_COLUMN = """
apiVersion: v1.0.0
kind: DataContract
id: optional-contract
name: Optional Contract
version: 1.0.0
status: active
description:
  purpose: "Test"
  usage: "Tests unitaires"
  limitations: "Aucune"
schema:
  - name: patients
    physicalType: TABLE
    description: Table patients
    properties:
      - name: id
        logicalType: string
        physicalType: TEXT
        description: Identifiant
        required: true
      - name: notes
        logicalType: string
        physicalType: TEXT
        description: Colonne optionnelle
        required: false
"""

YAML_SANS_QUALITY = """
apiVersion: v1.0.0
kind: DataContract
id: no-quality
name: No Quality Contract
version: 1.0.0
status: active
description:
  purpose: "Test"
  usage: "Tests unitaires"
  limitations: "Aucune"
schema:
  - name: patients
    physicalType: TABLE
    description: Table patients
    properties:
      - name: id
        logicalType: string
        physicalType: TEXT
        description: Identifiant
        required: true
"""


def _write_parquet_ids(tmp_path, ids):
    duckdb = pytest.importorskip("duckdb")
    parquet_file = tmp_path / "patients.parquet"
    parquet_path_literal = str(parquet_file).replace("'", "''")

    with duckdb.connect() as conn:
        conn.execute("CREATE TABLE patients (id VARCHAR)")
        conn.executemany(
            "INSERT INTO patients VALUES (?)",
            [(value,) for value in ids],
        )
        conn.execute(f"COPY patients TO '{parquet_path_literal}' (FORMAT PARQUET)")

    return parquet_file


def _write_parquet_single_typed_column(tmp_path, table_name, column_name, duckdb_type):
    duckdb = pytest.importorskip("duckdb")
    parquet_file = tmp_path / f"{table_name}_{column_name}_{duckdb_type.lower()}.parquet"
    parquet_path_literal = str(parquet_file).replace("'", "''")

    with duckdb.connect() as conn:
        conn.execute(
            f"CREATE TABLE {table_name} AS "
            f"SELECT CAST(1 AS {duckdb_type}) AS {column_name}"
        )
        conn.execute(f"COPY {table_name} TO '{parquet_path_literal}' (FORMAT PARQUET)")

    return parquet_file


# ------------------------------------------------------------------ #
# Tests validate_structure                                             #
# ------------------------------------------------------------------ #

def test_validate_structure_complet():
    raw = load_raw(YAML_COMPLET)
    report = DataContract.validate_structure(raw)
    assert report.success is True
    assert len(report.missing()) == 0


def test_validate_structure_incomplet():
    raw = load_raw(YAML_INCOMPLET)
    report = DataContract.validate_structure(raw)
    assert report.success is False
    missing_fields = [f.field for f in report.missing()]
    assert "id"          in missing_fields
    assert "name"        in missing_fields
    assert "version"     in missing_fields
    assert "status"      in missing_fields
    assert "description" in missing_fields


def test_validate_structure_racine_non_mapping():
    report = DataContract.validate_structure(["not", "a", "mapping"])
    assert report.success is False
    assert len(report.missing()) == len(report.fields)


# ------------------------------------------------------------------ #
# Tests load_contract                                                  #
# ------------------------------------------------------------------ #

def test_load_contract_depuis_string():
    contract, raw = load_contract(YAML_COMPLET)
    assert contract.name == "Test Contract"
    assert len(contract.schema_) == 1
    assert contract.schema_[0].name == "patients"


def test_load_contract_depuis_bytes():
    contract, raw = load_contract(YAML_COMPLET.encode())
    assert contract.id == "test-contract"


def test_load_contract_yaml_vide():
    with pytest.raises(ValueError, match="YAML est vide"):
        load_contract(b"")


# ------------------------------------------------------------------ #
# Tests check() avec DuckDB                                            #
# ------------------------------------------------------------------ #

def test_check_tous_passes(tmp_path):
    parquet_file = _write_parquet_ids(tmp_path, ["A001", "A002", "A003"])

    contract, _ = load_contract(YAML_COMPLET)
    report = contract.check(str(parquet_file), backend="duckdb")

    assert report.success is True
    assert report.code == 0
    assert len(report.passed()) == 1
    assert len(report.failed()) == 0


def test_check_echec_si_null(tmp_path):
    # Un id null → le check doit échouer
    parquet_file = _write_parquet_ids(tmp_path, ["A001", None, "A003"])

    contract, _ = load_contract(YAML_COMPLET)
    report = contract.check(str(parquet_file), backend="duckdb")

    assert report.success is False
    assert report.code == 1
    failures = report.failed()
    assert len(failures) == 1
    assert failures[0].status == CheckStatus.failed
    assert failures[0].obtained == 1
    assert failures[0].expected == 0


def test_check_tous_passes_depuis_bytes(tmp_path):
    parquet_file = _write_parquet_ids(tmp_path, ["A001", "A002", "A003"])
    parquet_bytes = parquet_file.read_bytes()

    contract, _ = load_contract(YAML_COMPLET)
    report = contract.check(parquet_bytes, backend="duckdb")

    assert report.success is True
    assert report.code == 0
    assert len(report.passed()) == 1


def test_check_backend_inconnu():
    contract, _ = load_contract(YAML_COMPLET)
    with pytest.raises(ValueError, match="Unknown backend"):
        contract.check("fake.parquet", backend="mysql")


def test_check_sans_quality_rules():
    contract, _ = load_contract(YAML_SANS_QUALITY)
    report = contract.check("unused.parquet", backend="duckdb")
    assert report.success is True
    assert report.code == 0
    assert report.results == []
    assert "No quality checks" in report.summary


def test_check_execution_error_returns_code_2(tmp_path):
    parquet_file = _write_parquet_ids(tmp_path, ["A001", "A002", "A003"])

    yaml_sql_error = """
apiVersion: v1.0.0
kind: DataContract
id: error-contract
name: Error Contract
version: 1.0.0
status: active
description:
  purpose: "Test"
  usage: "Tests unitaires"
  limitations: "Aucune"
schema:
  - name: patients
    physicalType: TABLE
    description: Table patients
    properties:
      - name: id
        logicalType: string
        physicalType: TEXT
        description: Identifiant
        required: true
        quality:
          - type: sql
            description: Trigger SQL error
            query: "SELECT * FROM unknown_table"
            mustBe: 0
"""
    contract, _ = load_contract(yaml_sql_error)
    report = contract.check(str(parquet_file), backend="duckdb")

    assert report.success is False
    assert report.code == 2
    assert len(report.errors()) == 1
    assert "Execution errors" in report.summary


# ------------------------------------------------------------------ #
# Tests check_schema()                                                 #
# ------------------------------------------------------------------ #

def test_check_schema_colonne_optionnelle_absente(tmp_path):
    parquet_file = _write_parquet_ids(tmp_path, ["A001", "A002"])

    contract, _ = load_contract(YAML_OPTIONAL_COLUMN)
    reports = contract.check_schema(str(parquet_file))
    assert len(reports) == 1

    cols = {c.column: c for c in reports[0].columns}
    assert cols["id"].status == ColumnCheckStatus.ok
    assert cols["notes"].status == ColumnCheckStatus.optional_missing
    assert reports[0].success is True


def test_check_schema_depuis_bytes(tmp_path):
    parquet_file = _write_parquet_ids(tmp_path, ["A001", "A002"])
    parquet_bytes = parquet_file.read_bytes()

    contract, _ = load_contract(YAML_OPTIONAL_COLUMN)
    reports = contract.check_schema(parquet_bytes)
    cols = {c.column: c for c in reports[0].columns}

    assert cols["id"].status == ColumnCheckStatus.ok
    assert cols["notes"].status == ColumnCheckStatus.optional_missing
    assert reports[0].success is True


def test_check_schema_timestamp_tz_compatible(tmp_path):
    duckdb = pytest.importorskip("duckdb")

    yaml_timestamp_tz = """
apiVersion: v1.0.0
kind: DataContract
id: ts-contract
name: Timestamp Contract
version: 1.0.0
status: active
description:
  purpose: "Test"
  usage: "Tests unitaires"
  limitations: "Aucune"
schema:
  - name: patients
    physicalType: TABLE
    description: Table patients
    properties:
      - name: event_ts
        logicalType: timestamp[us, tz=Europe/Paris]
        physicalType: TIMESTAMP
        description: Horodatage
        required: true
"""
    parquet_file = tmp_path / "patients.parquet"
    parquet_path_literal = str(parquet_file).replace("'", "''")
    with duckdb.connect() as conn:
        conn.execute(
            "CREATE TABLE patients AS "
            "SELECT TIMESTAMPTZ '2023-11-14 12:34:56+01:00' AS event_ts"
        )
        conn.execute(f"COPY patients TO '{parquet_path_literal}' (FORMAT PARQUET)")

    contract, _ = load_contract(yaml_timestamp_tz)
    reports = contract.check_schema(str(parquet_file))
    assert reports[0].success is True
    assert reports[0].columns[0].status == ColumnCheckStatus.ok


def test_check_schema_uint32_matches_uinteger(tmp_path):
    parquet_file = _write_parquet_single_typed_column(
        tmp_path=tmp_path,
        table_name="orders",
        column_name="status_code",
        duckdb_type="UINTEGER",
    )
    yaml_uint32 = """
apiVersion: v1.0.0
kind: DataContract
id: uint32-contract
name: UInt32 Contract
version: 1.0.0
status: active
description:
  purpose: "Test"
  usage: "Unit tests"
  limitations: "None"
schema:
  - name: orders
    physicalType: TABLE
    description: Orders table
    properties:
      - name: status_code
        logicalType: uint32
        physicalType: UINTEGER
        description: Status
        required: true
"""
    contract, _ = load_contract(yaml_uint32)
    reports = contract.check_schema(str(parquet_file))
    col = reports[0].columns[0]

    assert reports[0].success is True
    assert col.status == ColumnCheckStatus.ok
    assert col.parquet_type.lower() == "uinteger"


def test_check_schema_uint32_rejects_ubigint(tmp_path):
    parquet_file = _write_parquet_single_typed_column(
        tmp_path=tmp_path,
        table_name="orders",
        column_name="status_code",
        duckdb_type="UBIGINT",
    )
    yaml_uint32 = """
apiVersion: v1.0.0
kind: DataContract
id: uint32-contract
name: UInt32 Contract
version: 1.0.0
status: active
description:
  purpose: "Test"
  usage: "Unit tests"
  limitations: "None"
schema:
  - name: orders
    physicalType: TABLE
    description: Orders table
    properties:
      - name: status_code
        logicalType: uint32
        physicalType: UINTEGER
        description: Status
        required: true
"""
    contract, _ = load_contract(yaml_uint32)
    reports = contract.check_schema(str(parquet_file))
    col = reports[0].columns[0]

    assert reports[0].success is False
    assert col.status == ColumnCheckStatus.type_mismatch
    assert col.parquet_type.lower() == "ubigint"


def test_check_schema_integer_keeps_family_compatibility(tmp_path):
    parquet_file = _write_parquet_single_typed_column(
        tmp_path=tmp_path,
        table_name="orders",
        column_name="status_code",
        duckdb_type="UINTEGER",
    )
    yaml_integer = """
apiVersion: v1.0.0
kind: DataContract
id: integer-contract
name: Integer Contract
version: 1.0.0
status: active
description:
  purpose: "Test"
  usage: "Unit tests"
  limitations: "None"
schema:
  - name: orders
    physicalType: TABLE
    description: Orders table
    properties:
      - name: status_code
        logicalType: integer
        physicalType: INTEGER
        description: Status
        required: true
"""
    contract, _ = load_contract(yaml_integer)
    reports = contract.check_schema(str(parquet_file))

    assert reports[0].success is True
    assert reports[0].columns[0].status == ColumnCheckStatus.ok




def test_validate_structure_schema_missing_fields():
    yaml_invalid = """
apiVersion: v1.0.0
kind: DataContract
id: test
name: Test
version: 1.0.0
status: active
description:
  purpose: ok
  usage: ok
  limitations: ok
schema:
  - name: patients
    # physicalType manquant
    description: table
    properties:
      - name: id
        logicalType: string
        physicalType: TEXT
        description: ok
"""
    raw = load_raw(yaml_invalid)
    report = DataContract.validate_structure(raw)

    assert report.success is False

    schema_field = next(f for f in report.fields if f.field == "schema")
    assert "error(s)" in schema_field.display_value




def test_validate_structure_properties_invalid():
    yaml_invalid = """
apiVersion: v1.0.0
kind: DataContract
id: test
name: Test
version: 1.0.0
status: active
description:
  purpose: ok
  usage: ok
  limitations: ok
schema:
  - name: patients
    physicalType: TABLE
    description: table
    properties:
      - name: id
        # logicalType manquant
        physicalType: TEXT
        description: ok
"""
    raw = load_raw(yaml_invalid)
    report = DataContract.validate_structure(raw)

    assert report.success is False


def test_validate_structure_description_missing_subfields():
    yaml_invalid = """
apiVersion: v1.0.0
kind: DataContract
id: test
name: Test
version: 1.0.0
status: active
description:
  purpose: ok
schema:
  - name: patients
    physicalType: TABLE
    description: table
    properties:
      - name: id
        logicalType: string
        physicalType: TEXT
        description: ok
"""
    raw = load_raw(yaml_invalid)
    report = DataContract.validate_structure(raw)

    assert report.success is False
    desc_field = next(f for f in report.fields if f.field == "description")
    assert "missing usage, limitations" == desc_field.display_value


def test_validate_structure_description_not_object():
    yaml_invalid = """
apiVersion: v1.0.0
kind: DataContract
id: test
name: Test
version: 1.0.0
status: active
description: "oops"
schema:
  - name: patients
    physicalType: TABLE
    description: table
    properties:
      - name: id
        logicalType: string
        physicalType: TEXT
        description: ok
"""
    raw = load_raw(yaml_invalid)
    report = DataContract.validate_structure(raw)

    assert report.success is False
    desc_field = next(f for f in report.fields if f.field == "description")
    assert desc_field.display_value == "invalid (not an object)"


def test_validate_structure_unknown_logical_type_fails_early():
    yaml_invalid = """
apiVersion: v1.0.0
kind: DataContract
id: test
name: Test
version: 1.0.0
status: active
description:
  purpose: ok
  usage: ok
  limitations: ok
schema:
  - name: patients
    physicalType: TABLE
    description: table
    properties:
      - name: id
        logicalType: unknown_type
        physicalType: TEXT
        description: ok
"""
    raw = load_raw(yaml_invalid)
    report = DataContract.validate_structure(raw)

    assert report.success is False
    schema_field = next(f for f in report.fields if f.field == "schema")
    assert "schema[0].properties[0].logicalType unsupported" in schema_field.display_value


@pytest.mark.parametrize("logical_type", ["uint32", "uinteger"])
def test_validate_structure_accepts_uint32_and_duckdb_alias(logical_type):
    yaml_valid = f"""
apiVersion: v1.0.0
kind: DataContract
id: test
name: Test
version: 1.0.0
status: active
description:
  purpose: ok
  usage: ok
  limitations: ok
schema:
  - name: patients
    physicalType: TABLE
    description: table
    properties:
      - name: id
        logicalType: {logical_type}
        physicalType: TEXT
        description: ok
"""
    raw = load_raw(yaml_valid)
    report = DataContract.validate_structure(raw)

    assert report.success is True
