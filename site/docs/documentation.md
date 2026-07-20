# Guide d'utilisation

Clinical-Contract est un outil permettant de définir, partager et vérifier des contrats de données.

Un contrat de données décrit de manière explicite la structure attendue d'un fichier, les informations qu'il doit contenir ainsi que les règles de qualité qu'il doit respecter. Il constitue une référence commune entre les personnes qui produisent les données et celles qui les exploitent.

Clinical-Contract accompagne l'ensemble de ce processus : de la rédaction du contrat jusqu'à la validation des données, dans le navigateur, en ligne de commande ou depuis Python.

## Qu'est-ce qu'un contrat de données ?

Un contrat de données est un fichier, généralement au format *YAML*, qui spécifie les attentes d'un demandeur concernant un jeu de données.

Rédigé de préférence au début d'un projet, il décrit de manière explicite la structure attendue des données, les colonnes, leurs types ainsi que les règles de qualité à respecter. Il constitue une référence commune entre le producteur et le consommateur des données et permet de vérifier automatiquement qu'un fichier est conforme aux attentes définies.

Clinical-Contract s'appuie sur le **Open Data Contract Standard (ODCS) 3.1.0**, un standard ouvert de description des contrats de données. Les contrats créés avec Clinical-Contract suivent cette spécification afin de garantir leur interopérabilité avec les outils compatibles.

## Créer un contrat

Clinical-Contract vous guide dans la rédaction d'un contrat de données étape par étape. Vous commencez par renseigner les informations générales du contrat, puis définissez le schéma attendu, les colonnes et, si nécessaire, les règles de qualité à appliquer.

Chaque étape correspond à une partie du contrat et vous accompagne dans la rédaction d'un fichier *YAML* conforme au standard.

Un modèle de contrat est également intégré à Clinical-Contract. Il permet de découvrir un contrat entièrement rédigé et de comprendre rapidement comment les différentes sections s'articulent.


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

Chaque colonne est décrite par deux types complémentaires : un **Logical Type** et un **Physical Type**.

Le **Logical Type** décrit la nature de l'information. Il répond à la question : *"Quel type de donnée représente cette colonne ?"*

Les types logiques disponibles sont :

| Logical Type | Description |
| :----------- | :---------- |
| `string` | Texte ou chaîne de caractères |
| `integer` | Nombre entier |
| `float` | Nombre décimal |
| `boolean` | Valeur booléenne (`true` ou `false`) |
| `date` | Date ou date et heure |

Le **Physical Type** décrit quant à lui la manière dont cette donnée est stockée ou représentée dans le système source.

Chaque type logique propose un ensemble de types physiques compatibles :

| Logical Type | Physical Types disponibles |
| :----------- | :------------------------- |
| `string` | `varchar`, `text`, `string`, `char`, `uuid` |
| `integer` | `int8`, `int16`, `int32`, `int64`, `uint8`, `uint16`, `uint32`, `uint64` |
| `float` | `float32`, `float64` |
| `boolean` | `boolean`, `binary` |
| `date` | `datetime`, `timestamp`, `timestamp with timezone` |

Dans la plupart des cas, commencez par choisir le **Logical Type**, puis sélectionnez le **Physical Type** le plus adapté au système produisant les données.

Le **Logical Type** et le **Physical Type** peuvent également être définis sur **Not specified**. Cette option permet de ne pas imposer de type logique à une colonne ou de ne pas préciser sa représentation technique lorsqu'elle n'est pas nécessaire.

## Ajouter des règles de qualité

Clinical-Contract permet d'ajouter des règles de qualité afin de vérifier automatiquement la conformité des données.

Chaque règle est composée d'une **requête SQL**, d'un **Expected Result** et, de manière facultative, d'une **description** permettant de documenter le contrôle effectué.

La requête SQL est exécutée sur le jeu de données à valider. Le résultat obtenu est ensuite comparé à la valeur renseignée dans **Expected Result**. Si les deux valeurs sont identiques, la règle est considérée comme valide.

Dans les requêtes SQL, utilisez le nom de la table défini précédemment dans le contrat.

### Exemples

Vérifier qu'aucune valeur n'est manquante dans la colonne `STAY` (séjour) :

