#!/usr/bin/env python3
"""Generate the static website type catalog from the Python package."""
from __future__ import annotations

import json
import importlib.util
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
TYPE_CATALOG_SOURCE = REPO_ROOT / "src" / "clinical_contract" / "type_catalog.py"

spec = importlib.util.spec_from_file_location("clinical_contract_type_catalog", TYPE_CATALOG_SOURCE)
if not spec or not spec.loader:
    raise RuntimeError(f"Unable to load {TYPE_CATALOG_SOURCE}")
type_catalog_module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = type_catalog_module
spec.loader.exec_module(type_catalog_module)
EDITOR_TYPE_CATALOG = type_catalog_module.EDITOR_TYPE_CATALOG

TARGET = REPO_ROOT / "site" / "js" / "type-catalog.js"


def main() -> None:
    catalog_json = json.dumps(EDITOR_TYPE_CATALOG, indent=2, ensure_ascii=False)
    TARGET.write_text(
        "(function registerTypeCatalog(root) {\n"
        "// Generated from src/clinical_contract/type_catalog.py. Do not edit by hand.\n"
        "// TYPE_CATALOG_JSON_START\n"
        f"const catalog = {catalog_json};\n"
        "// TYPE_CATALOG_JSON_END\n\n"
        "root.ClinicalTypeCatalog = catalog;\n\n"
        "if (typeof module !== 'undefined') {\n"
        "  module.exports = catalog;\n"
        "}\n"
        "})(typeof window !== 'undefined' ? window : globalThis);\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
