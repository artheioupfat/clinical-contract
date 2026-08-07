## Installation

Clinical-Contract nécessite Python 3.11 ou une version plus récente.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install clinical-contract
```

Avec `uv` :

```bash
uv add clinical-contract
```

Vérifiez la version réellement installée :

```bash
clinical-contract --version
```

Le nom de la distribution PyPI contient un tiret, mais l'import Python utilise
un underscore :

```python
import clinical_contract

print(clinical_contract.__version__)
```

## Vue d'ensemble de l'API

Les fonctions et classes principales sont importables depuis
`clinical_contract` :

| API | Rôle |
|---|---|
| `load_raw` | Charger le YAML sous forme de dictionnaire sans modèle strict |
| `load_contract` | Charger le YAML et construire un `DataContract` Pydantic |
| `DataContract.validate_structure` | Valider la structure d'un dictionnaire brut |
| `DataContract.check_schema` | Comparer les tables, colonnes et types avec les fichiers |
| `DataContract.check` | Exécuter les règles qualité SQL |
| `DataSource` | Type d'une source CSV/Parquet unique |
| `DataSources` | Type accepté pour une ou plusieurs sources |

Le flux complet est volontairement composé de plusieurs étapes :

```text
YAML
  -> validate_structure()
  -> load_contract()
  -> check_schema()
  -> check()
```

Cette séparation permet d'utiliser uniquement la validation du contrat, de
contrôler seulement le schéma, ou de construire une orchestration adaptée à
une application.

## Charger le YAML brut

### `load_raw(source)`

`load_raw` accepte :

- un chemin `str` ;
- un objet `pathlib.Path` ;
- une chaîne YAML contenant un retour à la ligne ;
- des `bytes` contenant le YAML.

```python
from clinical_contract import load_raw

raw_contract = load_raw("contract.yaml")
print(raw_contract["name"])
```

Cette fonction ne construit pas encore le modèle Pydantic. Elle est utile pour
afficher toutes les erreurs structurelles d'un contrat incomplet.

Un document vide ou dont la racine n'est pas un objet YAML retourne `{}`. Une
syntaxe YAML invalide déclenche une exception `yaml.YAMLError`.

## Valider la structure

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

Cette validation vérifie notamment :

- les champs racine requis ;
- la présence d'au moins une table ;
- l'unicité des noms de table ;
- la présence des propriétés requises pour chaque table ;
- la validité de `required` ;
- les types logiques et physiques pris en charge ;
- la forme des attentes qualité.

Elle retourne un `ValidateReport` :

```python
report.success       # bool
report.fields        # list[FieldValidation]
report.missing()     # champs invalides ou absents
```

Chaque `FieldValidation` expose `field`, `present`, `value`, `status_icon` et
`display_value`.

## Charger un contrat typé

### `load_contract(source)`

```python
from clinical_contract import load_contract

contract, raw_contract = load_contract("contract.yaml")

print(contract.name)
print(contract.version)
print(contract.schema_)
```

La fonction retourne un tuple :

```python
(DataContract, dict)
```

Le premier élément est le modèle Pydantic utilisé par le moteur. Le second est
le document brut, utile si l'application doit conserver des métadonnées ODCS
qui ne participent pas aux contrôles.

Erreurs possibles :

- `FileNotFoundError` si le chemin n'existe pas ;
- `yaml.YAMLError` si le YAML est invalide ;
- `ValueError` si le document est vide ou si sa racine n'est pas un objet ;
- `pydantic.ValidationError` si les modèles opérationnels ne peuvent pas être
  construits.

## Fournir les données

Les méthodes de contrôle utilisent le type public `DataSources`.

### Une table et un fichier

Pour un contrat mono-table, passez directement un chemin :

```python
schema_reports = contract.check_schema("patients.parquet")
quality_report = contract.check("patients.parquet")
```

Le cas mono-table conserve sa compatibilité historique : si une seule source
est fournie, son nom n'a pas besoin de correspondre au nom de la table.

### Plusieurs tables et fichiers nommés

Pour un contrat multi-table, **chaque nom de fichier sans extension doit
correspondre exactement au nom d'une table** :

```python
sources = [
    "patients.csv",
    "observations.parquet",
]

schema_reports = contract.check_schema(sources)
quality_report = contract.check(sources)
```

L'ordre n'a aucune importance. CSV et Parquet peuvent être mélangés.

### Mapping explicite

Un mapping permet d'utiliser des fichiers dont le nom est différent :

```python
from pathlib import Path

