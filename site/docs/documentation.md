# Documentation

Clinical Contract est un outil pour rédiger, partager et vérifier des contrats de données.

Il a été conçu pour encadrer les échanges de fichiers entre équipes ou organisations, en particulier lorsque les données doivent être produites, transmises puis contrôlées sans ambiguïté.

## Pourquoi Clinical Contract existe

Dans beaucoup de projets, les échanges de données reposent encore sur des conventions informelles : un mail, un export déjà existant, une discussion, un tableur de référence, ou une documentation partielle.

Ce fonctionnement peut suffire au départ, mais il devient fragile dès que plusieurs équipes interviennent. Les surprises arrivent souvent tard : colonnes manquantes, noms modifiés, types inattendus, règles qualité absentes, ou fichiers impossibles à exploiter sans clarification.

Clinical Contract propose une approche simple : définir le contrat avant de contrôler le fichier.

## Le problème des échanges non encadrés

Un fichier de données n’est jamais seulement un fichier. Il porte des hypothèses : structure attendue, signification des colonnes, formats techniques, période couverte, règles métier et niveau de qualité minimal.

Lorsque ces hypothèses ne sont pas explicites, chaque réception de données peut devenir une phase d’interprétation.

Clinical Contract permet de réduire ce risque en rendant les attentes lisibles et vérifiables.

## Le contrat comme référence commune

Le contrat décrit ce qui est attendu, pas ce qui a été reçu.

Il sert de référence entre la personne ou l’organisation qui demande la donnée et celle qui la produit. Le fournisseur peut adapter son export au contrat, puis vérifier localement que le fichier respecte les règles attendues.

Le contrat devient ainsi un point d’accord partagé : il documente les besoins et permet de les tester.

## Ce que décrit un contrat

Un contrat peut préciser :

- l’identité du contrat : nom, version, statut ;
- l’objectif et l’usage prévu des données ;
- le contexte de l’étude ou du projet ;
- la table attendue ;
- les colonnes obligatoires ou optionnelles ;
- les types logiques et physiques attendus ;
- les règles qualité à vérifier ;
- l’équipe responsable du contrat.

L’objectif n’est pas de tout documenter dans le moindre détail, mais de cadrer ce qui est nécessaire pour produire et recevoir un fichier conforme.

## Types et schéma

Le schéma définit les colonnes attendues et leur typage.

Clinical Contract distingue deux niveaux :

- `logicalType` : l’intention métier ou fonctionnelle ;
- `physicalType` : le type technique attendu dans le fichier.

Si aucun type physique n’est renseigné, la vérification reste plus souple. Si un type physique est renseigné, la vérification devient stricte.

Cette distinction permet de choisir entre flexibilité et contrôle précis.

## Règles qualité

Les règles qualité permettent d’aller au-delà de la présence des colonnes.

Elles vérifient des conditions simples mais importantes : absence de valeurs nulles, identifiants uniques, dates dans une période attendue, absence de dates futures, ou nombre minimal de lignes.

Les règles sont exprimées en SQL et exécutées avec DuckDB. Le résultat attendu est explicite dans le contrat.

## Utilisation dans le navigateur

L’éditeur web permet de :

- rédiger un contrat avec une interface guidée ;
- visualiser le YAML généré ;
- valider la structure du contrat ;
- charger un fichier CSV ou Parquet ;
- prévisualiser les données ;
- vérifier le schéma et les règles qualité.

La page fonctionne sans backend. Le traitement est exécuté dans le navigateur avec PyScript, Pyodide et DuckDB.

## Utilisation en Python et en CLI

Clinical Contract existe aussi comme bibliothèque Python et comme commande CLI. L’éditeur web est utile pour rédiger et tester visuellement un contrat, mais la CLI permet d’intégrer les mêmes contrôles dans un terminal, un script ou un pipeline.

```bash
uv tool install --python python3.11 clinical-contract
```

Deux commandes couvrent le flux principal :

```bash
clinical-contract validate site/examples/contract.yaml
clinical-contract check site/examples/contract.yaml site/examples/template.parquet
```

`validate` contrôle la structure du contrat : métadonnées, description, schéma, colonnes, types et règles déclarées. Cette étape permet de vérifier que le YAML est correctement composé avant de l’envoyer à une autre équipe.

`check` applique ensuite le contrat à un fichier réel CSV ou Parquet. La commande vérifie les colonnes attendues, compare les types détectés, puis exécute les règles qualité SQL avec DuckDB.

Exemple de résultat attendu :

```text
Schema validation
Column       Expected   Detected   Status
PATIENT_ID   varchar    varchar    passed
STAY         uint32     uint32     passed
VALUE        float64    float64    passed
LIFE_STATUS  boolean    boolean    passed
EVENT_TIME   timestamp  timestamp  passed

Quality checks
PATIENT_ID  PATIENT_ID must not be null          passed
STAY        STAY must not be null                passed
EVENT_TIME  EVENT_TIME must be after 1925-01-01  passed

All checks passed.
```

En Python, le même contrat peut être chargé depuis un script :

```python
from clinical_contract import load_contract

contract, raw = load_contract("site/examples/contract.yaml")
report = contract.check("site/examples/template.parquet")

if not report.success:
    for result in report.failed():
        print(result.description, result.obtained, "!=", result.expected)
```

Cette utilisation est adaptée aux contrôles automatisés, aux pipelines de réception de fichiers et aux intégrations internes.

## Limites actuelles

Le navigateur est pratique pour rédiger, démontrer et tester rapidement un contrat. Pour des fichiers volumineux ou des contrôles automatisés en production, l’usage Python ou CLI reste plus adapté.
