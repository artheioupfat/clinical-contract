const test = require('node:test');
const assert = require('node:assert/strict');
const { t } = require('./test-i18n.js');
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

test('execution durations are formatted as rounded milliseconds', () => {
  const results = loadResultsModule();

  assert.equal(results.formatExecutionDuration(29.6), '30 ms');
  assert.equal(results.formatExecutionDuration(5620.2), '5620 ms');
  assert.equal(results.formatExecutionDuration(null), '');
});

test('status bar exposes validate and check execution timings', () => {
  const footer = fs.readFileSync(
    path.resolve(__dirname, '../partials/runtime-footer.html'),
    'utf8'
  );

  assert.match(footer, /editor\.footer\.validate/);
  assert.match(footer, /editor\.footer\.check/);
  assert.match(footer, /formatExecutionDuration\(validateDurationMs\)/);
  assert.match(footer, /formatExecutionDuration\(checkDurationMs\)/);
});

test('clearing results restores every result tab to its idle state', () => {
  const results = loadResultsModule();
  const context = {
    t,
    validateRows: [{ status: 'passed' }],
    schemaRows: [{ status: 'passed' }],
    qualityRows: [{ status: 'passed' }],
    validateRunState: 'passed',
    schemaRunState: 'passed',
    qualityRunState: 'passed',
    validateDurationMs: 30,
    checkDurationMs: 5620,
    logoVariant: 'green',
    resetValidateState: results.resetValidateState,
    resetDataCheckState: results.resetDataCheckState,
  };

  results.clearResults.call(context);

  assert.equal(context.validateRunState, 'idle');
  assert.equal(context.schemaRunState, 'idle');
  assert.equal(context.qualityRunState, 'idle');
  assert.equal(context.validateDurationMs, null);
  assert.equal(context.checkDurationMs, null);
  assert.equal(context.logoVariant, 'neutral');
});

test('resetDataCheckState clears only schema and quality execution state', () => {
  const results = loadResultsModule();
  const context = {
    t,
    validateRows: [{ status: 'passed' }],
    schemaRows: [{ status: 'passed' }],
    qualityRows: [{ status: 'failed' }],
    validateRunState: 'passed',
    schemaRunState: 'passed',
    qualityRunState: 'failed',
    validateDurationMs: 30,
    checkDurationMs: 5620,
  };

  results.resetDataCheckState.call(context);

  assert.deepEqual(context.validateRows, [{ status: 'passed' }]);
  assert.equal(context.validateRunState, 'passed');
  assert.deepEqual(context.schemaRows, []);
  assert.deepEqual(context.qualityRows, []);
  assert.equal(context.schemaRunState, 'idle');
  assert.equal(context.qualityRunState, 'idle');
  assert.equal(context.validateDurationMs, 30);
  assert.equal(context.checkDurationMs, null);
});

test('resetDataCheckState can preserve the visible check duration during a rerun', () => {
  const results = loadResultsModule();
  const context = {
    t,
    schemaRows: [{ status: 'passed' }],
    qualityRows: [{ status: 'passed' }],
    schemaRunState: 'passed',
    qualityRunState: 'passed',
    checkDurationMs: 5620,
  };

  results.resetDataCheckState.call(context, { clearDuration: false });

  assert.equal(context.checkDurationMs, 5620);
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
    t,
    pythonReady: true,
    busy: false,
    checkerCollapsed: true,
    editorView: 'schema',
    showRequiredHints: false,
    yamlText: 'id: contract',
    validateRows: [],
    validateRunState: 'idle',
    validateDurationMs: null,
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
  assert.equal(Number.isFinite(context.validateDurationMs), true);
  assert.equal(context.logoVariant, 'green');
});

test('failed validation replaces stale rows with the current YAML error', async () => {
  const results = loadResultsModule();
  const originalConsoleError = console.error;
  console.error = () => {};
  global.window.pyValidateContract = () => {
    throw new Error('Invalid YAML');
  };
  const context = {
    t,
    pythonReady: true,
    busy: false,
    editorView: 'yaml',
    showRequiredHints: false,
    yamlText: 'apiVersion: [',
    schemaParseWarning: 'YAML parse warning: unexpected end of input.',
    validateRows: [{ field: 'id', present: true, status: 'passed', value: 'old-contract' }],
    validateRunState: 'passed',
    validateDurationMs: 30,
    normalizeValidateRows: results.normalizeValidateRows,
    setLogoSuccess() {
      this.logoVariant = 'green';
    },
    setLogoFailure() {
      this.logoVariant = 'red';
    },
  };

  try {
    await results.validateContract.call(context);
  } finally {
    console.error = originalConsoleError;
  }

  assert.deepEqual(context.validateRows, [{
    field: 'YAML',
    present: false,
    status: 'failed',
    value: 'YAML parse warning: unexpected end of input.',
  }]);
  assert.equal(context.validateRunState, 'failed');
  assert.equal(context.logoVariant, 'red');
  assert.equal(Number.isFinite(context.validateDurationMs), true);
});

test('successful checks finish on quality after evaluating schema first', async () => {
  const results = loadResultsModule();
  global.window.pyRunContractCheck = () => JSON.stringify({
    validate: { success: true, fields: [] },
    validate_duration_ms: 8.4,
    schema_rows: [{ status: 'ok' }],
    quality_rows: [{ status: 'passed' }],
    schema_success: true,
    report_success: true,
  });
  const context = {
    t,
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
    validateDurationMs: 30,
    checkDurationMs: null,
    normalizeValidateRows: results.normalizeValidateRows,
    normalizeSchemaRows: results.normalizeSchemaRows,
    resetValidateState() {
      throw new Error('Run checks must not clear validation before receiving its result.');
    },
    resetDataCheckState: results.resetDataCheckState,
    setLogoSuccess() { this.logoVariant = 'green'; },
    setLogoFailure() { this.logoVariant = 'red'; },
  };

  await results.runCheck.call(context);

  assert.equal(context.schemaRunState, 'passed');
  assert.equal(context.qualityRunState, 'passed');
  assert.equal(context.validateDurationMs, 8.4);
  assert.equal(Number.isFinite(context.checkDurationMs), true);
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
