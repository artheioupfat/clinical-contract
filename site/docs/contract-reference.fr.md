## Contrat minimal valide

Clinical-Contract utilise un document YAML inspiré du **Open Data Contract
Standard (ODCS) 3.1.0**. Voici la plus petite structure recommandée :

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

La racine `description` doit être un objet, mais ses trois textes peuvent être
vides. Une table doit contenir au moins une colonne pour passer la validation
structurelle actuelle.

> Clinical-Contract implémente le sous-ensemble ODCS nécessaire à la rédaction,
> à la validation et au contrôle de fichiers CSV/Parquet. Il ne prétend pas
> encore valider tous les champs possibles du standard ODCS.

## Métadonnées racine

```yaml
apiVersion: v3.1.0
kind: DataContract
id: urn:datacontract:covid-cohort:v1
name: COVID diagnosis cohort
version: 1.2.0
status: active
```

| Champ | Requis | Usage |
|---|---|---|
| `apiVersion` | oui | version du standard ciblé ; l'éditeur écrit `v3.1.0` |
| `kind` | oui | nature du document ; utilisez `DataContract` |
| `id` | oui | identifiant stable, idéalement un URN |
| `name` | oui | nom humain du contrat et nom proposé au téléchargement |
| `version` | oui | version du contrat, indépendante de celle de la bibliothèque |
| `status` | oui | cycle de vie du contrat, par exemple `active` ou `inactive` |

Le validateur structurel vérifie actuellement la présence de ces champs. Les
valeurs recommandées ci-dessus assurent une meilleure interopérabilité et
doivent être considérées comme le contrat éditorial du projet.

## Description du contrat

```yaml
description:
  purpose: Define the COVID cohort expected by the study
  usage: Epidemiological analyses across participating hospitals
  limitations: Historical diagnoses may be incomplete before 2020
```

`description` est requis et doit être un objet. Ses trois sous-champs sont
optionnels : ils peuvent être absents ou vides sans provoquer d'échec.

| Sous-champ | Question traitée |
|---|---|
| `purpose` | Pourquoi ces données sont-elles demandées ? |
| `usage` | Comment peuvent-elles être utilisées ? |
| `limitations` | Quelles limites doivent connaître les consommateurs ? |

## Contexte d'étude

L'éditeur peut conserver un bloc contextuel d'étude :

```yaml
study:
  startDate: 2020-01-01
  endDate: 2026-12-31
  type: cohort
  objective: epidemiological
  healthDomain: infectious diseases
```

Ce bloc documente le projet mais n'est pas évalué par le moteur Python. Il
reste disponible dans le YAML brut retourné par `load_raw()` et par le second
élément de `load_contract()`.

## Tables et fichiers

Le champ `schema` contient une liste de tables :

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

Règles de résolution :

- les noms de table doivent être uniques ;
- une table correspond à un fichier CSV ou Parquet ;
- un fichier ne correspond qu'à une table ;
- en multi-table, **le nom du fichier sans extension doit correspondre
  exactement au nom de table**, par exemple `patients.csv` et
  `diagnoses.parquet` ;
- un mapping Python explicite permet d'utiliser d'autres noms de fichiers ;
- CSV et Parquet peuvent être mélangés dans un même contrôle.

Utilisez toujours `physicalType: table`. Cette valeur décrit la forme du schéma
ODCS ; elle n'est pas le format du fichier.

## Colonnes

Une colonne est déclarée dans `properties` :

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

| Champ | Requis | Comportement |
|---|---|---|
| `name` | oui | nom attendu dans le fichier |
| `logicalType` | non | famille sémantique utilisée si aucun type physique n'est fixé |
| `physicalType` | non | type précis attendu dans DuckDB |
| `required` | non | une colonne absente échoue uniquement si la valeur est `true` |
| `description` | non | définition métier de la colonne |
| `examples` | non | exemples documentaires, non contrôlés par le moteur |
| `quality` | non | liste de règles SQL rattachées à la colonne |

Les noms de colonne sont comparés sans tenir compte de la casse. Une
correspondance exacte est prioritaire. Si le fichier contient plusieurs noms
qui ne diffèrent que par la casse, le résultat devient `ambiguous`.

### Colonne sans contrainte de type

Les types ne sont pas obligatoires :

```yaml
- name: local_comment
  required: false
  description: Optional free-text comment
```

Dans ce cas, Clinical-Contract contrôle seulement la présence de la colonne.

## Types logiques et physiques

