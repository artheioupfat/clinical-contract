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

test('data module deletes the current file and clears dataset-dependent state', () => {
  global.window = { ClinicalModules: {}, ClinicalConstants: {} };
  delete require.cache[require.resolve('../js/data.js')];
  require('../js/data.js');

  const data = global.window.ClinicalModules.data;
  let released = 0;
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
    activeTab: 'preview',
    logoVariant: 'green',
    $refs: { dataInput: input },
    releasePreviewSession() {
      released += 1;
    },
    clearPreviewData() {
      this.previewRows = [];
    },
  };

  data.deleteDataFile.call(context);

  assert.equal(released, 1);
  assert.equal(context.dataFile, null);
  assert.equal(context.dataFileName, '');
  assert.equal(context.dataFileSize, 0);
  assert.equal(context.dataColumns, null);
  assert.equal(context.dataRows, null);
  assert.deepEqual(context.schemaRows, []);
  assert.deepEqual(context.qualityRows, []);
  assert.equal(context.activeTab, 'validate');
  assert.equal(context.logoVariant, 'neutral');
  assert.equal(input.value, '');
});
