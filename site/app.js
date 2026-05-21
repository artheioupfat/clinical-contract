document.addEventListener('alpine:init', () => {
  const constants = window.ClinicalConstants || {};
  const messages = constants.messages || {};
  const previewPageSize = Number(constants.previewPageSize) || 50;
  const modules = window.ClinicalModules || {};
  const ui = modules.ui || {};
  const runtime = modules.runtime || {};
  const editor = modules.editor || {};
  const data = modules.data || {};
  const results = modules.results || {};
  const schema = modules.schema || {};

  Alpine.data('clinicalApp', () => ({
    yamlText: '',
    yamlName: '',
    editorView: 'schema',
    schemaStarted: false,
    schemaParseWarning: '',
    showRequiredHints: false,
    schemaRowCounter: 0,
    schemaSection: 'fundamentals',
    schemaSections: [
      { id: 'fundamentals', title: 'Fundamentals' },
      { id: 'schema', title: 'Schema' },
      { id: 'quality', title: 'Quality' },
      { id: 'team', title: 'Team' },
    ],
    schemaRootExtras: {},
    schemaOtherSchemas: [],
    columnEditorRowId: null,
    qualityEditorRuleId: null,
    teamEditorMemberId: null,
    resetContractModalOpen: false,
    logicalTypeOptions: [
      'string',
      'date',
      'integer',
      'float',
      'boolean',
    ],
    physicalTypeByLogical: {
      string: ['varchar', 'text', 'string', 'char'],
      date: ['timestamp', 'datetime'],
      integer: ['int8', 'int16', 'int32', 'int64', 'uint8', 'uint16', 'uint32', 'uint64'],
      float: ['float32', 'float64'],
      boolean: ['binary'],
    },
    schemaDraft: {
      apiVersion: 'v3.1.0',
      kind: 'DataContract',
      id: '',
      name: '',
      version: '1.0.0',
      status: 'active',
      descriptionPurpose: '',
      descriptionUsage: '',
      descriptionLimitations: '',
      tableName: '',
      tableDescription: '',
      properties: [],
      qualityRules: [],
      teamName: '',
      teamDescription: '',
      teamMembers: [],
      teamExtras: {},
      tableExtras: {},
    },
    dataFile: null,
    dataFileName: '',
    dataFileSize: 0,
    dataColumns: null,
    dataRows: null,
    draggingData: false,
    busy: false,
    pythonReady: false,
    activeTab: 'validate',
    validateRows: [],
    schemaRows: [],
    qualityRows: [],
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
    runtimeProgress: 0,
    showRuntimeProgress: true,
    runtimeProgressInterval: null,
    runtimeBridgePoll: null,
    runtimeFailureTimer: null,
    runtimeError: '',
    runtimeErrorHandlersRegistered: false,
    splitPercent: 58,
    splitDragging: false,
    splitMoveHandler: null,
    splitEndHandler: null,
    logoVariant: 'neutral',
    logoErrored: false,

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

    get runtimeProgressLabel() {
      if (this.runtimeError) {
        return messages.runtimeFailed || 'Python runtime error';
      }
      return this.pythonReady
        ? messages.runtimeReady || 'Python runtime ready'
        : messages.runtimeLoading || 'Loading Python runtime...';
    },

    get validateTabState() {
      if (!this.validateRows.length) return 'idle';
      return this.validateRows.some((row) => row.status === 'failed') ? 'failed' : 'passed';
    },

    get schemaTabState() {
      if (!this.schemaRows.length) return 'idle';
      return this.schemaRows.some((row) => row.status === 'failed') ? 'failed' : 'passed';
    },

    get qualityTabState() {
      if (!this.qualityRows.length) return 'idle';
      return this.qualityRows.some((row) => row.status === 'failed' || row.status === 'error')
        ? 'failed'
        : 'passed';
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
      this.initSplitPane();
      this.restoreEditorSession();
      this.registerEditorSessionPersistence();
      this.registerRuntimeErrorHandlers();
      this.startRuntimeProgress();

      window.addEventListener('clinical-python-ready', async () => {
        this.onPythonRuntimeReady();
        if (this.dataFile) {
          await this.refreshDataInsights();
        }
      });

      window.addEventListener('beforeunload', () => {
        this.persistEditorSession();
        this.releasePreviewSession();
        this.destroySplitPane();
      });

      this.runtimeBridgePoll = window.setInterval(() => {
        if (this.pythonReady) return;
        if (typeof window.pyValidateContract === 'function') {
          this.onPythonRuntimeReady();
        }
      }, 250);

      if (typeof window.pyValidateContract === 'function') {
        this.onPythonRuntimeReady();
      }

      if (typeof this.syncSchemaFromYaml === 'function') {
        this.syncSchemaFromYaml({ preserveCurrentOnError: false });
      }
    },

    ...ui,
    ...runtime,
    ...editor,
    ...schema,
    ...data,
    ...results,
  }));
});
