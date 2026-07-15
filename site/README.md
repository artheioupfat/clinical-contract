# clinical-contract site

Static product site and browser playground for `clinical-contract`, designed for GitHub Pages.

The landing page explains the product and links to the browser editor. The editor lets users build or edit a data contract, validate the YAML, load a CSV or Parquet file, preview the dataset, and run contract checks directly in the browser through PyScript/Pyodide.

## Local workflow

```bash
npm install
npm run test:site
npm run build:site:css
python -m http.server 8000 -d site
```

Then open `http://localhost:8000`.

## File map

- `index.html`: lightweight landing page. It must not load PyScript.
- `editor.html`: interactive editor shell. It loads HTML partials before Alpine starts.
- `docs.html`: documentation page rendered from Markdown.
- `partials/header.html`: brand header and theme switch.
- `partials/editor-panel.html`: YAML editor and visual contract builder.
- `partials/split-resizer.html`: draggable divider between editor and checker.
- `partials/data-panel.html`: data upload, results tabs, and dataset preview.
- `partials/runtime-footer.html`: runtime progress bar and compact footer.
- `css/tailwind.input.css`: small Tailwind manifest listing CSS partials.
- `css/src/base.css`: design tokens and base document rules.
- `css/src/components/`: organized component styles grouped by feature.
- `css/build-input.mjs`: expands the manifest into a temporary Tailwind input.
- `css/tailwind.css`: compiled CSS used by the browser and GitHub Pages.
- `js/landing.js`: Alpine state for the landing page theme and version badge.
- `js/docs.js`: Markdown documentation loader.
- `js/app.js`: editor Alpine root state and application composition.
- `js/include-html.js`: loads static partials, then starts Alpine.
- `js/constants.js`: shared UI/type constants.
- `js/ui.js`: theme switch, split pane, and logo status helpers.
- `js/runtime.js`: PyScript readiness, progress, and runtime errors.
- `js/editor.js`: YAML text editor, import, export, and keyboard behavior.
- `js/contract-codec.js`: pure YAML/draft conversion helpers.
- `js/schema.js`: visual contract builder actions.
- `js/data.js`: CSV/Parquet loading and dataset preview actions.
- `js/results.js`: validate/check result presentation.
- `python/bridge.py`: Python bridge executed by PyScript.
- `tests/`: lightweight Node tests for browser-safe logic.

## Script loading order

`editor.html` intentionally loads scripts in this order:

1. `constants.js`
2. `ui.js`
3. `runtime.js`
4. `editor.js`
5. `contract-codec.js`
6. `schema.js`
7. `data.js`
8. `results.js`
9. `app.js`
10. `include-html.js`

Keep `contract-codec.js` before `schema.js`, because the schema builder uses the codec to convert between YAML and the visual draft.
Keep `include-html.js` last: it injects the partials and only then loads Alpine, so Alpine can initialize the final DOM once.

## Editing rules

- Put YAML serialization and parsing behavior in `js/contract-codec.js`.
- Keep Alpine UI actions in the feature modules under `js/`.
- Keep `index.html` lightweight. PyScript, DuckDB, and the Python bridge belong only in `editor.html`.
- Edit editor markup in `partials/`; keep `editor.html` as the lightweight shell.
- Edit CSS in `css/src/`. Add new partials to `css/tailwind.input.css`, then run `npm run build:site:css`.
- Do not edit `css/tailwind.css` directly; it is the compiled production bundle.
- Add or update `site/tests/contract-codec.test.js` when changing YAML/draft behavior.
- Keep the site static: no backend, no hardcoded local paths, and relative assets only.
- Serve the site through HTTP during development. Partial loading does not work reliably from `file://`.

## Manual smoke checklist

Before deploying, verify:

- Start from the empty contract screen.
- Add a schema, column, quality rule, and team member.
- Switch between Schema and YAML without losing data.
- Load the template contract and bundled Parquet file.
- Validate the contract.
- Load a CSV or Parquet file.
- Open Preview and paginate rows.
- Run checks.
- Toggle dark mode.
- Reset the contract and cancel once before confirming.

## Deployment

GitHub Pages deploys a deterministic `site_dist/` artifact. The workflow copies the static site, copies the Python package instead of relying on symlinks, runs site tests, builds CSS, checks for symlinks, and deploys the artifact.