Le type logique exprime une famille. Le type physique exprime un type plus
précis attendu lors de la lecture par DuckDB.

| Type logique | Types physiques proposés |
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

La règle de correspondance est la suivante :

1. si `physicalType` est renseigné, il pilote une comparaison physique stricte
   après normalisation des alias ;
2. sinon, `logicalType` accepte tout type détecté appartenant à sa famille ;
3. si les deux sont absents, aucune contrainte de type n'est appliquée.

Les largeurs d'entiers explicites sont strictes. Par exemple, `uint32`
correspond à `UINTEGER`, mais pas à `UBIGINT`. En revanche, le type logique
`integer` accepte la famille entière signée ou non signée.

`timestamp with timezone` exige une donnée temporelle avec fuseau. Un simple
`timestamp` ne suffit pas pour cette contrainte physique.

## Colonne obligatoire ou optionnelle

```yaml
- name: patient_id
  logicalType: string
  required: true

- name: icu_discharge_date
  logicalType: date
  required: false
```

- `required: true` : l'absence de la colonne fait échouer le schéma ;
- `required: false` ou champ absent : la colonne peut manquer ;
- si une colonne optionnelle est présente, son type reste contrôlé.

`required` concerne la présence de la **colonne**, pas les valeurs `NULL`.
Utilisez une règle qualité SQL pour contrôler les valeurs manquantes.

## Règle qualité SQL

Une règle est placée sous la colonne qu'elle documente :

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

La requête doit retourner **une ligne, une colonne et une valeur numérique
finie**. Le nom de table utilisé dans le SQL est le champ `schema[].name`.

Le résultat est comparé à une seule attente :

| Opérateur YAML | Symbole | Exemple |
|---|---|---|
| `equal` | `=` | `equal: 0` |
| `notEqual` | `!=` | `notEqual: 0` |
| `greaterThan` | `>` | `greaterThan: 100` |
| `greaterThanOrEqual` | `>=` | `greaterThanOrEqual: 100` |
| `lessThan` | `<` | `lessThan: 10` |
| `lessThanOrEqual` | `<=` | `lessThanOrEqual: 10` |
| `between` | inclusif | `min` et `max` |

Exemple de plage inclusive :

```yaml
expected:
  between:
    min: 900
    max: 1100
```

Une règle ne doit définir qu'un opérateur. Les booléens ne sont pas acceptés
comme valeurs de comparaison.

### Compatibilité avec `mustBe`

L'ancienne syntaxe reste acceptée comme alias de `expected.equal` :

```yaml
mustBe: 0
```

Pour les nouveaux contrats, préférez toujours :

```yaml
expected:
  equal: 0
```

## Qualité multi-table

Toutes les tables résolues sont disponibles dans la même session DuckDB. Une
règle peut donc contrôler une relation entre fichiers :

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

La règle reste rattachée à une colonne pour être lisible dans les rapports,
mais sa requête peut consulter plusieurs tables.

## Sécurité et limites SQL

Le moteur n'accepte qu'une instruction `SELECT` en lecture seule. La requête
ne peut pas :

- contenir plusieurs instructions ;
- modifier une table ou la configuration ;
- charger une extension ;
- lire un fichier externe après la préparation des sources autorisées.

Les ressources DuckDB sont également limitées. Une requête complexe peut
néanmoins être coûteuse : gardez les contrôles simples, déterministes et
adaptés à la taille attendue des fichiers.

## Équipe

L'éditeur peut documenter les responsabilités :

```yaml
team:
  name: Clinical Data Office
  description: Maintains the cohort definition
  members:
    - name: Jane Doe
      role: Data owner
      email: jane.doe@example.org
```

Ce bloc est informatif. Il est conservé dans le YAML brut mais n'est pas
évalué par les contrôles Python.

## Exemple multi-table complet

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

Ce contrat attend `patients.csv` ou `patients.parquet` et
`diagnoses.csv` ou `diagnoses.parquet`.

## Ce que vérifie chaque étape

| Étape | Vérification |
|---|---|
| `validate` | présence et forme des champs requis, tables, colonnes, types et attentes qualité |
| `check_schema` | association table/fichier, présence des colonnes et compatibilité des types |
| `check` | exécution et comparaison des requêtes qualité SQL |

`check()` ne relance pas automatiquement la validation structurelle ni le
contrôle de schéma. Le CLI et l'éditeur enchaînent ces étapes pour vous. Pour
une intégration personnalisée, consultez la
[documentation de l'API Python](./docs.html?page=python-api&lang=fr).
