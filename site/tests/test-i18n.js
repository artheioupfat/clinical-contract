const english = require('../locales/en.json');

function lookup(key) {
  return key.split('.').reduce((value, part) => value?.[part], english);
}

function t(key, params = {}) {
  const value = lookup(key) || key;
  return String(value).replace(/\{([A-Za-z0-9_]+)\}/g, (match, name) => (
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
  ));
}

module.exports = { t };
