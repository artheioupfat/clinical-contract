(function registerContractCodec(root, factory) {
  const codec = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = codec;
  }
  root.ClinicalContractCodec = codec;
})(typeof globalThis !== 'undefined' ? globalThis : window, function buildContractCodec() {
  function deepClone(value) {
    try {
      return structuredClone(value);
    } catch (_error) {
      return JSON.parse(JSON.stringify(value));
    }
  }

  function normalizeTypeToken(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  function normalizeContractDescription(description) {
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
  }

  function readFirstDefined(source, keys, fallback = '') {
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
  }

  function createIdFactory(options = {}) {
    if (typeof options.nextRowId === 'function') return options.nextRowId;
    let counter = Number(options.startRowId) || 0;
    return () => {
      counter += 1;
      return counter;
    };
  }

  function createSchemaProperty(seed = {}, options = {}) {
    const logicalType = normalizeTypeToken(seed.logicalType || '');
    const physicalType = normalizeTypeToken(seed.physicalType || '');
    const nextRowId = createIdFactory(options);
    return {
      _rowId: nextRowId(),
      name: seed.name || '',
      logicalType,
      physicalType,
      _lastLogicalType: logicalType,
      required: Boolean(seed.required),
      description: seed.description || '',
      extras: deepClone(seed.extras || {}),
    };
  }

  function createQualityRule(seed = {}, options = {}) {
    const nextRowId = createIdFactory(options);
    return {
      _rowId: nextRowId(),
      propertyName: seed.propertyName || '',
      type: seed.type || 'sql',
      description: seed.description || '',
      query: seed.query || '',
      mustBe: seed.mustBe ?? 0,
      extras: deepClone(seed.extras || {}),
    };
  }

  function createTeamMember(seed = {}, options = {}) {
    const nextRowId = createIdFactory(options);
    return {
      _rowId: nextRowId(),
      name: seed.name || '',
      role: seed.role || '',
      email: seed.email || '',
      extras: deepClone(seed.extras || {}),
    };
  }

  function createEmptyDraft(options = {}) {
    const nextRowId = createIdFactory(options);
    return {
      apiVersion: 'v3.1.0',
      kind: 'DataContract',
      id: '',
      name: '',
      version: '1.0.0',
      status: 'active',
      descriptionPurpose: '',
      descriptionUsage: '',
      descriptionLimitations: '',
      studyStartDate: '',
      studyEndDate: '',
      studyType: '',
      studyObjective: '',
      healthDomain: '',
      tableName: '',
      tableDescription: '',
      properties: options.withProperty ? [createSchemaProperty({}, { nextRowId })] : [],
      qualityRules: [],
      teamName: '',
      teamDescription: '',
      teamMembers: [],
      teamExtras: {},
      tableExtras: {},
      studyExtras: {},
    };
  }

  function collectExtras(source, handledKeys) {
    const extras = {};
    if (!source || typeof source !== 'object') return extras;
    for (const [key, value] of Object.entries(source)) {
      if (!handledKeys.has(key)) extras[key] = value;
    }
    return extras;
  }

  function slugifyContractId(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function contractObjectToDraft(contract, options = {}) {
    const parsed = contract && typeof contract === 'object' && !Array.isArray(contract) ? contract : {};
    const nextRowId = createIdFactory(options);
    const handledRoot = new Set(['apiVersion', 'kind', 'id', 'name', 'version', 'status', 'description', 'study', 'schema', 'team']);
    const rootExtras = collectExtras(parsed, handledRoot);

    const study = parsed.study && typeof parsed.study === 'object' && !Array.isArray(parsed.study) ? parsed.study : {};
    const handledStudy = new Set([
      'startDate',
      'start_date',
      'start-date',
      'endDate',
      'end_date',
      'end-date',
      'type',
      'studyType',
      'study_type',
      'study-type',
      'objective',
      'studyObjective',
      'study_objective',
      'study-objective',
      'healthDomain',
      'health_domain',
      'health-domain',
      'domain',
    ]);
    const studyExtras = collectExtras(study, handledStudy);

    const schemaArray = Array.isArray(parsed.schema) ? parsed.schema : [];
    const firstSchema = schemaArray[0] && typeof schemaArray[0] === 'object' ? schemaArray[0] : {};
    const otherSchemas = schemaArray.slice(1);

    const handledTable = new Set(['name', 'physicalType', 'description', 'properties']);
    const tableExtras = collectExtras(firstSchema, handledTable);

    const qualityRules = [];
    const properties = Array.isArray(firstSchema.properties) ? firstSchema.properties : [];
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
      const propExtras = collectExtras(source, handledProp);
      const logicalType = normalizeTypeToken(
        readFirstDefined(source, ['logicalType', 'logicaltype', 'logical_type', 'logical-type'])
      );
      const physicalType = normalizeTypeToken(
        readFirstDefined(source, ['physicalType', 'physicaltype', 'physical_type', 'physical-type'])
      );
      const rules = Array.isArray(source.quality) ? source.quality : [];

      for (const rule of rules) {
        const quality = rule && typeof rule === 'object' ? rule : {};
        const handledRule = new Set(['type', 'description', 'query', 'mustBe']);
        qualityRules.push(
          createQualityRule(
            {
              propertyName: source.name || '',
              type: quality.type || 'sql',
              description: quality.description || '',
              query: quality.query || '',
              mustBe: quality.mustBe ?? 0,
              extras: collectExtras(quality, handledRule),
            },
            { nextRowId }
          )
        );
      }

      return createSchemaProperty(
        {
          name: source.name || '',
          logicalType,
          physicalType,
          required: Boolean(source.required),
          description: source.description || '',
          extras: propExtras,
        },
        { nextRowId }
      );
    });

    const team = parsed.team && typeof parsed.team === 'object' && !Array.isArray(parsed.team) ? parsed.team : {};
    const handledTeam = new Set(['name', 'description', 'members']);
    const teamExtras = collectExtras(team, handledTeam);
    const teamMembers = Array.isArray(team.members)
      ? team.members.map((member) => {
          const source = member && typeof member === 'object' ? member : {};
          const handledMember = new Set(['name', 'role', 'email']);
          return createTeamMember(
            {
              name: source.name || '',
              role: source.role || '',
              email: source.email || '',
              extras: collectExtras(source, handledMember),
            },
            { nextRowId }
          );
        })
      : [];

    const description = normalizeContractDescription(parsed.description);
    return {
      draft: {
        apiVersion: parsed.apiVersion || 'v3.1.0',
        kind: parsed.kind || 'DataContract',
        id: parsed.id || '',
        name: parsed.name || '',
        version: parsed.version || '1.0.0',
        status: parsed.status || 'active',
        descriptionPurpose: description.purpose,
        descriptionUsage: description.usage,
        descriptionLimitations: description.limitations,
        studyStartDate: readFirstDefined(study, ['startDate', 'start_date', 'start-date']),
        studyEndDate: readFirstDefined(study, ['endDate', 'end_date', 'end-date']),
        studyType: readFirstDefined(study, ['type', 'studyType', 'study_type', 'study-type']),
        studyObjective: readFirstDefined(study, ['objective', 'studyObjective', 'study_objective', 'study-objective']),
        healthDomain: readFirstDefined(study, ['healthDomain', 'health_domain', 'health-domain', 'domain']),
        tableName: firstSchema.name || '',
        tableDescription: firstSchema.description || '',
        properties: normalizedProperties,
        qualityRules,
        teamName: team.name || '',
        teamDescription: team.description || '',
        teamMembers,
        teamExtras,
        tableExtras,
        studyExtras,
      },
      rootExtras,
      otherSchemas: deepClone(otherSchemas),
    };
  }

  function draftToContractObject(draft = {}, rootExtras = {}, otherSchemas = []) {
    const top = deepClone(rootExtras || {});
    const contractId = String(draft.id || '').trim() || slugifyContractId(draft.name);

    top.apiVersion = draft.apiVersion || 'v3.1.0';
    top.kind = draft.kind || 'DataContract';
    if (contractId) top.id = contractId;
    if (draft.name) top.name = draft.name;
    if (draft.version) top.version = draft.version;
    top.status = draft.status || 'active';
    top.description = {
      purpose: draft.descriptionPurpose || '',
      usage: draft.descriptionUsage || '',
      limitations: draft.descriptionLimitations || '',
    };

    const study = deepClone(draft.studyExtras || {});
    if (draft.studyStartDate && String(draft.studyStartDate).trim()) study.startDate = String(draft.studyStartDate).trim();
    if (draft.studyEndDate && String(draft.studyEndDate).trim()) study.endDate = String(draft.studyEndDate).trim();
    if (draft.studyType && String(draft.studyType).trim()) study.type = String(draft.studyType).trim();
    if (draft.studyObjective && String(draft.studyObjective).trim()) study.objective = String(draft.studyObjective).trim();
    if (draft.healthDomain && String(draft.healthDomain).trim()) study.healthDomain = String(draft.healthDomain).trim();
    if (Object.keys(study).length) top.study = study;
    else delete top.study;

    const table = deepClone(draft.tableExtras || {});
    table.name = draft.tableName || '';
    table.physicalType = 'TABLE';
    if (draft.tableDescription) table.description = draft.tableDescription;
    else delete table.description;

    table.properties = (draft.properties || [])
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

    top.schema = [table, ...(otherSchemas || [])];

    const team = deepClone(draft.teamExtras || {});
    if (draft.teamName && draft.teamName.trim()) team.name = draft.teamName.trim();
    if (draft.teamDescription && draft.teamDescription.trim()) team.description = draft.teamDescription.trim();

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
  }

  function ensureYamlLibrary(yamlLib) {
    if (!yamlLib || typeof yamlLib.load !== 'function' || typeof yamlLib.dump !== 'function') {
      throw new Error('YAML parser is unavailable in the browser runtime.');
    }
    return yamlLib;
  }

  function yamlTextToDraft(yamlText, yamlLib, options = {}) {
    const parsed = ensureYamlLibrary(yamlLib).load(yamlText);
    return contractObjectToDraft(parsed, options);
  }

  function draftToYamlText(draft, yamlLib, options = {}) {
    const contract = draftToContractObject(draft, options.rootExtras, options.otherSchemas);
    return ensureYamlLibrary(yamlLib).dump(contract, {
      noRefs: true,
      lineWidth: 110,
      sortKeys: false,
      ...(options.dumpOptions || {}),
    });
  }

  return {
    deepClone,
    normalizeTypeToken,
    normalizeContractDescription,
    readFirstDefined,
    createEmptyDraft,
    createSchemaProperty,
    createQualityRule,
    createTeamMember,
    contractObjectToDraft,
    draftToContractObject,
    yamlTextToDraft,
    draftToYamlText,
  };
});
