(function registerTypeCatalog(root) {
// Generated from src/clinical_contract/type_catalog.py. Do not edit by hand.
// TYPE_CATALOG_JSON_START
const catalog = {
  "logicalTypeOptions": [
    "string",
    "date",
    "integer",
    "float",
    "boolean"
  ],
  "physicalTypeByLogical": {
    "string": [
      "varchar",
      "text",
      "string",
      "char"
    ],
    "date": [
      "datetime",
      "timestamp",
      "timestamp with timezone"
    ],
    "integer": [
      "int8",
      "int16",
      "int32",
      "int64",
      "uint8",
      "uint16",
      "uint32",
      "uint64"
    ],
    "float": [
      "float32",
      "float64"
    ],
    "boolean": [
      "boolean",
      "binary"
    ]
  }
};
// TYPE_CATALOG_JSON_END

root.ClinicalTypeCatalog = catalog;

if (typeof module !== 'undefined') {
  module.exports = catalog;
}
})(typeof window !== 'undefined' ? window : globalThis);
