(function registerExampleCatalog(root) {
// Generated from site/examples. Do not edit by hand.
// EXAMPLE_CATALOG_JSON_START
const catalog = {
  "contractTemplates": [
    {
      "id": "contract-contract-yaml",
      "name": "Clinical Template Contract",
      "description": "Bundled YAML data contract.",
      "path": "./examples/contract.yaml",
      "fileName": "contract.yaml"
    }
  ],
  "dataTemplates": [
    {
      "id": "data-template-parquet",
      "name": "Template dataset",
      "description": "Bundled PARQUET dataset.",
      "path": "./examples/template.parquet",
      "fileName": "template.parquet",
      "mimeType": "application/octet-stream"
    }
  ]
};
// EXAMPLE_CATALOG_JSON_END

root.ClinicalExampleCatalog = catalog;

if (typeof module !== 'undefined') {
  module.exports = catalog;
}
})(typeof window !== 'undefined' ? window : globalThis);
