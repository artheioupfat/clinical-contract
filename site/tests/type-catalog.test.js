const test = require('node:test');
const assert = require('node:assert/strict');

const catalog = require('../js/type-catalog.js');

test('type catalog exposes logical and physical options for the editor', () => {
  assert.deepEqual(catalog.logicalTypeOptions, [
    'string',
    'date',
    'time',
    'interval',
    'array',
    'integer',
    'float',
    'decimal',
    'boolean',
  ]);
  assert.deepEqual(catalog.physicalTypeByLogical.date, [
    'datetime',
    'timestamp',
    'timestamp with timezone',
  ]);
  assert.deepEqual(catalog.physicalTypeByLogical.time, ['time']);
  assert.deepEqual(catalog.physicalTypeByLogical.interval, ['interval']);
  assert.deepEqual(catalog.physicalTypeByLogical.array, ['array']);
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
  assert.deepEqual(catalog.physicalTypeByLogical.decimal, ['decimal']);
  assert.ok(catalog.physicalTypeByLogical.string.includes('varchar'));
  assert.deepEqual(catalog.physicalTypeByLogical.boolean, ['boolean', 'binary']);
});
