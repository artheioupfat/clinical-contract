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

  openResetContractModal() {
    this.resetContractModalOpen = true;
  },

  closeResetContractModal() {
    this.resetContractModalOpen = false;
  },

  resetContractDraft() {
    this.resetContractModalOpen = false;
    this.deleteDataFile();
    this.yamlText = '';
    this.yamlName = '';
    this.schemaStarted = false;
    this.schemaParseWarning = '';
    this.showRequiredHints = false;
    this.schemaSection = 'fundamentals';
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
      apiVersion: draft.apiVersion,
      kind: draft.kind,
      id: draft.id,
      name: draft.name,
      version: draft.version,
      status: draft.status,
      descriptionPurpose: draft.descriptionPurpose,
      descriptionUsage: draft.descriptionUsage,
      descriptionLimitations: draft.descriptionLimitations,
      tableName: draft.tableName,
      tableDescription: draft.tableDescription,
    };

    if (Object.prototype.hasOwnProperty.call(fieldMap, fieldKey)) {
      return this.isBlankRequiredValue(fieldMap[fieldKey]);
    }

    if (!row) return false;

    const rowFieldMap = {
      propertyName: row.name,
      propertyDescription: row.description,
    };

    if (fieldKey === 'propertyLogicalType' || fieldKey === 'propertyPhysicalType') {
      return this.isBlankRequiredValue(row.logicalType) && this.isBlankRequiredValue(row.physicalType);
    }

    if (Object.prototype.hasOwnProperty.call(rowFieldMap, fieldKey)) {
      return this.isBlankRequiredValue(rowFieldMap[fieldKey]);
    }

    return false;
  },

  requiredInputClass(fieldKey, row = null) {
    return this.showRequiredFor(fieldKey, row) ? 'schema-input--required' : '';
  },

  hasAdvancedRequiredHints() {
    return ['apiVersion', 'kind', 'version', 'status'].some((field) => this.showRequiredFor(field));
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

  normalizeTypeToken(value) {
    return this.ensureContractCodec().normalizeTypeToken(value);
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
    const physicalMap = this.physicalTypeByLogical || {};
    const defaults = Array.isArray(physicalMap[logical])
      ? physicalMap[logical]
      : [...new Set(Object.values(physicalMap).flat())];
    const current = String(row?.physicalType || '').trim();
    if (!current) return defaults;
    if (defaults.includes(current)) return defaults;
    return [current, ...defaults];
  },

  onLogicalTypeChanged(row) {
    const nextLogical = this.normalizeTypeToken(row.logicalType);
    const previousLogical = this.normalizeTypeToken(row._lastLogicalType);
    row.logicalType = nextLogical;

    if (nextLogical !== previousLogical) {
      row.physicalType = '';
    }
    row._lastLogicalType = nextLogical;
    this.pushSchemaToYaml();
  },

  onPhysicalTypeChanged(row) {
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
    return 'Not specified';
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
    if (mode === this.editorView) return;
    if (mode === 'schema') {
      this.syncSchemaFromYaml({ preserveCurrentOnError: true });
      this.setSchemaSection(this.schemaDraft.properties?.length ? 'schema' : 'fundamentals');
    }
    this.editorView = mode;
    this.persistEditorSession();
  },

  startBlankContract() {
    this.schemaStarted = true;
    this.schemaParseWarning = '';
    this.showRequiredHints = false;
    this.yamlName = 'datacontract.yaml';
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
    this.schemaOtherSchemas = [];
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
      this.schemaParseWarning =
        `YAML parse warning: ${error.message}. You can still edit in Schema mode; saving fields will rewrite YAML.`;
      this.schemaStarted = true;
      if (!preserveCurrentOnError || !this.schemaDraft.properties.length) {
        this.seedSchemaDraft();
      }
      return;
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      this.schemaParseWarning =
        'YAML root is not an object. Schema mode will use a clean template and rewrite YAML from form values.';
      this.schemaStarted = true;
      if (!preserveCurrentOnError || !this.schemaDraft.properties.length) {
        this.seedSchemaDraft();
      }
      return;
    }

    const decoded = this.ensureContractCodec().contractObjectToDraft(parsed, {
      nextRowId: () => this.nextSchemaRowId(),
    });

    this.schemaDraft = decoded.draft;
    this.schemaRootExtras = decoded.rootExtras;
    this.schemaOtherSchemas = decoded.otherSchemas;
    this.columnEditorRowId = null;
    this.qualityEditorRuleId = null;
    this.teamEditorMemberId = null;
    this.schemaParseWarning = '';
    this.schemaStarted = true;
  },

  syncSchemaFromYamlEditor() {
    if (this.editorView !== 'yaml') return;
    this.syncSchemaFromYaml({ preserveCurrentOnError: true });
  },

  buildContractObjectFromSchema() {
    return this.ensureContractCodec().draftToContractObject(
      this.schemaDraft || {},
      this.schemaRootExtras || {},
      this.schemaOtherSchemas || []
    );
  },

  pushSchemaToYaml() {
    try {
      this.schemaStarted = true;
      this.yamlText = this.ensureContractCodec().draftToYamlText(this.schemaDraft || {}, this.ensureYamlLibrary(), {
        rootExtras: this.schemaRootExtras || {},
        otherSchemas: this.schemaOtherSchemas || [],
      });
      this.yamlName = this.yamlName || 'datacontract.yaml';
      this.schemaParseWarning = '';
      this.clearResults();
    } catch (error) {
      this.schemaParseWarning = `Schema sync error: ${error.message}`;
    }
  },
};
