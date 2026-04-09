window.ClinicalModules = window.ClinicalModules || {};

window.ClinicalModules.ui = (() => {
  const themeStorageKey =
    (window.ClinicalConstants && window.ClinicalConstants.themeStorageKey) || 'clinical-ui-dark';

  return {
    initThemeSwitch() {
      try {
        this.switchOn = localStorage.getItem(themeStorageKey) === '1';
      } catch (_error) {
        this.switchOn = false;
      }

      this.applyThemeToDocument();
    },

    toggleThemeSwitch() {
      this.switchOn = !this.switchOn;
      try {
        localStorage.setItem(themeStorageKey, this.switchOn ? '1' : '0');
      } catch (_error) {
        // Ignore storage failures.
      }

      this.applyThemeToDocument();
    },

    applyThemeToDocument() {
      document.documentElement.classList.toggle('dark', this.switchOn);
    },

    syncEditorScroll(event) {
      const gutter = event.target.previousElementSibling;
      if (gutter) gutter.scrollTop = event.target.scrollTop;
    },

    handleLogoError(event) {
      this.logoErrored = true;
      if (event?.target) event.target.style.display = 'none';
    },

    setLogoSuccess() {
      this.logoVariant = 'green';
    },

    setLogoFailure() {
      this.logoVariant = 'red';
    },
  };
})();