sources = {
    "patients": Path("export_patients_2026.csv"),
    "observations": Path("extract_lab.parquet"),
}
```

Il est également obligatoire pour plusieurs sources en mémoire :

```python
sources = {
    "patients": patients_csv_bytes,
    "observations": observations_parquet_bytes,
}
```

Les valeurs peuvent être des chemins, des objets `Path`, des `bytes` ou des
`bytearray`.

La résolution refuse :

- les clés de mapping inconnues ;
- deux fichiers pour la même table ;
- un fichier nommé d'après une table inexistante ;
- plusieurs tables portant le même nom ;
- plusieurs contenus binaires sans mapping explicite.

## Vérifier le schéma des données

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

La méthode retourne un `SchemaCheckReport` par table, dans l'ordre du contrat.
Chaque rapport expose :

```python
table_report.success
table_report.schema_name
table_report.source_name
table_report.error_message
table_report.columns
table_report.failures()
```

Les statuts de colonne sont :

| Statut | Signification |
|---|---|
| `ok` | colonne présente et type compatible |
| `missing` | colonne obligatoire absente |
| `optional_missing` | colonne optionnelle absente, sans échec du rapport |
| `type_mismatch` | colonne présente mais type incompatible |
| `ambiguous` | plusieurs colonnes ne diffèrent que par la casse |

Les noms de colonnes sont comparés sans tenir compte de la casse. Une
correspondance exacte reste prioritaire.

Si une colonne possède un `physicalType`, la comparaison est stricte sur ce
type physique. Sinon, le moteur utilise la famille du `logicalType`. Si aucun
type n'est défini, seule la présence est contrôlée.

## Exécuter les règles qualité

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

Attention : `check()` exécute les règles qualité mais ne lance pas
automatiquement `check_schema()`. Le CLI et le site orchestrent les deux
étapes explicitement.

Toutes les tables sont chargées dans une même connexion DuckDB. Une règle peut
donc effectuer une jointure :

```sql
SELECT COUNT(*)
FROM observations AS o
LEFT JOIN patients AS p
  ON p.patient_id = o.patient_id
WHERE p.patient_id IS NULL
```

`backend` est conservé pour compatibilité. Seules les valeurs `auto` et
`duckdb` sont acceptées, et toutes deux utilisent DuckDB.

Le paramètre avancé `include_schemas` limite l'exécution à un ensemble de
tables :

```python
report = contract.check(sources, include_schemas={"patients"})
```

Il est principalement destiné aux orchestrateurs qui veulent ignorer les
règles des tables dont le schéma de données est déjà invalide.

## Comprendre `ContractReport`

Le rapport qualité utilise trois codes :

| Code | Signification |
|---|---|
| `0` | toutes les règles passent, ou aucune règle SQL exécutable |
| `1` | au moins une valeur obtenue ne respecte pas l'attente |
| `2` | au moins une requête produit une erreur technique |

Helpers disponibles :

```python
report.passed()
report.failed()
report.errors()
```

Chaque `QualityResult` contient :

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

Une non-conformité fonctionnelle possède le statut `failed`. Une requête SQL
invalide ou impossible à exécuter possède le statut `error`.

## Orchestration complète recommandée

Cette fonction reproduit le principe du CLI :

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

Exemple d'appel avec plusieurs fichiers de données :

```python
sources = ["patients.csv", "diagnostic.parquet"]
validate_and_check("covid-diagnosis.yaml", sources)
```

Une application peut choisir de ne pas exécuter la qualité si une seule table
est invalide, ou de conserver le comportement du CLI et exécuter les règles
des tables encore valides.

## Sécurité des requêtes SQL

Les contrats sont traités comme des entrées non fiables. Une règle doit :

- contenir une seule instruction de lecture `SELECT` ;
- retourner exactement une ligne et une colonne ;
- retourner un nombre fini et non `NULL` au sens SQL ;
- ne pas modifier les données ou la configuration DuckDB ;
- ne pas lire de fichier externe après le chargement des sources autorisées.

Les extensions, l'accès externe et la modification des paramètres DuckDB sont
verrouillés. La mémoire, l'espace temporaire et le nombre de threads sont
limités. Ces protections réduisent le risque mais ne remplacent pas un timeout
applicatif pour des contrats provenant d'une source non maîtrisée.

## Typage et modèles publics

Le package expose `py.typed`, ce qui permet aux outils comme Pyright ou mypy de
consommer ses annotations.

Les modèles publics incluent notamment :

- `DataContract`, `SchemaItem`, `Property`, `Quality`, `Description` ;
- `QualityExpectation`, `BetweenExpectation`, `ComparisonOperator` ;
- `ValidateReport`, `SchemaCheckReport`, `ContractReport` ;
- `FieldValidation`, `ColumnCheckResult`, `QualityResult`.

Ils sont des modèles Pydantic et peuvent être sérialisés avec
`model_dump()`/`model_dump_json()` lorsque votre application doit stocker ou
exposer les rapports.

## API ou CLI ?

Utilisez le CLI pour :

- les contrôles manuels ;
- les scripts shell ;
- une étape simple de pipeline CI.

Utilisez l'API Python pour :

- intégrer les rapports à une application ;
- contrôler des contenus en mémoire ;
- personnaliser l'orchestration ;
- enregistrer les résultats dans votre propre système ;
- décider précisément comment traiter les tables invalides.

Pour la structure YAML complète, consultez la
[référence du contrat](./docs.html?page=contract-reference&lang=fr).
