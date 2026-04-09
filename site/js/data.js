window.ClinicalModules = window.ClinicalModules || {};
const constants = window.ClinicalConstants || {};
const messages = constants.messages || {};

window.ClinicalModules.data = {
  async analyzeDataFile(file, dataBuffer = null) {
    this.dataColumns = null;
    this.dataRows = null;
    if (!this.pythonReady || !file || !window.pyAnalyzeDataFile) return;
    try {
      const buffer = dataBuffer || (await file.arrayBuffer());
      const payload = JSON.parse(window.pyAnalyzeDataFile(buffer, file.name || ''));
      this.dataColumns = payload.columns;
      this.dataRows = payload.rows;
    } catch (error) {
      console.error(error);
      this.dataColumns = null;
      this.dataRows = null;
      this.previewError = `${messages.dataAnalysisError || 'Data analysis error'}: ${error.message}`;
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
      this.previewError = `${messages.dataLoadingError || 'Data loading error'}: ${error.message}`;
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

    if (!this.pythonReady || !file || !window.pyPrepareDataPreview) return;

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
    this.dataFile = file;
    this.dataFileName = file.name;
    await this.refreshDataInsights();
    event.target.value = '';
  },

  async dropData(event) {
    this.draggingData = false;
    const file = [...event.dataTransfer.files].find((f) => /\.(parquet|csv)$/i.test(f.name));
    if (!file) return;
    this.dataFile = file;
    this.dataFileName = file.name;
    await this.refreshDataInsights();
  },

  dataStatsText() {
    if (this.dataColumns === null || this.dataRows === null) return '';
    return `Cols: ${this.dataColumns}    Rows: ${this.dataRows}`;
  },
};
