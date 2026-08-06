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
  assert.match(editorPanel, /editor\.actions\.download/);
  assert.match(editorPanel, /pine-btn--action-success pine-btn--icon/);
  assert.match(editorPanel, /editor\.actions\.reset/);
  assert.match(editorPanel, /pine-btn--danger pine-btn--icon/);
  assert.match(editorPanel, /x-if="!schemaStarted"/);
  assert.match(editorPanel, /editor\.actions\.showExamples/);
  assert.match(dataPanel, /dataTab === 'data'/);
  assert.match(dataPanel, /editor\.actions\.showExamples/);
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

test('data file identity is displayed only in the Data preview tab', () => {
  const dataPanel = fs.readFileSync(path.join(siteRoot, 'partials/data-panel.html'), 'utf8');

  assert.match(dataPanel, /x-show="dataTab === 'data' && dataFiles\.length > 1"/);
  assert.doesNotMatch(dataPanel, /editor\.panel\.allDataFiles/);
});

test('data preview preserves the source column name casing', () => {
  const previewCss = fs.readFileSync(
    path.join(siteRoot, 'css/src/components/preview.css'),
    'utf8'
  );
  const previewHeaderRule = previewCss.match(/\.preview-th\s*\{([^}]*)\}/);

  assert.ok(previewHeaderRule, 'Preview header CSS rule is missing');
  assert.doesNotMatch(previewHeaderRule[1], /\buppercase\b/);
});

test('quality results expose per-rule execution logs', () => {
  const dataPanel = fs.readFileSync(path.join(siteRoot, 'partials/data-panel.html'), 'utf8');

  assert.match(dataPanel, /editor\.qualityResults\.result/);
  assert.match(dataPanel, /editor\.qualityResults\.log/);
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

test('dataset examples use explicit multi-selection before loading', () => {
  const dataPanel = fs.readFileSync(path.join(siteRoot, 'partials/data-panel.html'), 'utf8');

  assert.match(dataPanel, /@click="toggleDataTemplateSelection\(template\.id\)"/);
  assert.match(dataPanel, /:aria-pressed="isDataTemplateSelected\(template\.id\)"/);
  assert.match(dataPanel, /@click="confirmDataTemplateSelection\(\)"/);
  assert.match(dataPanel, /selectedDataTemplateIds\.length === 0/);
  assert.doesNotMatch(dataPanel, /@click="loadDataTemplate\(template\)"/);
});

test('contract reset uses accessible dialog semantics', () => {
  const editorPanel = fs.readFileSync(path.join(siteRoot, 'partials/editor-panel.html'), 'utf8');

  assert.match(editorPanel, /aria-labelledby="reset-contract-title"/);
  assert.match(editorPanel, /id="reset-contract-title"/);
  assert.match(editorPanel, /role="dialog"/);
  assert.match(editorPanel, /aria-modal="true"/);
  assert.match(editorPanel, /class="reset-modal" @click\.stop/);
});

test('table removal uses an accessible confirmation dialog', () => {
  const editorPanel = fs.readFileSync(path.join(siteRoot, 'partials/editor-panel.html'), 'utf8');
  const modalCss = fs.readFileSync(path.join(siteRoot, 'css/src/components/modals.css'), 'utf8');

  assert.doesNotMatch(editorPanel, /schema-remove-table-row/);
  assert.match(editorPanel, /pine-btn--danger pine-btn--icon/);
  assert.match(editorPanel, /@click="openRemoveTableModal\(\)"/);
  assert.match(editorPanel, /M4 7h16m-10 4v6m4-6v6/);
  assert.match(editorPanel, /x-if="removeTableModalOpen"/);
  assert.match(editorPanel, /aria-labelledby="remove-table-title"/);
  assert.match(editorPanel, /@click="confirmRemoveTable\(\)"/);
  assert.doesNotMatch(editorPanel, /@click="removeActiveSchemaTable\(\)"/);
  assert.doesNotMatch(modalCss, /\.schema-editor \.pine-btn(?:\s|\{)/);
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

test('schema and quality sections share the active table selector', () => {
  const editorPanel = fs.readFileSync(path.join(siteRoot, 'partials/editor-panel.html'), 'utf8');

  const tableSelectorCalls = editorPanel.match(/@change="selectSchemaTable\(\$event\.target\.value\)"/g) || [];
  assert.equal(tableSelectorCalls.length, 2);
  assert.match(
    editorPanel,
    /schemaSection === 'quality'[\s\S]*:value="schemaActiveIndex"[\s\S]*quality-table-/
  );
});

test('schema heading, table selector, and add action share one axis', () => {
  const editorPanel = fs.readFileSync(path.join(siteRoot, 'partials/editor-panel.html'), 'utf8');
  const schemaCss = fs.readFileSync(
    path.join(siteRoot, 'css/src/components/schema-builder.css'),
    'utf8'
  );

  assert.match(
    editorPanel,
    /schema-stage-bar[\s\S]*schema-stage-title[\s\S]*schemaActiveIndex[\s\S]*addSchemaTable\(\)[\s\S]*openRemoveTableModal\(\)/
  );
  assert.match(editorPanel, /addSchemaTable\(\)[\s\S]*M12 5v14M5 12h14/);
  assert.match(schemaCss, /\.schema-stage-bar\s*\{[\s\S]*?items-center/);
});

test('template catalogs keep bundled assets declarative', () => {
  const constants = fs.readFileSync(path.join(siteRoot, 'js/constants.js'), 'utf8');
  const catalog = fs.readFileSync(path.join(siteRoot, 'js/example-catalog.js'), 'utf8');

  assert.doesNotMatch(constants, /contractTemplates:/);
  assert.doesNotMatch(constants, /dataTemplates:/);
  assert.match(catalog, /contractTemplates/);
  assert.match(catalog, /dataTemplates/);
  assert.match(catalog, /\.\/examples\/clinical-template\.yaml/);
  assert.match(catalog, /\.\/examples\/clinical_template\.parquet/);
});
