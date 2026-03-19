# site (MVP)

Minimal static web demo for `clinical-contract` with:
- left panel: YAML editor + YAML file loader + validate + CLI-like output
- right panel: parquet drag-and-drop + check button
- runtime: PyScript + Pyodide in browser
- execution path: real library CLI functions (`clinical_contract.cli.cmd_validate`, `cmd_check`)

## Run locally

From repository root:

```bash
uv run python -m http.server 8000
```

Open:
- <http://localhost:8000/site/index.html>

## Notes

- The page uses PyScript package config to install:
  - `clinical-contract==0.1.3`
  - `duckdb`
- `pyarrow` is intentionally not installed in-browser (no compatible pure-Python wheel on Pyodide).
- Schema reading now relies on the library fallback (`duckdb`) when running from a parquet file path.
