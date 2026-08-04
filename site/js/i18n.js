(function registerI18n(root) {
  const supportedLocales = ['fr', 'en'];
  const storageKey = 'clinical-contract-locale';
  const catalogs = new Map();
  let activeLocale = 'en';
  let catalogLoadFailed = false;

  function normalizeLocale(value) {
    const locale = String(value || '').trim().toLowerCase().split('-')[0];
    return supportedLocales.includes(locale) ? locale : null;
  }

  function readStoredLocale() {
    try {
      return normalizeLocale(localStorage.getItem(storageKey));
    } catch (_error) {
      return null;
    }
  }

  function resolveInitialLocale() {
    const queryLocale = normalizeLocale(new URLSearchParams(root.location?.search || '').get('lang'));
    return queryLocale || readStoredLocale() || normalizeLocale(root.navigator?.language) || 'en';
  }

  async function loadCatalog(locale) {
    if (catalogs.has(locale)) return catalogs.get(locale);
    try {
      const response = await fetch(`./locales/${locale}.json`, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`Unable to load the ${locale} translation catalog (${response.status}).`);
      const catalog = await response.json();
      catalogs.set(locale, catalog);
      return catalog;
    } catch (error) {
      catalogLoadFailed = true;
      throw error;
    }
  }

  function lookup(catalog, key) {
    return String(key || '').split('.').reduce((value, part) => value?.[part], catalog);
  }

  function interpolate(value, params = {}) {
    return String(value).replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) => (
      Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match
    ));
  }

  function applyLocale(locale) {
    activeLocale = locale;
    document.documentElement.lang = locale;
    try {
      localStorage.setItem(storageKey, locale);
    } catch (_error) {
      // The locale remains active for the current page when storage is unavailable.
    }
  }

  async function setLocale(value) {
    const locale = normalizeLocale(value) || 'en';
    await Promise.all([loadCatalog('en'), loadCatalog(locale)]);
    applyLocale(locale);
    return locale;
  }

  async function init() {
    return setLocale(resolveInitialLocale());
  }

  function t(key, params = {}) {
    if (!catalogs.has('en')) return catalogLoadFailed ? key : '';
    const activeValue = lookup(catalogs.get(activeLocale), key);
    const fallbackValue = lookup(catalogs.get('en'), key);
    return interpolate(activeValue ?? fallbackValue ?? key, params);
  }

  const api = {
    supportedLocales,
    storageKey,
    init,
    setLocale,
    t,
    get locale() {
      return activeLocale;
    },
  };

  root.ClinicalI18n = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
