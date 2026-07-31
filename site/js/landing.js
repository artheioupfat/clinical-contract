document.addEventListener('alpine:init', () => {
  const pageShell = window.ClinicalPageShell;

  Alpine.data('landingPage', () => ({
    switchOn: false,
    siteVersionLabel: pageShell.versionLabel(window.ClinicalContractVersion),

    init() {
      this.initThemeSwitch();
    },

    ...pageShell.themeMethods,
  }));
});
