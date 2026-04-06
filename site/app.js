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
    structureSummary: 'Not run',
    schemaSummary: 'Not run',
    qualitySummary: 'Not run',
    statusText: 'Ready',
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

    async init() {
      window.addEventListener('clinical-python-ready', async () => {
        this.pythonReady = true;
        this.statusText = 'Python runtime ready';
        if (this.dataFile) {
          await this.analyzeDataFile(this.dataFile);
        }
      });

      try {
        const response = await fetch('./examples/example_contract.yaml');
        if (response.ok) {
          this.yamlText = await response.text();
          this.yamlName = 'example_contract.yaml';
        }
      } catch (_err) {
        this.yamlText = '# Write or drop a YAML contract here';
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

    async analyzeDataFile(file) {
      this.dataColumns = null;
      this.dataRows = null;
      if (!this.pythonReady || !file || !window.pyAnalyzeDataFile) return;
      try {
        const buffer = await file.arrayBuffer();
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

    async pickDataFile(event) {
      const file = event.target.files?.[0];
      if (!file) return;
      this.dataFile = file;
      this.dataFileName = file.name;
      this.statusText = `Loaded ${file.name}`;
      await this.analyzeDataFile(file);
      event.target.value = '';
    },

    async dropData(event) {
      this.draggingData = false;
      const file = [...event.dataTransfer.files].find((f) => /\.(parquet|csv)$/i.test(f.name));
      if (!file) return;
      this.dataFile = file;
      this.dataFileName = file.name;
      this.statusText = `Loaded ${file.name}`;
      await this.analyzeDataFile(file);
    },

    dataStatsText() {
      if (this.dataColumns === null || this.dataRows === null) return '';
      return `Col : ${this.dataColumns}    Rows : ${this.dataRows}`;
    },

    clearResults() {
      this.validateRows = [];
      this.schemaRows = [];
      this.qualityRows = [];
      this.structureSummary = 'Not run';
      this.schemaSummary = 'Not run';
      this.qualitySummary = 'Not run';
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
        this.validateRows = payload.fields || [];
        this.structureSummary = payload.success ? 'Valid structure' : 'Structure issues';
        this.schemaSummary = 'Not run';
        this.qualitySummary = 'Not run';
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

        this.validateRows = payload.validate?.fields || [];
        this.schemaRows = payload.schema_rows || [];
        this.qualityRows = payload.quality_rows || [];

        this.structureSummary = payload.validate?.success ? 'Valid structure' : 'Structure issues';
        this.schemaSummary = payload.schema_success ? 'Schema valid' : 'Schema issues';
        this.qualitySummary = payload.report_summary || (payload.quality_rows?.length ? 'Checks finished' : 'No quality checks');

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
