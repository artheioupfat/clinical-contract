(function registerPageShell(root) {
  const themeStorageKey = 'clinical-ui-dark';

  function readDarkMode() {
    try {
      return localStorage.getItem(themeStorageKey) === '1';
    } catch (_error) {
      return false;
    }
  }

  function writeDarkMode(enabled) {
    try {
      localStorage.setItem(themeStorageKey, enabled ? '1' : '0');
    } catch (_error) {
      // The theme remains active for the current page when storage is unavailable.
    }
  }

  const pageShell = {
    versionLabel(version) {
      return version ? `v${version}` : '';
    },

    themeMethods: {
      initThemeSwitch() {
        this.switchOn = readDarkMode();
      },

      toggleThemeSwitch() {
        this.switchOn = !this.switchOn;
        writeDarkMode(this.switchOn);
      },
    },
  };

  root.ClinicalPageShell = pageShell;

  if (typeof module !== 'undefined') {
    module.exports = pageShell;
  }
})(typeof window !== 'undefined' ? window : globalThis);
