const test = require('node:test');
const assert = require('node:assert/strict');

const codec = require('../js/contract-codec.js');

function nextIdFactory() {
  let id = 0;
  return () => {
    id += 1;
    return id;
  };
}

function sampleContract() {
  return {
    apiVersion: 'v3.1.0',
    kind: 'DataContract',
    id: 'orders-contract',
    name: 'Orders contract',
    version: '1.2.0',
    status: 'active',
    description: {
      purpose: 'Protect downstream order analytics.',
      usage: 'Consumed by analytics jobs.',
      limitations: 'Historical rows may be incomplete.',
    },
    study: {
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      type: 'cohort',
      objective: 'predictive',
      healthDomain: 'oncology',
      sponsor: 'kept',
    },
    xRoot: 'kept',
    schema: [
      {
        name: 'orders',
        physicalType: 'TABLE',
        description: 'Order facts.',
        xTable: 'kept',
        properties: [
          {
            name: 'order_id',
            logical_type: 'integer',
            physical_type: 'uint32',
            required: true,
            description: 'Stable order identifier.',
            xColumn: 'kept',
            quality: [
              {
                type: 'sql',
                description: 'Order id is never null.',
                query: 'select count(*) from data where order_id is null',
                mustBe: 0,
                severity: 'high',
              },
            ],
          },
        ],
      },
      {
        name: 'secondary_schema',
        physicalType: 'TABLE',
        properties: [],
      },
    ],
    team: {
      name: 'Data Office',
      description: 'Data ownership team.',
      xTeam: 'kept',
      members: [
        {
          name: 'Alice Doe',
          role: 'Data owner',
          email: 'alice@example.org',
          xMember: 'kept',
        },
      ],
    },
  };
}

test('createEmptyDraft starts without columns by default', () => {
  const draft = codec.createEmptyDraft();

  assert.equal(draft.apiVersion, 'v3.1.0');
  assert.deepEqual(draft.properties, []);
  assert.deepEqual(draft.qualityRules, []);
  assert.deepEqual(draft.teamMembers, []);
});

test('contractObjectToDraft loads column types, quality rows, team and extras', () => {
  const decoded = codec.contractObjectToDraft(sampleContract(), { nextRowId: nextIdFactory() });
  const draft = decoded.draft;

  assert.equal(draft.id, 'orders-contract');
  assert.equal(draft.descriptionPurpose, 'Protect downstream order analytics.');
  assert.equal(draft.studyStartDate, '2024-01-01');
  assert.equal(draft.studyEndDate, '2024-12-31');
  assert.equal(draft.studyType, 'cohort');
  assert.equal(draft.studyObjective, 'predictive');
  assert.equal(draft.healthDomain, 'oncology');
  assert.equal(draft.studyExtras.sponsor, 'kept');
  assert.equal(draft.tableName, 'orders');
  assert.equal(draft.tableExtras.xTable, 'kept');
  assert.equal(decoded.rootExtras.xRoot, 'kept');
  assert.equal(decoded.otherSchemas[0].name, 'secondary_schema');

  assert.equal(draft.properties.length, 1);
  assert.equal(draft.properties[0].name, 'order_id');
  assert.equal(draft.properties[0].logicalType, 'integer');
  assert.equal(draft.properties[0].physicalType, 'uint32');
  assert.equal(draft.properties[0].required, true);
  assert.equal(draft.properties[0].extras.xColumn, 'kept');

  assert.equal(draft.qualityRules.length, 1);
  assert.equal(draft.qualityRules[0].propertyName, 'order_id');
  assert.equal(draft.qualityRules[0].mustBe, 0);
  assert.equal(draft.qualityRules[0].extras.severity, 'high');

  assert.equal(draft.teamMembers.length, 1);
  assert.equal(draft.teamMembers[0].email, 'alice@example.org');
  assert.equal(draft.teamMembers[0].extras.xMember, 'kept');
});

test('draftToContractObject writes quality under its column and preserves extras', () => {
  const decoded = codec.contractObjectToDraft(sampleContract(), { nextRowId: nextIdFactory() });
  const contract = codec.draftToContractObject(decoded.draft, decoded.rootExtras, decoded.otherSchemas);
  const property = contract.schema[0].properties[0];

  assert.equal(contract.xRoot, 'kept');
  assert.deepEqual(contract.study, {
    sponsor: 'kept',
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    type: 'cohort',
    objective: 'predictive',
    healthDomain: 'oncology',
  });
  assert.equal(contract.schema[0].physicalType, 'TABLE');
  assert.equal(contract.schema[0].xTable, 'kept');
  assert.equal(contract.schema[1].name, 'secondary_schema');
  assert.equal(property.logicalType, 'integer');
  assert.equal(property.physicalType, 'uint32');
  assert.equal(property.xColumn, 'kept');
  assert.equal(property.quality.length, 1);
  assert.equal(property.quality[0].severity, 'high');
  assert.equal(property.quality[0].query, 'select count(*) from data where order_id is null');
  assert.equal(contract.team.members[0].xMember, 'kept');
});

