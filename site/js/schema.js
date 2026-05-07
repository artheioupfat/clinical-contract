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
      propertyLogicalType: row.logicalType,
      propertyPhysicalType: row.physicalType,
      propertyDescription: row.description,
    };

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
    this.schemaRowCounter += 1;
    return {
      _rowId: this.schemaRowCounter,
      name: seed.name || '',
      logicalType: seed.logicalType || 'string',
      physicalType: seed.physicalType || '',
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
      extras: deepClone(seed.extras || {}),
    };
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
    const defaults = Array.isArray(physicalMap[logical]) ? physicalMap[logical] : [];
    const current = String(row?.physicalType || '').trim();
    if (!current) return defaults;
    if (defaults.includes(current)) return defaults;
    return [current, ...defaults];
  },

  onLogicalTypeChanged(row) {
    const options = this.getPhysicalTypeOptions(row);
    if (!options.length) {
      row.physicalType = '';
      this.pushSchemaToYaml();
      return;
    }
    if (!options.includes(row.physicalType)) {
      [row.physicalType] = options;
    }
    this.pushSchemaToYaml();
  },

  addSchemaProperty() {
    this.schemaDraft.properties.push(this.createSchemaProperty());
    this.pushSchemaToYaml();
  },

  removeSchemaProperty(rowId) {
    this.schemaDraft.properties = this.schemaDraft.properties.filter((row) => row._rowId !== rowId);
    this.schemaDraft.qualityRules = (this.schemaDraft.qualityRules || []).filter(
      (rule) => this.schemaDraft.properties.some((property) => property.name === rule.propertyName)
    );
    this.pushSchemaToYaml();
  },

  addQualityRule() {
    const firstProperty = (this.schemaDraft.properties || []).find((property) => property.name);
    if (!firstProperty) return;
    this.schemaDraft.qualityRules.push(
      this.createQualityRule({ propertyName: firstProperty?.name || '' })
    );
    this.pushSchemaToYaml();
  },

  removeQualityRule(rowId) {
    this.schemaDraft.qualityRules = this.schemaDraft.qualityRules.filter((rule) => rule._rowId !== rowId);
    this.pushSchemaToYaml();
  },

  addTeamMember() {
    this.schemaDraft.teamMembers.push(this.createTeamMember());
    this.pushSchemaToYaml();
  },

  removeTeamMember(rowId) {
    this.schemaDraft.teamMembers = this.schemaDraft.teamMembers.filter((member) => member._rowId !== rowId);
    this.pushSchemaToYaml();
  },

  setEditorView(mode) {
    if (mode === this.editorView) return;
    if (mode === 'schema') {
      this.syncSchemaFromYaml({ preserveCurrentOnError: true });
      this.setSchemaSection('fundamentals');
    }
    this.editorView = mode;
  },

  seedSchemaDraft() {
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
      properties: [this.createSchemaProperty()],
      qualityRules: [],
      teamName: '',
      teamDescription: '',
      teamMembers: [],
      teamExtras: {},
      tableExtras: {},
    };
    this.schemaRootExtras = {};
    this.schemaOtherSchemas = [];
  },

  syncSchemaFromYaml({ preserveCurrentOnError = true } = {}) {
    if (!this.yamlText || !this.yamlText.trim()) {
      this.schemaParseWarning =
        'YAML is empty. Fill the schema form to generate a valid data contract YAML.';
      this.seedSchemaDraft();
      return;
    }

    let parsed;
    try {
      parsed = this.ensureYamlLibrary().load(this.yamlText);
    } catch (error) {
      this.schemaParseWarning =
        `YAML parse warning: ${error.message}. You can still edit in Schema mode; saving fields will rewrite YAML.`;
      if (!preserveCurrentOnError || !this.schemaDraft.properties.length) {
        this.seedSchemaDraft();
      }
      return;
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      this.schemaParseWarning =
        'YAML root is not an object. Schema mode will use a clean template and rewrite YAML from form values.';
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
      const handledProp = new Set(['name', 'logicalType', 'physicalType', 'required', 'description']);
      const propExtras = {};
      for (const [key, value] of Object.entries(source)) {
        if (!handledProp.has(key)) propExtras[key] = value;
      }
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
        logicalType: source.logicalType || 'string',
        physicalType: source.physicalType || '',
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
          const handledMember = new Set(['name', 'role']);
          const memberExtras = {};
          for (const [key, value] of Object.entries(source)) {
            if (!handledMember.has(key)) memberExtras[key] = value;
          }
          return this.createTeamMember({
            name: source.name || '',
            role: source.role || '',
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
      properties: normalizedProperties.length ? normalizedProperties : [this.createSchemaProperty()],
      qualityRules,
      teamName: team.name || '',
      teamDescription: team.description || '',
      teamMembers,
      teamExtras,
      tableExtras,
    };

    this.schemaRootExtras = rootExtras;
    this.schemaOtherSchemas = deepClone(otherSchemas);
    this.schemaParseWarning = '';
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
        const row = deepClone(prop.extras || {});
        if (!prop.name || !prop.name.trim()) return null;
        row.name = prop.name.trim();
        row.logicalType = prop.logicalType || 'string';
        if (prop.physicalType && prop.physicalType.trim()) row.physicalType = prop.physicalType.trim();
        else delete row.physicalType;
        row.required = Boolean(prop.required);
        if (prop.description && prop.description.trim()) row.description = prop.description.trim();
        else delete row.description;
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
        else delete row.quality;
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
