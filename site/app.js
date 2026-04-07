document.addEventListener('alpine:init', () => {
  Alpine.data('clinicalApp', () => ({
    yamlText: '',
    yamlName: 'datacontract.yaml',
    dataFile: null,
    dataFileName: '',
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
    previewPageSize: 50,
    previewTotalPages: 0,
    previewLoading: false,
    previewError: '',
    previewHandle: null,
    statusText: 'Ready',
    switchOn: false,
    runtimeProgress: 0,
    showRuntimeProgress: true,
    runtimeProgressInterval: null,
    runtimeBridgePoll: null,
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
      if (this.pythonReady) return 'Python runtime ready';
      return 'Loading Python runtime…';
    },

    async init() {
      this.initThemeSwitch();
      this.startRuntimeProgress();

      window.addEventListener('clinical-python-ready', async () => {
        this.onPythonRuntimeReady();
        if (this.dataFile) {
          await this.refreshDataInsights();
        }
      });
      window.addEventListener('beforeunload', () => {
        this.releasePreviewSession();
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

      try {
        const response = await fetch('./examples/contract.yaml');
        if (response.ok) {
          this.yamlText = await response.text();
          this.yamlName = 'example.yaml';
        }
      } catch (_err) {
        this.yamlText = '# Write or drop a YAML contract here';
      }
    },

    startRuntimeProgress() {
      if (this.runtimeProgressInterval) {
        window.clearInterval(this.runtimeProgressInterval);
      }
      this.runtimeProgress = 0;
      this.showRuntimeProgress = true;
      this.runtimeProgressInterval = window.setInterval(() => {
        if (this.pythonReady) return;
        if (this.runtimeProgress >= 92) return;
        const step = this.runtimeProgress < 50 ? 3 : this.runtimeProgress < 80 ? 2 : 1;
        this.runtimeProgress = Math.min(92, this.runtimeProgress + step);
      }, 120);
    },

    finishRuntimeProgress() {
      if (this.runtimeProgressInterval) {
        window.clearInterval(this.runtimeProgressInterval);
        this.runtimeProgressInterval = null;
      }
      const complete = () => {
        this.runtimeProgress = 100;
        window.setTimeout(() => {
          this.showRuntimeProgress = false;
        }, 450);
      };
      if (this.runtimeProgress >= 100) {
        complete();
        return;
      }
      const finisher = window.setInterval(() => {
        this.runtimeProgress = Math.min(100, this.runtimeProgress + 4);
        if (this.runtimeProgress >= 100) {
          window.clearInterval(finisher);
          complete();
        }
      }, 16);
    },

    onPythonRuntimeReady() {
      if (this.pythonReady) return;
      this.pythonReady = true;
      this.statusText = 'Python runtime ready';
      if (this.runtimeBridgePoll) {
        window.clearInterval(this.runtimeBridgePoll);
        this.runtimeBridgePoll = null;
      }
      this.finishRuntimeProgress();
    },

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

    async importYaml(event) {
      const file = event.target.files?.[0];
      if (!file) return;
      await this.handleYamlFile(file);
      event.target.value = '';
    },

    downloadYaml() {
      const blob = new Blob([this.yamlText || ''], { type: 'text/yaml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = this.yamlName || 'contract.yaml';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      this.statusText = `Downloaded ${link.download}`;
    },

    async dropYaml(event) {
      const file = [...event.dataTransfer.files].find((f) => /\.ya?ml$/i.test(f.name));
      if (!file) return;
      await this.handleYamlFile(file);
    },

    async handleYamlFile(file) {
      this.yamlText = await file.text();
      this.yamlName = file.name;
      this.clearResults();
      this.statusText = `Loaded ${file.name}`;
    },

    async analyzeDataFile(file, dataBuffer = null) {
      this.dataColumns = null;
      this.dataRows = null;
      if (!this.pythonReady || !file || !window.pyAnalyzeDataFile) return;
      try {
        const buffer = dataBuffer || (await file.arrayBuffer());
        const payload = JSON.parse(window.pyAnalyzeDataFile(buffer));
        this.dataColumns = payload.columns;
        this.dataRows = payload.rows;
        if (payload.summary) this.statusText = payload.summary;
      } catch (error) {
        console.error(error);
        this.dataColumns = null;
        this.dataRows = null;
        this.statusText = `Data analysis error: ${error.message}`;
      }
    },

    async refreshDataInsights() {
      if (!this.dataFile) return;
      try {
        const buffer = await this.dataFile.arrayBuffer();
        await this.analyzeDataFile(this.dataFile, buffer);
        await this.preparePreview(this.dataFile, buffer);
      } catch (error) {
        console.error(error);
        this.statusText = `Data loading error: ${error.message}`;
      }
    },

    releasePreviewSession() {
      if (!this.previewHandle || !window.pyReleaseDataPreview) return;
      try {
        window.pyReleaseDataPreview(this.previewHandle);
      } catch (error) {
        console.error(error);
      }
      this.previewHandle = null;
    },

    clearPreviewData() {
      this.previewColumns = [];
      this.previewRows = [];
      this.previewTotalRows = 0;
      this.previewPage = 1;
      this.previewTotalPages = 0;
      this.previewLoading = false;
      this.previewError = '';
    },

    async preparePreview(file, dataBuffer = null) {
      this.releasePreviewSession();
      this.clearPreviewData();

      if (!this.pythonReady || !file || !window.pyPrepareDataPreview) return;

      try {
        const buffer = dataBuffer || (await file.arrayBuffer());
        const payload = JSON.parse(window.pyPrepareDataPreview(buffer, file.name || ''));
        if (payload.error) {
          this.previewError = payload.error;
          this.statusText = `Preview error: ${payload.error}`;
          return;
        }

        this.previewHandle = payload.handle || null;
        this.previewColumns = payload.columns || [];
        this.previewTotalRows = payload.total_rows || 0;
        this.previewPageSize = payload.page_size || 50;
        this.previewTotalPages = payload.total_pages || 0;

        if (this.previewHandle) {
          await this.loadPreviewPage(1);
        }
      } catch (error) {
        console.error(error);
        this.previewError = error.message;
        this.statusText = `Preview error: ${error.message}`;
      }
    },

    async loadPreviewPage(page) {
      if (!this.previewHandle || !window.pyFetchDataPreviewPage) return;
      this.previewLoading = true;
      this.previewError = '';
      try {
        const payload = JSON.parse(
          window.pyFetchDataPreviewPage(this.previewHandle, page, this.previewPageSize)
        );
        if (payload.error) {
          this.previewRows = [];
          this.previewError = payload.error;
          this.statusText = `Preview error: ${payload.error}`;
          return;
        }
        this.previewColumns = payload.columns || this.previewColumns;
        this.previewRows = payload.rows || [];
        this.previewPage = payload.page || 1;
        this.previewPageSize = payload.page_size || this.previewPageSize;
        this.previewTotalRows = payload.total_rows || 0;
        this.previewTotalPages = payload.total_pages || 0;
      } catch (error) {
        console.error(error);
        this.previewRows = [];
        this.previewError = error.message;
        this.statusText = `Preview error: ${error.message}`;
      } finally {
        this.previewLoading = false;
      }
    },

    goPreviewPrev() {
      if (this.previewLoading || this.previewPage <= 1) return;
      this.loadPreviewPage(this.previewPage - 1);
    },

    goPreviewNext() {
      if (this.previewLoading || this.previewPage >= this.previewTotalPages) return;
      this.loadPreviewPage(this.previewPage + 1);
    },

    async pickDataFile(event) {
      const file = event.target.files?.[0];
      if (!file) return;
      this.dataFile = file;
      this.dataFileName = file.name;
      this.statusText = `Loaded ${file.name}`;
      await this.refreshDataInsights();
      event.target.value = '';
    },

    async dropData(event) {
      this.draggingData = false;
      const file = [...event.dataTransfer.files].find((f) => /\.(parquet|csv)$/i.test(f.name));
      if (!file) return;
      this.dataFile = file;
      this.dataFileName = file.name;
      this.statusText = `Loaded ${file.name}`;
      await this.refreshDataInsights();
    },

    dataStatsText() {
      if (this.dataColumns === null || this.dataRows === null) return '';
      return `Cols: ${this.dataColumns}    Rows: ${this.dataRows}`;
    },

    tabDotClass(state) {
      if (state === 'passed' || state === 'success') return 'bg-emerald-500';
      if (state === 'failed' || state === 'error') return 'bg-rose-500';
      return 'bg-slate-400';
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

    get previewTabState() {
      if (this.previewError) return 'error';
      if (!this.previewHandle) return 'idle';
      return 'success';
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

    normalizeValidateRows(rows) {
      return (rows || []).map((row) => ({
        ...row,
        status: row.present ? 'passed' : 'failed',
      }));
    },

    normalizeSchemaRows(rows) {
      return (rows || []).map((row) => {
        const rawStatus = String(row.status || '').toLowerCase();
        const passed = rawStatus === 'ok' || rawStatus === 'optional_missing';
        return {
          ...row,
          status: passed ? 'passed' : 'failed',
        };
      });
    },

    clearResults() {
      this.validateRows = [];
      this.schemaRows = [];
      this.qualityRows = [];
      this.logoVariant = 'neutral';
    },

    async validateContract() {
      if (!this.pythonReady) {
        this.statusText = 'Python runtime still loading';
        return;
      }
      this.busy = true;
      this.activeTab = 'validate';
      this.statusText = 'Validating contract…';
      try {
        const payload = JSON.parse(window.pyValidateContract(this.yamlText));
        this.validateRows = this.normalizeValidateRows(payload.fields || []);
        this.statusText = payload.success ? 'Validation passed' : 'Validation failed';
        if (payload.success) this.setLogoSuccess();
        else this.setLogoFailure();
      } catch (error) {
        console.error(error);
        this.statusText = `Validation error: ${error.message}`;
        this.setLogoFailure();
      } finally {
        this.busy = false;
      }
    },

    async runCheck() {
      if (!this.pythonReady) {
        this.statusText = 'Python runtime still loading';
        return;
      }
      if (!this.dataFile) {
        this.statusText = 'Pick a parquet or csv file first';
        return;
      }

      this.busy = true;
      this.statusText = 'Running schema and quality checks…';

      try {
        const buffer = await this.dataFile.arrayBuffer();
        const payload = JSON.parse(window.pyRunContractCheck(this.yamlText, buffer));

        this.validateRows = this.normalizeValidateRows(payload.validate?.fields || []);
        this.schemaRows = this.normalizeSchemaRows(payload.schema_rows || []);
        this.qualityRows = payload.quality_rows || [];

        if (!payload.validate?.success) {
          this.activeTab = 'validate';
          this.statusText = payload.error || 'YAML validation failed';
          this.setLogoFailure();
        } else if (!payload.schema_success) {
          this.activeTab = 'schema';
          this.statusText = payload.error || 'Schema validation failed';
          this.setLogoFailure();
        } else {
          this.activeTab = 'quality';
          this.statusText = payload.report_summary || 'Checks completed';
          if (payload.report_success) this.setLogoSuccess();
          else this.setLogoFailure();
        }
      } catch (error) {
        console.error(error);
        this.statusText = `Execution error: ${error.message}`;
        this.setLogoFailure();
      } finally {
        this.busy = false;
      }
    },
  }));
});