test('draftToContractObject always writes schema physicalType as TABLE without draft state', () => {
  const decoded = codec.contractObjectToDraft(
    {
      ...sampleContract(),
      schema: [
        {
          ...sampleContract().schema[0],
          physicalType: 'VIEW',
        },
      ],
    },
    { nextRowId: nextIdFactory() }
  );

  assert.equal(Object.prototype.hasOwnProperty.call(decoded.draft, 'tablePhysicalType'), false);
  decoded.draft.tablePhysicalType = 'FILE';
  const contract = codec.draftToContractObject(decoded.draft, decoded.rootExtras, decoded.otherSchemas);

  assert.equal(contract.schema[0].physicalType, 'TABLE');
});

test('yaml helpers delegate parsing and dumping to the injected YAML library', () => {
  const yamlLib = {
    load(text) {
      return { id: text, schema: [] };
    },
    dump(contract) {
      return `dumped:${contract.id}`;
    },
  };

  const decoded = codec.yamlTextToDraft('contract-id', yamlLib, { nextRowId: nextIdFactory() });
  const yamlText = codec.draftToYamlText(decoded.draft, yamlLib, {
    rootExtras: decoded.rootExtras,
    otherSchemas: decoded.otherSchemas,
  });

  assert.equal(decoded.draft.id, 'contract-id');
  assert.equal(yamlText, 'dumped:contract-id');
});

