#!/usr/bin/env python3
"""Generate the static website example catalog from site/examples."""
from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.parse import quote

REPO_ROOT = Path(__file__).resolve().parents[1]
EXAMPLES_DIR = REPO_ROOT / "site" / "examples"
TARGET = REPO_ROOT / "site" / "js" / "example-catalog.js"

CONTRACT_EXTENSIONS = {".yaml", ".yml"}
DATA_MIME_TYPES = {
    ".csv": "text/csv",
    ".parquet": "application/octet-stream",
}


def humanize(value: str) -> str:
    words = re.sub(r"[-_]+", " ", value).strip()
    return words[:1].upper() + words[1:] if words else "Example"


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "example"


def contract_name(path: Path) -> str:
    """Read a simple top-level YAML name without requiring PyYAML."""
    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            if line[:1].isspace():
                continue
            match = re.match(r"^name\s*:\s*(.+?)\s*$", line)
            if match:
                return match.group(1).strip("'\"") or humanize(path.stem)
    except (OSError, UnicodeError):
        pass
    return humanize(path.stem)


def example_url(relative_path: Path) -> str:
    encoded_path = "/".join(quote(part) for part in relative_path.parts)
    return f"./examples/{encoded_path}"


def build_catalog() -> dict[str, list[dict[str, str]]]:
    contracts: list[dict[str, str]] = []
    datasets: list[dict[str, str]] = []
    for path in sorted(EXAMPLES_DIR.rglob("*"), key=lambda item: item.as_posix().lower()):
        if not path.is_file():
            continue

        extension = path.suffix.lower()
        relative_path = path.relative_to(EXAMPLES_DIR)
        relative_key = relative_path.as_posix()

        if extension in CONTRACT_EXTENSIONS:
            contracts.append(
                {
                    "id": f"contract-{slugify(relative_key)}",
                    "name": contract_name(path),
                    "description": "Bundled YAML data contract.",
                    "path": example_url(relative_path),
                    "fileName": path.name,
                }
            )
        elif extension in DATA_MIME_TYPES:
            datasets.append(
                {
                    "id": f"data-{slugify(relative_key)}",
                    "name": f"{humanize(path.stem)} dataset",
                    "description": f"Bundled {extension.removeprefix('.').upper()} dataset.",
                    "path": example_url(relative_path),
                    "fileName": path.name,
                    "mimeType": DATA_MIME_TYPES[extension],
                }
            )

    return {"contractTemplates": contracts, "dataTemplates": datasets}


def main() -> None:
    catalog_json = json.dumps(build_catalog(), indent=2, ensure_ascii=False)
    TARGET.write_text(
        "(function registerExampleCatalog(root) {\n"
        "// Generated from site/examples. Do not edit by hand.\n"
        "// EXAMPLE_CATALOG_JSON_START\n"
        f"const catalog = {catalog_json};\n"
        "// EXAMPLE_CATALOG_JSON_END\n\n"
        "root.ClinicalExampleCatalog = catalog;\n\n"
        "if (typeof module !== 'undefined') {\n"
        "  module.exports = catalog;\n"
        "}\n"
        "})(typeof window !== 'undefined' ? window : globalThis);\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
