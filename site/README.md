# clinical-contract site

Static product site and browser playground for `clinical-contract`, designed for GitHub Pages.

The landing page explains the product and links to the browser editor. The editor lets users build or edit a data contract, validate the YAML, load a CSV or Parquet file, preview the dataset, and run contract checks directly in the browser through PyScript/Pyodide.

## Local workflow

```bash
npm install
npm run generate:site-examples
npm run test:site
npm run build:site:css
python -m http.server 8000 -d site
```

Then open `http://localhost:8000`.

## File map

- `index.html`: lightweight landing page. It must not load PyScript.
- `editor.html`: interactive editor shell. It loads HTML partials before Alpine starts.
- `docs.html`: localized documentation page rendered from Markdown.
- `docs/documentation.en.md`: English documentation source.
- `docs/documentation.fr.md`: French documentation source.
- `partials/header.html`: brand header and theme switch.
- `partials/editor-panel.html`: contract input, YAML/schema editor, and validation results.
- `partials/split-resizer.html`: draggable divider between editor and checker.
- `partials/data-panel.html`: independent data input, preview, schema, and quality results.
- `partials/runtime-footer.html`: runtime progress bar and compact footer.
- `css/tailwind.input.css`: small Tailwind manifest listing CSS partials.
- `css/src/base.css`: design tokens and base document rules.
- `css/src/components/`: organized component styles grouped by feature.
- `css/build-input.mjs`: expands the manifest into a temporary Tailwind input.
- `css/tailwind.css`: compiled CSS used by the browser and GitHub Pages.
- `js/landing.js`: Alpine state for the landing page theme and version badge.
- `js/docs.js`: Markdown documentation loader.
- `js/i18n.js`: locale resolution, catalog loading, persistence, and translation lookup.
- `js/app.js`: editor Alpine root state and application composition.
- `js/include-html.js`: loads static partials, then starts Alpine.
- `js/constants.js`: shared UI constants and runtime messages.
- `js/page-shell.js`: shared version label and persistent light/dark theme behavior.
- `js/example-catalog.js`: generated contract/data example catalog.
- `js/ui.js`: theme switch, split pane, and logo status helpers.
- `js/runtime.js`: PyScript readiness, progress, and runtime errors.
- `js/editor.js`: YAML text editor, import, export, and keyboard behavior.
- `js/contract-codec.js`: pure YAML/draft conversion helpers.
- `js/schema.js`: visual contract builder actions.
- `js/data-storage.js`: IndexedDB persistence for the current browser data session.
- `js/data.js`: CSV/Parquet loading, sample datasets, and paginated preview actions.
- `js/results.js`: validate/check result presentation.
- `locales/en.json`: English interface catalog.
- `locales/fr.json`: French interface catalog.
- `python/bridge.py`: Python bridge executed by PyScript.
- `tests/`: lightweight Node tests for browser-safe logic.

## Script loading order

`editor.html` intentionally loads scripts in this order:

1. `constants.js`
2. `i18n.js`
3. `page-shell.js`
4. `example-catalog.js`
5. `ui.js`
6. `runtime.js`
7. `editor.js`
8. `contract-codec.js`
9. `type-catalog.js`
10. `site-version.js`
11. `schema.js`
12. `data-storage.js`
13. `data.js`
14. `results.js`
15. `app.js`
16. `include-html.js`

Keep `contract-codec.js` before `schema.js`, because the schema builder uses the codec to convert between YAML and the visual draft.
Keep `include-html.js` last: it injects the partials and only then loads Alpine, so Alpine can initialize the final DOM once.

## Editing rules

- Put YAML serialization and parsing behavior in `js/contract-codec.js`.
- Keep Alpine UI actions in the feature modules under `js/`.
- Add user-facing interface text to both locale catalogs and keep their key sets identical.
- Edit documentation in both localized Markdown files; do not add hardcoded prose to `docs.html`.
- Keep `index.html` lightweight. PyScript, DuckDB, and the Python bridge belong only in `editor.html`.
- Edit editor markup in `partials/`; keep `editor.html` as the lightweight shell.
- Edit CSS in `css/src/`. Add new partials to `css/tailwind.input.css`, then run `npm run build:site:css`.
- Add YAML, CSV, or Parquet examples under `examples/`, then run `npm run generate:site-examples` and commit the generated catalog.
- Do not edit `css/tailwind.css` directly; it is the compiled production bundle.
- Add or update `site/tests/contract-codec.test.js` when changing YAML/draft behavior.
- Keep the site static: no backend, no hardcoded local paths, and relative assets only.
- Serve the site through HTTP during development. Partial loading does not work reliably from `file://`.

## Manual smoke checklist

Before deploying, verify:

- Confirm the editor opens with independent empty contract and dataset panels.
- Add a schema, column, quality rule, and team member.
- Switch between Schema and YAML without losing data.
- Load the contract template and sample dataset independently.
- Validate the contract and confirm the left Validation view opens.
- Load a CSV or Parquet file.
- Open Data and paginate rows before loading a contract.
- Run checks and confirm Schema or Quality opens according to the result.
- Toggle dark mode.
- Reset the contract and confirm the loaded data file remains available.
- Delete the data file and confirm the contract remains available.

## Deployment

GitHub Pages deploys a deterministic `site_dist/` artifact. The workflow copies the static site, copies the Python package instead of relying on symlinks, runs site tests, builds CSS, checks for symlinks, and deploys the artifact.