test('schema module resets physicalType whenever logicalType changes', () => {
  global.window = {
    ClinicalModules: {},
    ClinicalContractCodec: codec,
  };
  delete require.cache[require.resolve('../js/schema.js')];
  require('../js/schema.js');

  const schema = global.window.ClinicalModules.schema;
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
  global.window = {
    ClinicalModules: {},
    ClinicalContractCodec: codec,
  };
  delete require.cache[require.resolve('../js/schema.js')];
  require('../js/schema.js');

  const schema = global.window.ClinicalModules.schema;
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
  global.window = {
    ClinicalModules: {},
    ClinicalContractCodec: codec,
  };
  delete require.cache[require.resolve('../js/schema.js')];
  require('../js/schema.js');

  const schema = global.window.ClinicalModules.schema;
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

test('results module maps capitalized failed states to red dots', () => {
  global.window = { ClinicalModules: {} };
  delete require.cache[require.resolve('../js/results.js')];
  require('../js/results.js');

  const results = global.window.ClinicalModules.results;

  assert.equal(results.tabDotClass('idle'), 'tab-dot--idle');
  assert.equal(results.tabDotClass('Failed'), 'tab-dot--failed');
  assert.equal(results.tabDotClass(' failed '), 'tab-dot--failed');
  assert.equal(results.tabDotClass('Error'), 'tab-dot--failed');
  assert.equal(results.statusDotClass('Failed'), 'status-dot--failed');
  assert.equal(results.statusDotClass(' missing '), 'status-dot--failed');
});

test('clearing results restores every result tab to its idle state', () => {
  global.window = { ClinicalModules: {} };
  delete require.cache[require.resolve('../js/results.js')];
  require('../js/results.js');

  const results = global.window.ClinicalModules.results;
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
  global.window = { ClinicalModules: {} };
  delete require.cache[require.resolve('../js/results.js')];
  require('../js/results.js');

  const results = global.window.ClinicalModules.results;
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

test('data module deletes the current file and clears dataset-dependent state', () => {
  global.window = { ClinicalModules: {}, ClinicalConstants: {} };
  delete require.cache[require.resolve('../js/results.js')];
  delete require.cache[require.resolve('../js/data.js')];
  require('../js/results.js');
  require('../js/data.js');

  const results = global.window.ClinicalModules.results;
  const data = global.window.ClinicalModules.data;
  let released = 0;
  let persistedFileCleared = 0;
  const input = { value: '/tmp/dataset.parquet' };
  const context = {
    dataFile: { name: 'dataset.parquet' },
    dataFileName: 'dataset.parquet',
    dataFileSize: 2048,
    dataColumns: 4,
    dataRows: 10,
    draggingData: true,
    schemaRows: [{ status: 'passed' }],
    qualityRows: [{ status: 'passed' }],
    schemaRunState: 'passed',
    qualityRunState: 'passed',
    activeTab: 'preview',
    logoVariant: 'green',
    $refs: { dataInput: input },
    resetDataCheckState: results.resetDataCheckState,
    clearPersistedDataFile() {
      persistedFileCleared += 1;
      return Promise.resolve();
    },
    releasePreviewSession() {
      released += 1;
    },
    clearPreviewData() {
      this.previewRows = [];
    },
  };

  data.deleteDataFile.call(context);

  assert.equal(released, 1);
  assert.equal(persistedFileCleared, 1);
  assert.equal(context.dataFile, null);
  assert.equal(context.dataFileName, '');
  assert.equal(context.dataFileSize, 0);
  assert.equal(context.dataColumns, null);
  assert.equal(context.dataRows, null);
  assert.deepEqual(context.schemaRows, []);
  assert.deepEqual(context.qualityRows, []);
  assert.equal(context.schemaRunState, 'idle');
  assert.equal(context.qualityRunState, 'idle');
  assert.equal(context.activeTab, 'validate');
  assert.equal(context.logoVariant, 'neutral');
  assert.equal(input.value, '');
});

test('data module persists each loaded file before refreshing insights', async () => {
  global.window = { ClinicalModules: {}, ClinicalConstants: {} };
  delete require.cache[require.resolve('../js/results.js')];
  delete require.cache[require.resolve('../js/data.js')];
  require('../js/results.js');
  require('../js/data.js');

  const results = global.window.ClinicalModules.results;
  const data = global.window.ClinicalModules.data;
  const file = new File(['id\n1'], 'dataset.csv', { type: 'text/csv' });
  let persisted = null;
  let refreshed = 0;
  const context = {
    schemaRows: [{ status: 'passed' }],
    qualityRows: [{ status: 'passed' }],
    schemaRunState: 'passed',
    qualityRunState: 'passed',
    resetDataCheckState: results.resetDataCheckState,
    async persistDataFileSession(value) {
      persisted = value;
    },
    async refreshDataInsights() {
      refreshed += 1;
    },
  };

  await data.loadDataFile.call(context, file);

  assert.equal(persisted, file);
  assert.equal(refreshed, 1);
  assert.equal(context.dataFileName, 'dataset.csv');
  assert.equal(context.schemaRunState, 'idle');
  assert.equal(context.qualityRunState, 'idle');
});

test('data module derives status bar stats from preview preparation', async () => {
  global.window = {
    ClinicalModules: {},
    ClinicalConstants: {},
    pyPrepareDataPreview() {
      return JSON.stringify({
        handle: 'preview-1',
        columns: ['patient_id', 'event_date', 'age'],
        total_rows: 5000,
        page_size: 50,
        total_pages: 100,
        error: '',
      });
    },
  };
  delete require.cache[require.resolve('../js/data.js')];
  require('../js/data.js');

  const data = global.window.ClinicalModules.data;
  const context = {
    pythonReady: true,
    previewHandle: null,
    previewPageSizeDefault: 50,
    dataColumns: null,
    dataRows: null,
    releasePreviewSession: data.releasePreviewSession,
    clearPreviewData: data.clearPreviewData,
    async loadPreviewPage(page) {
      this.previewPage = page;
    },
  };

  await data.preparePreview.call(context, new File(['id\n1'], 'dataset.csv'));

  assert.equal(context.dataColumns, 3);
  assert.equal(context.dataRows, 5000);
  assert.deepEqual(context.previewColumns, ['patient_id', 'event_date', 'age']);
  assert.equal(context.previewTotalRows, 5000);
});

test('data storage module creates and reuses a browser session id', () => {
  const store = new Map();
  global.window = {
    ClinicalModules: {},
    sessionStorage: {
      getItem(key) {
        return store.get(key) || null;
      },
      setItem(key, value) {
        store.set(key, value);
      },
    },
    crypto: {
      randomUUID() {
        return 'session-id-1';
      },
    },
  };
  global.sessionStorage = global.window.sessionStorage;

  delete require.cache[require.resolve('../js/data-storage.js')];
  require('../js/data-storage.js');

  const dataStorage = global.window.ClinicalModules.dataStorage;
  assert.equal(dataStorage.getDataStorageSessionId(false), null);
  assert.equal(dataStorage.getDataStorageSessionId(true), 'session-id-1');
  assert.equal(dataStorage.getDataStorageSessionId(false), 'session-id-1');
});

test('data module reconstructs the persisted browser file after reload', async () => {
  global.window = { ClinicalModules: {}, ClinicalConstants: {} };
  delete require.cache[require.resolve('../js/results.js')];
  delete require.cache[require.resolve('../js/data.js')];
  require('../js/results.js');
  require('../js/data.js');

  const results = global.window.ClinicalModules.results;
  const data = global.window.ClinicalModules.data;
  const context = {
    pythonReady: false,
    schemaRows: [{ status: 'passed' }],
    qualityRows: [{ status: 'passed' }],
    resetDataCheckState: results.resetDataCheckState,
    async readPersistedDataFile() {
      return {
        name: 'dataset.parquet',
        type: 'application/octet-stream',
        lastModified: 1234,
        data: new Blob(['parquet-bytes']),
      };
    },
  };

  const restored = await data.restoreDataFileSession.call(context);

  assert.equal(restored, true);
  assert.equal(context.dataFile.name, 'dataset.parquet');
  assert.equal(context.dataFileSize, 13);
  assert.equal(context.schemaRunState, 'idle');
  assert.equal(context.qualityRunState, 'idle');
});
