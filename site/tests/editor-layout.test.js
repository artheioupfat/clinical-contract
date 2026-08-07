const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const siteRoot = path.resolve(__dirname, '..');

function readPartialTree(relativePath, visited = new Set()) {
  const fullPath = path.join(siteRoot, relativePath);
  if (visited.has(fullPath)) throw new Error(`Circular partial include: ${relativePath}`);
  visited.add(fullPath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const hydrated = source.replace(
    /<div\s+data-include="\.\/partials\/([^"]+)"\s*><\/div>/g,
    (_match, childName) => readPartialTree(`partials/${childName}`, new Set(visited))
  );
  return hydrated;
}

function readEditorPanel() {
  return readPartialTree('partials/editor-panel.html');
}

test('editor separates contract validation from dataset checks', () => {
  const editorPanel = readEditorPanel();
  const dataPanel = fs.readFileSync(path.join(siteRoot, 'partials/data-panel.html'), 'utf8');

  assert.match(editorPanel, /editorModeButtonClass\('validation'\)/);
  assert.match(editorPanel, /tabDotClass\(validateRunState\)/);
  assert.match(editorPanel, /editor\.actions\.download/);
  assert.match(editorPanel, /pine-btn--success-outline pine-btn--icon/);
  assert.match(editorPanel, /editor\.actions\.reset/);
  assert.match(editorPanel, /pine-btn--danger pine-btn--icon/);
  assert.match(editorPanel, /x-if="!schemaStarted"/);
  assert.match(editorPanel, /editor\.actions\.showExamples/);
  assert.match(dataPanel, /dataTab === 'data'/);
  assert.match(dataPanel, /editor\.actions\.showExamples/);
  assert.match(dataPanel, /!schemaStarted \|\| !dataFile/);
  assert.doesNotMatch(dataPanel, />Validate</);
});

