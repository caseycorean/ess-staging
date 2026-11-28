// Graphical simulations: the shareable state. Pure; works in the browser and in Node tests.
// A shared link carries the experiment, its settings and each lane's car (with its saved build and change), in the URL
// fragment (#r=…). Fragments are not sent to the server and opening one never writes to the recipient's Garage.
import { EXPERIMENTS, SEQUENCES, NO_CHANGE, laneVehicle } from './runs.mjs';
import { cleanSetup, usableSetup } from '../models.mjs';
import { vehicles } from '../vehicles.mjs';
import { tireGrip } from '../../engine/acceleration.mjs';
import { DIFFS } from '../../engine/maneuvers.mjs';

const clamp = (n, lo, hi, dflt) => Number.isFinite(+n) ? Math.min(hi, Math.max(lo, +n)) : dflt;
const RANGES = {
  accelerate: { ft: [60, 10560, 1320] },
  brake: { from: [10, 200, 60] },
  corner: { radius: [30, 1500, 100] },
  entry: { mph: [30, 160, 80], radius: [40, 800, 150] },
  exit: { radius: [30, 400, 75] },
};

export function cleanParams(x, p = {}) {
  if (x === 'sequence') return { key: SEQUENCES.includes(p.key) ? p.key : 'corner90' };
  const r = RANGES[x], out = {};
  for (const [k, [lo, hi, d]] of Object.entries(r)) out[k] = Math.round(clamp(p[k], lo, hi, d));
  return out;
}
/** Limits for one-change inputs (shared by the page's custom fields, the model run and the share link). */
export const LIMITS = {
  weight: { min: base => -Math.round(base * .3 / 10) * 10, max: 1500, unit: 'lb', text: base => `between −${Math.round(base * .3 / 10) * 10} and +1,500 lb` },
  power: { min: -50, max: 150, unit: '%', text: () => 'between −50% and +150%' },
  cg: { min: -4, max: 4, unit: 'in', text: () => 'between −4 and +4 in' },
};

export function cleanLane(l) {
  if (!l || typeof l !== 'object' || !Object.hasOwn(vehicles, l.id)) return null;
  let setup;
  if (l.setup) {
    const cleaned = cleanSetup(l.setup);
    if (cleaned?.id === l.id && usableSetup(cleaned)) setup = cleaned;
  }
  if (l.id === 'custom' && !setup) return null;
  const c = l.change ?? {};
  // One input boundary for the model, the page and the share link (QA P0, 26 Nov): the same limits everywhere.
  const base = Number(laneVehicle({ id: l.id, setup })?.weight) || 3000;
  const lane = { id: l.id, change: { ...NO_CHANGE,
    tire: Object.hasOwn(tireGrip, c.tire) ? c.tire : '',
    weight: Math.round(clamp(c.weight, LIMITS.weight.min(base), LIMITS.weight.max, 0)), cg: clamp(c.cg, LIMITS.cg.min, LIMITS.cg.max, 0), power: Math.round(clamp(c.power, LIMITS.power.min, LIMITS.power.max, 0)) } };
  if (Object.hasOwn(DIFFS, l.diff)) lane.diff = l.diff;
  if (l.technique === 'straight' || l.technique === 'trail') lane.technique = l.technique;
  if (setup) lane.setup = setup;
  return lane;
}
export function cleanState(st) {
  if (!st || !EXPERIMENTS[st.x] || !Array.isArray(st.lanes)) return null;
  const lanes = st.lanes.slice(0, 3).map(cleanLane).filter(Boolean);
  if (!lanes.length) return null;
  return { x: st.x, p: cleanParams(st.x, st.p), lanes };
}

const toB64 = str => btoa(String.fromCharCode(...new TextEncoder().encode(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64 = b => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0)));

/** State → fragment text (without '#'). */
export function encodeState(st) {
  const clean = cleanState(st);
  if (!clean) return '';
  const lanes = clean.lanes.map(l => {
    const out = { id: l.id };
    const c = Object.fromEntries(Object.entries(l.change).filter(([, v]) => v));
    if (Object.keys(c).length) out.change = c;
    if (l.diff) out.diff = l.diff;
    if (l.technique) out.technique = l.technique;
    if (l.setup) out.setup = l.setup;
    return out;
  });
  return 'r=' + toB64(JSON.stringify({ x: clean.x, p: clean.p, lanes }));
}
/** Fragment text (with or without '#') → clean state, or null. Never throws. */
export function decodeState(hash) {
  try {
    const m = String(hash ?? '').replace(/^#/, '').match(/(?:^|&)r=([A-Za-z0-9_-]+)/);
    if (!m) return null;
    return cleanState(JSON.parse(fromB64(m[1])));
  } catch { return null; }
}

/** Carry the exact comparison through the input editor using fragments only. */
export function replayInputSuffix(state, lane, plan = '') {
  const encoded = encodeState(state);
  if (decodeState(encoded)?.lanes.length !== state.lanes.length) return '';
  return `&lane=${lane}&${encoded}${/^[A-Za-z0-9-]{1,80}$/.test(plan) ? '&plan=' + plan : ''}`;
}

export function readReplayInput(fragment) {
  if (typeof fragment !== 'string' || fragment.length > 32768) return null;
  const match = /^(#v2\/build\/[A-Za-z0-9_-]+)&lane=([012])&(r=[A-Za-z0-9_-]+)(?:&plan=([A-Za-z0-9-]{1,80}))?$/.exec(fragment);
  if (!match) return null;
  const experiment = decodeState(match[3]);
  const selected = Number(match[2]);
  return experiment?.lanes[selected] ? { build: match[1], experiment, selected, plan: match[4] || '' } : null;
}

export function replayWithInputs(context, setup) {
  const picked = context.experiment.lanes[context.selected];
  if (picked.id !== setup.id) return null;
  const starting = JSON.stringify(picked.setup ?? null);
  const lanes = context.experiment.lanes.map((lane, index) => {
    // Technique, differential and same-setup comparisons need a common baseline.
    return index === context.selected || (lane.id === picked.id && JSON.stringify(lane.setup ?? null) === starting)
      ? { ...lane, setup } : lane;
  });
  return encodeState({ ...context.experiment, lanes });
}
