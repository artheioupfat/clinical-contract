const test = require('node:test');
const assert = require('node:assert/strict');

function loadResultsAndDataModules() {
  global.window = { ClinicalModules: {}, ClinicalConstants: {} };
  delete require.cache[require.resolve('../js/results.js')];
  delete require.cache[require.resolve('../js/data.js')];
  require('../js/results.js');
  require('../js/data.js');
  return {
    data: global.window.ClinicalModules.data,
    results: global.window.ClinicalModules.results,
  };
}

test('data module deletes the current file and clears dataset-dependent state', () => {
  const { data, results } = loadResultsAndDataModules();
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
    dataTab: 'schema',
    validateRunState: 'passed',
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
  assert.equal(context.dataTab, 'data');
  assert.equal(context.logoVariant, 'green');
  assert.equal(input.value, '');
});

test('data module persists each loaded file before refreshing insights', async () => {
  const { data, results } = loadResultsAndDataModules();
  const file = new File(['id\n1'], 'dataset.csv', { type: 'text/csv' });
  let persisted = null;
  let refreshed = 0;
  const context = {
    pythonReady: true,
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

test('data module exposes browser storage failures to the UI state', async () => {
  const { data, results } = loadResultsAndDataModules();
  const file = new File(['id\n1'], 'dataset.csv', { type: 'text/csv' });
  const originalWarn = console.warn;
  console.warn = () => {};
  const context = {
    pythonReady: true,
    schemaRows: [],
    qualityRows: [],
    dataStorageWarning: '',
    resetDataCheckState: results.resetDataCheckState,
    async persistDataFileSession() {
      throw new Error('Quota exceeded');
    },
    async refreshDataInsights() {},
  };

  try {
    await data.loadDataFile.call(context, file);

    assert.equal(context.dataFile, file);
    assert.match(context.dataStorageWarning, /browser storage failed: Quota exceeded/);
  } finally {
    console.warn = originalWarn;
  }
});

test('data module rejects new files until the Python runtime is ready', async () => {
  const { data } = loadResultsAndDataModules();
  const file = new File(['id\n1'], 'dataset.csv', { type: 'text/csv' });
  let persisted = 0;
  const context = {
    pythonReady: false,
    dataStorageWarning: '',
    async persistDataFileSession() {
      persisted += 1;
    },
  };

  const loaded = await data.loadDataFile.call(context, file);

  assert.equal(loaded, false);
  assert.equal(persisted, 0);
  assert.equal(context.dataFile, undefined);
  assert.match(context.dataStorageWarning, /Python runtime is still loading/);
});

test('data module always clears a stale local preview handle', () => {
  const { data } = loadResultsAndDataModules();
  const context = { previewHandle: 'preview-1' };

  data.releasePreviewSession.call(context);

  assert.equal(context.previewHandle, null);
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

test('data module loads the selected sample without modifying the contract', async () => {
  const { data } = loadResultsAndDataModules();
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    async arrayBuffer() { return new TextEncoder().encode('sample').buffer; },
  });
  let loadedFile = null;
  const context = {
    pythonReady: true,
    yamlText: 'name: Existing contract',
    dataTemplateModalOpen: true,
    async loadDataFile(file) { loadedFile = file; },
  };

  try {
    await data.loadDataTemplate.call(context, {
      path: './examples/template.parquet',
      fileName: 'template.parquet',
      mimeType: 'application/octet-stream',
    });
  } finally {
    global.fetch = originalFetch;
  }

  assert.equal(loadedFile.name, 'template.parquet');
  assert.equal(context.yamlText, 'name: Existing contract');
  assert.equal(context.dataTemplateModalOpen, false);
});

test('data module reconstructs the persisted browser file after reload', async () => {
  const { data, results } = loadResultsAndDataModules();
  let pruned = 0;
  const context = {
    pythonReady: false,
    schemaRows: [{ status: 'passed' }],
    qualityRows: [{ status: 'passed' }],
    resetDataCheckState: results.resetDataCheckState,
    async pruneExpiredDataFileSessions() {
      pruned += 1;
    },
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
  assert.equal(pruned, 1);
  assert.equal(context.dataFile.name, 'dataset.parquet');
  assert.equal(context.dataFileSize, 13);
  assert.equal(context.schemaRunState, 'idle');
  assert.equal(context.qualityRunState, 'idle');
});
