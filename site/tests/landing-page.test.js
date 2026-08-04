const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');

function readSiteFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, 'site', relativePath), 'utf8');
}

test('landing page presents a static product overview without loading the editor runtime', () => {
  const indexHtml = readSiteFile('index.html');
  const french = JSON.parse(readSiteFile('locales/fr.json'));

  assert.match(indexHtml, /clinical-contract/);
  assert.match(indexHtml, /\.\/logo\/landing_page\.png/);
  assert.equal(french.landing.overviewTitle, 'Cadrer les données avant de les échanger.');
  assert.equal(french.landing.contractTitle, 'Contrat de données');
  assert.equal(french.landing.odcsTitle, 'ODCS 3.1.0');
  assert.equal(french.landing.localTitle, 'Traitement local');
  assert.match(french.landing.localBody, /Tout reste dans votre navigateur/);
  assert.match(indexHtml, /https:\/\/datacontract\.com\//);
  assert.match(french.landing.pythonTitle, /bibliothèque Python/);
  assert.match(french.landing.pythonBody, /PyPI/);
  assert.match(indexHtml, /uv tool install --python python3\.11 clinical-contract/);
  assert.match(indexHtml, /clinical-contract validate site\/examples\/contract\.yaml/);
  assert.match(indexHtml, /clinical-contract check site\/examples\/contract\.yaml site\/examples\/template\.parquet/);
  assert.match(indexHtml, /landing\.closingLink/);
  assert.match(indexHtml, /\.\/editor\.html/);
  assert.match(indexHtml, /\.\/docs\.html/);
  assert.match(indexHtml, /\.\/js\/landing\.js/);
  assert.doesNotMatch(indexHtml, /<iframe/);
  assert.doesNotMatch(indexHtml, /\.\/editor\.html\?embed=1/);
  assert.doesNotMatch(indexHtml, /\.\/assets\/site-demo\.gif/);
  assert.doesNotMatch(indexHtml, /src="\.\/index\.html/);
  assert.doesNotMatch(indexHtml, /src="\.\/docs\.html/);
  assert.doesNotMatch(indexHtml, /pyscript\.net/);
  assert.doesNotMatch(indexHtml, /type="py"/);
});

test('interactive editor page owns the PyScript runtime', () => {
  const editorHtml = readSiteFile('editor.html');
  const headerHtml = readSiteFile('partials/header.html');
  const shellCss = readSiteFile('css/src/components/shell.css');

  assert.match(editorHtml, /x-data="clinicalApp\(\)"/);
  assert.match(editorHtml, /is-embedded-editor/);
  assert.match(editorHtml, /pyscript\.net/);
  assert.match(editorHtml, /type="py"/);
  assert.match(editorHtml, /partials\/editor-panel\.html/);
  assert.match(headerHtml, /<a class="pine-brand" href="\.\/index\.html"/);
  assert.match(shellCss, /\.is-embedded-editor \.pine-header/);
});
