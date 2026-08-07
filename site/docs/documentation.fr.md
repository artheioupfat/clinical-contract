
## Qu'est-ce qu'un contrat de données ?

Un contrat de données est un fichier, généralement au format *YAML*, qui spécifie les attentes d'un demandeur concernant un jeu de données.

Rédigé de préférence au début d'un projet, il décrit de manière explicite la structure attendue des données, les colonnes, leurs types ainsi que les règles de qualité à respecter. Il constitue une référence commune entre le producteur et le consommateur des données et permet de vérifier automatiquement qu'un fichier est conforme aux attentes définies.

Clinical-Contract s'appuie sur le **Open Data Contract Standard (ODCS) 3.1.0**, un standard ouvert de description des contrats de données. Les contrats créés avec Clinical-Contract suivent cette spécification afin de garantir leur interopérabilité avec les outils compatibles.

## Créer un contrat

Clinical-Contract vous guide dans la rédaction d'un contrat de données étape par étape. Vous commencez par renseigner les informations générales du contrat, puis définissez le schéma attendu, les colonnes et, si nécessaire, les règles de qualité à appliquer.

Chaque étape correspond à une partie du contrat et vous accompagne dans la rédaction d'un fichier *YAML* conforme au standard.

Plusieurs paires de contrats et de jeux de données synthétiques sont intégrées à Clinical-Contract. Elles couvrent des échanges CSV et Parquet, des types simples ou avancés et plusieurs formes de règles qualité. Les fichiers d'une même paire portent le même nom afin de les identifier facilement dans l'éditeur.


## Renseigner les informations générales, l'objectif et l'usage

La première étape consiste à renseigner les informations générales du contrat. Ces informations permettent d'identifier le contrat, de préciser son contexte d'utilisation et de documenter l'étude à laquelle il est associé.

Commencez par donner un **nom** à votre contrat, définir sa **version** et indiquer son **statut** (*actif* ou *inactif*). Le statut permet notamment de distinguer un contrat en cours de rédaction d'un contrat prêt à être utilisé.

Vous pouvez ensuite compléter les sections **Purpose**, **Usage** et **Limitations**. Bien qu'elles soient facultatives, elles sont recommandées afin de documenter l'objectif du contrat, son contexte d'utilisation ainsi que ses éventuelles limites.

Enfin, renseignez les informations propres à l'étude : la **période d'inclusion** (*Start Date* et *End Date*), le **type d'étude** (*cohort*, *retrospective*, *prospective*, etc.), son **objectif** (*predictive*, *therapeutic*, *descriptive*, etc.) et, si nécessaire, le **domaine de santé** concerné.

## Définir la table attendue

Définissez ensuite la table décrite par le contrat. Son **nom** est indépendant de celui du contrat de données et représente le jeu de données attendu.

Privilégiez un nom court, explicite et en minuscules. Ce nom sera notamment utilisé dans les règles de qualité rédigées en *SQL*.

Vous pouvez également ajouter une **description** afin de documenter le contenu et le rôle de cette table.

## Définir les colonnes

Clinical-Contract vous guide dans la définition des colonnes attendues dans le jeu de données.

Pour chaque colonne, renseignez un **nom**, indiquez si elle est **obligatoire** (*Required*) ou facultative, puis sélectionnez son **type de données**. Il est possible de définir à la fois un **Logical Type** et un **Physical Type**, dont les différences sont détaillées dans la section suivante.

Enfin, ajoutez une **description** afin de documenter la signification de la colonne et les informations qu'elle contient.

## Comprendre les types

Une colonne peut définir un **Logical Type**, qui décrit la famille sémantique
de la donnée, et un **Physical Type**, qui précise sa représentation technique.
Le type physique est contrôlé en priorité ; s'il est absent, Clinical-Contract
utilise la famille logique. Lorsque aucun type n'est renseigné, seule la
présence de la colonne est vérifiée.

La liste complète des types, leurs correspondances DuckDB et les règles de
comparaison sont disponibles dans la
[référence du contrat](./docs.html?page=contract-reference&lang=fr).

## Ajouter des règles de qualité

Une règle qualité associe une requête SQL en lecture seule à une comparaison
attendue. La requête doit retourner une seule valeur numérique et peut utiliser
une ou plusieurs tables du contrat dans la même session DuckDB.

Les opérateurs disponibles, la syntaxe `expected`, les exemples SQL et la
compatibilité avec `mustBe` sont détaillés dans la
[référence du contrat](./docs.html?page=contract-reference&lang=fr).

### Sécurité des règles SQL

Clinical-Contract considère les contrats chargés comme des entrées non fiables. Une règle de qualité doit contenir une seule requête de lecture `SELECT`. Les commandes permettant de modifier des données, d'écrire un fichier, de charger une extension ou de changer la configuration DuckDB sont refusées.

