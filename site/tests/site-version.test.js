const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readProjectVersion() {
  const pyproject = read('pyproject.toml');
  const match = pyproject.match(/^version\s*=\s*"([^"]+)"/m);
  assert.ok(match, 'pyproject.toml must expose project.version');
  return match[1];
}

function readSiteVersion() {
  const source = read('site/js/site-version.js');
  const match = source.match(/\/\/ SITE_VERSION_JSON_START\s*const version = "([^"]+)";\s*\/\/ SITE_VERSION_JSON_END/s);
  assert.ok(match, 'site version JSON block must be extractable');
  return match[1];
}

test('site version is generated from pyproject version', () => {
  assert.equal(readSiteVersion(), readProjectVersion());
});

test('site pages load version before Alpine page modules', () => {
  const indexHtml = read('site/index.html');
  const editorHtml = read('site/editor.html');
  const docsHtml = read('site/docs.html');

  assert.ok(indexHtml.indexOf('./js/site-version.js') < indexHtml.indexOf('./js/landing.js'));
  assert.ok(editorHtml.indexOf('./js/site-version.js') < editorHtml.indexOf('./app.js'));
  assert.ok(docsHtml.indexOf('./js/site-version.js') < docsHtml.indexOf('./js/docs.js'));
});

test('site badges do not duplicate the generated version in HTML', () => {
  const badgeSources = [
    read('site/index.html'),
    read('site/docs.html'),
    read('site/partials/header.html'),
  ];

  for (const source of badgeSources) {
    assert.doesNotMatch(source, /class="pine-badge"[^>]*>v\d/);
    assert.match(source, /class="pine-badge"[^>]*x-text="siteVersionLabel"[^>]*x-cloak/);
  }
});

test('site pages load the shared page shell before their Alpine modules', () => {
  const indexHtml = read('site/index.html');
  const editorHtml = read('site/editor.html');
  const docsHtml = read('site/docs.html');

  assert.ok(indexHtml.indexOf('./js/page-shell.js') < indexHtml.indexOf('./js/landing.js'));
  assert.ok(editorHtml.indexOf('./js/page-shell.js') < editorHtml.indexOf('./app.js'));
  assert.ok(docsHtml.indexOf('./js/page-shell.js') < docsHtml.indexOf('./js/docs.js'));
});
