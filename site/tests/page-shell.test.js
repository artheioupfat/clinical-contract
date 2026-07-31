const test = require('node:test');
const assert = require('node:assert/strict');

function loadPageShell(storage = {}) {
  global.localStorage = storage;
  delete require.cache[require.resolve('../js/page-shell.js')];
  return require('../js/page-shell.js');
}

test('page shell formats the shared site version label', () => {
  const shell = loadPageShell();

  assert.equal(shell.versionLabel('0.1.8'), 'v0.1.8');
  assert.equal(shell.versionLabel(''), '');
});

test('page shell shares and persists theme behavior across pages', () => {
  let storedValue = '1';
  const shell = loadPageShell({
    getItem(key) {
      assert.equal(key, 'clinical-ui-dark');
      return storedValue;
    },
    setItem(key, value) {
      assert.equal(key, 'clinical-ui-dark');
      storedValue = value;
    },
  });
  const context = { switchOn: false };

  shell.themeMethods.initThemeSwitch.call(context);
  assert.equal(context.switchOn, true);

  shell.themeMethods.toggleThemeSwitch.call(context);
  assert.equal(context.switchOn, false);
  assert.equal(storedValue, '0');
});
