(function registerExampleCatalog(root) {
// Generated from site/examples. Do not edit by hand.
// EXAMPLE_CATALOG_JSON_START
const catalog = {
  "contractTemplates": [
    {
      "id": "contract-clinical-template-yaml",
      "name": "Clinical Template Contract",
      "description": "Bundled YAML data contract.",
      "path": "./examples/clinical-template.yaml",
      "fileName": "clinical-template.yaml"
    },
    {
      "id": "contract-epidemiology-survey-yaml",
      "name": "Epidemiology Survey",
      "description": "Bundled YAML data contract.",
      "path": "./examples/epidemiology-survey.yaml",
      "fileName": "epidemiology-survey.yaml"
    },
    {
      "id": "contract-laboratory-results-yaml",
      "name": "Laboratory Results",
      "description": "Bundled YAML data contract.",
      "path": "./examples/laboratory-results.yaml",
      "fileName": "laboratory-results.yaml"
    },
    {
      "id": "contract-medication-administration-yaml",
      "name": "Medication Administration",
      "description": "Bundled YAML data contract.",
      "path": "./examples/medication-administration.yaml",
      "fileName": "medication-administration.yaml"
    }
  ],
  "dataTemplates": [
    {
      "id": "data-clinical-template-parquet",
      "name": "Clinical template dataset",
      "description": "Bundled PARQUET dataset.",
      "path": "./examples/clinical-template.parquet",
      "fileName": "clinical-template.parquet",
      "mimeType": "application/octet-stream"
    },
    {
      "id": "data-epidemiology-survey-csv",
      "name": "Epidemiology survey dataset",
      "description": "Bundled CSV dataset.",
      "path": "./examples/epidemiology-survey.csv",
      "fileName": "epidemiology-survey.csv",
      "mimeType": "text/csv"
    },
    {
      "id": "data-laboratory-results-parquet",
      "name": "Laboratory results dataset",
      "description": "Bundled PARQUET dataset.",
      "path": "./examples/laboratory-results.parquet",
      "fileName": "laboratory-results.parquet",
      "mimeType": "application/octet-stream"
    },
    {
      "id": "data-medication-administration-parquet",
      "name": "Medication administration dataset",
      "description": "Bundled PARQUET dataset.",
      "path": "./examples/medication-administration.parquet",
      "fileName": "medication-administration.parquet",
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
