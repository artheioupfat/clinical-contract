const test = require('node:test');
const assert = require('node:assert/strict');

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

test('editor module blocks template loading until Python is ready', async () => {
  const editor = loadEditorModule();
  const originalFetch = global.fetch;
  global.fetch = () => {
    throw new Error('Template fetch should not run while Python is loading');
  };
  const context = {
    pythonReady: false,
    schemaParseWarning: '',
  };

  try {
    await editor.loadExampleContract.call(context);
  } finally {
    global.fetch = originalFetch;
  }

  assert.match(context.schemaParseWarning, /Python runtime is still loading/);
});
