const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const siteRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(siteRoot, relativePath), 'utf8');
}

function flattenKeys(value, prefix = '') {
  return Object.entries(value).flatMap(([key, child]) => {
    const childKey = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      return flattenKeys(child, childKey);
    }
    return [childKey];
  });
}

function lookup(catalog, key) {
  return key.split('.').reduce((value, part) => value?.[part], catalog);
}

function createI18nRuntime({ search = '', storedLocale = null, browserLocale = 'en-US', failedLocales = [] } = {}) {
  const storedValues = new Map(storedLocale ? [['clinical-contract-locale', storedLocale]] : []);
  const window = {
    location: { search },
    navigator: { language: browserLocale },
  };
  const context = {
    window,
    URLSearchParams,
    Map,
    document: { documentElement: { lang: '' } },
    localStorage: {
      getItem(key) {
        return storedValues.get(key) ?? null;
      },
      setItem(key, value) {
        storedValues.set(key, value);
      },
    },
    fetch: async (url) => {
      const locale = /\/([a-z]{2})\.json$/.exec(url)?.[1];
      const failed = failedLocales.includes(locale);
      return {
        ok: Boolean(locale) && !failed,
        status: locale && !failed ? 200 : 404,
        json: async () => JSON.parse(read(`locales/${locale}.json`)),
      };
    },
  };

  vm.runInNewContext(read('js/i18n.js'), context);
  return { api: window.ClinicalI18n, context, storedValues };
}

test('French and English catalogs expose exactly the same translation keys', () => {
  const english = JSON.parse(read('locales/en.json'));
  const french = JSON.parse(read('locales/fr.json'));

  assert.deepEqual(flattenKeys(french).sort(), flattenKeys(english).sort());
});

test('every literal translation key used by the site exists in both catalogs', () => {
  const english = JSON.parse(read('locales/en.json'));
  const french = JSON.parse(read('locales/fr.json'));
  const files = [
    'index.html',
    'docs.html',
    'app.js',
    ...fs.readdirSync(path.join(siteRoot, 'partials')).map((name) => `partials/${name}`),
    ...fs.readdirSync(path.join(siteRoot, 'js')).filter((name) => name.endsWith('.js')).map((name) => `js/${name}`),
  ];
  const usedKeys = new Set();
  const keyPattern = /\bt\(['"]([A-Za-z0-9_.]+)['"]/g;

  for (const file of files) {
    for (const match of read(file).matchAll(keyPattern)) usedKeys.add(match[1]);
  }

  for (const key of usedKeys) {
    assert.equal(typeof lookup(english, key), 'string', `Missing English translation: ${key}`);
    assert.equal(typeof lookup(french, key), 'string', `Missing French translation: ${key}`);
  }
});

test('all pages load i18n before their Alpine page module and expose the locale switch', () => {
  const pages = [
    ['index.html', './js/landing.js'],
    ['editor.html', './app.js'],
    ['docs.html', './js/docs.js'],
  ];

  for (const [page, appScript] of pages) {
    const html = read(page);
    assert.ok(html.indexOf('./js/i18n.js') < html.indexOf(appScript), `${page} must load i18n first`);
  }

  assert.match(read('index.html'), /setLocale\('fr'\)/);
  assert.match(read('docs.html'), /setLocale\('en'\)/);
  assert.match(read('partials/header.html'), /setLocale\('fr'\)/);
});

test('documentation has a source file for every supported locale', () => {
  assert.ok(fs.existsSync(path.join(siteRoot, 'docs/documentation.fr.md')));
  assert.ok(fs.existsSync(path.join(siteRoot, 'docs/documentation.en.md')));
});

test('locale URL override, persistence, switching, and interpolation work together', async () => {
  const runtime = createI18nRuntime({ search: '?lang=fr', storedLocale: 'en', browserLocale: 'en-US' });

  assert.equal(runtime.api.t('common.nav.editor'), '');
  assert.equal(await runtime.api.init(), 'fr');
  assert.equal(runtime.context.document.documentElement.lang, 'fr');
  assert.equal(runtime.storedValues.get('clinical-contract-locale'), 'fr');
  assert.equal(runtime.api.t('editor.preview.showing', { start: 1, end: 50, total: 90 }), 'Résultats 1 à 50 sur 90');

  assert.equal(await runtime.api.setLocale('en'), 'en');
  assert.equal(runtime.api.t('common.nav.editor'), 'Editor');
});

test('catalog failures expose a visible fallback instead of blank interface labels', async () => {
  const runtime = createI18nRuntime({ failedLocales: ['en'] });

  await assert.rejects(runtime.api.init(), /translation catalog/);
  assert.equal(runtime.api.t('editor.actions.validate'), 'editor.actions.validate');
});
