(function registerDataModule() {
window.ClinicalModules = window.ClinicalModules || {};
const dataConstants = window.ClinicalConstants || {};
const dataMessages = dataConstants.messages || {};

window.ClinicalModules.data = {
  dataStorageDbName: 'clinical-contract-browser-storage',
  dataStorageStoreName: 'session-files',
  dataStorageSessionKey: 'clinical-contract-data-session-v1',

  openDataStorage() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB is unavailable.'));
        return;
      }

      const request = window.indexedDB.open(this.dataStorageDbName, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(this.dataStorageStoreName)) {
          database.createObjectStore(this.dataStorageStoreName, { keyPath: 'sessionId' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Unable to open browser data storage.'));
    });
  },

  getDataStorageSessionId(create = false) {
    try {
      let sessionId = sessionStorage.getItem(this.dataStorageSessionKey);
      if (!sessionId && create) {
        sessionId = window.crypto?.randomUUID?.()
          || `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        sessionStorage.setItem(this.dataStorageSessionKey, sessionId);
      }
      return sessionId;
    } catch (_error) {
      return null;
    }
  },

  async persistDataFileSession(file) {
    if (!file) return;
    const sessionId = this.getDataStorageSessionId(true);
    if (!sessionId) return;

    const database = await this.openDataStorage();
    try {
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(this.dataStorageStoreName, 'readwrite');
        transaction.objectStore(this.dataStorageStoreName).put({
          sessionId,
          name: file.name || 'dataset',
          type: file.type || 'application/octet-stream',
          lastModified: file.lastModified || Date.now(),
          data: file,
          savedAt: Date.now(),
        });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error('Unable to store the data file.'));
        transaction.onabort = () => reject(transaction.error || new Error('Data file storage was aborted.'));
      });
    } finally {
      database.close();
    }
  },

  async readPersistedDataFile() {
    const sessionId = this.getDataStorageSessionId(false);
    if (!sessionId) return null;

    const database = await this.openDataStorage();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction(this.dataStorageStoreName, 'readonly');
        const request = transaction.objectStore(this.dataStorageStoreName).get(sessionId);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error('Unable to restore the data file.'));
      });
    } finally {
      database.close();
    }
  },

  async restoreDataFileSession() {
    try {
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
      this.schemaRows = [];
      this.qualityRows = [];
      this.schemaRunState = 'idle';
      this.qualityRunState = 'idle';

      if (this.pythonReady) await this.refreshDataInsights();
      return true;
    } catch (error) {
      console.warn(`Unable to restore the data file: ${error.message}`);
      return false;
    }
  },

  async clearPersistedDataFile() {
    const sessionId = this.getDataStorageSessionId(false);
    try {
      sessionStorage.removeItem(this.dataStorageSessionKey);
    } catch (_error) {
      // Ignore storage failures.
    }
    if (!sessionId) return;

    const database = await this.openDataStorage();
    try {
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(this.dataStorageStoreName, 'readwrite');
        transaction.objectStore(this.dataStorageStoreName).delete(sessionId);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error('Unable to delete the stored data file.'));
        transaction.onabort = () => reject(transaction.error || new Error('Stored data file deletion was aborted.'));
      });
    } finally {
      database.close();
    }
  },

  async analyzeDataFile(file, dataBuffer = null) {
    this.dataColumns = null;
    this.dataRows = null;
    if (!this.pythonReady || !file || !window.pyAnalyzeDataFile) {
      this.setDataRuntimeUnavailable();
      return;
    }
    try {
      const buffer = dataBuffer || (await file.arrayBuffer());
      const payload = JSON.parse(window.pyAnalyzeDataFile(buffer, file.name || ''));
      this.dataColumns = payload.columns;
      this.dataRows = payload.rows;
    } catch (error) {
      console.error(error);
      this.dataColumns = null;
      this.dataRows = null;
      this.previewError = `${dataMessages.dataAnalysisError || 'Data analysis error'}: ${error.message}`;
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

      this.previewHandle = payload.handle || null;
      this.previewColumns = payload.columns || [];
      this.previewTotalRows = payload.total_rows || 0;
      this.previewPageSize = payload.page_size || this.previewPageSizeDefault;
      this.previewTotalPages = payload.total_pages || 0;

      if (this.previewHandle) {
        await this.loadPreviewPage(1);
      }
    } catch (error) {
      console.error(error);
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
    this.schemaRows = [];
    this.qualityRows = [];
    this.schemaRunState = 'idle';
    this.qualityRunState = 'idle';
    try {
      await this.persistDataFileSession(file);
    } catch (error) {
      console.warn(`Unable to persist the data file: ${error.message}`);
    }
    await this.refreshDataInsights();
  },

  deleteDataFile() {
    const cleanup = this.clearPersistedDataFile();
    if (cleanup?.catch) {
      cleanup.catch((error) => console.warn(`Unable to clear the stored data file: ${error.message}`));
    }
    this.releasePreviewSession();
    this.clearPreviewData();

    this.dataFile = null;
    this.dataFileName = '';
    this.dataFileSize = 0;
    this.dataColumns = null;
    this.dataRows = null;
    this.draggingData = false;
    this.schemaRows = [];
    this.qualityRows = [];
    this.schemaRunState = 'idle';
    this.qualityRunState = 'idle';
    this.logoVariant = 'neutral';

    if (['schema', 'quality', 'preview'].includes(this.activeTab)) {
      this.activeTab = 'validate';
    }
    if (this.$refs?.dataInput) {
      this.$refs.dataInput.value = '';
    }
  },

  dataStatsText() {
    if (this.dataColumns === null || this.dataRows === null) return '';
    return `Cols: ${this.dataColumns}    Rows: ${this.dataRows}`;
  },

  dataFileSizeText() {
    if (!this.dataFileSize) return '';
    return `Data file: ${this.formatFileSize(this.dataFileSize)}`;
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
