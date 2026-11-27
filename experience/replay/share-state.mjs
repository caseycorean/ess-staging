// Graphical simulations: the shareable state. Pure; works in the browser and in Node tests.
// A shared link carries the experiment, its settings and each lane's car (with its saved build and change), in the URL
// fragment (#r=…). Fragments are not sent to the server and opening one never writes to the recipient's Garage.
import { EXPERIMENTS, SEQUENCES, NO_CHANGE } from './runs.mjs';
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
export function cleanLane(l) {
  if (!l || typeof l !== 'object' || !vehicles[l.id] || l.id === 'custom') return null;
  const c = l.change ?? {};
  const lane = { id: l.id, change: { ...NO_CHANGE,
    tire: tireGrip[c.tire] ? c.tire : '',
    weight: Math.round(clamp(c.weight, -1500, 2000, 0)), cg: clamp(c.cg, -6, 6, 0), power: Math.round(clamp(c.power, -50, 150, 0)) } };
  if (DIFFS[l.diff]) lane.diff = l.diff;
  if (l.technique === 'straight' || l.technique === 'trail') lane.technique = l.technique;
  if (l.setup) { try { const s = cleanSetup(l.setup); if (s && s.id === l.id && usableSetup(s)) lane.setup = s; } catch { /* drop an unusable build */ } }
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
