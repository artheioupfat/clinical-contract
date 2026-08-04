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

    localeMethods: {
      async initLocale() {
        try {
          this.locale = await root.ClinicalI18n.init();
        } catch (error) {
          console.error('Unable to initialize interface translations.', error);
          this.locale = root.ClinicalI18n.locale || 'en';
        }
        this.applyPageMetadata?.();
      },

      async setLocale(locale) {
        try {
          this.locale = await root.ClinicalI18n.setLocale(locale);
        } catch (error) {
          console.error(`Unable to switch interface language to ${locale}.`, error);
          this.locale = root.ClinicalI18n.locale || 'en';
        }
        this.applyPageMetadata?.();
        await this.onLocaleChanged?.();
      },

      t(key, params = {}) {
        void this.locale;
        return root.ClinicalI18n.t(key, params);
      },
    },

    setPageMetadata(title, description = '') {
      if (title) document.title = title;
      const meta = document.querySelector('meta[name="description"]');
      if (meta && description) meta.setAttribute('content', description);
    },
  };

  root.ClinicalPageShell = pageShell;

  if (typeof module !== 'undefined') {
    module.exports = pageShell;
  }
})(typeof window !== 'undefined' ? window : globalThis);
