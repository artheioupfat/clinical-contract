const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const siteRoot = path.resolve(__dirname, '..');
const routing = require('../js/docs-routing.js');

function read(relativePath) {
  return fs.readFileSync(path.join(siteRoot, relativePath), 'utf8');
}

test('documentation routing exposes a closed registry of supported pages', () => {
  assert.deepEqual(
    routing.pages.map(({ id, fileBase }) => ({ id, fileBase })),
    [
      { id: 'overview', fileBase: 'documentation' },
      { id: 'contract-reference', fileBase: 'contract-reference' },
      { id: 'python-api', fileBase: 'python-api' },
    ],
  );
});

test('unknown documentation routes safely fall back to the overview', () => {
  assert.equal(routing.resolvePage('').id, 'overview');
  assert.equal(routing.resolvePage('?page=python-api').id, 'python-api');
  assert.equal(routing.resolvePage('?page=../../private').id, 'overview');
  assert.equal(routing.pageById('missing').id, 'overview');
});

test('documentation links retain the selected locale', () => {
  assert.equal(routing.pageHref('overview', 'fr'), './docs.html?lang=fr');
  assert.equal(
    routing.pageHref('contract-reference', 'en'),
    './docs.html?page=contract-reference&lang=en',
  );
});

test('every registered page has French and English Markdown sources', () => {
  for (const page of routing.pages) {
    for (const locale of ['fr', 'en']) {
      assert.ok(
        fs.existsSync(path.join(siteRoot, `docs/${page.fileBase}.${locale}.md`)),
        `Missing ${locale} source for ${page.id}`,
      );
    }
  }
});

test('documentation shell loads routing before the page controller', () => {
  const html = read('docs.html');
  assert.ok(html.indexOf('./js/docs-routing.js') < html.indexOf('./js/docs.js'));
  assert.match(html, /x-for="page in docPages"/);
  assert.match(html, /class="docs-guide-tabs"/);
  assert.match(html, /pageHref\(page\.id\)/);
  assert.ok(html.indexOf('docs-guide-tabs') < html.indexOf('docs-layout'));
});
