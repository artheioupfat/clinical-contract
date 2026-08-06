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

  function examplesToText(examples) {
    if (Array.isArray(examples)) {
      return examples
        .map((example) => (typeof example === 'string' ? example : JSON.stringify(example)))
        .join('\n');
    }
    if (examples === null || examples === undefined) return '';
    return String(examples);
  }

  function textToExamples(value) {
    return String(value || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
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
      examplesText: seed.examplesText || '',
      extras: deepClone(seed.extras || {}),
    };
  }

  const QUALITY_COMPARISON_OPERATORS = [
    'equal',
    'notEqual',
    'greaterThan',
    'greaterThanOrEqual',
    'lessThan',
    'lessThanOrEqual',
    'between',
  ];

  const ROOT_KEYS = new Set([
    'apiVersion', 'kind', 'id', 'name', 'version', 'status', 'description', 'study', 'schema', 'team',
  ]);
  const STUDY_KEYS = new Set([
    'startDate', 'start_date', 'start-date', 'endDate', 'end_date', 'end-date',
    'type', 'studyType', 'study_type', 'study-type',
    'objective', 'studyObjective', 'study_objective', 'study-objective',
    'healthDomain', 'health_domain', 'health-domain', 'domain',
  ]);
  const TABLE_KEYS = new Set(['name', 'physicalType', 'description', 'properties']);
  const PROPERTY_KEYS = new Set([
    'name', 'logicalType', 'logical_type', 'logical-type',
    'physicalType', 'physical_type', 'physical-type',
    'required', 'description', 'examples', 'quality',
  ]);
  const QUALITY_KEYS = new Set(['type', 'description', 'query', 'mustBe', 'expected']);
  const TEAM_KEYS = new Set(['name', 'description', 'members']);
  const TEAM_MEMBER_KEYS = new Set(['name', 'role', 'email']);

  function decodeQualityExpectation(quality = {}) {
    const expected = quality.expected;
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      const operator = QUALITY_COMPARISON_OPERATORS.find(
        (candidate) => Object.prototype.hasOwnProperty.call(expected, candidate)
      );
      if (operator === 'between') {
        const bounds = expected.between;
        return {
          comparisonOperator: 'between',
          expectedValue: 0,
          expectedMin: bounds && typeof bounds === 'object' ? bounds.min ?? 0 : 0,
          expectedMax: bounds && typeof bounds === 'object' ? bounds.max ?? 0 : 0,
        };
      }
      if (operator) {
        return {
          comparisonOperator: operator,
          expectedValue: expected[operator] ?? 0,
          expectedMin: 0,
          expectedMax: 0,
        };
      }
    }

    return {
      comparisonOperator: 'equal',
      expectedValue: quality.mustBe ?? 0,
      expectedMin: 0,
      expectedMax: 0,
    };
  }

  function createQualityRule(seed = {}, options = {}) {
    const nextRowId = createIdFactory(options);
    const operator = QUALITY_COMPARISON_OPERATORS.includes(seed.comparisonOperator)
      ? seed.comparisonOperator
      : 'equal';
    return {
      _rowId: nextRowId(),
      propertyName: seed.propertyName || '',
      type: seed.type || 'sql',
      description: seed.description || '',
      query: seed.query || '',
      comparisonOperator: operator,
      expectedValue: seed.expectedValue ?? seed.mustBe ?? 0,
      expectedMin: seed.expectedMin ?? 0,
      expectedMax: seed.expectedMax ?? 0,
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

  function contractFileName(value) {
    return `${slugifyContractId(value) || 'contract'}.yaml`;
  }

  function contractStudyToDraft(study) {
    return {
      studyStartDate: readFirstDefined(study, ['startDate', 'start_date', 'start-date']),
      studyEndDate: readFirstDefined(study, ['endDate', 'end_date', 'end-date']),
      studyType: readFirstDefined(study, ['type', 'studyType', 'study_type', 'study-type']),
      studyObjective: readFirstDefined(study, ['objective', 'studyObjective', 'study_objective', 'study-objective']),
      healthDomain: readFirstDefined(study, ['healthDomain', 'health_domain', 'health-domain', 'domain']),
      studyExtras: collectExtras(study, STUDY_KEYS),
    };
  }

  function qualityRuleToDraft(quality, propertyName, nextRowId) {
    const source = quality && typeof quality === 'object' ? quality : {};
    return createQualityRule({
      propertyName,
      type: source.type || 'sql',
      description: source.description || '',
      query: source.query || '',
      ...decodeQualityExpectation(source),
      extras: collectExtras(source, QUALITY_KEYS),
    }, { nextRowId });
  }

  function contractPropertyToDraft(property, nextRowId) {
    const source = property && typeof property === 'object' ? property : {};
    const logicalType = normalizeTypeToken(
      readFirstDefined(source, ['logicalType', 'logicaltype', 'logical_type', 'logical-type'])
    );
    const physicalType = normalizeTypeToken(
      readFirstDefined(source, ['physicalType', 'physicaltype', 'physical_type', 'physical-type'])
    );
    return {
      property: createSchemaProperty({
        name: source.name || '',
        logicalType,
        physicalType,
        required: Boolean(source.required),
        description: source.description || '',
        examplesText: examplesToText(source.examples),
        extras: collectExtras(source, PROPERTY_KEYS),
      }, { nextRowId }),
      qualityRules: (Array.isArray(source.quality) ? source.quality : [])
        .map((quality) => qualityRuleToDraft(quality, source.name || '', nextRowId)),
    };
  }

  function contractTeamToDraft(team, nextRowId) {
    const members = Array.isArray(team.members)
      ? team.members.map((member) => {
          const source = member && typeof member === 'object' ? member : {};
          return createTeamMember({
            name: source.name || '',
            role: source.role || '',
            email: source.email || '',
            extras: collectExtras(source, TEAM_MEMBER_KEYS),
          }, { nextRowId });
        })
      : [];
    return {
      teamName: team.name || '',
      teamDescription: team.description || '',
      teamMembers: members,
      teamExtras: collectExtras(team, TEAM_KEYS),
    };
  }

  function contractObjectToDraft(contract, options = {}) {
    const parsed = contract && typeof contract === 'object' && !Array.isArray(contract) ? contract : {};
    const nextRowId = createIdFactory(options);
    const schemaArray = Array.isArray(parsed.schema) ? parsed.schema : [];
    const requestedIndex = Number(options.activeSchemaIndex) || 0;
    const activeSchemaIndex = schemaArray.length
      ? Math.max(0, Math.min(requestedIndex, schemaArray.length - 1))
      : 0;
    const table = schemaArray[activeSchemaIndex] && typeof schemaArray[activeSchemaIndex] === 'object'
      ? schemaArray[activeSchemaIndex]
      : {};
    const study = parsed.study && typeof parsed.study === 'object' && !Array.isArray(parsed.study)
      ? parsed.study
      : {};
    const team = parsed.team && typeof parsed.team === 'object' && !Array.isArray(parsed.team)
      ? parsed.team
      : {};
    const decodedProperties = (Array.isArray(table.properties) ? table.properties : [])
      .map((property) => contractPropertyToDraft(property, nextRowId));
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
        ...contractStudyToDraft(study),
        tableName: table.name || '',
        tableDescription: table.description || '',
        properties: decodedProperties.map((item) => item.property),
        qualityRules: decodedProperties.flatMap((item) => item.qualityRules),
        ...contractTeamToDraft(team, nextRowId),
        tableExtras: collectExtras(table, TABLE_KEYS),
      },
      rootExtras: collectExtras(parsed, ROOT_KEYS),
      schemas: deepClone(schemaArray),
      activeSchemaIndex,
    };
  }

  function draftStudyToContract(draft) {
    const study = deepClone(draft.studyExtras || {});
    const fields = [
      ['studyStartDate', 'startDate'], ['studyEndDate', 'endDate'],
      ['studyType', 'type'], ['studyObjective', 'objective'],
      ['healthDomain', 'healthDomain'],
    ];
    for (const [draftKey, contractKey] of fields) {
      const value = String(draft[draftKey] || '').trim();
      if (value) study[contractKey] = value;
    }
    return study;
  }

  function qualityRuleToContract(rule) {
    const quality = deepClone(rule.extras || {});
    quality.type = rule.type || 'sql';
    if (String(rule.description || '').trim()) quality.description = rule.description.trim();
    else delete quality.description;
    quality.query = rule.query || '';
    const operator = QUALITY_COMPARISON_OPERATORS.includes(rule.comparisonOperator)
      ? rule.comparisonOperator
      : 'equal';
    quality.expected = operator === 'between'
      ? { between: { min: Number(rule.expectedMin ?? 0), max: Number(rule.expectedMax ?? 0) } }
      : { [operator]: Number(rule.expectedValue ?? 0) };
    return quality;
  }

  function draftPropertyToContract(property, qualityRules) {
    if (!String(property.name || '').trim()) return null;
    const row = deepClone(property.extras || {});
    row.name = property.name.trim();
    if (String(property.logicalType || '').trim()) row.logicalType = property.logicalType.trim();
    if (String(property.physicalType || '').trim()) row.physicalType = property.physicalType.trim();
    if (String(property.description || '').trim()) row.description = property.description.trim();
    const examples = textToExamples(property.examplesText);
    if (examples.length) row.examples = examples;
    row.required = Boolean(property.required);
    const quality = qualityRules
      .filter((rule) => rule.propertyName === property.name)
      .map(qualityRuleToContract)
      .filter((rule) => rule.query || rule.description);
    if (quality.length) row.quality = quality;
    return row;
  }

  function draftTableToContract(draft) {
    const table = deepClone(draft.tableExtras || {});
    table.name = draft.tableName || '';
    table.physicalType = 'TABLE';
    if (draft.tableDescription) table.description = draft.tableDescription;
    else delete table.description;
    table.properties = (draft.properties || [])
      .map((property) => draftPropertyToContract(property, draft.qualityRules || []))
      .filter(Boolean);
    return table;
  }

  function draftTeamToContract(draft) {
    const team = deepClone(draft.teamExtras || {});
    if (String(draft.teamName || '').trim()) team.name = draft.teamName.trim();
    if (String(draft.teamDescription || '').trim()) team.description = draft.teamDescription.trim();
    const members = (draft.teamMembers || [])
      .map((member) => {
        if (!String(member.name || '').trim()) return null;
        const row = deepClone(member.extras || {});
        row.name = member.name.trim();
        if (String(member.role || '').trim()) row.role = member.role.trim();
        if (String(member.email || '').trim()) row.email = member.email.trim();
        return row;
      })
      .filter(Boolean);
    if (members.length) team.members = members;
    return team;
  }

  function draftToContractObject(draft = {}, rootExtras = {}, schemaCollection = null, activeSchemaIndex = 0) {
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

    const study = draftStudyToContract(draft);
    if (Object.keys(study).length) top.study = study;
    else delete top.study;

    const table = draftTableToContract(draft);
    if (Array.isArray(schemaCollection) && schemaCollection.length) {
      const schemas = deepClone(schemaCollection);
      const index = Math.max(0, Math.min(Number(activeSchemaIndex) || 0, schemas.length - 1));
      schemas[index] = table;
      top.schema = schemas;
    } else {
      top.schema = [table];
    }

    const team = draftTeamToContract(draft);
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
    const contract = draftToContractObject(
      draft,
      options.rootExtras,
      options.schemas,
      options.activeSchemaIndex
    );
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
    QUALITY_COMPARISON_OPERATORS,
    decodeQualityExpectation,
    createEmptyDraft,
    createSchemaProperty,
    createQualityRule,
    createTeamMember,
    contractFileName,
    contractObjectToDraft,
    draftToContractObject,
    yamlTextToDraft,
    draftToYamlText,
  };
});
