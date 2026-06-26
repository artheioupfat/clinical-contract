window.ClinicalModules = window.ClinicalModules || {};

window.ClinicalModules.ui = {
  splitMin: 35,
  splitMax: 75,
  splitDefault: 58,

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

  initSplitPane() {
    try {
      const saved = Number(localStorage.getItem('clinical-ui-split'));
      if (Number.isFinite(saved)) {
        this.splitPercent = this.clampSplitPercent(saved);
      }
    } catch (_error) {
      this.splitPercent = this.splitDefault;
    }

    this.splitMoveHandler = (event) => this.onSplitResize(event);
    this.splitEndHandler = () => this.stopSplitResize();
    window.addEventListener('pointermove', this.splitMoveHandler);
    window.addEventListener('pointerup', this.splitEndHandler);
    window.addEventListener('pointercancel', this.splitEndHandler);
  },

  destroySplitPane() {
    if (this.splitMoveHandler) {
      window.removeEventListener('pointermove', this.splitMoveHandler);
    }
    if (this.splitEndHandler) {
      window.removeEventListener('pointerup', this.splitEndHandler);
      window.removeEventListener('pointercancel', this.splitEndHandler);
    }
    document.body.classList.remove('is-resizing-split');
  },

  clampSplitPercent(value) {
    return Math.min(this.splitMax, Math.max(this.splitMin, Number(value) || this.splitDefault));
  },

  splitGridStyle() {
    return `--editor-pane:${this.splitPercent}%;`;
  },

  appGridClass() {
    if (!this.schemaStarted) return 'app-grid app-grid--onboarding';
    if (this.checkerCollapsed) return 'app-grid app-grid--checker-collapsed';
    if (this.editorView === 'schema') return 'app-grid app-grid--schema';
    return 'app-grid';
  },

  toggleCheckerPanel() {
    this.checkerCollapsed = !this.checkerCollapsed;
    if (this.checkerCollapsed) {
      this.splitDragging = false;
      document.body.classList.remove('is-resizing-split');
    }
  },

  startSplitResize(event) {
    if (this.checkerCollapsed) return;
    if (window.matchMedia('(max-width: 1023px)').matches) return;
    this.splitDragging = true;
    document.body.classList.add('is-resizing-split');
    this.updateSplitFromPointer(event);
  },

  onSplitResize(event) {
    if (!this.splitDragging) return;
    event.preventDefault();
    this.updateSplitFromPointer(event);
  },

  stopSplitResize() {
    if (!this.splitDragging) return;
    this.splitDragging = false;
    document.body.classList.remove('is-resizing-split');
    this.persistSplitPane();
  },

  updateSplitFromPointer(event) {
    const grid = this.$refs?.appGrid;
    if (!grid) return;
    const rect = grid.getBoundingClientRect();
    if (!rect.width) return;
    this.splitPercent = this.clampSplitPercent(((event.clientX - rect.left) / rect.width) * 100);
  },

  persistSplitPane() {
    try {
      localStorage.setItem('clinical-ui-split', String(Math.round(this.splitPercent)));
    } catch (_error) {
      // Ignore storage failures.
    }
  },

  resetSplitPane() {
    this.splitPercent = this.splitDefault;
    this.persistSplitPane();
  },

  handleSplitKeydown(event) {
    const step = event.shiftKey ? 5 : 2;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.splitPercent = this.clampSplitPercent(this.splitPercent - step);
      this.persistSplitPane();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.splitPercent = this.clampSplitPercent(this.splitPercent + step);
      this.persistSplitPane();
    } else if (event.key === 'Home') {
      event.preventDefault();
      this.splitPercent = this.splitMin;
      this.persistSplitPane();
    } else if (event.key === 'End') {
      event.preventDefault();
      this.splitPercent = this.splitMax;
      this.persistSplitPane();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.resetSplitPane();
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
