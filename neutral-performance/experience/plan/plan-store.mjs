// ESS Plan — the vehicle development plan record, validation, progress and share codec.
// Storage: one browser key, `ess.plan.v1`. The vehicle is a reference to the shared vehicle identity (catalogue id,
// optionally the Garage entry key or a cleaned configuration); Plan never keeps its own Garage list.
// Contract for My Garage (Work): see experience/plan/CONTRACT.md. Pure functions except load/save.
import { OBJECTIVES, STEPS, STEP_KEYS } from './objectives.mjs';
import { cleanSetup, usableSetup } from '../models.mjs';
import { vehicles } from '../vehicles.mjs';
import { cleanExpectation, cleanPrediction, cleanMeasurement } from './outcomes.mjs';

export const PLAN_KEY = 'ess.plan.v1';
export const LIMITS = { projects: 12, name: 60, vision: 600, note: 600, blocker: 140, blockers: 8, measured: 400 };

const text = (v, n) => typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ').trim().slice(0, n) : '';
const line = (v, n) => text(v, n).replace(/\n+/g, ' ');
const id = () => globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
const cleanId = v => typeof v === 'string' && /^[A-Za-z0-9-]{1,80}$/.test(v) ? v : null;
export function planHref(id, prefix = '../plan/') {
  return cleanId(id) ? prefix + '?project=' + encodeURIComponent(id) : prefix;
}

export function projectsForVehicle(projects, entry) {
  return projects.filter(({vehicle}) => {
    if (!vehicle || vehicle.id !== entry.setup.id) return false;
    if (vehicle.garageKey === entry.key) return true;
    if (vehicle.garageKey) return false;
    if (vehicle.setup) {
      return vehicle.mode === entry.mode && JSON.stringify(vehicle.setup) === JSON.stringify(entry.setup);
    }
    return entry.mode === 'before' && entry.setup.id !== 'custom' && !entry.setup.name &&
      Object.keys(entry.setup.base).length === 0;
  });
}
const cleanDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';
const today = () => new Date().toISOString().slice(0, 10);

export function cleanVehicle(raw) {
  if (!raw || typeof raw !== 'object' || !Object.hasOwn(vehicles, raw.id) ) return null;
  const out = { id: raw.id };
  const garageKey = cleanId(raw.garageKey);
  if (garageKey) out.garageKey = garageKey;
  if (raw.setup) {
    try { const s = cleanSetup(raw.setup); if (s && s.id === raw.id && usableSetup(s)) out.setup = s; } catch { /* drop */ }
    if (out.setup) out.mode = raw.mode === 'after' ? 'after' : 'before';
  }
  return raw.id === 'custom' && !out.setup ? null : out;
}

export function cleanObjective(raw) {
  if (!raw || typeof raw !== 'object' || !Object.hasOwn(OBJECTIVES, raw.key)) return null;
  const o = OBJECTIVES[raw.key];
  const done = {};
  for (const k of STEP_KEYS) if (raw.done?.[k] === true) done[k] = true;
  const approach = o.approaches.some(a => a.key === raw.approach) ? raw.approach : null;
  if (!approach) { delete done.approaches; delete done.decision; }
  const measured = line(raw.measured, LIMITS.measured);
  const expectation = cleanExpectation(raw.expectation, raw.key);
  const prediction = cleanPrediction(raw.prediction, raw.key);
  const measurement = cleanMeasurement(raw.measurement, raw.key);
  if (!measured && !measurement) delete done.verify;
  const blockers = Array.isArray(raw.blockers) ? raw.blockers.map(b => line(b, LIMITS.blocker)).filter(Boolean).slice(0, LIMITS.blockers) : [];
  return { key: raw.key, done, approach, decisionNote: text(raw.decisionNote, LIMITS.note), notes: text(raw.notes, LIMITS.note),
    blockers, measured, measuredOn: measured ? cleanDate(raw.measuredOn) : '',
    ...(expectation ? { expectation } : {}), ...(prediction ? { prediction } : {}), ...(measurement ? { measurement } : {}) };
}

export function newObjective(key) { return cleanObjective({ key }); }

export function cleanProject(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const seen = new Set();
  const objectives = (Array.isArray(raw.objectives) ? raw.objectives : []).map(cleanObjective)
    .filter(o => o && !seen.has(o.key) && seen.add(o.key));
  return { id: cleanId(raw.id) ?? id(), name: line(raw.name, LIMITS.name), vision: text(raw.vision, LIMITS.vision),
    vehicle: cleanVehicle(raw.vehicle), objectives,
    ...(objectives.some(o => o.key === raw.focus) ? { focus: raw.focus } : {}),
    created: cleanDate(raw.created) || today(), updated: cleanDate(raw.updated) || today() };
}

export function newProject(vehicle = null) {
  return cleanProject({ vehicle, objectives: [] });
}

