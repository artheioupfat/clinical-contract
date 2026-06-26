const test = require('node:test');
const assert = require('node:assert/strict');

const codec = require('../js/contract-codec.js');

function loadSchemaModule() {
  global.window = {
    ClinicalModules: {},
    ClinicalContractCodec: codec,
  };
  delete require.cache[require.resolve('../js/schema.js')];
  require('../js/schema.js');
  return global.window.ClinicalModules.schema;
}

test('schema module resets physicalType whenever logicalType changes', () => {
  const schema = loadSchemaModule();
  let pushed = 0;
  const context = {
    ensureContractCodec: () => codec,
    normalizeTypeToken: schema.normalizeTypeToken,
    pushSchemaToYaml() {
      pushed += 1;
    },
  };
  const row = {
    logicalType: 'string',
    _lastLogicalType: '',
    physicalType: 'varchar',
  };

  schema.onLogicalTypeChanged.call(context, row);

  assert.equal(row.physicalType, '');
  assert.equal(row._lastLogicalType, 'string');
  assert.equal(pushed, 1);
});

test('schema module keeps the current builder section when returning from YAML', () => {
  const schema = loadSchemaModule();
  let synced = 0;
  let persisted = 0;
  const context = {
    editorView: 'yaml',
    schemaSection: 'quality',
    schemaDraft: {
      properties: [{ name: 'patient_id' }],
    },
    syncSchemaFromYaml(options) {
      synced += 1;
      assert.deepEqual(options, { preserveCurrentOnError: true });
    },
    persistEditorSession() {
      persisted += 1;
    },
  };

  schema.setEditorView.call(context, 'schema');

  assert.equal(context.editorView, 'schema');
  assert.equal(context.schemaSection, 'quality');
  assert.equal(synced, 1);
  assert.equal(persisted, 1);
});

test('resetting a contract also deletes the loaded data file', () => {
  const schema = loadSchemaModule();
  let dataDeleted = 0;
  let draftSeeded = 0;
  let resultsCleared = 0;
  let sessionCleared = 0;
  const context = {
    resetContractModalOpen: true,
    yamlText: 'id: example',
    yamlName: 'example.yaml',
    schemaStarted: true,
    schemaParseWarning: 'warning',
    showRequiredHints: true,
    schemaSection: 'schema',
    deleteDataFile() {
      dataDeleted += 1;
    },
    seedSchemaDraft() {
      draftSeeded += 1;
    },
    clearResults() {
      resultsCleared += 1;
    },
    clearEditorSession() {
      sessionCleared += 1;
    },
  };

  schema.resetContractDraft.call(context);

  assert.equal(dataDeleted, 1);
  assert.equal(draftSeeded, 1);
  assert.equal(resultsCleared, 1);
  assert.equal(sessionCleared, 1);
  assert.equal(context.resetContractModalOpen, false);
  assert.equal(context.yamlText, '');
  assert.equal(context.yamlName, '');
  assert.equal(context.schemaStarted, false);
  assert.equal(context.schemaSection, 'fundamentals');
});

test('schema module blocks blank contract creation until Python is ready', () => {
  const schema = loadSchemaModule();
  const context = {
    pythonReady: false,
    schemaStarted: false,
    schemaParseWarning: '',
    clearResults() {
      throw new Error('Contract should not start while Python is loading');
    },
  };

  schema.startBlankContract.call(context);

  assert.equal(context.schemaStarted, false);
  assert.match(context.schemaParseWarning, /Python runtime is still loading/);
});

test('schema module starts blank contracts with the checker collapsed', () => {
  const schema = loadSchemaModule();
  const context = {
    pythonReady: true,
    schemaStarted: false,
    checkerCollapsed: false,
    schemaParseWarning: 'old warning',
    showRequiredHints: true,
    yamlName: '',
    ensureContractCodec: () => codec,
    nextSchemaRowId: schema.nextSchemaRowId,
    schemaRowCounter: 0,
    clearResults() {},
    seedSchemaDraft: schema.seedSchemaDraft,
    pushSchemaToYaml() {},
    setSchemaSection(section) {
      this.schemaSection = section;
    },
    persistEditorSession() {},
  };

  schema.startBlankContract.call(context);

  assert.equal(context.schemaStarted, true);
  assert.equal(context.checkerCollapsed, true);
  assert.equal(context.schemaSection, 'fundamentals');
});
