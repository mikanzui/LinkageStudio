import { validateSpring } from '../core/springs/spring-model';
import type { Joint, Link, MechanismSpring } from '../types';
import { MAX_DOCUMENT_CHARACTERS, MAX_DOCUMENT_DEPTH, MAX_DOCUMENT_VALUES, MAX_DOCUMENT_ISSUES, MAX_ENTITY_ID_LENGTH } from './limits';

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
  let hasErrors = false;
  const issue = (path: string, message: string, severity: DocumentIssue['severity'] = 'error') => {
    if (severity === 'error') hasErrors = true;
    const item = { path, message, severity };
    if (issues.length < MAX_DOCUMENT_ISSUES) issues.push(item);
    else if (severity === 'error' && !issues.some(i => i.severity === 'error')) issues[issues.length - 1] = item;
  };
  if (typeof text !== 'string') return { ok: false, issues: [{ severity: 'error', path: '$', message: 'Expected JSON project text.' }] };
  if (text.length > MAX_DOCUMENT_CHARACTERS) return { ok: false,
    issues: [{ severity: 'error', path: '$', message: 'Project exceeds the supported 32-million-character file limit.' }] };
  let data: unknown;
  try { data = JSON.parse(text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text); }
  catch { return { ok: false, issues: [{ severity: 'error', path: '$', message: 'Invalid JSON. Choose an intact .slinker or JSON file.' }] }; }
  if (!record(data)) return { ok: false, issues: [{ severity: 'error', path: '$', message: 'Expected a mechanism object.' }] };
  const source = data;
  const pending: { value: JsonValue; path: string; depth: number }[] = [{ value: source, path: '$', depth: 0 }];
  let visited = 0;
  while (pending.length) {
    const { value, path, depth } = pending.pop()!; visited++;
    if (depth > MAX_DOCUMENT_DEPTH) { issue(path, `Project nesting exceeds ${MAX_DOCUMENT_DEPTH} levels.`); return { ok: false, issues }; }
    if (typeof value === 'number' && !finite(value)) issue(path, 'Number must be finite.');
    if (!Array.isArray(value) && !record(value)) continue;
    const keys = Object.keys(value);
    if (visited + pending.length + keys.length > MAX_DOCUMENT_VALUES) { issue(path, 'Project contains too many nested values.'); return { ok: false, issues }; }
    for (const key of keys) {
      const childPath = `${path}.${key}`.slice(0, 1024);
      if (key.length > 512) { issue(path, 'Property names must not exceed 512 characters.'); return { ok: false, issues }; }
      if (['__proto__', 'constructor', 'prototype'].includes(key)) issue(childPath, 'Reserved property name.');
      pending.push({ value: (value as JsonObject)[key], path: childPath, depth: depth + 1 });
    }
  }
  if (source.documentFormat !== undefined && source.documentFormat !== 'linkage-studio') issue('documentFormat', 'Unsupported document format.');
  if (source.schemaVersion !== undefined && source.schemaVersion !== 1) issue('schemaVersion', `Unsupported schema version ${source.schemaVersion}. This file was not modified.`);
  if (source.simulationModel !== undefined && source.simulationModel !== 'saved-links-v1') issue('simulationModel', 'Unsupported simulation model.');
  if (source.springModel !== undefined && source.springModel !== 'legacy-motion-v1') issue('springModel', 'Unsupported spring motion model.');
  if (source.forceModel !== undefined && source.forceModel !== 'unit-particle-v1') issue('forceModel', 'Unsupported model-force convention.');
  if (source.version !== undefined && typeof source.version !== 'string') issue('version', 'Version must be text.');
  if (source.sourceVersion !== undefined && typeof source.sourceVersion !== 'string') issue('sourceVersion', 'Source version must be text.');
  if (source.writerVersion !== undefined && typeof source.writerVersion !== 'string') issue('writerVersion', 'Writer version must be text.');
  const map = (name: string, required = false): JsonObject => {
    const value = source[name];
    if (value === undefined && !required) return {};
    if (!record(value)) { issue(name, 'Expected an object keyed by stable entity ID.'); return {}; }
    return value;
  };
  const joints = map('joints', true), links = map('links'), bodies = map('bodies', true);
  if (typeof source.baseBodyId !== 'string' || !Object.hasOwn(bodies, source.baseBodyId)) issue('baseBodyId', 'Base must reference an existing body.');
  const selectableIds = new Map<string, string>();
  const each = (name: string, values: JsonObject, check: (v: JsonObject, path: string) => void) => {
    for (const [id, value] of Object.entries(values)) {
      const path = `${name}.${id}`;
      if (!id.trim() || id.length > MAX_ENTITY_ID_LENGTH) issue(path, 'Expected a nonempty stable entity ID of at most 256 characters.');
      // Bodies use a separate owner namespace; selectable objects share one picker.
      if (name !== 'bodies') {
        const previous = selectableIds.get(id);
        if (previous) issue(path, `Selectable ID also belongs to ${previous}.`);
        else selectableIds.set(id, path);
      }
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
    if (v.label !== undefined && typeof v.label !== 'string') issue(`${path}.label`, 'Expected text.');
    optionalBoolean(v, 'mirrored', path);
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
    if (strings(v.jointIds) && new Set(v.jointIds).size !== v.jointIds.length) issue(`${path}.jointIds`, 'A joint may appear only once in this body.');
    optionalBoolean(v, 'useOutlineCOM', path); optionalBoolean(v, 'showLinks', path);
    if (v.frame !== undefined) {
      if (!record(v.frame) || !strings(v.frame.jointIds) || v.frame.jointIds.length !== 2 || !finite(v.frame.angleOffset)) issue(`${path}.frame`, 'Expected a finite joint-pair body frame.');
      else if (v.frame.jointIds.some(id => !strings(v.jointIds) || !v.jointIds.includes(id))) issue(`${path}.frame.jointIds`, 'Frame joints must belong to this body.');
    }
  });
  each('outlines', map('outlines'), (v, path) => {
    bodyRef(v, path);
    if (!Array.isArray(v.points) || !v.points.every(point)) issue(`${path}.points`, 'Expected finite coordinate pairs.');
    optionalBoolean(v, 'visible', path);
    optionalBoolean(v, 'closed', path);
    if (v.name !== undefined && typeof v.name !== 'string') issue(`${path}.name`, 'Expected text.');
  });
  each('images', map('images'), (v, path) => {
    bodyRef(v, path);
    if (typeof v.src !== 'string' || !v.src.startsWith('data:image/')) issue(`${path}.src`, 'Expected an embedded image data URL.');
    if (!point(v.position)) issue(`${path}.position`, 'Expected finite coordinates.');
    for (const key of ['scale', 'naturalWidth', 'naturalHeight']) number(v, key, path, Number.MIN_VALUE);
    number(v, 'rotation', path); number(v, 'opacity', path, 0, 1); optionalBoolean(v, 'visible', path);
    optionalBoolean(v, 'flipX', path);
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
    if (v.name !== undefined && typeof v.name !== 'string') issue(`${path}.name`, 'Expected text.');
    bodyRef(v, path);
    if (!point(v.localPosition)) issue(`${path}.localPosition`, 'Expected finite local coordinates.');
    optionalBoolean(v, 'enabled', path);
  });
  each('springs', map('springs'), (v, path) => {
    if (v.name !== undefined && typeof v.name !== 'string') issue(`${path}.name`, 'Expected text.');
    try { validateSpring(v as unknown as MechanismSpring, joints as unknown as Record<string, Joint>, links as unknown as Record<string, Link>); }
    catch (error) { issue(path, error instanceof Error ? error.message : 'Invalid spring.'); }
  });
  each('forceSensors', map('forceSensors'), (v, path) => {
    if (typeof v.linkId !== 'string' || !Object.hasOwn(links, v.linkId)) issue(`${path}.linkId`, 'Missing sensor link.');
    optionalBoolean(v, 'enabled', path);
    if (v.name !== undefined && typeof v.name !== 'string') issue(`${path}.name`, 'Expected text.');
  });
  if (source.projectName !== undefined && typeof source.projectName !== 'string') issue('projectName', 'Expected text.');
  const view = source.viewPreferences;
  if (view !== undefined) {
    if (!record(view)) issue('viewPreferences', 'Expected view preferences object.');
    else {
      for (const key of ['showLinks', 'showVectors', 'showRulers', 'showForceUnits', 'showLoads', 'showReactions']) optionalBoolean(view, key, 'viewPreferences');
      if (view.gridLevel !== undefined && !['normal', 'fine', 'ultrafine', 'off'].includes(String(view.gridLevel))) issue('viewPreferences.gridLevel', 'Unknown grid setting.');
      if (view.camera !== undefined && (!record(view.camera) || !point(view.camera.pan) || !finite(view.camera.zoom) || view.camera.zoom <= 0)) issue('viewPreferences.camera', 'Expected finite pan and positive zoom.');
    }
  }
  const settings = source.simulationSettings;
  if (settings !== undefined) {
    if (!record(settings)) issue('simulationSettings', 'Expected simulation settings object.');
    else {
      optionalBoolean(settings, 'gravityEnabled', 'simulationSettings');
      for (const key of ['gravityStrength', 'damping', 'dragMultiplier', 'dragDamping']) if (settings[key] !== undefined) number(settings, key, 'simulationSettings', 0, key === 'damping' || key === 'dragDamping' ? 1 : Infinity);
    }
  }
  if (hasErrors) return { ok: false, issues };
  return { ok: true, issues, context: {
    source, sourceVersion: typeof source.sourceVersion === 'string' ? source.sourceVersion : typeof source.version === 'string' ? source.version : 'unknown',
    simulationModel: 'saved-links-v1',
  } };
}

/** Keep future fields, but never resurrect deleted entities from the source file. */
export function encodeDocument(current: JsonObject, writerVersion: string, context?: DocumentContext): string {
  const result: JsonObject = { ...structuredClone(context?.source ?? {}), ...structuredClone(current) };
  for (const name of ['joints', 'links', 'bodies', 'outlines', 'images', 'sliders', 'colliders', 'tracers', 'springs', 'forceSensors']) {
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
  if (record(result.springs) && Object.keys(result.springs).length) result.springModel = 'legacy-motion-v1';
  if (record(result.forceSensors) && Object.keys(result.forceSensors).length) result.forceModel = 'unit-particle-v1';
  const text = JSON.stringify(result, null, 2);
  const check = decodeDocument(text);
  if (!check.ok) throw new Error(check.issues.map(x => `${x.path}: ${x.message}`).join('\n'));
  return text;
}
