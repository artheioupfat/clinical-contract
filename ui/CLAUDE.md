# clinical-contract UI

Site web statique pour éditer des data contracts YAML et valider des fichiers Parquet.

## Stack

- **HTML** + **Tailwind CSS** (CDN) avec composants HyperUI
- **Alpine.js 3** (CDN) pour l'interactivité
- **CodeMirror 5** (CDN) pour l'éditeur YAML (thème material-darker en dark mode)
- **PyScript 2024.11** (CDN) pour exécuter Python dans le navigateur
- **staticjinja** + **livereload** pour le build et le dev server
- **Fonts** : DM Sans (UI) + JetBrains Mono (code)

## Commandes

```bash
cd ui && uv sync        # Setup
make build               # Build one-shot
make serve               # Build + watch + live reload sur :8000
```

## Structure

- `templates/_base.html` — Layout principal (CDN links, dark mode, PyScript)
- `templates/index.html` — Page principale (splitter + deux panneaux)
- `templates/_partials/` — Composants (fichiers `_` = partials, non rendus)
  - `_header.html` — Logo, GitHub, toggle dark/light
  - `_editor_toolbar.html` — Boutons Tester/Importer/Exporter
  - `_editor_panel.html` — Toolbar + CodeMirror
  - `_checker_toolbar.html` — Boutons Charger/Tester
  - `_checker_panel.html` — Drop zone + tableau résultats
  - `_results_table.html` — Tableau qualité (HyperUI striped table)
  - `_statusbar.html` — Barre unique : editor info | PyScript | parquet info
- `static/js/app.js` — Alpine.js appState (CodeMirror init, actions, état)
- `static/py/contract_bridge.py` — Fonctions PyScript placeholder (validate, check)
- `_output/` — Sortie générée (gitignored)

## Conventions

- Composants HyperUI (tables, file-uploaders, button-groups)
- Pas de fichier CSS custom sauf overrides CodeMirror dans `_base.html`
- Minimiser le JavaScript — utiliser Alpine.js directives
- Labels UI en français
- Couleurs : palette surface (slate) + accent (teal)
