const test = require('node:test');
const assert = require('node:assert/strict');

function loadUiModule() {
  global.window = { ClinicalModules: {} };
  global.document = {
    body: {
      classList: {
        remove() {},
      },
    },
  };
  delete require.cache[require.resolve('../js/ui.js')];
  require('../js/ui.js');
  return global.window.ClinicalModules.ui;
}

test('ui module expands the editor grid when checker is collapsed', () => {
  const ui = loadUiModule();

  assert.equal(ui.appGridClass.call({ checkerCollapsed: false, editorView: 'validation' }), 'app-grid');
  assert.equal(
    ui.appGridClass.call({ schemaStarted: true, checkerCollapsed: true, editorView: 'schema' }),
    'app-grid app-grid--checker-collapsed'
  );
  assert.equal(
    ui.appGridClass.call({ schemaStarted: true, checkerCollapsed: false, editorView: 'schema' }),
    'app-grid app-grid--schema'
  );
});

test('ui module stops split dragging when checker is collapsed', () => {
  const ui = loadUiModule();
  const context = {
    checkerCollapsed: false,
    splitDragging: true,
  };

  ui.toggleCheckerPanel.call(context);

  assert.equal(context.checkerCollapsed, true);
  assert.equal(context.splitDragging, false);
});

test('ui module styles checker modes with the shared view switch', () => {
  const ui = loadUiModule();

  assert.equal(ui.dataModeButtonClass.call({ dataTab: 'data' }, 'data'), 'view-switch-btn view-switch-btn--active');
  assert.equal(ui.dataModeButtonClass.call({ dataTab: 'data' }, 'schema'), 'view-switch-btn');
});
