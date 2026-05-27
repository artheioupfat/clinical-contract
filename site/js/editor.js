window.ClinicalModules = window.ClinicalModules || {};

window.ClinicalModules.editor = {
  indentUnit: '  ',
  editorSessionKey: 'clinical-contract-editor-session-v1',

  clearEditorSession() {
    try {
      sessionStorage.removeItem(this.editorSessionKey);
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

      this.yamlText = typeof session.yamlText === 'string' ? session.yamlText : '';
      this.yamlName = typeof session.yamlName === 'string' ? session.yamlName : '';
      this.editorView = session.editorView === 'yaml' ? 'yaml' : 'schema';
      this.schemaSection = typeof session.schemaSection === 'string'
        ? session.schemaSection
        : 'fundamentals';
      this.schemaStarted = Boolean(this.yamlText.trim());

      if (this.schemaStarted && typeof this.syncSchemaFromYaml === 'function') {
        this.syncSchemaFromYaml({ preserveCurrentOnError: false });
      }
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
        editorView: this.editorView || 'schema',
        schemaSection: this.schemaSection || 'fundamentals',
        savedAt: new Date().toISOString(),
      };

      if (!payload.yamlText.trim() && !payload.yamlName) {
        this.clearEditorSession();
        return;
      }

      sessionStorage.setItem(this.editorSessionKey, JSON.stringify(payload));
    } catch (_error) {
      // Ignore storage failures.
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
    const file = event.target.files?.[0];
    if (!file) return;
    await this.handleYamlFile(file);
    event.target.value = '';
  },

  async loadExampleContract() {
    try {
      const [contractResponse, dataResponse] = await Promise.all([
        fetch('./examples/contract.yaml'),
        fetch('./examples/template.parquet'),
      ]);
      if (!contractResponse.ok) {
        throw new Error(`Template contract request failed with status ${contractResponse.status}`);
      }
      if (!dataResponse.ok) {
        throw new Error(`Template data request failed with status ${dataResponse.status}`);
      }

      const [contractText, dataBuffer] = await Promise.all([
        contractResponse.text(),
        dataResponse.arrayBuffer(),
      ]);
      const dataFile = new File([dataBuffer], 'template.parquet', {
        type: 'application/octet-stream',
      });

      this.yamlText = contractText;
      this.yamlName = 'template.yaml';
      this.schemaStarted = true;
      this.clearResults();
      if (typeof this.loadDataFile === 'function') {
        await this.loadDataFile(dataFile);
      }
      if (typeof this.syncSchemaFromYaml === 'function') {
        this.syncSchemaFromYaml({ preserveCurrentOnError: false });
      }
      if (typeof this.setSchemaSection === 'function') {
        this.setSchemaSection('fundamentals');
      } else {
        this.schemaSection = 'fundamentals';
      }
      this.persistEditorSession();
    } catch (error) {
      this.schemaParseWarning = `Unable to load template: ${error.message}`;
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
    const file = [...event.dataTransfer.files].find((f) => /\.ya?ml$/i.test(f.name));
    if (!file) return;
    await this.handleYamlFile(file);
  },

  async handleYamlFile(file) {
    this.yamlText = await file.text();
    this.yamlName = file.name;
    this.schemaStarted = Boolean(this.yamlText.trim());
    this.clearResults();
    if (typeof this.syncSchemaFromYaml === 'function') {
      this.syncSchemaFromYaml({ preserveCurrentOnError: false });
    }
    if (typeof this.setSchemaSection === 'function') {
      this.setSchemaSection('fundamentals');
    } else {
      this.schemaSection = 'fundamentals';
    }
    this.persistEditorSession();
  },
};
