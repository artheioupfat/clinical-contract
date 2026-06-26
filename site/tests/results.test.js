const test = require('node:test');
const assert = require('node:assert/strict');

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

test('validate opens the checker panel before showing validation results', async () => {
  const results = loadResultsModule();
  global.window.pyValidateContract = () => JSON.stringify({
    success: true,
    fields: [{ field: 'id', present: true }],
  });
  const context = {
    pythonReady: true,
    busy: false,
    checkerCollapsed: true,
    activeTab: 'schema',
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

  assert.equal(context.checkerCollapsed, false);
  assert.equal(context.activeTab, 'validate');
  assert.equal(context.validateRunState, 'passed');
  assert.equal(context.logoVariant, 'green');
});
