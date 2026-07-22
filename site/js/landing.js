document.addEventListener('alpine:init', () => {
  const siteVersion = window.ClinicalContractVersion || '';

  Alpine.data('landingPage', () => ({
    switchOn: false,

    get siteVersionLabel() {
      return siteVersion ? `v${siteVersion}` : '';
    },

    init() {
      this.initTheme();
    },

    initTheme() {
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
  }));
});
