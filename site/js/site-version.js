(function registerSiteVersion(root) {
// Generated from pyproject.toml. Do not edit by hand.
// SITE_VERSION_JSON_START
const version = "0.1.7";
// SITE_VERSION_JSON_END

root.ClinicalContractVersion = version;

if (typeof module !== 'undefined') {
  module.exports = version;
}
})(typeof window !== 'undefined' ? window : globalThis);
