"""
Placeholder bridge functions for clinical-contract UI.
These will be replaced with real implementations using the clinical_contract library.
"""

from pyscript import document, window
from pyodide.ffi import create_proxy


def _to_js(obj):
    """Convert Python dict/list to JS-compatible proxy."""
    from pyodide.ffi import to_js
    from js import Object
    if isinstance(obj, dict):
        return to_js(obj, dict_converter=Object.fromEntries)
    return to_js(obj)


def validate(yaml_content):
    """Placeholder: validate YAML contract structure."""
    success = "apiVersion" in yaml_content and "schema" in yaml_content
    errors = [] if success else ["Structure YAML invalide"]
    return _to_js({"success": success, "errors": errors})


def check(yaml_content, file_bytes):
    """Placeholder: check a Parquet file against the YAML contract."""
    results = [
        {"column": "IPP", "expected_type": "string", "error": "", "result": "success", "obtained": 0, "expected": 0},
        {"column": "IPP", "expected_type": "string", "error": "IPP doit faire entre 35 et 37 caractères", "result": "fail", "obtained": 12, "expected": 0},
        {"column": "DATE_EVENEMENT", "expected_type": "timestamp", "error": "", "result": "success", "obtained": 0, "expected": 0},
    ]
    info = {"columns": 6, "rows": 1453}
    return _to_js({"results": _to_js(results), "info": _to_js(info)})


# Expose to JavaScript
window.pyValidate = create_proxy(validate)
window.pyCheck = create_proxy(check)

# Signal ready in status bar
indicator = document.getElementById("pyscript-indicator")
status_el = document.getElementById("pyscript-status")
if indicator:
    indicator.classList.remove("bg-gray-300", "dark:bg-gray-600")
    indicator.classList.add("bg-emerald-500")
if status_el:
    status_el.textContent = "PyScript OK"
