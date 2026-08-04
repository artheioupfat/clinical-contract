document.addEventListener('alpine:init', () => {
  const pageShell = window.ClinicalPageShell;

  Alpine.data('landingPage', () => ({
    switchOn: false,
    locale: '',
    siteVersionLabel: pageShell.versionLabel(window.ClinicalContractVersion),

    async init() {
      this.initThemeSwitch();
      await this.initLocale();
    },

    applyPageMetadata() {
      pageShell.setPageMetadata(this.t('landing.meta.title'), this.t('landing.meta.description'));
    },

    ...pageShell.themeMethods,
    ...pageShell.localeMethods,
  }));
});
