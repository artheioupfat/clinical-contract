# Contributing to Clinical-Contract

Thank you for helping improve Clinical-Contract. Contributions may target the
Python package, CLI, static web editor, documentation, tests, or bundled
synthetic examples.

Before contributing, read the [security policy](SECURITY.md). Never use real
patient data, production healthcare data, credentials, confidential contracts,
or identifying metadata in an issue, test, example, screenshot, or pull
request.

## Requirements

Local development requires:

- Python 3.11 or newer;
- [uv](https://docs.astral.sh/uv/);
- Node.js 20;
- npm.

## Development Setup

Fork or clone the repository, then create a branch from the latest `main`:

```bash
git clone https://github.com/artheioupfat/clinical-contract.git
cd clinical-contract
git switch main
git pull --ff-only
git switch -c fix/short-description
```

Install the Python project and development dependencies:

```bash
uv sync --extra dev
```

Install the web development dependencies:

```bash
npm ci
```

## Project Boundaries

Keep changes in the layer that owns the behavior:

- `src/clinical_contract/` is the source of truth for validation, schema
  matching, quality execution, security controls, and public Python models;
- `site/python/bridge.py` adapts the Python package for PyScript but must not
  redefine business rules;
- `site/js/contract-codec.js` converts between YAML and the visual editor draft;
- other files under `site/js/` manage browser state and interactions;
- `site/partials/` contains editor markup;
- `site/css/src/` contains editable styles;
- `site/docs/` contains the localized public documentation.

Do not duplicate Python type rules or quality semantics in handwritten
JavaScript. The browser type catalog is generated from
`src/clinical_contract/type_catalog.py`.

If a new Python module is required by the browser runtime, add it to
`site/pyscript.toml` and update the corresponding PyScript configuration test.

## Coding Guidelines

### Python

- Keep public API behavior backward compatible unless a breaking change has
  been explicitly approved.
- Keep source code, CLI output, exceptions, comments, and docstrings in English.
- Add type annotations to public interfaces.
- Keep DuckDB quality SQL read-only and preserve the controls documented in
  `SECURITY.md`.
- Add or update tests for every behavioral change and bug fix.

Run:

```bash
uv run ruff check .
uv run pytest -v
```

For local coverage:

```bash
uv run pytest --cov=clinical_contract --cov-report=term-missing --cov-fail-under=85
```

### Web Application

- Keep the landing page and documentation pages lightweight; only
  `editor.html` may load PyScript and DuckDB.
- Keep the site static and GitHub Pages compatible. Do not add an application
  backend, absolute local paths, or data-upload services.
- Add user-facing interface text to both `site/locales/en.json` and
  `site/locales/fr.json`.
- Edit documentation in both language variants.
- Put reusable visual styles in `site/css/src/`, not directly in generated CSS.
- Preserve keyboard navigation, labels, focus states, and sufficient contrast.
- Add or update the Node test that owns the changed behavior.

Run:

```bash
npm run test:site
npm run build:site:css
```

Serve the site through HTTP for manual verification:

```bash
python3 -m http.server 8000 --directory site
```

Then open `http://127.0.0.1:8000` and test both light and dark themes, both
languages, and the affected contract/data workflow.

## Generated Files

The following files are committed for GitHub Pages but must not be edited by
hand:

| Generated file | Source | Command |
|---|---|---|
| `site/js/example-catalog.js` | `site/examples/` | `npm run generate:site-examples` |
| `site/js/type-catalog.js` | `src/clinical_contract/type_catalog.py` | `npm run generate:site-types` |
| `site/css/tailwind.css` | `site/css/tailwind.input.css` and `site/css/src/` | `npm run build:site:css` |
| `site/js/site-version.js` and the README PyPI badge key | `pyproject.toml` version | Maintainer release process only |

Commit the regenerated output with the source change. CI regenerates these
files and rejects stale output.

## Tests and Examples

Tests must be deterministic, isolated, and fast enough for CI. Use temporary
directories for generated files and avoid network access in unit tests.

Every committed healthcare example must be entirely synthetic. A bundled
contract may describe several tables, but each table must have one matching CSV
or Parquet file whose filename stem equals the schema name. After changing
examples, run:

```bash
npm run generate:site-examples
uv run pytest tests/test_site_examples.py -v
```

Do not commit large generated datasets or generation utilities created only for
local experimentation.

## Reporting Bugs and Proposing Changes

Before opening an issue:

1. search existing issues;
2. reproduce the problem with the latest release;
3. prepare the smallest possible example using synthetic data.

A useful bug report includes:

- Clinical-Contract version;
- Python version and operating system;
- whether the issue affects the API, CLI, or web editor;
- the exact command or user action;
- expected and actual behavior;
- a minimal sanitized contract and synthetic dataset when required.

Use private vulnerability reporting instead of a public issue for anything
security-sensitive.

For a large feature or public API change, open an issue before implementation
so the scope and compatibility impact can be discussed first.

## Commit Messages

Use a concise imperative message with an optional scope:

```text
feat(core): support a new contract capability
fix(site): preserve the selected table
test(core): cover invalid SQL input
docs: clarify multi-source checks
refactor(site): simplify preview state
chore: update development tooling
```

Keep commits focused. Do not mix unrelated cleanup, generated files, and
behavioral changes unless they are part of the same change.

## Pull Requests

Open pull requests against `main`. A pull request should:

- explain the problem and the chosen solution;
- reference the related issue when one exists;
- describe behavior or compatibility changes;
- list the tests that were run;
- include screenshots for visible UI changes;
- update public documentation when behavior changes;
- contain no real health data, secrets, local paths, or unrelated files;
- pass all required GitHub Actions checks.

Before requesting review, run the relevant commands and preferably the complete
local verification:

```bash
uv run ruff check .
uv run pytest -v
npm run test:site
npm run build:site:css
git diff --check
```

## Releases Are Maintainer-Only

Releases are created only by the project maintainer.

Unless explicitly requested by the maintainer, contributors must not:

- change the project version in `pyproject.toml` or `uv.lock`;
- regenerate version-specific site files or README badge keys;
- create or push release tags;
- publish distributions to PyPI;
- modify the trusted publishing workflow or release environment.

Version selection, release commits, tags, package publication, and release notes
remain the maintainer's responsibility. A contribution should describe whether
it may require a future release, but it should not prepare that release by
default.

## License

By contributing, you agree that your contribution will be licensed under the
project's [MIT License](LICENSE).
