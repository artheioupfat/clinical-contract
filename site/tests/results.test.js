const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function loadResultsModule() {
  global.window = { ClinicalModules: {} };
  delete require.cache[require.resolve('../js/results.js')];
  require('../js/results.js');
  return global.window.ClinicalModules.results;
}

test('results module maps capitalized failed states to red dots', () => {
  const results = loadResultsModule();

  assert.equal(results.tabDotClass('idle'), 'tab-dot--idle');
  assert.equal(results.tabDotClass('Failed'), 'tab-dot--failed');
  assert.equal(results.tabDotClass(' failed '), 'tab-dot--failed');
  assert.equal(results.tabDotClass('Error'), 'tab-dot--failed');
  assert.equal(results.statusDotClass('Failed'), 'status-dot--failed');
  assert.equal(results.statusDotClass(' missing '), 'status-dot--failed');
});

test('production CSS retains every dynamically selected result status', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../css/tailwind.css'), 'utf8');
  const variants = ['passed', 'failed', 'error', 'warning'];

  for (const variant of variants) {
    assert.match(css, new RegExp(`\\.status-chip--${variant}(?:[,\\{])`));
    assert.match(css, new RegExp(`\\.status-dot--${variant}(?:[,\\{])`));
  }
});

test('clearing results restores every result tab to its idle state', () => {
  const results = loadResultsModule();
  const context = {
    validateRows: [{ status: 'passed' }],
    schemaRows: [{ status: 'passed' }],
    qualityRows: [{ status: 'passed' }],
    validateRunState: 'passed',
    schemaRunState: 'passed',
    qualityRunState: 'passed',
    logoVariant: 'green',
    resetValidateState: results.resetValidateState,
    resetDataCheckState: results.resetDataCheckState,
  };

  results.clearResults.call(context);

  assert.equal(context.validateRunState, 'idle');
  assert.equal(context.schemaRunState, 'idle');
  assert.equal(context.qualityRunState, 'idle');
  assert.equal(context.logoVariant, 'neutral');
});

test('resetDataCheckState clears only schema and quality execution state', () => {
  const results = loadResultsModule();
  const context = {
    validateRows: [{ status: 'passed' }],
    schemaRows: [{ status: 'passed' }],
    qualityRows: [{ status: 'failed' }],
    validateRunState: 'passed',
    schemaRunState: 'passed',
    qualityRunState: 'failed',
  };

  results.resetDataCheckState.call(context);

  assert.deepEqual(context.validateRows, [{ status: 'passed' }]);
  assert.equal(context.validateRunState, 'passed');
  assert.deepEqual(context.schemaRows, []);
  assert.deepEqual(context.qualityRows, []);
  assert.equal(context.schemaRunState, 'idle');
  assert.equal(context.qualityRunState, 'idle');
});

test('validate opens the contract validation view without changing the checker panel', async () => {
  const results = loadResultsModule();
  global.window.pyValidateContract = () => JSON.stringify({
    success: true,
    fields: [{ field: 'id', present: true }],
  });
  const context = {
    pythonReady: true,
    busy: false,
    checkerCollapsed: true,
    editorView: 'schema',
    showRequiredHints: false,
    yamlText: 'id: contract',
    validateRows: [],
    validateRunState: 'idle',
    normalizeValidateRows: results.normalizeValidateRows,
    setLogoSuccess() {
      this.logoVariant = 'green';
    },
    setLogoFailure() {
      this.logoVariant = 'red';
    },
  };

  await results.validateContract.call(context);

  assert.equal(context.checkerCollapsed, true);
  assert.equal(context.editorView, 'validation');
  assert.equal(context.validateRunState, 'passed');
  assert.equal(context.logoVariant, 'green');
});

test('successful checks finish on quality after evaluating schema first', async () => {
  const results = loadResultsModule();
  global.window.pyRunContractCheck = () => JSON.stringify({
    validate: { success: true, fields: [] },
    schema_rows: [{ status: 'ok' }],
    quality_rows: [{ status: 'passed' }],
    schema_success: true,
    report_success: true,
  });
  const context = {
    pythonReady: true,
    schemaStarted: true,
    dataFile: { async arrayBuffer() { return new ArrayBuffer(1); } },
    yamlText: 'name: contract',
    busy: false,
    dataTab: 'data',
    showRequiredHints: false,
    validateRows: [],
    schemaRows: [],
    qualityRows: [],
    validateRunState: 'idle',
    schemaRunState: 'idle',
    qualityRunState: 'idle',
    normalizeValidateRows: results.normalizeValidateRows,
    normalizeSchemaRows: results.normalizeSchemaRows,
    resetValidateState: results.resetValidateState,
    resetDataCheckState: results.resetDataCheckState,
    setLogoSuccess() { this.logoVariant = 'green'; },
    setLogoFailure() { this.logoVariant = 'red'; },
  };

  await results.runCheck.call(context);

  assert.equal(context.schemaRunState, 'passed');
  assert.equal(context.qualityRunState, 'passed');
  assert.equal(context.dataTab, 'quality');
  assert.equal(context.logoVariant, 'green');
});

test('checks stay blocked until contract and data are both available', async () => {
  const results = loadResultsModule();
  let calls = 0;
  global.window.pyRunContractCheck = () => {
    calls += 1;
    return '{}';
  };

  await results.runCheck.call({ pythonReady: true, schemaStarted: false, dataFile: {} });
  await results.runCheck.call({ pythonReady: true, schemaStarted: true, dataFile: null });

  assert.equal(calls, 0);
});
