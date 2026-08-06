(function registerDataModule() {
window.ClinicalModules = window.ClinicalModules || {};

const dataModule = {
  async restoreDataFileSession() {
    try {
      if (typeof this.pruneExpiredDataFileSessions === 'function') {
        await this.pruneExpiredDataFileSessions();
      }
      const storedFiles = await this.readPersistedDataFiles();
      this.dataFiles = storedFiles
        .filter((stored) => stored?.data)
        .map((stored) => new File([stored.data], stored.name, {
          type: stored.type || 'application/octet-stream',
          lastModified: stored.lastModified || Date.now(),
        }));
      if (!this.dataFiles.length) return false;
      this.activeDataIndex = 0;
      dataModule.syncActiveDataFile.call(this);
      this.dataColumns = null;
      this.dataRows = null;
      this.dataTab = 'data';
      this.resetDataCheckState();

      if (this.pythonReady) await this.refreshDataInsights();
      this.dataStorageWarning = '';
      return true;
    } catch (error) {
      console.warn(`Unable to restore the data file: ${error.message}`);
      this.dataStorageWarning = this.t('editor.messages.dataRestore', { message: error.message });
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
      this.previewError = `${this.t('editor.messages.dataLoading')}: ${error.message}`;
    }
  },

  releasePreviewSession() {
    const handle = this.previewHandle;
    this.previewHandle = null;
    if (!handle || typeof window.pyReleaseDataPreview !== 'function') return;
    try {
      window.pyReleaseDataPreview(handle);
    } catch (error) {
      console.error(error);
    }
  },

  clearPreviewData() {
    this.previewColumns = [];
    this.previewRows = [];
    this.previewTotalRows = 0;
    this.previewPage = 1;
    this.previewPageSize = this.previewPageSizeDefault;
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
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    await this.loadDataFiles(files);
    event.target.value = '';
  },

  async dropData(event) {
    this.draggingData = false;
    const files = [...event.dataTransfer.files].filter((file) => /\.(parquet|csv)$/i.test(file.name));
    if (!files.length) return;
    await this.loadDataFiles(files);
  },

  dataFileKey(file) {
    return String(file?.name || '').replace(/\.(parquet|csv)$/i, '');
  },

  syncActiveDataFile() {
    if (!Array.isArray(this.dataFiles)) this.dataFiles = [];
    if (!this.dataFiles.length) {
      this.activeDataIndex = 0;
      this.dataFile = null;
      this.dataFileName = '';
      this.dataFileSize = 0;
      return;
    }
    this.activeDataIndex = Math.max(0, Math.min(this.activeDataIndex, this.dataFiles.length - 1));
    this.dataFile = this.dataFiles[this.activeDataIndex];
    this.dataFileName = this.dataFile.name;
    this.dataFileSize = this.dataFile.size || 0;
  },

  async loadDataFiles(files) {
    if (!this.pythonReady) {
      this.dataStorageWarning = this.t('editor.messages.runtimeData');
      return false;
    }
    const acceptedFiles = Array.from(files || []).filter((file) => /\.(parquet|csv)$/i.test(file?.name || ''));
    if (!acceptedFiles.length) return false;

    const merged = Array.from(this.dataFiles || []);
    for (const file of acceptedFiles) {
      const key = dataModule.dataFileKey(file);
      const existingIndex = merged.findIndex((candidate) => dataModule.dataFileKey(candidate) === key);
      if (existingIndex >= 0) merged[existingIndex] = file;
      else merged.push(file);
    }
    this.dataFiles = merged;
    this.activeDataIndex = this.dataFiles.indexOf(acceptedFiles.at(-1));
    if (this.activeDataIndex < 0) {
      this.activeDataIndex = this.dataFiles.findIndex(
        (file) => dataModule.dataFileKey(file) === dataModule.dataFileKey(acceptedFiles.at(-1))
      );
    }
    dataModule.syncActiveDataFile.call(this);
    this.dataStorageWarning = '';
    this.dataTab = 'data';
    this.resetDataCheckState();
    try {
      await this.persistDataFilesSession(this.dataFiles);
    } catch (error) {
      console.warn(`Unable to persist the data file: ${error.message}`);
      this.dataStorageWarning = this.t('editor.messages.dataStorage', { message: error.message });
    }
    await this.refreshDataInsights();
    return true;
  },

  async selectDataFile(index) {
    const nextIndex = Number(index);
    if (!Number.isInteger(nextIndex) || nextIndex === this.activeDataIndex) return;
    this.releasePreviewSession();
    this.activeDataIndex = nextIndex;
    dataModule.syncActiveDataFile.call(this);
    this.dataTab = 'data';
    await this.refreshDataInsights();
  },

  deleteDataFile() {
    this.dataFiles = Array.from(this.dataFiles || []);
    if (this.dataFiles.length) this.dataFiles.splice(this.activeDataIndex, 1);
    const cleanup = this.dataFiles.length
      ? this.persistDataFilesSession(this.dataFiles)
      : this.clearPersistedDataFile();
    if (cleanup?.catch) {
      cleanup.catch((error) => {
        console.warn(`Unable to clear the stored data file: ${error.message}`);
        this.dataStorageWarning = this.t('editor.messages.dataCleanup', { message: error.message });
      });
    }
    this.releasePreviewSession();
    this.clearPreviewData();

    this.activeDataIndex = Math.min(this.activeDataIndex, Math.max(0, this.dataFiles.length - 1));
    dataModule.syncActiveDataFile.call(this);
    this.dataColumns = null;
    this.dataRows = null;
    this.dataStorageWarning = '';
    this.draggingData = false;
    this.resetDataCheckState();
    this.dataTab = 'data';
    if (this.dataFile && this.pythonReady) this.refreshDataInsights();
    if (this.validateRunState === 'passed') this.logoVariant = 'green';
    else if (this.validateRunState === 'failed') this.logoVariant = 'red';
    else this.logoVariant = 'neutral';
    if (this.$refs?.dataInput) {
      this.$refs.dataInput.value = '';
    }
  },

  openDataTemplateModal() {
    if (!this.pythonReady) {
      this.dataStorageWarning = this.t('editor.messages.runtimeSample');
      return;
    }
    this.selectedDataTemplateIds = [];
    this.dataTemplateModalOpen = true;
  },

  closeDataTemplateModal() {
    this.dataTemplateModalOpen = false;
    this.selectedDataTemplateIds = [];
  },

  isDataTemplateSelected(templateId) {
    return Array.from(this.selectedDataTemplateIds || []).includes(templateId);
  },

  toggleDataTemplateSelection(templateId) {
    const selectedIds = new Set(this.selectedDataTemplateIds || []);
    if (selectedIds.has(templateId)) selectedIds.delete(templateId);
    else selectedIds.add(templateId);
    this.selectedDataTemplateIds = [...selectedIds];
  },

  async confirmDataTemplateSelection() {
    const selectedIds = new Set(this.selectedDataTemplateIds || []);
    const templates = (this.dataTemplates || []).filter((template) => selectedIds.has(template.id));
    await dataModule.loadDataTemplates.call(this, templates);
  },

  async loadDataTemplates(templates) {
    const selectedTemplates = Array.from(templates || []).filter((template) => template?.path);
    if (!this.pythonReady || !selectedTemplates.length) return;
    this.busy = true;
    try {
      const files = await Promise.all(selectedTemplates.map(async (template) => {
        const response = await fetch(template.path, { cache: 'no-cache' });
        if (!response.ok) {
          throw new Error(this.t('editor.messages.templateDataStatus', { status: response.status }));
        }
        const buffer = await response.arrayBuffer();
        return new File([buffer], template.fileName || 'template.parquet', {
          type: template.mimeType || 'application/octet-stream',
        });
      }));
      this.dataTemplateModalOpen = false;
      this.selectedDataTemplateIds = [];
      await this.loadDataFiles(files);
    } catch (error) {
      this.dataStorageWarning = this.t('editor.messages.templateDataFailed', { message: error.message });
    } finally {
      this.busy = false;
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
    this.previewError = this.t('editor.messages.dataRuntime');
    console.error(this.previewError);
  },
};

window.ClinicalModules.data = dataModule;
})();
