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
            examples: ['1001', '1002'],
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
  assert.equal(draft.properties[0].examplesText, '1001\n1002');
  assert.equal(draft.properties[0].extras.xColumn, 'kept');
  assert.equal(Object.prototype.hasOwnProperty.call(draft.properties[0].extras, 'examples'), false);

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
  assert.deepEqual(property.examples, ['1001', '1002']);
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

test('draftToContractObject keeps hidden technical metadata and derives id from name', () => {
  const draft = codec.createEmptyDraft();
  draft.apiVersion = '';
  draft.kind = '';
  draft.id = '';
  draft.name = 'Emergency Care Export';
  draft.version = '2.0.0';
  draft.status = 'inactive';

  const contract = codec.draftToContractObject(draft);

  assert.equal(contract.apiVersion, 'v3.1.0');
  assert.equal(contract.kind, 'DataContract');
  assert.equal(contract.id, 'emergency-care-export');
  assert.equal(contract.name, 'Emergency Care Export');
  assert.equal(contract.version, '2.0.0');
  assert.equal(contract.status, 'inactive');
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
