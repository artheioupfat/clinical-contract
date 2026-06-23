window.ClinicalModules = window.ClinicalModules || {};

const normalizeResultState = (value) => String(value || '').trim().toLowerCase();
const isPassedState = (value) => ['ok', 'passed', 'present', 'success', 'valid'].includes(normalizeResultState(value));
const isFailedState = (value) => ['error', 'failed', 'failure', 'invalid', 'missing'].includes(normalizeResultState(value));

window.ClinicalModules.results = {
  tabDotClass(state) {
    if (normalizeResultState(state) === 'idle') return 'tab-dot--idle';
    if (isPassedState(state)) return 'tab-dot--passed';
    if (isFailedState(state)) return 'tab-dot--failed';
    return '';
  },

  statusChipClass(status) {
    const normalized = normalizeResultState(status);
    if (isPassedState(normalized)) {
      return 'status-chip--passed';
    }
    if (isFailedState(normalized)) {
      return normalized === 'error' ? 'status-chip--error' : 'status-chip--failed';
    }
    return 'status-chip--warning';
  },

  statusDotClass(status) {
    const normalized = normalizeResultState(status);
    if (isPassedState(normalized)) {
      return 'status-dot--passed';
    }
    if (isFailedState(normalized)) {
      return normalized === 'error' ? 'status-dot--error' : 'status-dot--failed';
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
    this.showRequiredHints = true;
    try {
      const payload = JSON.parse(window.pyValidateContract(this.yamlText));
      this.validateRows = this.normalizeValidateRows(payload.fields || []);
      if (payload.success) {
        this.showRequiredHints = false;
        this.setLogoSuccess();
      } else {
        this.setLogoFailure();
      }
    } catch (error) {
      console.error(error);
      this.showRequiredHints = true;
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
    this.showRequiredHints = true;

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
        this.showRequiredHints = false;
        this.activeTab = 'schema';
        this.setLogoFailure();
      } else {
        this.showRequiredHints = false;
        this.activeTab = 'quality';
        if (payload.report_success) this.setLogoSuccess();
        else this.setLogoFailure();
      }
    } catch (error) {
      console.error(error);
      this.showRequiredHints = true;
      this.setLogoFailure();
    } finally {
      this.busy = false;
    }
  },
};
