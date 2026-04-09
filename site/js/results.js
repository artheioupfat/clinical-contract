window.ClinicalModules = window.ClinicalModules || {};

window.ClinicalModules.results = {
  tabDotClass(state) {
    if (state === 'passed' || state === 'success') return 'tab-dot--passed';
    if (state === 'failed' || state === 'error') return 'tab-dot--failed';
    return '';
  },

  statusChipClass(status) {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'passed' || normalized === 'ok' || normalized === 'success') {
      return 'status-chip--passed';
    }
    if (normalized === 'failed' || normalized === 'error') {
      return `status-chip--${normalized}`;
    }
    return 'status-chip--warning';
  },

  statusDotClass(status) {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'passed' || normalized === 'ok' || normalized === 'success') {
      return 'status-dot--passed';
    }
    if (normalized === 'failed' || normalized === 'error') {
      return `status-dot--${normalized}`;
    }
    return 'status-dot--warning';
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
      return;
    }
    this.busy = true;
    this.activeTab = 'validate';
    try {
      const payload = JSON.parse(window.pyValidateContract(this.yamlText));
      this.validateRows = this.normalizeValidateRows(payload.fields || []);
      if (payload.success) this.setLogoSuccess();
      else this.setLogoFailure();
    } catch (error) {
      console.error(error);
      this.setLogoFailure();
    } finally {
      this.busy = false;
    }
  },

  async runCheck() {
    if (!this.pythonReady) {
      return;
    }
    if (!this.dataFile) {
      return;
    }

    this.busy = true;

    try {
      const buffer = await this.dataFile.arrayBuffer();
      const payload = JSON.parse(window.pyRunContractCheck(this.yamlText, buffer));

      this.validateRows = this.normalizeValidateRows(payload.validate?.fields || []);
      this.schemaRows = this.normalizeSchemaRows(payload.schema_rows || []);
      this.qualityRows = payload.quality_rows || [];

      if (!payload.validate?.success) {
        this.activeTab = 'validate';
        this.setLogoFailure();
      } else if (!payload.schema_success) {
        this.activeTab = 'schema';
        this.setLogoFailure();
      } else {
        this.activeTab = 'quality';
        if (payload.report_success) this.setLogoSuccess();
        else this.setLogoFailure();
      }
    } catch (error) {
      console.error(error);
      this.setLogoFailure();
    } finally {
      this.busy = false;
    }
  },
};
