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

  assert.match(indexHtml, /clinical-contract/);
  assert.match(indexHtml, /Write\. Share\. Trust\./);
  assert.match(indexHtml, /\.\/logo\/landing_page\.png/);
  assert.match(indexHtml, /standard/);
  assert.match(indexHtml, /https:\/\/datacontract\.com\//);
  assert.match(indexHtml, /Python library \+ CLI/);
  assert.match(indexHtml, /uv tool install --python python3\.11 clinical-contract/);
  assert.match(indexHtml, /clinical-contract validate site\/examples\/contract\.yaml/);
  assert.match(indexHtml, /clinical-contract check site\/examples\/contract\.yaml site\/examples\/template\.parquet/);
  assert.match(indexHtml, /Clinical Template Contract/);
  assert.match(indexHtml, /5\/5 columns valid/);
  assert.match(indexHtml, /Consulter la documentation/);
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
  const shellCss = readSiteFile('css/src/components/shell.css');

  assert.match(editorHtml, /x-data="clinicalApp\(\)"/);
  assert.match(editorHtml, /is-embedded-editor/);
  assert.match(editorHtml, /pyscript\.net/);
  assert.match(editorHtml, /type="py"/);
  assert.match(editorHtml, /partials\/editor-panel\.html/);
  assert.match(shellCss, /\.is-embedded-editor \.pine-header/);
});
