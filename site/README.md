# clinical-contract site

Static product site and browser playground for `clinical-contract`, designed for GitHub Pages. No application backend receives contracts or datasets: PyScript, Pyodide, and DuckDB execute the Python package locally in the browser.

The landing page explains the product and links to the browser editor. The editor lets users build or edit a data contract, validate the YAML, load a CSV or Parquet file, preview the dataset, and run contract checks directly in the browser through PyScript/Pyodide.

## Local workflow

```bash
uv sync --extra dev
npm ci
npm run generate:site-examples
npm run generate:site-types
npm run generate:site-version
uv run pytest -q
npm run test:site
npm run build:site:css
python3 -m http.server 8000 --directory site
```

Then open `http://localhost:8000`.

## File map

- `index.html`: lightweight landing page. It must not load PyScript.
- `editor.html`: interactive editor shell. It loads HTML partials before Alpine starts.
- `docs.html`: localized documentation shell with an allowlisted page router.
- `docs/documentation.*.md`: project introduction and editor workflow.
- `docs/python-api.*.md`: Python library and integration reference.
- `docs/contract-reference.*.md`: block-by-block YAML contract reference.
- `app.js`: Alpine root state and composition of the editor feature modules.
- `partials/header.html`: brand header and theme switch.
- `partials/editor-panel.html`: lightweight contract-panel shell.
- `partials/editor-*.html`: contract empty state, YAML view, builder shell, validation results, and dialogs.
- `partials/schema-*.html`: independent Fundamentals, Schema, Quality, and Team builder steps.
- `partials/split-resizer.html`: draggable divider between editor and checker.
- `partials/data-panel.html`: independent data input, preview, schema, and quality results.
- `partials/runtime-footer.html`: runtime progress bar and compact footer.
- `css/tailwind.input.css`: small Tailwind manifest listing CSS partials.
- `css/src/base.css`: design tokens and base document rules.
- `css/src/components/`: organized component styles grouped by feature.
- `css/build-input.mjs`: expands the manifest into a temporary Tailwind input.
- `css/tailwind.css`: compiled CSS used by the browser and GitHub Pages.
- `js/landing.js`: Alpine state for landing-page locale, theme, metadata, and version.
- `js/docs-routing.js`: closed documentation page registry and safe URL routing.
- `js/docs.js`: localized Markdown loader, guide navigation, and table-of-contents state.
- `js/i18n.js`: locale resolution, catalog loading, persistence, and translation lookup.
- `js/include-html.js`: loads static partials, then starts Alpine.
- `js/constants.js`: shared UI constants and runtime messages.
- `js/page-shell.js`: shared metadata, locale methods, version label, and persistent theme behavior.
- `js/example-catalog.js`: generated contract/data example catalog.
- `js/type-catalog.js`: generated browser copy of the Python type catalog.
- `js/site-version.js`: generated browser copy of `project.version`.
- `js/ui.js`: split pane, checker collapse, result-view, and logo status helpers.
- `js/runtime.js`: PyScript readiness, progress, and runtime errors.
- `js/editor.js`: YAML text editor, import, export, and keyboard behavior.
- `js/contract-codec.js`: pure YAML/draft conversion helpers.
- `js/schema.js`: visual contract builder actions.
- `js/data-storage.js`: IndexedDB persistence for the current browser data session.
- `js/data.js`: multi-file CSV/Parquet loading, active dataset selection, samples, and paginated preview actions.
- `js/results.js`: validate/check result presentation.
- `locales/en.json`: English interface catalog.
- `locales/fr.json`: French interface catalog.
- `examples/`: matching YAML and CSV/Parquet examples bundled with the editor.
- `pyscript.toml`: pinned Pyodide interpreter, Python dependencies, and package files.
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

The PyScript bridge is declared separately before these application scripts. Runtime readiness is asynchronous and is communicated through the `clinical-python-ready` browser event.

## Generated assets

These files are committed but must not be edited manually:

- `js/example-catalog.js`, generated from every supported file under `examples/`;
- `js/type-catalog.js`, generated from `src/clinical_contract/type_catalog.py`;
- `js/site-version.js` and the README PyPI badge cache key, generated from
  `project.version` in `pyproject.toml`;
- `css/tailwind.css`, compiled from the CSS source manifest and partials.

Their commands are:

```bash
npm run generate:site-examples
npm run generate:site-types
npm run generate:site-version
npm run build:site:css
```

GitHub Actions regenerates these assets and fails when the committed output is stale.

## Bundled examples

Each YAML contract has one homonymous dataset per declared schema. Contract and
data templates remain independent and are loaded separately in the editor.

| Pair | Format | Main coverage |
|---|---|---|
| `clinical-template` | Parquet | Common scalar types and equality checks |
| `laboratory-results` | Parquet | UUID, DECIMAL, TIME, INTERVAL, and timezone-aware timestamps |
| `medication-administration` | Parquet | ARRAY, float32, optional unconstrained text, and comparison operators |
| `covid-diagnosis-cohort` | 2 CSV files | Patient/COVID joins, CIM-10 codes, conditional dates, and ICU consistency |

The datasets are synthetic fixtures prepared outside the public source tree. Only the final YAML, CSV, and Parquet files are committed. `tests/test_site_examples.py` verifies pairing and executes structure, schema, and quality checks for every example.

## Editing rules

- Put YAML serialization and parsing behavior in `js/contract-codec.js`.
- Keep Alpine UI actions in the feature modules under `js/`.
- Add user-facing interface text to both locale catalogs and keep their key sets identical.
- Edit every documentation page in both locales; register new pages in `js/docs-routing.js` and never load a Markdown path directly from the URL.
- Keep `index.html` lightweight. PyScript, DuckDB, and the Python bridge belong only in `editor.html`.
- Edit editor markup in `partials/`; keep `editor.html` as the lightweight shell.
- Edit CSS in `css/src/`. Add new partials to `css/tailwind.input.css`, then run `npm run build:site:css`.
- Add contracts under `examples/` and name each dataset after its YAML schema, then run `npm run generate:site-examples` and commit the generated catalog.
- Do not edit `css/tailwind.css` directly; it is the compiled production bundle.
- Add or update the test matching the changed module. YAML/draft behavior belongs in `contract-codec.test.js`.
- Keep the site static: no backend, no hardcoded local paths, and relative assets only.
- Serve the site through HTTP during development. Partial loading does not work reliably from `file://`.

## Manual smoke checklist

Before deploying, verify:

- Confirm the editor opens with independent empty contract and dataset panels.
- Add a schema, column, quality rule, and team member.
- Switch between Schema and YAML without losing data.
- Load every bundled contract and its homonymous dataset independently.
- Validate the contract and confirm the left Validation view opens.
- Load a CSV or Parquet file.
- Open Data and paginate rows before loading a contract.
- Run checks and confirm Schema or Quality opens according to the result.
- Toggle dark mode.
- Reset the contract and confirm the loaded data file remains available.
- Delete the data file and confirm the contract remains available.

## Deployment

GitHub Pages deploys only from `main` or through a manual workflow dispatch. The workflow:

1. installs Python and Node dependencies;
2. runs Ruff and the complete Python suite;
3. regenerates and verifies the example, type, and version catalogs;
4. runs the JavaScript suite and builds the production CSS;
5. copies `site/` into a deterministic `site_dist/` artifact;
6. copies the complete Python package into the artifact instead of relying on a symlink;
7. rejects any remaining symlink;
8. uploads and deploys the artifact with GitHub Pages Actions.
