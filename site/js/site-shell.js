document.addEventListener('alpine:init', () => {
  const constants = window.ClinicalConstants || {};
  const themeStorageKey = constants.themeStorageKey || 'clinical-ui-dark';

  Alpine.data('siteShell', (activePage = 'home') => ({
    activePage,
    switchOn: false,

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

    navLinkClass(pageName) {
      return pageName === this.activePage
        ? 'site-nav-link site-nav-link--active'
        : 'site-nav-link';
    },
  }));
});
