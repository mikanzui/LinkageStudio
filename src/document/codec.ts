export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
export interface JsonObject { [key: string]: JsonValue }

export interface DocumentIssue {
  severity: 'error' | 'warning';
  path: string;
  message: string;
}

export interface DocumentContext {
  source: JsonObject;
  sourceVersion: string;
  simulationModel: 'saved-links-v1';
}

export type DecodeResult =
  | { ok: true; context: DocumentContext; issues: DocumentIssue[] }
  | { ok: false; issues: DocumentIssue[] };

const record = (value: unknown): value is JsonObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(x => typeof x === 'string');
const point = (value: unknown) => record(value) && finite(value.x) && finite(value.y);

/** Decode without changing the saved graph or discarding unrecognised features. */
export function decodeDocument(text: string): DecodeResult {
  const issues: DocumentIssue[] = [];
  const issue = (path: string, message: string, severity: DocumentIssue['severity'] = 'error') =>
    issues.push({ path, message, severity });
  let data: unknown;
  try { data = JSON.parse(text); }
  catch { return { ok: false, issues: [{ severity: 'error', path: '$', message: 'Invalid JSON. Choose an intact .slinker or JSON file.' }] }; }
  if (!record(data)) return { ok: false, issues: [{ severity: 'error', path: '$', message: 'Expected a mechanism object.' }] };
  const source = data;
  const inspect = (value: JsonValue, path: string) => {
    if (Array.isArray(value)) value.forEach((v, i) => inspect(v, `${path}[${i}]`));
    else if (record(value)) for (const [key, child] of Object.entries(value)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) issue(`${path}.${key}`, 'Reserved property name.');
      inspect(child, `${path}.${key}`);
    }
    else if (typeof value === 'number' && !finite(value)) issue(path, 'Number must be finite.');
  };
  inspect(source, '$');
  if (source.documentFormat !== undefined && source.documentFormat !== 'linkage-studio') issue('documentFormat', 'Unsupported document format.');
  if (source.schemaVersion !== undefined && source.schemaVersion !== 1) issue('schemaVersion', `Unsupported schema version ${source.schemaVersion}. This file was not modified.`);
  if (source.simulationModel !== undefined && source.simulationModel !== 'saved-links-v1') issue('simulationModel', 'Unsupported simulation model.');
  if (source.version !== undefined && typeof source.version !== 'string') issue('version', 'Version must be text.');
  if (source.sourceVersion !== undefined && typeof source.sourceVersion !== 'string') issue('sourceVersion', 'Source version must be text.');
  const map = (name: string, required = false): JsonObject => {
    const value = source[name];
    if (value === undefined && !required) return {};
    if (!record(value)) { issue(name, 'Expected an object keyed by stable entity ID.'); return {}; }
    return value;
  };
  const joints = map('joints', true), links = map('links'), bodies = map('bodies', true);
  if (typeof source.baseBodyId !== 'string' || !Object.hasOwn(bodies, source.baseBodyId)) issue('baseBodyId', 'Base must reference an existing body.');
  const each = (name: string, values: JsonObject, check: (v: JsonObject, path: string) => void) => {
    for (const [id, value] of Object.entries(values)) {
      const path = `${name}.${id}`;
      if (!record(value)) { issue(path, 'Expected an entity object.'); continue; }
      if (value.id !== id) issue(`${path}.id`, 'Entity ID must match its record key.');
      check(value, path);
    }
  };
  const number = (v: JsonObject, key: string, path: string, min = -Infinity, max = Infinity) => {
    if (!finite(v[key]) || v[key] < min || v[key] > max) issue(`${path}.${key}`, `Expected a finite number in [${min}, ${max}].`);
  };
  const optionalBoolean = (v: JsonObject, key: string, path: string) => {
    if (v[key] !== undefined && typeof v[key] !== 'boolean') issue(`${path}.${key}`, 'Expected true or false.');
  };
  const jointRef = (v: JsonObject, key: string, path: string, optionalConstraint = false) => {
    if (typeof v[key] !== 'string') issue(`${path}.${key}`, 'Expected a joint ID.');
    else if (!Object.hasOwn(joints, v[key])) issue(`${path}.${key}`, `Missing joint ${v[key]}; saved data retained.`, optionalConstraint ? 'warning' : 'error');
  };
  const bodyRef = (v: JsonObject, path: string) => {
    if (typeof v.bodyId !== 'string' || !Object.hasOwn(bodies, v.bodyId)) issue(`${path}.bodyId`, 'Missing owning body.');
  };
  each('joints', joints, (v, path) => {
    if (!['fixed', 'revolute'].includes(String(v.type))) issue(`${path}.type`, 'Expected fixed or revolute.');
    if (!point(v.position)) issue(`${path}.position`, 'Expected finite x and y coordinates.');
    if (v.connectedLinkIds !== undefined && !strings(v.connectedLinkIds)) issue(`${path}.connectedLinkIds`, 'Expected link IDs.');
    if (v.mass !== undefined) number(v, 'mass', path, 0);
    if (v.externalForce !== undefined && !point(v.externalForce)) issue(`${path}.externalForce`, 'Expected finite x and y components.');
  });
  each('links', links, (v, path) => {
    if (!strings(v.jointIds) || v.jointIds.length !== 2) issue(`${path}.jointIds`, 'Expected exactly two joint IDs.');
    else for (const id of v.jointIds) if (!Object.hasOwn(joints, id)) issue(`${path}.jointIds`, `Missing joint ${id}.`);
    number(v, 'restLength', path, 0);
    number(v, 'mass', path, 0);
  });
  each('bodies', bodies, (v, path) => {
    if (typeof v.name !== 'string' || typeof v.color !== 'string') issue(path, 'Body name and color must be text.');
    if (v.jointIds !== undefined && !strings(v.jointIds)) issue(`${path}.jointIds`, 'Expected joint IDs.');
    else if (strings(v.jointIds)) for (const id of v.jointIds) if (!Object.hasOwn(joints, id)) issue(`${path}.jointIds`, `Missing joint ${id}.`);
    optionalBoolean(v, 'useOutlineCOM', path); optionalBoolean(v, 'showLinks', path);
  });
  each('outlines', map('outlines'), (v, path) => {
    bodyRef(v, path);
    if (!Array.isArray(v.points) || !v.points.every(point)) issue(`${path}.points`, 'Expected finite coordinate pairs.');
    optionalBoolean(v, 'visible', path);
    if (v.name !== undefined && typeof v.name !== 'string') issue(`${path}.name`, 'Expected text.');
  });
  each('images', map('images'), (v, path) => {
    bodyRef(v, path);
    if (typeof v.src !== 'string' || !v.src.startsWith('data:image/')) issue(`${path}.src`, 'Expected an embedded image data URL.');
    if (!point(v.position)) issue(`${path}.position`, 'Expected finite coordinates.');
    for (const key of ['scale', 'naturalWidth', 'naturalHeight']) number(v, key, path, Number.MIN_VALUE);
    number(v, 'rotation', path); number(v, 'opacity', path, 0, 1); optionalBoolean(v, 'visible', path);
  });
  each('sliders', map('sliders'), (v, path) => {
    for (const key of ['jointIdA', 'jointIdB', 'jointIdC']) jointRef(v, key, path);
    number(v, 't', path, 0, 1);
  });
  each('colliders', map('colliders'), (v, path) => {
    jointRef(v, 'jointIdA', path, true); jointRef(v, 'jointIdC', path, true);
    if (!strings(v.bodyIds)) issue(`${path}.bodyIds`, 'Expected body IDs.');
    else for (const id of v.bodyIds) if (!Object.hasOwn(bodies, id)) issue(`${path}.bodyIds`, `Missing body ${id}; saved data retained.`, 'warning');
  });
  each('tracers', map('tracers'), (v, path) => {
    bodyRef(v, path);
    if (!point(v.localPosition)) issue(`${path}.localPosition`, 'Expected finite local coordinates.');
    optionalBoolean(v, 'enabled', path);
  });
  if (source.projectName !== undefined && typeof source.projectName !== 'string') issue('projectName', 'Expected text.');
  const view = source.viewPreferences;
  if (view !== undefined) {
    if (!record(view)) issue('viewPreferences', 'Expected view preferences object.');
    else {
      for (const key of ['showLinks', 'showVectors', 'showRulers', 'showForceUnits']) optionalBoolean(view, key, 'viewPreferences');
      if (view.gridLevel !== undefined && !['normal', 'fine', 'ultrafine', 'off'].includes(String(view.gridLevel))) issue('viewPreferences.gridLevel', 'Unknown grid setting.');
      if (view.camera !== undefined && (!record(view.camera) || !point(view.camera.pan) || !finite(view.camera.zoom) || view.camera.zoom <= 0)) issue('viewPreferences.camera', 'Expected finite pan and positive zoom.');
    }
  }
  const settings = source.simulationSettings;
  if (settings !== undefined) {
    if (!record(settings)) issue('simulationSettings', 'Expected simulation settings object.');
    else {
      optionalBoolean(settings, 'gravityEnabled', 'simulationSettings');
      for (const key of ['gravityStrength', 'damping', 'dragMultiplier', 'dragDamping']) if (settings[key] !== undefined) number(settings, key, 'simulationSettings', 0);
    }
  }
  if (issues.some(x => x.severity === 'error')) return { ok: false, issues };
  return { ok: true, issues, context: {
    source, sourceVersion: typeof source.sourceVersion === 'string' ? source.sourceVersion : typeof source.version === 'string' ? source.version : 'unknown',
    simulationModel: 'saved-links-v1',
  } };
}

/** Keep future fields, but never resurrect deleted entities from the source file. */
export function encodeDocument(current: JsonObject, writerVersion: string, context?: DocumentContext): string {
  const result: JsonObject = { ...structuredClone(context?.source ?? {}), ...structuredClone(current) };
  for (const name of ['joints', 'links', 'bodies', 'outlines', 'images', 'sliders', 'colliders', 'tracers']) {
    const source = context?.source[name];
    const active = current[name];
    if (!record(active)) continue;
    result[name] = Object.fromEntries(Object.entries(active).map(([id, value]) => [id,
      record(value) && record(source) && record(source[id]) ? { ...source[id], ...value } : value,
    ]));
  }
  result.documentFormat = 'linkage-studio';
  result.schemaVersion = 1;
  result.sourceVersion = context?.sourceVersion ?? writerVersion;
  result.version = result.sourceVersion;
  result.writerVersion = writerVersion;
  result.simulationModel = context?.simulationModel ?? 'saved-links-v1';
  const text = JSON.stringify(result, null, 2);
  const check = decodeDocument(text);
  if (!check.ok) throw new Error(check.issues.map(x => `${x.path}: ${x.message}`).join('\n'));
  return text;
}
