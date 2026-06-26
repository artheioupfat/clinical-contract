const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('pyscript config ships every browser-required clinical_contract module', () => {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const pyscriptConfig = fs.readFileSync(path.join(repoRoot, 'site', 'pyscript.toml'), 'utf8');

  for (const moduleName of ['__init__', 'contract', 'loader', 'models', 'type_catalog']) {
    assert.match(
      pyscriptConfig,
      new RegExp(`clinical_contract/${moduleName}\\.py`),
      `${moduleName}.py must be listed in site/pyscript.toml`
    );
  }
});
