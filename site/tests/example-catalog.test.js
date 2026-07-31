const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const siteRoot = path.resolve(__dirname, '..');
const examplesRoot = path.join(siteRoot, 'examples');
const catalog = require('../js/example-catalog.js');

function listExampleFiles(directory = examplesRoot) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listExampleFiles(absolutePath);
    return path.relative(examplesRoot, absolutePath).split(path.sep).join('/');
  });
}

function catalogPaths(entries) {
  return entries.map((entry) => decodeURIComponent(entry.path.replace(/^\.\/examples\//, ''))).sort();
}

test('generated example catalog matches every supported file in site/examples', () => {
  const files = listExampleFiles();
  const contracts = files.filter((file) => /\.ya?ml$/i.test(file)).sort();
  const datasets = files.filter((file) => /\.(csv|parquet)$/i.test(file)).sort();

  assert.deepEqual(catalogPaths(catalog.contractTemplates), contracts);
  assert.deepEqual(catalogPaths(catalog.dataTemplates), datasets);
});

test('generated example catalog uses unique stable identifiers', () => {
  const entries = [...catalog.contractTemplates, ...catalog.dataTemplates];
  const ids = entries.map((entry) => entry.id);

  assert.equal(new Set(ids).size, ids.length);
  assert.ok(entries.every((entry) => entry.name && entry.path && entry.fileName));
});