export function cleanStore(raw) {
  const projects = (Array.isArray(raw?.projects) ? raw.projects : []).map(cleanProject).filter(Boolean).slice(0, LIMITS.projects);
  const ids = new Set();
  const unique = projects.filter(p => !ids.has(p.id) && ids.add(p.id));
  const active = unique.some(p => p.id === raw?.active) ? raw.active : unique[0]?.id ?? null;
  return { v: 1, active, projects: unique };
}

export function loadStore(storage = globalThis.localStorage) {
  try { return cleanStore(JSON.parse(storage.getItem(PLAN_KEY))); } catch { return cleanStore(null); }
}

export function saveStore(store, storage = globalThis.localStorage) {
  try { storage.setItem(PLAN_KEY, JSON.stringify(cleanStore(store))); return true; } catch { return false; }
}

/** Replace (or add) one project and make it active; stamps `updated`. Returns the new store. */
export function upsert(store, project) {
  const p = cleanProject({ ...project, updated: today() });
  const rest = store.projects.filter(x => x.id !== p.id);
  if (!store.projects.some(x => x.id === p.id) && rest.length >= LIMITS.projects) return null;
  const projects = store.projects.some(x => x.id === p.id) ? store.projects.map(x => x.id === p.id ? p : x) : [p, ...rest];
  return cleanStore({ active: p.id, projects });
}

export function remove(store, projectId) {
  return cleanStore({ active: store.active === projectId ? null : store.active, projects: store.projects.filter(p => p.id !== projectId) });
}

// ------------------------------------------------------------------ progress: completed activities, not percentages
/** The activities an objective has completed, in order, as plain words. */
export function completed(obj) {
  const o = OBJECTIVES[obj.key];
  return STEPS.filter(s => obj.done[s.key]).map(s => {
    if (s.key === 'approaches') return `Approach: ${o.approaches.find(a => a.key === obj.approach)?.name ?? '—'}`;
    if (s.key === 'decision') return 'Decision made';
    if (s.key === 'verify') return 'Result measured';
    return { question: 'Question framed', learn: 'Mechanism learned', experiment: 'Experimented', components: 'Components evaluated' }[s.key];
  });
}

/** The next step to work on (first incomplete in the progression), or null when verified. */
export function nextStep(obj) {
  return STEPS.find(s => !obj.done[s.key]) ?? null;
}

/** Stage of the objective in plain words, used in summaries. */
export function stage(obj) {
  if (obj.done.verify) return 'Verified';
  if (obj.done.decision) return 'Decided — build and measure';
  if (obj.approach) return 'Approach chosen';
  if (obj.done.experiment || obj.done.learn) return 'Exploring';
  return 'Just started';
}

/** Whole-plan summary counts (meaningful activities, not a percentage). */
export function summary(project) {
  const objs = project.objectives;
  return { objectives: objs.length, decisions: objs.filter(o => o.done.decision).length,
    measured: objs.filter(o => o.done.verify).length, blockers: objs.reduce((n, o) => n + o.blockers.length, 0),
    activities: objs.reduce((n, o) => n + Object.keys(o.done).length, 0) };
}

/** Mark one step done/undone with the step's own rule (choice and measurement steps need their value). */
export function setStep(obj, key, value, extra = {}) {
  const next = { ...obj, done: { ...obj.done }, ...extra };
  if (value) next.done[key] = true; else delete next.done[key];
  return cleanObjective(next);
}

// ------------------------------------------------------------------ share codec: opt-in, reproduces the plan read-only
const toB64 = s => { let b = ''; for (const x of new TextEncoder().encode(s)) b += String.fromCharCode(x); return btoa(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const fromB64 = s => new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)));

/** `#p=…` fragment for a project. The Garage entry key is browser-local and is not shared. */
export function encodePlan(project) {
  const p = cleanProject(project);
  if (!p) return '';
  const vehicle = p.vehicle ? { id: p.vehicle.id, ...(p.vehicle.setup ? { setup: p.vehicle.setup, mode: p.vehicle.mode } : {}) } : null;
  const payload = toB64(JSON.stringify({ name: p.name, vision: p.vision, vehicle, objectives: p.objectives }));
  return payload.length <= 24000 ? 'p=' + payload : '';
}

/** Decode a shared fragment to a fresh project (new id), or null. Never throws. */
export function decodePlan(hash) {
  try {
    const m = String(hash ?? '').replace(/^#/, '').match(/(?:^|&)p=([A-Za-z0-9_-]{1,24000})$/);
    if (!m) return null;
    const raw = JSON.parse(fromB64(m[1]));
    const p = cleanProject({ ...raw, id: undefined, created: undefined, updated: undefined });
    return p && (p.objectives.length || p.vehicle || p.name) ? p : null;
  } catch { return null; }
}
