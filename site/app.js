document.addEventListener('alpine:init', () => {
  const constants = window.ClinicalConstants || {};
  const pageShell = window.ClinicalPageShell || {};
  const exampleCatalog = window.ClinicalExampleCatalog || {};
  const typeCatalog = window.ClinicalTypeCatalog || {};
  const siteVersion = window.ClinicalContractVersion || '';
  const contractCodec = window.ClinicalContractCodec;
  const previewPageSize = Number(constants.previewPageSize) || 50;
  const modules = window.ClinicalModules || {};
  const ui = modules.ui || {};
  const runtime = modules.runtime || {};
  const editor = modules.editor || {};
  const data = modules.data || {};
  const dataStorage = modules.dataStorage || {};
  const results = modules.results || {};
  const schema = modules.schema || {};

  if (!contractCodec?.createEmptyDraft || !pageShell.versionLabel) {
    throw new Error('Required editor modules were not loaded before app.js.');
  }

  Alpine.data('clinicalApp', () => ({
    yamlText: '',
    yamlName: '',
    yamlNameGenerated: false,
    editorStorageWarning: '',
    editorView: 'schema',
    schemaStarted: false,
    schemaParseWarning: '',
    showRequiredHints: false,
    schemaRowCounter: 0,
    schemaSection: 'fundamentals',
    schemaSections: [
      { id: 'fundamentals', titleKey: 'editor.sections.fundamentals' },
      { id: 'schema', titleKey: 'editor.sections.schema' },
      { id: 'quality', titleKey: 'editor.sections.quality' },
      { id: 'team', titleKey: 'editor.sections.team' },
    ],
    schemaRootExtras: {},
    schemaOtherSchemas: [],
    columnEditorRowId: null,
    qualityEditorRuleId: null,
    teamEditorMemberId: null,
    resetContractModalOpen: false,
    contractTemplateModalOpen: false,
    dataTemplateModalOpen: false,
    contractTemplates: exampleCatalog.contractTemplates || [],
    dataTemplates: exampleCatalog.dataTemplates || [],
    logicalTypeOptions: typeCatalog.logicalTypeOptions || [],
    physicalTypeByLogical: typeCatalog.physicalTypeByLogical || {},
    schemaDraft: contractCodec.createEmptyDraft(),
    dataFile: null,
    dataFileName: '',
    dataFileSize: 0,
    dataColumns: null,
    dataRows: null,
    dataStorageWarning: '',
    draggingData: false,
    busy: false,
    pythonReady: false,
    dataTab: 'data',
    validateRows: [],
    schemaRows: [],
    qualityRows: [],
    validateRunState: 'idle',
    schemaRunState: 'idle',
    qualityRunState: 'idle',
    validateDurationMs: null,
    checkDurationMs: null,
    previewColumns: [],
    previewRows: [],
    previewTotalRows: 0,
    previewPage: 1,
    previewPageSizeDefault: previewPageSize,
    previewPageSize: previewPageSize,
    previewTotalPages: 0,
    previewLoading: false,
    previewError: '',
    previewHandle: null,
    switchOn: false,
    locale: '',
    runtimeProgress: 0,
    showRuntimeProgress: true,
    runtimeProgressInterval: null,
    runtimeBridgePoll: null,
    runtimeFailureTimer: null,
    runtimeError: '',
    runtimeErrorHandlersRegistered: false,
    splitPercent: 58,
    splitDragging: false,
    checkerCollapsed: false,
    splitMoveHandler: null,
    splitEndHandler: null,
    logoVariant: 'neutral',
    logoErrored: false,

    siteVersionLabel: pageShell.versionLabel(siteVersion),

    applyPageMetadata() {
      pageShell.setPageMetadata(this.t('editor.meta.title'), this.t('editor.meta.description'));
    },

    get logoSrc() {
      if (this.logoErrored) return '';
      if (this.logoVariant === 'green') return './logo/phare_vert.png';
      if (this.logoVariant === 'red') return './logo/phare_red.png';
      return './logo/phare.png';
    },

    get logoAlt() {
      if (this.logoVariant === 'green') return 'Green lighthouse';
      if (this.logoVariant === 'red') return 'Red lighthouse';
      return 'Lighthouse';
    },

    get lineNumbers() {
      const count = Math.max(1, this.yamlText.split('\n').length);
      return Array.from({ length: count }, (_, i) => i + 1);
    },

    get previewStartRow() {
      if (!this.previewTotalRows || !this.previewRows.length) return 0;
      return (this.previewPage - 1) * this.previewPageSize + 1;
    },

    get previewEndRow() {
      if (!this.previewTotalRows || !this.previewRows.length) return 0;
      return this.previewStartRow + this.previewRows.length - 1;
    },

    get previewPageItems() {
      const total = this.previewTotalPages;
      const current = this.previewPage;
      if (!total || total <= 0) return [];
      if (total <= 7) return Array.from({ length: total }, (_, idx) => idx + 1);

      const pages = new Set([1, total, current - 1, current, current + 1]);
      const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
      const items = [];
      for (let i = 0; i < sorted.length; i += 1) {
        const page = sorted[i];
        if (i > 0 && page - sorted[i - 1] > 1) {
          items.push('ellipsis');
        }
        items.push(page);
      }
      return items;
    },

    async init() {
      this.initThemeSwitch();
      await this.initLocale();
      this.initSplitPane();
      this.restoreEditorSession();
      this.registerEditorSessionPersistence();
      this.registerRuntimeErrorHandlers();
      this.startRuntimeProgress();

      window.addEventListener('clinical-python-ready', async () => {
        const wasReady = this.pythonReady;
        this.onPythonRuntimeReady();
        if (!wasReady && this.dataFile) {
          await this.refreshDataInsights();
        }
      });

      window.addEventListener('beforeunload', () => {
        this.persistEditorSession();
        this.releasePreviewSession();
        this.destroySplitPane();
      });

      this.runtimeBridgePoll = window.setInterval(async () => {
        if (this.pythonReady) return;
        if (typeof window.pyValidateContract === 'function') {
          this.onPythonRuntimeReady();
          if (this.dataFile) await this.refreshDataInsights();
        }
      }, 250);

      if (!this.pythonReady && typeof window.pyValidateContract === 'function') {
        this.onPythonRuntimeReady();
      }

      await this.restoreDataFileSession();
    },

    ...(pageShell.themeMethods || {}),
    ...(pageShell.localeMethods || {}),
    ...ui,
    ...runtime,
    ...editor,
    ...schema,
    ...dataStorage,
    ...data,
    ...results,
  }));
});
