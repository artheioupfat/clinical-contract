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

## Utilisation en Python

Clinical Contract existe aussi comme bibliothèque Python et comme CLI.

```bash
clinical-contract validate contract.yaml
clinical-contract check contract.yaml data.parquet
```

Cette utilisation est adaptée aux scripts, aux pipelines et aux contrôles automatisés.

## Limites actuelles

Le navigateur est pratique pour rédiger, démontrer et tester rapidement un contrat. Pour des fichiers volumineux ou des contrôles automatisés en production, l’usage Python ou CLI reste plus adapté.
