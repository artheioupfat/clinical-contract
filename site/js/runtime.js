window.ClinicalModules = window.ClinicalModules || {};
const runtimeConstants = window.ClinicalConstants || {};
const runtimeMessages = runtimeConstants.messages || {};

window.ClinicalModules.runtime = {
  startRuntimeProgress() {
    if (this.runtimeProgressInterval) {
      window.clearInterval(this.runtimeProgressInterval);
    }
    if (this.runtimeFailureTimer) {
      window.clearTimeout(this.runtimeFailureTimer);
    }
    this.runtimeProgress = 0;
    this.showRuntimeProgress = true;
    this.runtimeError = '';
    this.runtimeProgressInterval = window.setInterval(() => {
      if (this.pythonReady) return;
      if (this.runtimeProgress >= 92) return;
      const step = this.runtimeProgress < 50 ? 3 : this.runtimeProgress < 80 ? 2 : 1;
      this.runtimeProgress = Math.min(92, this.runtimeProgress + step);
    }, 120);

    this.runtimeFailureTimer = window.setTimeout(() => {
      if (!this.pythonReady) {
        this.setRuntimeError(runtimeMessages.runtimeTimeout);
      }
    }, 45000);
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
    this.runtimeError = '';
    if (this.runtimeFailureTimer) {
      window.clearTimeout(this.runtimeFailureTimer);
      this.runtimeFailureTimer = null;
    }
    if (this.runtimeBridgePoll) {
      window.clearInterval(this.runtimeBridgePoll);
      this.runtimeBridgePoll = null;
    }
    this.finishRuntimeProgress();
  },

  runtimeBadgeClass() {
    if (this.runtimeError) return 'runtime-badge--failed';
    return this.pythonReady ? 'runtime-badge--ready' : 'runtime-badge--loading';
  },

  runtimeBadgeLabel() {
    if (this.runtimeError) return runtimeMessages.runtimeFailed || 'Python runtime error';
    return this.pythonReady ? 'Python ready' : 'Python loading';
  },

  setRuntimeError(message) {
    if (this.pythonReady) return;
    const fallback = runtimeMessages.runtimeTimeout || 'Python runtime could not initialize.';
    this.runtimeError = message || fallback;
    this.showRuntimeProgress = true;
    this.runtimeProgress = Math.max(this.runtimeProgress || 0, 92);
    if (this.runtimeProgressInterval) {
      window.clearInterval(this.runtimeProgressInterval);
      this.runtimeProgressInterval = null;
    }
    if (this.runtimeFailureTimer) {
      window.clearTimeout(this.runtimeFailureTimer);
      this.runtimeFailureTimer = null;
    }
    console.error(this.runtimeError);
  },

  isRuntimeFailureMessage(value) {
    return /pyscript|pyodide|duckdb|micropip|python|wasm/i.test(String(value || ''));
  },

  registerRuntimeErrorHandlers() {
    if (this.runtimeErrorHandlersRegistered) return;
    this.runtimeErrorHandlersRegistered = true;

    window.addEventListener('error', (event) => {
      const message = event?.message || event?.error?.message || '';
      if (this.isRuntimeFailureMessage(message)) {
        this.setRuntimeError(message);
      }
    });

    window.addEventListener('unhandledrejection', (event) => {
      const reason = event?.reason;
      const message = reason?.message || reason || '';
      if (this.isRuntimeFailureMessage(message)) {
        this.setRuntimeError(String(message));
      }
    });
  },
};
