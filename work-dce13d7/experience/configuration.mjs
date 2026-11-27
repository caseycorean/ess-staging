import { cleanSetup, newSetup, usableSetup } from './models.mjs';
import { cleanSusp } from './suspension-lab.mjs';
import { cleanRear } from './suspension-view.mjs';

const activeKey = 'ess.active-configuration.v1';
const garageKey = 'ess.garage.v1';
const savedKey = 'ess.vehicle-build.v1';
export const views = ['home', 'build', 'compare', 'tools', 'learn', 'suspension', 'garage', 'performance', 'performance-why', 'performance-math'];
const maxFragment = 32768;

export const getSaved = () => {
  try {
    const setup = cleanSetup(JSON.parse(localStorage.getItem(savedKey)));
    return setup && usableSetup(setup) ? setup : null;
  } catch {
    return null;
  }
};

export function saveBuild(setup) {
  const valid = cleanSetup(setup);
  if (!valid || !usableSetup(valid)) return false;
  try {
    localStorage.setItem(savedKey, JSON.stringify(valid));
    return true;
  } catch {
    return false;
  }
}

export const example = () => ({
  a: newSetup('firebird'), b: newSetup('mustang'), aMode: 'before', bMode: 'before', focus: 'a',
});

export const laneKeys = ['a', 'b', 'c', 'd'];
export const lanes = state => laneKeys.filter(key => state[key]);
export const labelLane = key => 'Car ' + key.toUpperCase();
export const modeOf = (state, key) => state[key + 'Mode'] ?? 'before';

export function getActive() {
  try {
    const value = JSON.parse(localStorage.getItem(activeKey));
    return validateSelection(value?.setup, value?.mode);
  } catch { return null; }
}

function validateSelection(setup, mode) {
  const clean = cleanSetup(setup);
  return clean && usableSetup(clean) && ['before', 'after'].includes(mode) ? {setup: clean, mode} : null;
}

export function useConfig(setup, mode) {
  const active = validateSelection(setup, mode);
  if (!active) return false;
  try {
    localStorage.setItem(activeKey, JSON.stringify(active));
    return true;
  } catch { return false; }
}

export function getGarage() {
  try {
    const data = JSON.parse(localStorage.getItem(garageKey));
    return Array.isArray(data) ? data.slice(0, 40).flatMap(entry => {
      const selection = validateSelection(entry?.setup, entry?.mode);
      return selection && typeof entry.key === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(entry.key) ?
        [{key: entry.key, ...selection}] : [];
    }) : [];
  } catch { return []; }
}

export function saveToGarage(setup, mode) {
  const selection = validateSelection(setup, mode);
  if (!selection) return false;
  const garage = getGarage();
  if (garage.some(item => item.mode === mode && JSON.stringify(item.setup) === JSON.stringify(selection.setup))) return true;
  if (garage.length >= 40) return false;
  const key = globalThis.crypto?.randomUUID?.() ?? Date.now() + '-' + Math.random().toString(36).slice(2);
  try {
    localStorage.setItem(garageKey, JSON.stringify([{key, ...selection}, ...garage]));
    return true;
  } catch { return false; }
}

export function removeFromGarage(key) {
  try {
    localStorage.setItem(garageKey, JSON.stringify(getGarage().filter(entry => entry.key !== key)));
    return true;
  } catch { return false; }
}

export const modified = s => s.parts.length > 0 || Object.keys(s.tune).length > 0 || Object.keys(s.components ?? {}).length > 0 ||
  Object.keys(s.conditions ?? {}).length > 0;
export const clone = s => cleanSetup(s);

function encodePayload(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodePayload(payload) {
  if (!/^[A-Za-z0-9_-]+$/.test(payload)) throw new Error('Invalid link encoding');
  const bytes = Uint8Array.from(atob(payload.replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0));
  return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
}

export function shareFragment(state, view = 'compare') {
  const configurations = {};
  for (const key of lanes(state)) {
    configurations[key] = state[key];
    configurations[key + 'Mode'] = modeOf(state, key);
  }
  return '#v2/' + view + '/' + encodePayload({
    ...configurations, focus: state.focus,
    ...(state.event ? {event: state.event} : {}),
    ...(state.tool ? {tool: state.tool} : {}),
    ...(state.perf ? {perf: state.perf} : {}),
    ...(state.susp ? {susp: state.susp} : {}),
  });
}

export function readFragment(hash) {
  const invalid = { invalid: true, view: 'home' };
  if (hash.length > maxFragment) return invalid;
  const view = hash.startsWith('#') ? hash.slice(1) : 'home';
  if (views.includes(view)) return {view};
  if (!hash.startsWith('#v')) return {view: 'home'};
  const matched = /^#v([12])\/([^/]+)\/(.+)$/.exec(hash);
  if (!matched || !views.includes(matched[2])) return invalid;
  try {
    const raw = matched[1] === '1' ? JSON.parse(decodeURIComponent(matched[3])) : decodePayload(matched[3]);
    const keys = matched[1] === '1' ? ['a', 'b'] : lanes(raw);
    const tool = raw.tool;
    if (!keys.includes('a') || !keys.includes('b') || !keys.includes(raw.focus) ||
        (raw.event !== undefined && !['strip', 'oval'].includes(raw.event)) ||
        (tool !== undefined && (!tool || ![tool.brake, tool.lateral].every(n => Number.isFinite(n) && n >= 0 && n <= 1.2)))) return invalid;
    const state = {focus: raw.focus, ...(raw.event ? {event: raw.event} : {}),
      ...(tool ? {tool: {brake: tool.brake, lateral: tool.lateral}} : {})};
    // Gearing-and-traction conditions (tire class, surface, own friction, inspected gear). Shape-checked here;
    // performance-view.cleanPerf() validates the values against the tire and surface tables.
    const perf = raw.perf;
    if (perf !== undefined) {
      if (!perf || typeof perf !== 'object' || Array.isArray(perf)) return invalid;
      const tire = perf.tire, surface = perf.surface, mu = perf.customMu, gear = perf.gear;
      if ((tire != null && (typeof tire !== 'string' || tire.length > 24)) || (surface != null && (typeof surface !== 'string' || surface.length > 24)) ||
          (mu != null && !(Number.isFinite(mu) && mu >= .1 && mu <= 3)) || (gear != null && !(Number.isInteger(gear) && gear >= 0 && gear < 10))) return invalid;
      state.perf = {tire: tire ?? null, surface: surface ?? 'dryAsphalt', customMu: mu ?? null, gear: gear ?? 0};
    }
    // Suspension geometry and settings travel in canonical units (in, lb-ft/deg, g), never in display units.
    if (raw.susp !== undefined) {
      const susp = cleanSusp(raw.susp);
      const rear = raw.susp?.rear === undefined ? undefined : cleanRear(raw.susp.rear);
      if (!susp || rear === null) return invalid;
      state.susp = {...susp, ...(rear ? {rear} : {})};
    }
    for (const key of keys) {
      const selected = validateSelection(raw[key], raw[key + 'Mode']);
      if (!selected) return invalid;
      state[key] = selected.setup;
      state[key + 'Mode'] = selected.mode;
    }
    return {view: matched[2], state};
  } catch {
    return invalid;
  }
}

export async function shareResult(url, title, summary, environment = navigator) {
  if (typeof environment.share === 'function') {
    try {
      await environment.share({ title, text: summary, url });
      return 'shared';
    } catch (error) {
      if (error.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await environment.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'manual';
  }
}
