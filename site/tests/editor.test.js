const test = require('node:test');
const assert = require('node:assert/strict');
const { t } = require('./test-i18n.js');

function loadEditorModule() {
  global.window = { ClinicalModules: {} };
  delete require.cache[require.resolve('../js/editor.js')];
  require('../js/editor.js');
  return global.window.ClinicalModules.editor;
}

test('editor module marks old contract drafts as expired', () => {
  const editor = loadEditorModule();
  const now = Date.UTC(2026, 0, 2);

  assert.equal(editor.isEditorSessionExpired({ savedAt: new Date(now).toISOString() }, now), false);
  assert.equal(
    editor.isEditorSessionExpired({ savedAt: new Date(now - editor.editorSessionMaxAgeMs - 1).toISOString() }, now),
    true
  );
  assert.equal(editor.isEditorSessionExpired({}, now), true);
});

test('editor module restores a non-expired contract draft', () => {
  const editor = loadEditorModule();
  const session = {
    yamlText: 'id: active-contract',
    yamlName: 'contract.yaml',
    editorView: 'yaml',
    schemaSection: 'quality',
    savedAt: new Date().toISOString(),
  };
  global.sessionStorage = {
    getItem() {
      return JSON.stringify(session);
    },
    removeItem() {},
  };
  const context = {
    t,
    yamlText: '',
    yamlName: '',
    editorView: 'schema',
    schemaSection: 'fundamentals',
    schemaStarted: false,
    editorStorageWarning: 'old warning',
    clearEditorSession: editor.clearEditorSession,
    isEditorSessionExpired: () => false,
    syncSchemaFromYaml() {},
  };

  editor.restoreEditorSession.call(context);

  assert.equal(context.yamlText, 'id: active-contract');
  assert.equal(context.yamlName, 'contract.yaml');
  assert.equal(context.editorView, 'yaml');
  assert.equal(context.schemaSection, 'quality');
  assert.equal(context.schemaStarted, true);
  assert.equal(context.editorStorageWarning, '');
});

test('editor module clears expired contract drafts', () => {
  const editor = loadEditorModule();
  let removedKey = '';
  global.sessionStorage = {
    getItem() {
      return JSON.stringify({ yamlText: 'id: expired', savedAt: '2020-01-01T00:00:00.000Z' });
    },
    removeItem(key) {
      removedKey = key;
    },
  };
  const context = {
    t,
    yamlText: '',
    editorStorageWarning: '',
    editorSessionKey: editor.editorSessionKey,
    clearEditorSession: editor.clearEditorSession,
    isEditorSessionExpired: () => true,
  };

  editor.restoreEditorSession.call(context);

  assert.equal(context.yamlText, '');
  assert.equal(removedKey, editor.editorSessionKey);
});

test('editor module exposes contract draft storage failures to the UI state', () => {
  const editor = loadEditorModule();
  global.sessionStorage = {
    setItem() {
      throw new Error('Quota exceeded');
    },
    removeItem() {},
  };
  const context = {
    t,
    yamlText: 'id: contract',
    yamlName: 'contract.yaml',
    editorView: 'schema',
    schemaSection: 'fundamentals',
    editorStorageWarning: '',
    clearEditorSession: editor.clearEditorSession,
  };

  editor.persistEditorSession.call(context);

  assert.match(context.editorStorageWarning, /Contract draft could not be stored.*Quota exceeded/);
});

test('editor module blocks contract imports until Python is ready', async () => {
  const editor = loadEditorModule();
  const context = {
    t,
    pythonReady: false,
    schemaParseWarning: '',
    async handleYamlFile() {
      throw new Error('YAML import should not run while Python is loading');
    },
  };
  const event = {
    target: {
      files: [{ name: 'contract.yaml' }],
      value: 'contract.yaml',
    },
  };

  await editor.importYaml.call(context, event);

  assert.equal(event.target.value, '');
  assert.match(context.schemaParseWarning, /Python runtime is still loading/);
});

test('editor module blocks the template selector until Python is ready', () => {
  const editor = loadEditorModule();
  const context = {
    t,
    pythonReady: false,
    schemaParseWarning: '',
    contractTemplateModalOpen: false,
  };

  editor.openContractTemplateModal.call(context);

  assert.equal(context.contractTemplateModalOpen, false);
  assert.match(context.schemaParseWarning, /Python runtime is still loading/);
});

test('editor module loads only the selected contract template', async () => {
  const editor = loadEditorModule();
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, async text() { return 'name: Example'; } });
  let dataLoads = 0;
  const context = {
    t,
    pythonReady: true,
    yamlText: '',
    yamlName: '',
    schemaStarted: false,
    editorView: 'yaml',
    contractTemplateModalOpen: true,
    applyLoadedContract: editor.applyLoadedContract,
    clearResults() {},
    syncSchemaFromYaml() {},
    setSchemaSection() {},
    persistEditorSession() {},
    loadDataFile() { dataLoads += 1; },
  };

  try {
    await editor.loadContractTemplate.call(context, {
      path: './examples/contract.yaml',
      fileName: 'template.yaml',
    });
  } finally {
    global.fetch = originalFetch;
  }

  assert.equal(context.yamlText, 'name: Example');
  assert.equal(context.yamlName, 'template.yaml');
  assert.equal(context.editorView, 'schema');
  assert.equal(context.contractTemplateModalOpen, false);
  assert.equal(dataLoads, 0);
});

test('editor module applies imported YAML through one shared loading path', () => {
  const editor = loadEditorModule();
  let syncCount = 0;
  let persistCount = 0;
  const context = {
    t,
    yamlText: '',
    yamlName: '',
    schemaStarted: false,
    editorView: 'yaml',
    clearResults() {},
    syncSchemaFromYaml() { syncCount += 1; },
    setSchemaSection(section) { this.schemaSection = section; },
    persistEditorSession() { persistCount += 1; },
  };

  editor.applyLoadedContract.call(context, 'name: Imported', 'imported.yaml');

  assert.equal(context.yamlText, 'name: Imported');
  assert.equal(context.yamlName, 'imported.yaml');
  assert.equal(context.schemaStarted, true);
  assert.equal(context.editorView, 'schema');
  assert.equal(context.schemaSection, 'fundamentals');
  assert.equal(syncCount, 1);
  assert.equal(persistCount, 1);
});
