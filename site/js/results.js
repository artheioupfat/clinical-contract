window.ClinicalModules = window.ClinicalModules || {};

window.ClinicalModules.results = {
  tabDotClass(state) {
    if (state === 'passed' || state === 'success') return 'bg-emerald-500';
    if (state === 'failed' || state === 'error') return 'bg-rose-500';
    return 'bg-slate-400';
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
};
