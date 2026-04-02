# clinical-contract UI

Site web statique pour éditer des data contracts YAML et valider des fichiers Parquet.

## Stack

- **HTML** + **Tailwind CSS** (CDN) avec composants HyperUI
- **Alpine.js 3** (CDN) pour l'interactivité
- **CodeMirror 6** (CDN esm.sh) pour l'éditeur YAML
- **PyScript** (CDN) pour exécuter Python dans le navigateur
- **staticjinja** pour le build des templates

## Commandes

```bash
# Setup
cd ui && uv sync

# Build once
uv run python build.py

# Build + watch + live server sur :8000
uv run python build.py --serve
```

## Structure

- `templates/` — Templates Jinja2 (fichiers `_` = partials, non rendus)
- `templates/_partials/` — Composants réutilisables
- `static/js/app.js` — État Alpine.js (appState)
- `static/py/contract_bridge.py` — Fonctions PyScript (validate, check)
- `_output/` — Sortie générée (gitignored)
- `build.py` — Script de build staticjinja

## Conventions

- Pas de fichier CSS custom — tout en Tailwind utility classes
- Minimiser le JavaScript — utiliser Alpine.js directives
- Labels UI en français
- Style HyperUI (sobre, professionnel, minimaliste)