Le fichier CSV ou Parquet sélectionné est d'abord chargé dans une table temporaire interne. Clinical-Contract désactive ensuite les accès externes au système de fichiers et au réseau avant d'exécuter les règles. Dans l'application web, le contrat et les données restent dans le navigateur et ne sont envoyés à aucun serveur.

Une requête de lecture peut néanmoins être volontairement très coûteuse. Il reste recommandé de relire les règles SQL provenant d'une organisation externe avant leur exécution automatisée sur une infrastructure partagée.


## Valider un contrat de données

Une fois le contrat entièrement rédigé, vous pouvez lancer sa validation afin de vérifier qu'il est complet et conforme.

Lors de cette étape, un panneau s'ouvre sur la droite de l'interface et présente l'ensemble des contrôles effectués. Il indique les éléments valides ainsi que les informations manquantes ou incorrectes à corriger.

Les champs concernés sont également mis en évidence dans l'éditeur grâce à un **contour rouge**, ce qui permet de les identifier rapidement et de compléter le contrat avant son utilisation.

## Charger un fichier de données

Lorsque un contract est chargé et validé, il peut être utilisé pour vérifier la conformité d'un jeu de données produit.

Ouvrez le panneau **Checker**, puis déposez un fichier par table dans la zone de **drag and drop** ou sélectionnez-les depuis votre ordinateur. **Le nom du fichier, sans son extension, doit correspondre au nom du schéma associé.**

Clinical-Contract accepte actuellement les fichiers aux formats **CSV** et **Parquet** uniquement. 

## Vérifier la conformité des données avec le contrat

Une fois les fichiers chargés, cliquez sur **Run Check** pour lancer la vérification.

Clinical-Contract compare d'abord le **schéma** du fichier de données avec celui défini dans le contrat. Les colonnes attendues sont vérifiées, ainsi que leurs types de données. Toute différence (colonne manquante ou type incompatible) est signalée dans le rapport de validation.

Si les schémas sont conformes, les **règles de qualité** définies dans le contrat sont ensuite exécutées dans une session **DuckDB** partagée. Une règle peut ainsi joindre plusieurs tables avant de comparer son résultat à la valeur attendue (*Expected Result*).

À l'issue de l'exécution, le panneau de résultats présente le statut de chaque vérification afin d'identifier rapidement les éventuelles non-conformités.

## Utiliser Clinical-Contract en ligne de commande

Le CLI permet d'appliquer les mêmes validations depuis un terminal, un script
ou une étape de CI. Python 3.11 ou une version plus récente est nécessaire.

```bash
uv tool install --python python3.11 clinical-contract
clinical-contract validate contract.yaml
clinical-contract check contract.yaml patients.csv diagnoses.parquet
```

Les options du CLI, l'utilisation de plusieurs sources et l'intégration dans
une application sont présentées dans la
[documentation de l'API Python](./docs.html?page=python-api&lang=fr).

## Aller plus loin

Deux guides complètent cette introduction :

- la [documentation de l'API Python](./docs.html?page=python-api&lang=fr)
  détaille l'installation, les rapports, le multi-table et l'intégration dans
  une application ;
- la [référence du contrat YAML](./docs.html?page=contract-reference&lang=fr)
  présente chaque bloc, les types et tous les opérateurs qualité pris en charge.


## Limites actuelles

Clinical-Contract est en développement actif. La version actuelle présente les limitations suivantes :

- Un contrat peut décrire plusieurs tables ; chaque table correspond exactement à un fichier CSV ou Parquet.
- Seuls les fichiers **CSV** et **Parquet** sont pris en charge pour la validation.
- Les règles de qualité doivent être exprimées sous forme de requêtes **SQL**.
- Les types logiques et physiques disponibles sont limités à ceux proposés par l'application.


## À propos

Clinical-Contract est un projet open source développé par le **Centre de Données Cliniques (CDC) du CHU de Brest** pour faciliter la rédaction, la validation et le partage de contrats de données dans le domaine de la santé, tout en favorisant la standardisation et l'interopérabilité des échanges de données.

L'application s'appuie sur le **Open Data Contract Standard (ODCS) 3.1.0** afin de garantir des contrats interopérables et facilement réutilisables.

Le code source, la documentation et les exemples d'utilisation sont disponibles sur le dépôt GitHub du projet.

Les suggestions d'amélioration, les recommandations et les signalements de problèmes sont les bienvenus. N'hésitez pas à ouvrir une *issue* sur le dépôt GitHub du projet :
https://github.com/artheioupfat/clinical-contract/issues/new
