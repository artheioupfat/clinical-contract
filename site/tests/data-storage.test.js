const test = require('node:test');
const assert = require('node:assert/strict');

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
