/* 
This file is generates from src/clinical_contract/type_catalog.py
This makes it possible to avoid type mismatches.
Thnaks to scripts/generate_site_type_catalog.py


npm run generate:site-types     command to generate this file 
*/


(function registerTypeCatalog(root) {

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
      "timestamp",
      "datetime"
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
