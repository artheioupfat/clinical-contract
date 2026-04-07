window.ClinicalModules = window.ClinicalModules || {};

window.ClinicalModules.runtime = {
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
};
