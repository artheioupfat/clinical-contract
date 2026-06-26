"""
Shared type catalog used by the browser editor.

The Python package is the source of truth. The static website receives a
small generated JavaScript copy through scripts/generate_site_type_catalog.py.

Warning : if this file is updated : npm run generate:site-types

"""
from __future__ import annotations

EDITOR_TYPE_CATALOG: dict[str, object] = {
    "logicalTypeOptions": [
        "string",
        "date",
        "integer",
        "float",
        "boolean",
    ],
    "physicalTypeByLogical": {
        "string": ["varchar", "text", "string", "char"],
        "date": ["timestamp", "datetime"],
        "integer": [
            "int8",
            "int16",
            "int32",
            "int64",
            "uint8",
            "uint16",
            "uint32",
            "uint64",
        ],
        "float": ["float32", "float64"],
        "boolean": ["binary"],
    },
}
