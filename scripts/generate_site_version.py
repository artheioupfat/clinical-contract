#!/usr/bin/env python3
"""Generate public version references from pyproject.toml."""
from __future__ import annotations

import json
import re
import sys
import tomllib
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
PYPROJECT = REPO_ROOT / "pyproject.toml"
TARGET = REPO_ROOT / "site" / "js" / "site-version.js"
README = REPO_ROOT / "README.md"
PYPI_BADGE_PATTERN = re.compile(
    r"https://img\.shields\.io/pypi/v/clinical-contract\.svg"
    r"\?cacheSeconds=300(?:&release=[^)]+)?"
)


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

    readme = README.read_text(encoding="utf-8")
    badge_url = (
        "https://img.shields.io/pypi/v/clinical-contract.svg"
        f"?cacheSeconds=300&release={version}"
    )
    readme, replacements = PYPI_BADGE_PATTERN.subn(badge_url, readme, count=1)
    if replacements != 1:
        raise RuntimeError("Unable to update the PyPI badge URL in README.md")
    README.write_text(readme, encoding="utf-8")


if __name__ == "__main__":
    if sys.version_info < (3, 11):
        raise SystemExit("Python 3.11+ is required to generate version assets.")
    main()
