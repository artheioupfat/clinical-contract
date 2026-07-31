const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const siteRoot = path.resolve(__dirname, '..');

test('editor separates contract validation from dataset checks', () => {
  const editorPanel = fs.readFileSync(path.join(siteRoot, 'partials/editor-panel.html'), 'utf8');
  const dataPanel = fs.readFileSync(path.join(siteRoot, 'partials/data-panel.html'), 'utf8');

  assert.match(editorPanel, /editorModeButtonClass\('validation'\)/);
  assert.match(editorPanel, /tabDotClass\(validateRunState\)/);
  assert.match(editorPanel, /aria-label="Download contract"/);
  assert.match(editorPanel, /pine-btn--action-success pine-btn--icon/);
  assert.match(editorPanel, /aria-label="Reset contract"/);
  assert.match(editorPanel, /pine-btn--danger pine-btn--icon/);
  assert.match(editorPanel, /x-if="!schemaStarted"/);
  assert.match(editorPanel, /Show examples/);
  assert.match(dataPanel, /dataTab === 'data'/);
  assert.match(dataPanel, /Show examples/);
  assert.match(dataPanel, /!schemaStarted \|\| !dataFile/);
  assert.doesNotMatch(dataPanel, />Validate</);
});

test('checker exposes Data, Schema, and Quality in its panel toolbar', () => {
  const dataPanel = fs.readFileSync(path.join(siteRoot, 'partials/data-panel.html'), 'utf8');

  assert.match(dataPanel, /<div class="panel-head">[\s\S]*<div class="view-switch" :class="!dataFile \? 'view-switch--locked' : ''"[^>]*>/);
  assert.match(dataPanel, /dataModeButtonClass\('data'\)/);
  assert.match(dataPanel, /dataModeButtonClass\('schema'\)/);
  assert.match(dataPanel, /dataModeButtonClass\('quality'\)/);
  assert.match(dataPanel, /!dataFile \? 'view-switch--locked' : ''/);
  assert.equal((dataPanel.match(/:disabled="!dataFile"/g) || []).length, 3);
  assert.doesNotMatch(dataPanel, /class="checker-body"/);
  assert.doesNotMatch(dataPanel, /class="results-shell"/);
});

test('quality results expose per-rule execution logs', () => {
  const dataPanel = fs.readFileSync(path.join(siteRoot, 'partials/data-panel.html'), 'utf8');

  assert.match(dataPanel, /<th>Result<\/th><th>Log<\/th>/);
  assert.match(dataPanel, /row\.log \|\| '—'/);
  assert.match(dataPanel, /colspan="7"/);
});

test('template selectors use persistent accessible dialogs', () => {
  const editorPanel = fs.readFileSync(path.join(siteRoot, 'partials/editor-panel.html'), 'utf8');
  const dataPanel = fs.readFileSync(path.join(siteRoot, 'partials/data-panel.html'), 'utf8');

  assert.match(editorPanel, /x-show="contractTemplateModalOpen"/);
  assert.match(dataPanel, /x-show="dataTemplateModalOpen"/);
  assert.match(editorPanel, /aria-labelledby="contract-template-title"/);
  assert.match(dataPanel, /aria-labelledby="data-template-title"/);
  assert.doesNotMatch(editorPanel, /class="template-modal" @click\.outside/);
  assert.doesNotMatch(dataPanel, /class="template-modal" @click\.outside/);
});

test('contract reset uses accessible dialog semantics', () => {
  const editorPanel = fs.readFileSync(path.join(siteRoot, 'partials/editor-panel.html'), 'utf8');

  assert.match(editorPanel, /aria-labelledby="reset-contract-title"/);
  assert.match(editorPanel, /id="reset-contract-title"/);
  assert.match(editorPanel, /role="dialog"/);
  assert.match(editorPanel, /aria-modal="true"/);
  assert.match(editorPanel, /class="reset-modal" @click\.stop/);
});

test('quality editor exposes every supported comparison operator', () => {
  const editorPanel = fs.readFileSync(path.join(siteRoot, 'partials/editor-panel.html'), 'utf8');

  for (const operator of [
    'equal',
    'notEqual',
    'greaterThan',
    'greaterThanOrEqual',
    'lessThan',
    'lessThanOrEqual',
    'between',
  ]) {
    assert.match(editorPanel, new RegExp(`value="${operator}"`));
  }
  assert.match(editorPanel, /rule\.comparisonOperator !== 'between'/);
  assert.match(editorPanel, /rule\.comparisonOperator === 'between'/);
  assert.match(editorPanel, /rule\.expectedMin/);
  assert.match(editorPanel, /rule\.expectedMax/);
});

test('template catalogs keep bundled assets declarative', () => {
  const constants = fs.readFileSync(path.join(siteRoot, 'js/constants.js'), 'utf8');
  const catalog = fs.readFileSync(path.join(siteRoot, 'js/example-catalog.js'), 'utf8');

  assert.doesNotMatch(constants, /contractTemplates:/);
  assert.doesNotMatch(constants, /dataTemplates:/);
  assert.match(catalog, /contractTemplates/);
  assert.match(catalog, /dataTemplates/);
  assert.match(catalog, /\.\/examples\/contract\.yaml/);
  assert.match(catalog, /\.\/examples\/template\.parquet/);
});
