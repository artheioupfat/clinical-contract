window.ClinicalModules = window.ClinicalModules || {};

const normalizeResultState = (value) => String(value || '').trim().toLowerCase();
const isPassedState = (value) => ['ok', 'passed', 'present', 'success', 'valid'].includes(normalizeResultState(value));
const isFailedState = (value) => ['error', 'failed', 'failure', 'invalid', 'missing'].includes(normalizeResultState(value));
const statusClass = (prefix, status) => {
  const normalized = normalizeResultState(status);
  if (isPassedState(normalized)) return `${prefix}--passed`;
  if (isFailedState(normalized)) {
    return `${prefix}--${normalized === 'error' ? 'error' : 'failed'}`;
  }
  return `${prefix}--warning`;
};
const executionNow = () => globalThis.performance?.now?.() ?? Date.now();
const elapsedMilliseconds = (startedAt) => Math.max(0, executionNow() - startedAt);

window.ClinicalModules.results = {
  tabDotClass(state) {
    if (normalizeResultState(state) === 'idle') return 'tab-dot--idle';
    if (isPassedState(state)) return 'tab-dot--passed';
    if (isFailedState(state)) return 'tab-dot--failed';
    return '';
  },

  statusChipClass(status) {
    return statusClass('status-chip', status);
  },

  statusDotClass(status) {
    return statusClass('status-dot', status);
  },

  formatExecutionDuration(value) {
    if (!Number.isFinite(value)) return '';
    return `${Math.round(Math.max(0, value))} ms`;
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

  resetDataCheckState({ clearDuration = true } = {}) {
    this.schemaRows = [];
    this.qualityRows = [];
    this.schemaRunState = 'idle';
    this.qualityRunState = 'idle';
    if (clearDuration) this.checkDurationMs = null;
  },

  resetValidateState({ clearDuration = true } = {}) {
    this.validateRows = [];
    this.validateRunState = 'idle';
    if (clearDuration) this.validateDurationMs = null;
  },

  clearResults() {
    this.resetValidateState();
    this.resetDataCheckState();
    this.logoVariant = 'neutral';
  },

  async validateContract() {
    if (!this.pythonReady) {
      return;
    }
    this.busy = true;
    this.validateDurationMs = null;
    this.editorView = 'validation';
    this.showRequiredHints = true;
    const startedAt = executionNow();
    try {
      const payload = JSON.parse(window.pyValidateContract(this.yamlText));
      this.validateRows = this.normalizeValidateRows(payload.fields || []);
      this.validateRunState = payload.success ? 'passed' : 'failed';
      if (payload.success) {
        this.showRequiredHints = false;
        this.setLogoSuccess();
      } else {
        this.setLogoFailure();
      }
    } catch (error) {
      console.error(error);
      this.validateRunState = 'failed';
      this.showRequiredHints = true;
      this.setLogoFailure();
    } finally {
      this.validateDurationMs = elapsedMilliseconds(startedAt);
      this.busy = false;
    }
  },

  async runCheck() {
    if (!this.pythonReady) {
      return;
    }
    if (!this.schemaStarted || !this.dataFile) {
      return;
    }

    this.busy = true;
    this.showRequiredHints = true;
    this.resetDataCheckState({ clearDuration: false });
    this.dataTab = 'schema';
    const startedAt = executionNow();

    try {
      const buffer = await this.dataFile.arrayBuffer();
      const payload = JSON.parse(window.pyRunContractCheck(this.yamlText, buffer));

      if (Number.isFinite(payload.validate_duration_ms)) {
        this.validateDurationMs = payload.validate_duration_ms;
      }
      this.validateRows = this.normalizeValidateRows(payload.validate?.fields || []);
      this.schemaRows = this.normalizeSchemaRows(payload.schema_rows || []);
      this.qualityRows = payload.quality_rows || [];
      this.validateRunState = payload.validate?.success ? 'passed' : 'failed';

      if (!payload.validate?.success) {
        this.editorView = 'validation';
        this.setLogoFailure();
      } else if (!payload.schema_success) {
        this.schemaRunState = 'failed';
        this.showRequiredHints = false;
        this.dataTab = 'schema';
        this.setLogoFailure();
      } else {
        this.schemaRunState = 'passed';
        this.qualityRunState = payload.report_success ? 'passed' : 'failed';
        this.showRequiredHints = false;
        this.dataTab = 'quality';
        if (payload.report_success) this.setLogoSuccess();
        else this.setLogoFailure();
      }
    } catch (error) {
      console.error(error);
      if (this.validateRunState === 'idle') this.validateRunState = 'failed';
      else this.schemaRunState = 'failed';
      this.showRequiredHints = true;
      this.setLogoFailure();
    } finally {
      this.checkDurationMs = elapsedMilliseconds(startedAt);
      this.busy = false;
    }
  },
};
