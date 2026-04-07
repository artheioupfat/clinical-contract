window.ClinicalModules = window.ClinicalModules || {};

window.ClinicalModules.ui = {
  initThemeSwitch() {
    try {
      this.switchOn = localStorage.getItem('clinical-ui-dark') === '1';
    } catch (_error) {
      this.switchOn = false;
    }
  },

  toggleThemeSwitch() {
    this.switchOn = !this.switchOn;
    try {
      localStorage.setItem('clinical-ui-dark', this.switchOn ? '1' : '0');
    } catch (_error) {
      // Ignore storage failures.
    }
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
