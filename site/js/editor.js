window.ClinicalModules = window.ClinicalModules || {};

window.ClinicalModules.editor = {
  indentUnit: '  ',
  editorSessionKey: 'clinical-contract-editor-session-v1',
  editorSessionMaxAgeMs: 24 * 60 * 60 * 1000,

  isEditorSessionExpired(session, now = Date.now()) {
    const savedAt = Date.parse(String(session?.savedAt || ''));
    return !Number.isFinite(savedAt) || now - savedAt > this.editorSessionMaxAgeMs;
  },

  clearEditorSession() {
    try {
      sessionStorage.removeItem(this.editorSessionKey);
      this.editorStorageWarning = '';
    } catch (_error) {
      // Ignore storage failures.
    }
  },

  restoreEditorSession() {
    try {
      const rawSession = sessionStorage.getItem(this.editorSessionKey);
      if (!rawSession) return;

      const session = JSON.parse(rawSession);
      if (!session || typeof session !== 'object') return;
      if (this.isEditorSessionExpired(session)) {
        this.clearEditorSession();
        return;
      }

      this.yamlText = typeof session.yamlText === 'string' ? session.yamlText : '';
      this.yamlName = typeof session.yamlName === 'string' ? session.yamlName : '';
      this.yamlNameGenerated = session.yamlNameGenerated === true;
      this.editorView = ['schema', 'yaml'].includes(session.editorView)
        ? session.editorView
        : 'schema';
      this.schemaSection = typeof session.schemaSection === 'string'
        ? session.schemaSection
        : 'fundamentals';
      this.schemaStarted = Boolean(this.yamlText.trim());

      if (this.schemaStarted) {
        this.syncSchemaFromYaml({ preserveCurrentOnError: false });
      }
      this.editorStorageWarning = '';
    } catch (_error) {
      this.clearEditorSession();
    }
  },

  registerEditorSessionPersistence() {
    this.$watch('yamlText', () => this.persistEditorSession());
    this.$watch('yamlName', () => this.persistEditorSession());
    this.$watch('editorView', () => this.persistEditorSession());
    this.$watch('schemaSection', () => this.persistEditorSession());
  },

  persistEditorSession() {
    try {
      const payload = {
        yamlText: this.yamlText || '',
        yamlName: this.yamlName || '',
        yamlNameGenerated: this.yamlNameGenerated === true,
        editorView: this.editorView || 'schema',
        schemaSection: this.schemaSection || 'fundamentals',
        savedAt: new Date().toISOString(),
      };

      if (!payload.yamlText.trim() && !payload.yamlName) {
        this.clearEditorSession();
        return;
      }

      sessionStorage.setItem(this.editorSessionKey, JSON.stringify(payload));
      this.editorStorageWarning = '';
    } catch (error) {
      this.editorStorageWarning = this.t('editor.messages.draftStorage', { message: error.message });
    }
  },

  applyEditorChange(textarea, value, selectionStart, selectionEnd = selectionStart) {
    textarea.value = value;
    textarea.selectionStart = selectionStart;
    textarea.selectionEnd = selectionEnd;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  },

  handleEditorKeydown(event) {
    const textarea = event.target;
    if (!textarea || textarea.tagName !== 'TEXTAREA') return;

    if (event.key === 'Tab') {
      event.preventDefault();
      this.handleEditorTab(textarea, event.shiftKey);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      this.handleEditorEnter(textarea);
    }
  },

  handleEditorTab(textarea, outdent = false) {
    const value = textarea.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const hasSelection = start !== end;
    const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const lineEndIndex = value.indexOf('\n', end);
    const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
    const touchedBlock = value.slice(lineStart, lineEnd);
    const isMultiLineSelection = hasSelection && touchedBlock.includes('\n');

    if (!outdent && !hasSelection && !isMultiLineSelection) {
      const nextValue = `${value.slice(0, start)}${this.indentUnit}${value.slice(end)}`;
      this.applyEditorChange(textarea, nextValue, start + this.indentUnit.length);
      return;
    }

    const lines = touchedBlock.split('\n');
    const shifted = outdent
      ? lines.map((line) => {
          if (line.startsWith(this.indentUnit)) return line.slice(this.indentUnit.length);
          if (line.startsWith('\t')) return line.slice(1);
          if (line.startsWith(' ')) return line.slice(1);
          return line;
        })
      : lines.map((line) => `${this.indentUnit}${line}`);

    const nextBlock = shifted.join('\n');
    const nextValue = `${value.slice(0, lineStart)}${nextBlock}${value.slice(lineEnd)}`;
    this.applyEditorChange(textarea, nextValue, lineStart, lineStart + nextBlock.length);
  },

  handleEditorEnter(textarea) {
    const value = textarea.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const currentLineBeforeCaret = value.slice(lineStart, start);
    const indentMatch = currentLineBeforeCaret.match(/^[\t ]*/);
    const baseIndent = indentMatch ? indentMatch[0] : '';
    const shouldIncrease = /:\s*$/.test(currentLineBeforeCaret.trimEnd());
    const nextIndent = shouldIncrease ? `${baseIndent}${this.indentUnit}` : baseIndent;
    const insertion = `\n${nextIndent}`;
    const nextValue = `${value.slice(0, start)}${insertion}${value.slice(end)}`;
    const nextCaret = start + insertion.length;
    this.applyEditorChange(textarea, nextValue, nextCaret);
  },

  async importYaml(event) {
    if (!this.pythonReady) {
      this.schemaParseWarning = this.t('editor.messages.runtimeContract');
      event.target.value = '';
      return;
    }

    const file = event.target.files?.[0];
    if (!file) return;
    await this.handleYamlFile(file);
    event.target.value = '';
  },

  openContractTemplateModal() {
    if (!this.pythonReady) {
      this.schemaParseWarning = this.t('editor.messages.runtimeTemplate');
      return;
    }
    this.contractTemplateModalOpen = true;
  },

  closeContractTemplateModal() {
    this.contractTemplateModalOpen = false;
  },

  async loadContractTemplate(template) {
    if (!this.pythonReady || !template?.path) return;

    try {
      const contractResponse = await fetch(template.path, { cache: 'no-cache' });
      if (!contractResponse.ok) {
        throw new Error(this.t('editor.messages.templateContractStatus', { status: contractResponse.status }));
      }

      this.contractTemplateModalOpen = false;
      this.applyLoadedContract(
        await contractResponse.text(),
        template.fileName || 'template.yaml'
      );
    } catch (error) {
      this.schemaParseWarning = this.t('editor.messages.templateContractFailed', { message: error.message });
    }
  },

  downloadYaml() {
    const blob = new Blob([this.yamlText || ''], { type: 'text/yaml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = this.yamlName || 'contract.yaml';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },

  async dropYaml(event) {
    if (!this.pythonReady) {
      this.schemaParseWarning = this.t('editor.messages.runtimeContract');
      return;
    }

    const file = [...event.dataTransfer.files].find((f) => /\.ya?ml$/i.test(f.name));
    if (!file) return;
    await this.handleYamlFile(file);
  },

  async handleYamlFile(file) {
    this.applyLoadedContract(await file.text(), file.name);
  },

  applyLoadedContract(yamlText, fileName) {
    this.yamlText = yamlText;
    this.yamlName = fileName;
    this.yamlNameGenerated = false;
    this.schemaStarted = Boolean(this.yamlText.trim());
    this.editorView = 'schema';
    this.clearResults();
    this.syncSchemaFromYaml({ preserveCurrentOnError: false });
    this.setSchemaSection('fundamentals');
    this.persistEditorSession();
  },
};
