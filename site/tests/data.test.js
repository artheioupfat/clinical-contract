const test = require('node:test');
const assert = require('node:assert/strict');
const { t } = require('./test-i18n.js');

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
    t,
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
    t,
    pythonReady: true,
    schemaRows: [{ status: 'passed' }],
    qualityRows: [{ status: 'passed' }],
    schemaRunState: 'passed',
    qualityRunState: 'passed',
    resetDataCheckState: results.resetDataCheckState,
    async persistDataFilesSession(value) {
      persisted = [...value];
    },
    async refreshDataInsights() {
      refreshed += 1;
    },
  };

  await data.loadDataFiles.call(context, [file]);

  assert.deepEqual(persisted, [file]);
  assert.equal(refreshed, 1);
  assert.equal(context.dataFileName, 'dataset.csv');
  assert.equal(context.schemaRunState, 'idle');
  assert.equal(context.qualityRunState, 'idle');
});

test('data module keeps one file per schema name and selects the latest file', async () => {
  const { data, results } = loadResultsAndDataModules();
  const orders = new File(['orders'], 'orders.parquet');
  const lines = new File(['lines'], 'line_items.csv');
  let persisted = [];
  const context = {
    t,
    pythonReady: true,
    dataFiles: [],
    schemaRows: [],
    qualityRows: [],
    resetDataCheckState: results.resetDataCheckState,
    async persistDataFilesSession(files) { persisted = [...files]; },
    async refreshDataInsights() {},
  };

  await data.loadDataFiles.call(context, [orders, lines]);

  assert.deepEqual(context.dataFiles.map((file) => file.name), [
    'orders.parquet',
    'line_items.csv',
  ]);
  assert.equal(context.dataFileName, 'line_items.csv');
  assert.deepEqual(persisted.map((file) => file.name), [
    'orders.parquet',
    'line_items.csv',
  ]);
});

test('data module replaces duplicate schema sources instead of appending them', async () => {
  const { data, results } = loadResultsAndDataModules();
  const oldOrders = new File(['old'], 'orders.csv');
  const newOrders = new File(['new'], 'orders.parquet');
  const context = {
    t,
    pythonReady: true,
    dataFiles: [oldOrders],
    schemaRows: [],
    qualityRows: [],
    resetDataCheckState: results.resetDataCheckState,
    async persistDataFilesSession() {},
    async refreshDataInsights() {},
  };

  await data.loadDataFiles.call(context, [newOrders]);

  assert.deepEqual(context.dataFiles.map((file) => file.name), ['orders.parquet']);
});

test('data module exposes browser storage failures to the UI state', async () => {
  const { data, results } = loadResultsAndDataModules();
  const file = new File(['id\n1'], 'dataset.csv', { type: 'text/csv' });
  const originalWarn = console.warn;
  console.warn = () => {};
  const context = {
    t,
    pythonReady: true,
    schemaRows: [],
    qualityRows: [],
    dataStorageWarning: '',
    resetDataCheckState: results.resetDataCheckState,
    async persistDataFilesSession() {
      throw new Error('Quota exceeded');
    },
    async refreshDataInsights() {},
  };

  try {
    await data.loadDataFiles.call(context, [file]);

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
    t,
    pythonReady: false,
    dataStorageWarning: '',
    async persistDataFilesSession() {
      persisted += 1;
    },
  };

  const loaded = await data.loadDataFiles.call(context, [file]);

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
    t,
    pythonReady: true,
    busy: false,
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

test('data module loads one selected sample without modifying the contract', async () => {
  const { data } = loadResultsAndDataModules();
  const originalFetch = global.fetch;
  let fetchOptions = null;
  global.fetch = async (_path, options) => {
    fetchOptions = options;
    return {
      ok: true,
      async arrayBuffer() { return new TextEncoder().encode('sample').buffer; },
    };
  };
  let loadedFiles = [];
  const context = {
    t,
    pythonReady: true,
    busy: false,
    yamlText: 'name: Existing contract',
    dataTemplateModalOpen: true,
    async loadDataFiles(files) { loadedFiles = files; },
  };

  try {
    await data.loadDataTemplates.call(context, [{
      path: './examples/template.parquet',
      fileName: 'template.parquet',
      mimeType: 'application/octet-stream',
    }]);
  } finally {
    global.fetch = originalFetch;
  }

  assert.equal(loadedFiles.length, 1);
  assert.equal(loadedFiles[0].name, 'template.parquet');
  assert.equal(context.yamlText, 'name: Existing contract');
  assert.equal(context.dataTemplateModalOpen, false);
  assert.deepEqual(fetchOptions, { cache: 'no-cache' });
});

test('data template modal toggles selections without loading files', () => {
  const { data } = loadResultsAndDataModules();
  const context = {
    t,
    pythonReady: true,
    dataStorageWarning: '',
    dataTemplateModalOpen: false,
    selectedDataTemplateIds: ['stale-template'],
  };

  data.openDataTemplateModal.call(context);
  assert.equal(context.dataTemplateModalOpen, true);
  assert.deepEqual(context.selectedDataTemplateIds, []);

  data.toggleDataTemplateSelection.call(context, 'patients');
  data.toggleDataTemplateSelection.call(context, 'covid');
  assert.deepEqual(context.selectedDataTemplateIds, ['patients', 'covid']);
  assert.equal(data.isDataTemplateSelected.call(context, 'patients'), true);

  data.toggleDataTemplateSelection.call(context, 'patients');
  assert.deepEqual(context.selectedDataTemplateIds, ['covid']);
});

test('data template modal loads all selected samples after confirmation', async () => {
  const { data } = loadResultsAndDataModules();
  const originalFetch = global.fetch;
  const fetchedPaths = [];
  global.fetch = async (path) => {
    fetchedPaths.push(path);
    return {
      ok: true,
      async arrayBuffer() { return new TextEncoder().encode(path).buffer; },
    };
  };
  let loadedFiles = [];
  const context = {
    t,
    pythonReady: true,
    dataTemplateModalOpen: true,
    selectedDataTemplateIds: ['patients', 'covid'],
    dataTemplates: [
      { id: 'patients', path: './examples/patients.csv', fileName: 'patients.csv', mimeType: 'text/csv' },
      { id: 'covid', path: './examples/covid.csv', fileName: 'covid.csv', mimeType: 'text/csv' },
      { id: 'other', path: './examples/other.csv', fileName: 'other.csv', mimeType: 'text/csv' },
    ],
    async loadDataFiles(files) { loadedFiles = files; },
  };

  try {
    await data.confirmDataTemplateSelection.call(context);
  } finally {
    global.fetch = originalFetch;
  }

  assert.deepEqual(fetchedPaths, ['./examples/patients.csv', './examples/covid.csv']);
  assert.deepEqual(loadedFiles.map((file) => file.name), ['patients.csv', 'covid.csv']);
  assert.equal(context.dataTemplateModalOpen, false);
  assert.deepEqual(context.selectedDataTemplateIds, []);
});

test('data module reconstructs the persisted browser file after reload', async () => {
  const { data, results } = loadResultsAndDataModules();
  let pruned = 0;
  const context = {
    t,
    pythonReady: false,
    schemaRows: [{ status: 'passed' }],
    qualityRows: [{ status: 'passed' }],
    resetDataCheckState: results.resetDataCheckState,
    async pruneExpiredDataFileSessions() {
      pruned += 1;
    },
    async readPersistedDataFiles() {
      return [{
        name: 'dataset.parquet',
        type: 'application/octet-stream',
        lastModified: 1234,
        data: new Blob(['parquet-bytes']),
      }];
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
