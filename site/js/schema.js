window.ClinicalModules = window.ClinicalModules || {};

function deepClone(value) {
  try {
    return structuredClone(value);
  } catch (_error) {
    return JSON.parse(JSON.stringify(value));
  }
}

window.ClinicalModules.schema = {
  ensureYamlLibrary() {
    const yamlLib = window.jsyaml;
    if (!yamlLib || typeof yamlLib.load !== 'function' || typeof yamlLib.dump !== 'function') {
      throw new Error('YAML parser is unavailable in the browser runtime.');
    }
    return yamlLib;
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

  normalizeContractDescription(description) {
    if (description && typeof description === 'object' && !Array.isArray(description)) {
      return {
        purpose: description.purpose || '',
        usage: description.usage || '',
        limitations: description.limitations || '',
      };
    }
    if (typeof description === 'string') {
      return {
        purpose: description,
        usage: '',
        limitations: '',
      };
    }
    return {
      purpose: '',
      usage: '',
      limitations: '',
    };
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
      tablePhysicalType: draft.tablePhysicalType,
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
    const logicalType = this.normalizeTypeToken(seed.logicalType || '');
    const physicalType = this.normalizeTypeToken(seed.physicalType || '');
    this.schemaRowCounter += 1;
    return {
      _rowId: this.schemaRowCounter,
      name: seed.name || '',
      logicalType,
      physicalType,
      _lastLogicalType: logicalType,
      required: Boolean(seed.required),
      description: seed.description || '',
      extras: deepClone(seed.extras || {}),
    };
  },

  createQualityRule(seed = {}) {
    this.schemaRowCounter += 1;
    return {
      _rowId: this.schemaRowCounter,
      propertyName: seed.propertyName || '',
      type: seed.type || 'sql',
      description: seed.description || '',
      query: seed.query || '',
      mustBe: seed.mustBe ?? 0,
      extras: deepClone(seed.extras || {}),
    };
  },

  createTeamMember(seed = {}) {
    this.schemaRowCounter += 1;
    return {
      _rowId: this.schemaRowCounter,
      name: seed.name || '',
      role: seed.role || '',
      email: seed.email || '',
      extras: deepClone(seed.extras || {}),
    };
  },

  readFirstDefined(source, keys, fallback = '') {
    if (!source || typeof source !== 'object') return fallback;

    const normalizedEntries = {};
    for (const [rawKey, rawValue] of Object.entries(source)) {
      const normalizedKey = String(rawKey).toLowerCase().replace(/[-_]/g, '');
      if (!Object.prototype.hasOwnProperty.call(normalizedEntries, normalizedKey)) {
        normalizedEntries[normalizedKey] = rawValue;
      }
    }

    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(source, key) && source[key] !== null && source[key] !== undefined) {
        return source[key];
      }
      const normalizedKey = String(key).toLowerCase().replace(/[-_]/g, '');
      if (
        Object.prototype.hasOwnProperty.call(normalizedEntries, normalizedKey) &&
        normalizedEntries[normalizedKey] !== null &&
        normalizedEntries[normalizedKey] !== undefined
      ) {
        return normalizedEntries[normalizedKey];
      }
    }
    return fallback;
  },

  normalizeTypeToken(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim();
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

    // Clear physical type only when the logical type was effectively changed by the user.
    if (nextLogical && previousLogical && nextLogical !== previousLogical) {
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
    this.schemaDraft = {
      apiVersion: 'v3.1.0',
      kind: 'DataContract',
      id: '',
      name: '',
      version: '1.0.0',
      status: 'active',
      descriptionPurpose: '',
      descriptionUsage: '',
      descriptionLimitations: '',
      tableName: '',
      tablePhysicalType: 'TABLE',
      tableDescription: '',
      properties: withProperty ? [this.createSchemaProperty()] : [],
      qualityRules: [],
      teamName: '',
      teamDescription: '',
      teamMembers: [],
      teamExtras: {},
      tableExtras: {},
    };
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

    const handledRoot = new Set(['apiVersion', 'kind', 'id', 'name', 'version', 'status', 'description', 'schema', 'team']);
    const rootExtras = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!handledRoot.has(key)) rootExtras[key] = value;
    }

    const schemaArray = Array.isArray(parsed.schema) ? parsed.schema : [];
    const firstSchema = schemaArray[0] && typeof schemaArray[0] === 'object' ? schemaArray[0] : {};
    const otherSchemas = schemaArray.slice(1);

    const handledTable = new Set(['name', 'physicalType', 'description', 'properties']);
    const tableExtras = {};
    for (const [key, value] of Object.entries(firstSchema)) {
      if (!handledTable.has(key)) tableExtras[key] = value;
    }

    const properties = Array.isArray(firstSchema.properties) ? firstSchema.properties : [];
    const qualityRules = [];
    const normalizedProperties = properties.map((prop) => {
      const source = prop && typeof prop === 'object' ? prop : {};
      const handledProp = new Set([
        'name',
        'logicalType',
        'logical_type',
        'logical-type',
        'physicalType',
        'physical_type',
        'physical-type',
        'required',
        'description',
        'quality',
      ]);
      const propExtras = {};
      for (const [key, value] of Object.entries(source)) {
        if (!handledProp.has(key)) propExtras[key] = value;
      }
      const logicalType = this.normalizeTypeToken(
        this.readFirstDefined(source, ['logicalType', 'logicaltype', 'logical_type', 'logical-type'])
      );
      const physicalType = this.normalizeTypeToken(
        this.readFirstDefined(source, ['physicalType', 'physicaltype', 'physical_type', 'physical-type'])
      );
      const rules = Array.isArray(source.quality) ? source.quality : [];
      for (const rule of rules) {
        const quality = rule && typeof rule === 'object' ? rule : {};
        const handledRule = new Set(['type', 'description', 'query', 'mustBe']);
        const ruleExtras = {};
        for (const [key, value] of Object.entries(quality)) {
          if (!handledRule.has(key)) ruleExtras[key] = value;
        }
        qualityRules.push(
          this.createQualityRule({
            propertyName: source.name || '',
            type: quality.type || 'sql',
            description: quality.description || '',
            query: quality.query || '',
            mustBe: quality.mustBe ?? 0,
            extras: ruleExtras,
          })
        );
      }
      return this.createSchemaProperty({
        name: source.name || '',
        logicalType,
        physicalType,
        required: Boolean(source.required),
        description: source.description || '',
        extras: propExtras,
      });
    });

    const team = parsed.team && typeof parsed.team === 'object' && !Array.isArray(parsed.team) ? parsed.team : {};
    const handledTeam = new Set(['name', 'description', 'members']);
    const teamExtras = {};
    for (const [key, value] of Object.entries(team)) {
      if (!handledTeam.has(key)) teamExtras[key] = value;
    }
    const teamMembers = Array.isArray(team.members)
      ? team.members.map((member) => {
          const source = member && typeof member === 'object' ? member : {};
          const handledMember = new Set(['name', 'role', 'email']);
          const memberExtras = {};
          for (const [key, value] of Object.entries(source)) {
            if (!handledMember.has(key)) memberExtras[key] = value;
          }
          return this.createTeamMember({
            name: source.name || '',
            role: source.role || '',
            email: source.email || '',
            extras: memberExtras,
          });
        })
      : [];

    const description = this.normalizeContractDescription(parsed.description);

    this.schemaDraft = {
      apiVersion: parsed.apiVersion || 'v3.1.0',
      kind: parsed.kind || 'DataContract',
      id: parsed.id || '',
      name: parsed.name || '',
      version: parsed.version || '1.0.0',
      status: parsed.status || 'active',
      descriptionPurpose: description.purpose,
      descriptionUsage: description.usage,
      descriptionLimitations: description.limitations,
      tableName: firstSchema.name || '',
      tablePhysicalType: firstSchema.physicalType || 'TABLE',
      tableDescription: firstSchema.description || '',
      properties: normalizedProperties,
      qualityRules,
      teamName: team.name || '',
      teamDescription: team.description || '',
      teamMembers,
      teamExtras,
      tableExtras,
    };

    this.schemaRootExtras = rootExtras;
    this.schemaOtherSchemas = deepClone(otherSchemas);
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
    const draft = this.schemaDraft || {};
    const top = deepClone(this.schemaRootExtras || {});

    if (draft.apiVersion) top.apiVersion = draft.apiVersion;
    if (draft.kind) top.kind = draft.kind;
    if (draft.id) top.id = draft.id;
    if (draft.name) top.name = draft.name;
    if (draft.version) top.version = draft.version;
    if (draft.status) top.status = draft.status;
    top.description = {
      purpose: draft.descriptionPurpose || '',
      usage: draft.descriptionUsage || '',
      limitations: draft.descriptionLimitations || '',
    };

    const table = deepClone(draft.tableExtras || {});
    table.name = draft.tableName || '';
    if (draft.tablePhysicalType) table.physicalType = draft.tablePhysicalType;
    if (draft.tableDescription) table.description = draft.tableDescription;
    else delete table.description;

    const properties = (draft.properties || [])
      .map((prop) => {
        if (!prop.name || !prop.name.trim()) return null;
        const row = {};
        row.name = prop.name.trim();
        if (prop.logicalType && prop.logicalType.trim()) row.logicalType = prop.logicalType.trim();
        if (prop.physicalType && prop.physicalType.trim()) row.physicalType = prop.physicalType.trim();
        if (prop.description && prop.description.trim()) row.description = prop.description.trim();
        row.required = Boolean(prop.required);
        const quality = (draft.qualityRules || [])
          .filter((rule) => rule.propertyName === prop.name)
          .map((rule) => {
            const qualityRow = deepClone(rule.extras || {});
            qualityRow.type = rule.type || 'sql';
            if (rule.description && rule.description.trim()) qualityRow.description = rule.description.trim();
            else delete qualityRow.description;
            qualityRow.query = rule.query || '';
            qualityRow.mustBe = Number(rule.mustBe ?? 0);
            return qualityRow;
          })
          .filter((rule) => rule.query || rule.description);
        if (quality.length) row.quality = quality;
        for (const [key, value] of Object.entries(deepClone(prop.extras || {}))) {
          if (!Object.prototype.hasOwnProperty.call(row, key)) {
            row[key] = value;
          }
        }
        return row;
      })
      .filter(Boolean);

    table.properties = properties;

    const schemas = [table, ...(this.schemaOtherSchemas || [])];
    top.schema = schemas;

    const team = deepClone(draft.teamExtras || {});
    if (draft.teamName && draft.teamName.trim()) team.name = draft.teamName.trim();
    if (draft.teamDescription && draft.teamDescription.trim()) {
      team.description = draft.teamDescription.trim();
    }
    const members = (draft.teamMembers || [])
      .map((member) => {
        const row = deepClone(member.extras || {});
        if (!member.name || !member.name.trim()) return null;
        row.name = member.name.trim();
        if (member.role && member.role.trim()) row.role = member.role.trim();
        if (member.email && member.email.trim()) row.email = member.email.trim();
        return row;
      })
      .filter(Boolean);
    if (members.length) team.members = members;
    if (Object.keys(team).length) top.team = team;
    else delete top.team;

    return top;
  },

  pushSchemaToYaml() {
    let contract;
    try {
      this.schemaStarted = true;
      contract = this.buildContractObjectFromSchema();
      this.yamlText = this.ensureYamlLibrary().dump(contract, {
        noRefs: true,
        lineWidth: 110,
        sortKeys: false,
      });
      this.yamlName = this.yamlName || 'datacontract.yaml';
      this.schemaParseWarning = '';
      this.clearResults();
    } catch (error) {
      this.schemaParseWarning = `Schema sync error: ${error.message}`;
    }
  },
};