```sql
SELECT COUNT(*)
FROM export
WHERE STAY IS NULL;
```

**Expected Result :** `0`
<br>
<br>

---

Vérifier que le fichier contient exactement 1 000 lignes :

```sql
SELECT COUNT(*)
FROM export;
```

**Expected Result :** `1000`
<br>
<br>

---

Vérifier que tous les identifiants sont uniques :

```sql
SELECT COUNT(*) - COUNT(DISTINCT PATIENT_ID)
FROM export;
```

**Expected Result :** `0`
<br>


## Valider un contrat de données

Une fois le contrat entièrement rédigé, vous pouvez lancer sa validation afin de vérifier qu'il est complet et conforme.

Lors de cette étape, un panneau s'ouvre sur la droite de l'interface et présente l'ensemble des contrôles effectués. Il indique les éléments valides ainsi que les informations manquantes ou incorrectes à corriger.

Les champs concernés sont également mis en évidence dans l'éditeur grâce à un **contour rouge**, ce qui permet de les identifier rapidement et de compléter le contrat avant son utilisation.

## Charger un fichier de données

Lorsque un contract est chargé et validé, il peut être utilisé pour vérifier la conformité d'un jeu de données produit.

Ouvrez le panneau **Checker**, puis déposez votre fichier dans la zone de **glisser-déposer** (*drag and drop*) ou sélectionnez-le depuis votre ordinateur.

Clinical-Contract accepte actuellement les fichiers aux formats **CSV** et **Parquet** uniquement. 

## Vérifier la conformité des données avec le contrat

Une fois le fichier chargé, cliquez sur **Run Check** pour lancer la vérification.

Clinical-Contract compare d'abord le **schéma** du fichier de données avec celui défini dans le contrat. Les colonnes attendues sont vérifiées, ainsi que leurs types de données. Toute différence (colonne manquante ou type incompatible) est signalée dans le rapport de validation.

Si le schéma est conforme, les **règles de qualité** définies dans le contrat sont ensuite exécutées. Ces contrôles sont réalisés à l'aide du moteur **DuckDB**, qui exécute les requêtes SQL et compare leur résultat à la valeur attendue (*Expected Result*).

À l'issue de l'exécution, le panneau de résultats présente le statut de chaque vérification afin d'identifier rapidement les éventuelles non-conformités.

## Utiliser Clinical-Contract en ligne de commande

Clinical-Contract peut également être utilisé directement depuis un terminal pour valider un contrat de données ou vérifier la conformité d'un fichier.

### Installer Clinical-Contract

L'outil s'installe avec `uv` :

```bash
uv tool install --python python3.11 clinical-contract
```

### Valider un contrat

La commande `validate` vérifie qu'un contrat est correctement rédigé et que tous les champs obligatoires sont présents.

```bash
clinical-contract validate site/examples/contract.yaml
```

### Vérifier un fichier de données

La commande `check` compare un fichier de données avec un contrat de données. Elle vérifie d'abord le schéma (colonnes et types), puis exécute les règles de qualité définies dans le contrat.

```bash
clinical-contract check site/examples/contract.yaml site/examples/template.parquet
```

## Limites actuelles

Clinical-Contract est en développement actif. La version actuelle présente les limitations suivantes :

- Un contrat de données décrit **une seule table**.
- Seuls les fichiers **CSV** et **Parquet** sont pris en charge pour la validation.
- Les règles de qualité doivent être exprimées sous forme de requêtes **SQL**.
- Les types logiques et physiques disponibles sont limités à ceux proposés par l'application.

## À propos

Clinical-Contract est un projet open source développé pour faciliter la rédaction, la validation et le partage de contrats de données dans le domaine de la santé.

L'application s'appuie sur le **Open Data Contract Standard (ODCS) 3.1.0** afin de garantir des contrats interopérables et facilement réutilisables.

Le code source, la documentation et les exemples d'utilisation sont disponibles sur le dépôt GitHub du projet.

Les suggestions d'amélioration, les recommandations et les signalements de problèmes sont les bienvenus. N'hésitez pas à ouvrir une *issue* sur le dépôt GitHub du projet : [https://github.com/artheioupfat/clinical-contract/issues/new](https://github.com/artheioupfat/clinical-contract/issues/new?utm_source=chatgpt.com).
