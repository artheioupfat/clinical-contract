#!/usr/bin/env python3
"""Generate the static website version from pyproject.toml."""
from __future__ import annotations

import json
import sys
import tomllib
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
PYPROJECT = REPO_ROOT / "pyproject.toml"
TARGET = REPO_ROOT / "site" / "js" / "site-version.js"


def main() -> None:
    version = tomllib.loads(PYPROJECT.read_text(encoding="utf-8"))["project"]["version"]
    version_json = json.dumps(version, ensure_ascii=False)
    TARGET.write_text(
        "(function registerSiteVersion(root) {\n"
        "// Generated from pyproject.toml. Do not edit by hand.\n"
        "// SITE_VERSION_JSON_START\n"
        f"const version = {version_json};\n"
        "// SITE_VERSION_JSON_END\n\n"
        "root.ClinicalContractVersion = version;\n\n"
        "if (typeof module !== 'undefined') {\n"
        "  module.exports = version;\n"
        "}\n"
        "})(typeof window !== 'undefined' ? window : globalThis);\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    if sys.version_info < (3, 11):
        raise SystemExit("Python 3.11+ is required to generate site-version.js.")
    main()
