(function registerDataModule() {
window.ClinicalModules = window.ClinicalModules || {};
const dataConstants = window.ClinicalConstants || {};
const dataMessages = dataConstants.messages || {};

window.ClinicalModules.data = {
  async restoreDataFileSession() {
    try {
      if (typeof this.pruneExpiredDataFileSessions === 'function') {
        await this.pruneExpiredDataFileSessions();
      }
      const stored = await this.readPersistedDataFile();
      if (!stored?.data) return false;

      this.dataFile = new File([stored.data], stored.name, {
        type: stored.type || 'application/octet-stream',
        lastModified: stored.lastModified || Date.now(),
      });
      this.dataFileName = this.dataFile.name;
      this.dataFileSize = this.dataFile.size;
      this.dataColumns = null;
      this.dataRows = null;
      this.resetDataCheckState();

      if (this.pythonReady) await this.refreshDataInsights();
      this.dataStorageWarning = '';
      return true;
    } catch (error) {
      console.warn(`Unable to restore the data file: ${error.message}`);
      this.dataStorageWarning = `Stored data file could not be restored: ${error.message}`;
      return false;
    }
  },

  async refreshDataInsights() {
    if (!this.dataFile) return;
    try {
      const buffer = await this.dataFile.arrayBuffer();
      await this.preparePreview(this.dataFile, buffer);
    } catch (error) {
      console.error(error);
      this.previewError = `${dataMessages.dataLoadingError || 'Data loading error'}: ${error.message}`;
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
    this.dataColumns = null;
    this.dataRows = null;

    if (!this.pythonReady || !file || !window.pyPrepareDataPreview) {
      this.setDataRuntimeUnavailable();
      return;
    }

    try {
      const buffer = dataBuffer || (await file.arrayBuffer());
      const payload = JSON.parse(window.pyPrepareDataPreview(buffer, file.name || ''));
      if (payload.error) {
        this.previewError = payload.error;
        return;
      }

      const columns = payload.columns || [];
      this.previewHandle = payload.handle || null;
      this.previewColumns = columns;
      this.previewTotalRows = payload.total_rows || 0;
      this.previewPageSize = payload.page_size || this.previewPageSizeDefault;
      this.previewTotalPages = payload.total_pages || 0;
      this.dataColumns = columns.length;
      this.dataRows = this.previewTotalRows;

      if (this.previewHandle) {
        await this.loadPreviewPage(1);
      }
    } catch (error) {
      console.error(error);
      this.dataColumns = null;
      this.dataRows = null;
      this.previewError = error.message;
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
    await this.loadDataFile(file);
    event.target.value = '';
  },

  async dropData(event) {
    this.draggingData = false;
    const file = [...event.dataTransfer.files].find((f) => /\.(parquet|csv)$/i.test(f.name));
    if (!file) return;
    await this.loadDataFile(file);
  },

  async loadDataFile(file) {
    this.dataFile = file;
    this.dataFileName = file.name;
    this.dataFileSize = file.size || 0;
    this.dataStorageWarning = '';
    this.resetDataCheckState();
    try {
      await this.persistDataFileSession(file);
    } catch (error) {
      console.warn(`Unable to persist the data file: ${error.message}`);
      this.dataStorageWarning = `This file is loaded for the current session, but browser storage failed: ${error.message}`;
    }
    await this.refreshDataInsights();
  },

  deleteDataFile() {
    const cleanup = this.clearPersistedDataFile();
    if (cleanup?.catch) {
      cleanup.catch((error) => {
        console.warn(`Unable to clear the stored data file: ${error.message}`);
        this.dataStorageWarning = `Stored data cleanup failed: ${error.message}`;
      });
    }
    this.releasePreviewSession();
    this.clearPreviewData();

    this.dataFile = null;
    this.dataFileName = '';
    this.dataFileSize = 0;
    this.dataColumns = null;
    this.dataRows = null;
    this.dataStorageWarning = '';
    this.draggingData = false;
    this.resetDataCheckState();
    this.logoVariant = 'neutral';

    if (['schema', 'quality', 'preview'].includes(this.activeTab)) {
      this.activeTab = 'validate';
    }
    if (this.$refs?.dataInput) {
      this.$refs.dataInput.value = '';
    }
  },

  formatFileSize(bytes) {
    const value = Number(bytes) || 0;
    if (value <= 0) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = value;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }
    const precision = size >= 10 || unitIndex === 0 ? 0 : 1;
    return `${size.toFixed(precision)}${units[unitIndex]}`;
  },

  setDataRuntimeUnavailable() {
    this.previewRows = [];
    this.previewError = dataMessages.dataRuntimeUnavailable || 'Data loading requires the Python runtime.';
    console.error(this.previewError);
  },
};
})();
