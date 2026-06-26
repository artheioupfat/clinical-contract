const test = require('node:test');
const assert = require('node:assert/strict');

const catalog = require('../js/type-catalog.js');

test('type catalog exposes logical and physical options for the editor', () => {
  assert.deepEqual(catalog.logicalTypeOptions, ['string', 'date', 'integer', 'float', 'boolean']);
  assert.deepEqual(catalog.physicalTypeByLogical.integer, [
    'int8',
    'int16',
    'int32',
    'int64',
    'uint8',
    'uint16',
    'uint32',
    'uint64',
  ]);
  assert.ok(catalog.physicalTypeByLogical.string.includes('varchar'));
  assert.ok(catalog.physicalTypeByLogical.boolean.includes('binary'));
});
