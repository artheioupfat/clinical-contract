window.ClinicalModules = window.ClinicalModules || {};

window.ClinicalModules.schema = {
  ensureYamlLibrary() {
    const yamlLib = window.jsyaml;
    if (!yamlLib || typeof yamlLib.load !== 'function' || typeof yamlLib.dump !== 'function') {
      throw new Error('YAML parser is unavailable in the browser runtime.');
    }
    return yamlLib;
  },

  ensureContractCodec() {
    if (!window.ClinicalContractCodec) {
      throw new Error('Contract codec is unavailable in the browser runtime.');
    }
    return window.ClinicalContractCodec;
  },

  editorModeButtonClass(mode) {
    const base = 'view-switch-btn';
    return this.editorView === mode ? `${base} view-switch-btn--active` : base;
  },

  schemaSectionClass(sectionId) {
    return this.schemaSection === sectionId
      ? 'schema-nav-item schema-nav-item--active'
      : 'schema-nav-item';
  },

  setSchemaSection(sectionId) {
    const sections = Array.isArray(this.schemaSections) ? this.schemaSections : [];
    if (!sections.some((section) => section.id === sectionId)) return;
    this.schemaSection = sectionId;
    this.persistEditorSession();
  },

  closeResetContractModal() {
    this.resetContractModalOpen = false;
  },

  openRemoveTableModal() {
    if (!Array.isArray(this.schemaCollection) || this.schemaCollection.length === 0) return;
    this.removeTableModalOpen = true;
  },

  closeRemoveTableModal() {
    this.removeTableModalOpen = false;
  },

  confirmRemoveTable() {
    this.removeTableModalOpen = false;
    this.removeActiveSchemaTable();
  },

  resetContractDraft() {
    this.resetContractModalOpen = false;
    this.removeTableModalOpen = false;
    this.yamlText = '';
    this.yamlName = '';
    this.yamlNameGenerated = false;
    this.editorView = 'schema';
    this.schemaStarted = false;
    this.schemaParseWarning = '';
    this.showRequiredHints = false;
    this.schemaSection = 'fundamentals';
    this.dataTab = 'data';
    this.seedSchemaDraft();
    this.clearResults();
    this.clearEditorSession();
  },

  isBlankRequiredValue(value) {
    return String(value ?? '').trim() === '';
  },

  showRequiredFor(fieldKey, row = null) {
    if (!this.showRequiredHints) return false;

    const draft = this.schemaDraft || {};
    const fieldMap = {
      name: draft.name,
      version: draft.version,
      tableName: draft.tableName,
      tableDescription: draft.tableDescription,
    };

    if (Object.prototype.hasOwnProperty.call(fieldMap, fieldKey)) {
      return this.isBlankRequiredValue(fieldMap[fieldKey]);
    }

    if (!row) return false;

    const rowFieldMap = {
      propertyName: row.name,
    };

    if (Object.prototype.hasOwnProperty.call(rowFieldMap, fieldKey)) {
      return this.isBlankRequiredValue(rowFieldMap[fieldKey]);
    }

    return false;
  },

  requiredInputClass(fieldKey, row = null) {
    return this.showRequiredFor(fieldKey, row) ? 'schema-input--required' : '';
  },

  isContractActive() {
    return String(this.schemaDraft?.status || 'active').trim().toLowerCase() === 'active';
  },

  setContractActive(isActive) {
    this.schemaDraft.status = isActive ? 'active' : 'inactive';
    this.pushSchemaToYaml();
  },

  createSchemaProperty(seed = {}) {
    return this.ensureContractCodec().createSchemaProperty(seed, {
      nextRowId: () => this.nextSchemaRowId(),
    });
  },

  createQualityRule(seed = {}) {
    return this.ensureContractCodec().createQualityRule(seed, {
      nextRowId: () => this.nextSchemaRowId(),
    });
  },

  createTeamMember(seed = {}) {
    return this.ensureContractCodec().createTeamMember(seed, {
      nextRowId: () => this.nextSchemaRowId(),
    });
  },

  nextSchemaRowId() {
    this.schemaRowCounter += 1;
    return this.schemaRowCounter;
  },

  getLogicalTypeOptions(row) {
    const defaults = Array.isArray(this.logicalTypeOptions) ? this.logicalTypeOptions : [];
    const current = String(row?.logicalType || '').trim();
    if (!current) return defaults;
    if (defaults.includes(current)) return defaults;
    return [current, ...defaults];
  },

  getPhysicalTypeOptions(row) {
    const logical = String(row?.logicalType || '').trim();
    if (!logical) return [];
    const physicalMap = this.physicalTypeByLogical || {};
    const defaults = Array.isArray(physicalMap[logical]) ? physicalMap[logical] : [];
    const current = String(row?.physicalType || '').trim();
    if (!current) return defaults;
    if (defaults.includes(current)) return defaults;
    return [current, ...defaults];
  },

  shouldShowPhysicalType(row) {
    return Boolean(String(row?.logicalType || '').trim());
  },

  onLogicalTypeChanged(row) {
    const codec = this.ensureContractCodec();
    const nextLogical = codec.normalizeTypeToken(row.logicalType);
    const previousLogical = codec.normalizeTypeToken(row._lastLogicalType);
    row.logicalType = nextLogical;

    if (!nextLogical || nextLogical !== previousLogical) {
      row.physicalType = '';
    }
    row._lastLogicalType = nextLogical;
    this.pushSchemaToYaml();
  },

  onPhysicalTypeChanged(row) {
    if (!this.shouldShowPhysicalType(row)) {
      row.physicalType = '';
    }
    this.pushSchemaToYaml();
  },

  addSchemaProperty() {
    const property = this.createSchemaProperty();
    this.schemaDraft.properties.push(property);
    this.columnEditorRowId = property._rowId;
    this.pushSchemaToYaml();
  },

  removeSchemaProperty(rowId) {
    this.schemaDraft.properties = this.schemaDraft.properties.filter((row) => row._rowId !== rowId);
    if (this.columnEditorRowId === rowId) {
      this.columnEditorRowId = null;
    }
    this.schemaDraft.qualityRules = (this.schemaDraft.qualityRules || []).filter(
      (rule) => this.schemaDraft.properties.some((property) => property.name === rule.propertyName)
    );
    this.pushSchemaToYaml();
  },

  openSchemaProperty(rowId) {
    this.columnEditorRowId = rowId;
  },

  closeSchemaProperty() {
    this.columnEditorRowId = null;
  },

  schemaEditorProperty() {
    return (this.schemaDraft.properties || []).find(
      (property) => property._rowId === this.columnEditorRowId
    ) || null;
  },

  columnTypeSummary(row) {
    if (row?.logicalType && row?.physicalType) {
      return `${row.logicalType} / ${row.physicalType}`;
    }
    if (row?.logicalType) return row.logicalType;
    if (row?.physicalType) return row.physicalType;
    return this.t('editor.columns.noConstraint');
  },

  addQualityRule() {
    const firstProperty = (this.schemaDraft.properties || []).find((property) => property.name);
    if (!firstProperty) return;
    const rule = this.createQualityRule({ propertyName: firstProperty?.name || '' });
    this.schemaDraft.qualityRules.push(rule);
    this.qualityEditorRuleId = rule._rowId;
    this.pushSchemaToYaml();
  },

  removeQualityRule(rowId) {
    this.schemaDraft.qualityRules = this.schemaDraft.qualityRules.filter((rule) => rule._rowId !== rowId);
    if (this.qualityEditorRuleId === rowId) {
      this.qualityEditorRuleId = null;
    }
    this.pushSchemaToYaml();
  },

  openQualityRule(rowId) {
    this.qualityEditorRuleId = rowId;
  },

  closeQualityRule() {
    this.qualityEditorRuleId = null;
  },

  qualityEditorRule() {
    return (this.schemaDraft.qualityRules || []).find(
      (rule) => rule._rowId === this.qualityEditorRuleId
    ) || null;
  },

  setQualityRuleProperty(rule, propertyName) {
    if (!rule) return;
    rule.propertyName = propertyName || '';
    this.pushSchemaToYaml();
  },

  addTeamMember() {
    const member = this.createTeamMember();
    this.schemaDraft.teamMembers.push(member);
    this.teamEditorMemberId = member._rowId;
    this.pushSchemaToYaml();
  },

  removeTeamMember(rowId) {
    this.schemaDraft.teamMembers = this.schemaDraft.teamMembers.filter((member) => member._rowId !== rowId);
    if (this.teamEditorMemberId === rowId) {
      this.teamEditorMemberId = null;
    }
    this.pushSchemaToYaml();
  },

  openTeamMember(rowId) {
    this.teamEditorMemberId = rowId;
  },

  closeTeamMember() {
    this.teamEditorMemberId = null;
  },

  teamEditorMember() {
    return (this.schemaDraft.teamMembers || []).find(
      (member) => member._rowId === this.teamEditorMemberId
    ) || null;
  },

  setEditorView(mode) {
    if (!['schema', 'yaml', 'validation'].includes(mode)) return;
    if (mode === this.editorView) return;
    if (mode === 'schema') {
      this.syncSchemaFromYaml({ preserveCurrentOnError: true });
    }
    this.editorView = mode;
    this.persistEditorSession();
  },

  startBlankContract() {
    if (!this.pythonReady) {
      this.schemaParseWarning = this.t('editor.messages.runtimeStart');
      return;
    }

    this.schemaStarted = true;
    this.checkerCollapsed = false;
    this.schemaParseWarning = '';
    this.showRequiredHints = false;
    this.yamlName = 'contract.yaml';
    this.yamlNameGenerated = true;
    this.editorView = 'schema';
    this.clearResults();
    this.seedSchemaDraft();
    this.pushSchemaToYaml();
    this.setSchemaSection('fundamentals');
    this.persistEditorSession();
  },

  seedSchemaDraft({ withProperty = false } = {}) {
    this.schemaDraft = this.ensureContractCodec().createEmptyDraft({
      withProperty,
      nextRowId: () => this.nextSchemaRowId(),
    });
    this.schemaRootExtras = {};
    this.schemaCollection = [];
    this.schemaActiveIndex = 0;
    this.columnEditorRowId = null;
    this.qualityEditorRuleId = null;
    this.teamEditorMemberId = null;
  },

  syncSchemaFromYaml({ preserveCurrentOnError = true } = {}) {
    if (!this.yamlText || !this.yamlText.trim()) {
      this.seedSchemaDraft();
      this.schemaStarted = false;
      this.schemaParseWarning = '';
      return;
    }

    let parsed;
    try {
      parsed = this.ensureYamlLibrary().load(this.yamlText);
    } catch (error) {
      this.schemaParseWarning = this.t('editor.messages.yamlParse', { message: error.message });
      this.schemaStarted = true;
      if (!preserveCurrentOnError || !this.schemaDraft.properties.length) {
        this.seedSchemaDraft();
      }
      return;
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      this.schemaParseWarning = this.t('editor.messages.yamlRoot');
      this.schemaStarted = true;
      if (!preserveCurrentOnError || !this.schemaDraft.properties.length) {
        this.seedSchemaDraft();
      }
      return;
    }

    const decoded = this.ensureContractCodec().contractObjectToDraft(parsed, {
      nextRowId: () => this.nextSchemaRowId(),
      activeSchemaIndex: this.schemaActiveIndex,
    });

    this.schemaDraft = decoded.draft;
    this.schemaRootExtras = decoded.rootExtras;
    this.schemaCollection = decoded.schemas;
    this.schemaActiveIndex = decoded.activeSchemaIndex;
    this.columnEditorRowId = null;
    this.qualityEditorRuleId = null;
    this.teamEditorMemberId = null;
    this.schemaParseWarning = '';
    this.schemaStarted = true;
    if (this.yamlNameGenerated) {
      this.yamlName = this.ensureContractCodec().contractFileName(this.schemaDraft.name);
    }
  },

  syncSchemaFromYamlEditor() {
    if (this.editorView !== 'yaml') return;
    this.syncSchemaFromYaml({ preserveCurrentOnError: true });
  },

  invalidateResultsFromYamlEditor() {
    if (this.editorView !== 'yaml') return;
    this.clearResults();
  },

  pushSchemaToYaml() {
    try {
      this.schemaStarted = true;
      const contract = this.ensureContractCodec().draftToContractObject(
        this.schemaDraft || {},
        this.schemaRootExtras || {},
        this.schemaCollection || [],
        this.schemaActiveIndex
      );
      this.schemaCollection = Array.isArray(contract.schema) ? contract.schema : [];
      this.yamlText = this.ensureYamlLibrary().dump(contract, {
        noRefs: true,
        lineWidth: 110,
        sortKeys: false,
      });
      this.yamlName = this.yamlNameGenerated
        ? this.ensureContractCodec().contractFileName(this.schemaDraft?.name)
        : this.yamlName || 'contract.yaml';
      this.schemaParseWarning = '';
      this.clearResults();
    } catch (error) {
      this.schemaParseWarning = this.t('editor.messages.schemaSync', { message: error.message });
    }
  },

  selectSchemaTable(index) {
    const nextIndex = Number(index);
    if (!Number.isInteger(nextIndex) || nextIndex === this.schemaActiveIndex) return;
    this.pushSchemaToYaml();
    this.schemaActiveIndex = nextIndex;
    this.syncSchemaFromYaml({ preserveCurrentOnError: false });
  },

  addSchemaTable() {
    this.pushSchemaToYaml();
    const parsed = this.ensureYamlLibrary().load(this.yamlText) || {};
    const schemas = Array.isArray(parsed.schema) ? parsed.schema : [];
    schemas.push({ name: '', physicalType: 'TABLE', properties: [] });
    parsed.schema = schemas;
    this.yamlText = this.ensureYamlLibrary().dump(parsed, {
      noRefs: true,
      lineWidth: 110,
      sortKeys: false,
    });
    this.schemaActiveIndex = schemas.length - 1;
    this.syncSchemaFromYaml({ preserveCurrentOnError: false });
    this.setSchemaSection('schema');
    this.persistEditorSession();
  },

  removeActiveSchemaTable() {
    this.pushSchemaToYaml();
    const parsed = this.ensureYamlLibrary().load(this.yamlText) || {};
    const schemas = Array.isArray(parsed.schema) ? parsed.schema : [];
    if (!schemas.length) return;
    if (schemas.length === 1) {
      schemas[0] = { name: '', physicalType: 'TABLE', properties: [] };
    } else {
      schemas.splice(this.schemaActiveIndex, 1);
    }
    parsed.schema = schemas;
    this.yamlText = this.ensureYamlLibrary().dump(parsed, {
      noRefs: true,
      lineWidth: 110,
      sortKeys: false,
    });
    this.schemaActiveIndex = Math.min(this.schemaActiveIndex, schemas.length - 1);
    this.syncSchemaFromYaml({ preserveCurrentOnError: false });
    this.persistEditorSession();
  },
};