test('editor hides the contract filename until a contract is active', () => {
  const editorPanel = fs.readFileSync(path.join(siteRoot, 'partials/editor-panel.html'), 'utf8');

  assert.match(
    editorPanel,
    /class="panel-title"\s+x-show="schemaStarted"\s+x-cloak\s+x-text="yamlName \|\| t\('editor\.panel\.untitled'\)"/
  );
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

test('data files use the shared entity selector in the Data preview tab', () => {
  const dataPanel = fs.readFileSync(path.join(siteRoot, 'partials/data-panel.html'), 'utf8');

  assert.match(dataPanel, /class="entity-tabs-toolbar data-file-toolbar"[\s\S]*x-show="dataTab === 'data' && dataFile"/);
  assert.match(dataPanel, /editor\.panel\.dataFile/);
  assert.match(dataPanel, /class="entity-select"/);
  assert.match(dataPanel, /role="listbox"/);
  assert.match(dataPanel, /:aria-selected="index === activeDataIndex"/);
  assert.match(dataPanel, /@click="selectDataFile\(index\)"/);
  assert.match(dataPanel, /selectDataFile\(index\)[\s\S]*entity-tabs-actions[\s\S]*\$refs\.dataInput\.click\(\)/);
  assert.doesNotMatch(dataPanel, /class="entity-tab"/);
  assert.doesNotMatch(dataPanel, /editor\.panel\.allDataFiles/);
});

test('schema and quality checker headers occupy the data toolbar height', () => {
  const dataPanel = fs.readFileSync(path.join(siteRoot, 'partials/data-panel.html'), 'utf8');
  const resultsCss = fs.readFileSync(
    path.join(siteRoot, 'css/src/components/results.css'),
    'utf8'
  );
  const checkerResultWraps = dataPanel.match(/results-table-wrap results-table-wrap--checker-results/g) || [];

  assert.equal(checkerResultWraps.length, 2);
  assert.match(
    resultsCss,
    /\.results-table-wrap--checker-results \.results-table thead th\s*\{[\s\S]*?height: 51px/
  );
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
  const editorPanel = readEditorPanel();
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
  const editorPanel = readEditorPanel();

  assert.match(editorPanel, /aria-labelledby="reset-contract-title"/);
  assert.match(editorPanel, /id="reset-contract-title"/);
  assert.match(editorPanel, /role="dialog"/);
  assert.match(editorPanel, /aria-modal="true"/);
  assert.match(editorPanel, /class="reset-modal" @click\.stop/);
});

test('table removal uses an accessible confirmation dialog', () => {
  const editorPanel = readEditorPanel();
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
  const editorPanel = readEditorPanel();

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

test('schema and quality use the same table selector and active table state', () => {
  const editorPanel = readEditorPanel();

  const tableSelectors = editorPanel.match(/class="entity-tabs-toolbar entity-tabs-toolbar--inline schema-table-toolbar"/g) || [];
  const tableSelectionCalls = editorPanel.match(/@click="selectSchemaTable\(index\)"/g) || [];

  assert.equal(tableSelectors.length, 2);
  assert.equal(tableSelectionCalls.length, 2);
  assert.doesNotMatch(editorPanel, /@change="selectSchemaTable\(\$event\.target\.value\)"/);
  assert.equal((editorPanel.match(/editor\.columns\.tables/g) || []).length, 4);
  assert.equal((editorPanel.match(/role="listbox"/g) || []).length, 2);
  assert.equal((editorPanel.match(/:aria-selected="index === schemaActiveIndex"/g) || []).length, 2);
  assert.match(
    editorPanel,
    /schemaSection === 'schema'[\s\S]*entity-select[\s\S]*index === schemaActiveIndex[\s\S]*@click="selectSchemaTable\(index\)"/
  );
  assert.match(
    editorPanel,
    /schemaSection === 'quality'[\s\S]*entity-select[\s\S]*index === schemaActiveIndex[\s\S]*@click="selectSchemaTable\(index\)"/
  );
});

test('every builder section uses the aligned primary stage bar', () => {
  const editorPanel = readEditorPanel();
  const primaryBars = editorPanel.match(/schema-stage-bar schema-stage-bar--primary/g) || [];

  assert.equal(primaryBars.length, 4);
});

test('builder navigation header aligns with primary stage bars', () => {
  const schemaBuilderCss = fs.readFileSync(
    path.join(siteRoot, 'css/src/components/schema-builder.css'),
    'utf8'
  );

  assert.match(schemaBuilderCss, /\.schema-nav-head\s*\{[\s\S]*?min-h-\[51px\]/);
  assert.match(schemaBuilderCss, /\.schema-stage-bar--primary\s*\{[\s\S]*?min-h-\[51px\]/);
});

test('shared table selector keeps table actions visible beside the menu', () => {
  const editorPanel = readEditorPanel();
  const buttonCss = fs.readFileSync(
    path.join(siteRoot, 'css/src/components/buttons.css'),
    'utf8'
  );
  const shellCss = fs.readFileSync(
    path.join(siteRoot, 'css/src/components/shell.css'),
    'utf8'
  );
  const schemaCss = fs.readFileSync(
    path.join(siteRoot, 'css/src/components/schema-builder.css'),
    'utf8'
  );

  assert.match(
    editorPanel,
    /schema-stage-bar schema-stage-bar--primary[\s\S]*schema-stage-title[\s\S]*schema-table-toolbar[\s\S]*entity-select-label[\s\S]*entity-select[\s\S]*entity-tabs-actions[\s\S]*addSchemaTable\(\)[\s\S]*openRemoveTableModal\(\)[\s\S]*<\/div>[\s\S]*schema-form-grid/
  );
  assert.match(editorPanel, /addSchemaTable\(\)[\s\S]*M12 5v14M5 12h14/);
  assert.match(shellCss, /\.entity-tabs-actions\s*\{[\s\S]*?shrink-0/);
  assert.match(shellCss, /\.entity-tabs-actions \.pine-btn\s*\{[\s\S]*?h-\[30px\][\s\S]*?w-\[30px\]/);
  assert.match(shellCss, /\.entity-tabs-toolbar--inline \.entity-tabs-controls\s*\{[\s\S]*?flex-1/);
  assert.match(shellCss, /\.entity-select-trigger\s*\{[\s\S]*?h-\[30px\]/);
  assert.match(shellCss, /\.entity-select-menu\s*\{[\s\S]*?max-h-56[\s\S]*?overflow-y-auto/);
  assert.match(buttonCss, /\.pine-btn\s*\{[\s\S]*?h-9/);
  assert.match(shellCss, /\.view-switch\s*\{[\s\S]*?h-9/);
  assert.match(schemaCss, /\.schema-stage-bar--primary\s*\{[\s\S]*?-mx-4[\s\S]*?min-h-\[51px\][\s\S]*?py-2\.5/);
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
