// ESS Suspension V2 — architectures, generic example geometry and page state (pure; tested in Node).
// Every hardpoint here is a GENERIC EDUCATIONAL EXAMPLE. A vehicle choice selects an architecture only; ESS holds no
// measured pickup points for any car, so no vehicle name is ever attached to this geometry.
import { corner, STATUS as PS } from '../../engine/linkage.mjs';
import { axleSolver } from '../../engine/axle-links.mjs';
import { vehicleArchitectures } from './vehicle-architectures.mjs';

export const STATUS = PS;

// ---- planar corners (front view of a front corner, rear view of an independent rear corner) ----
const slaFront = { upperInner: [14, 16], upperOuter: [25, 17], lowerInner: [10, 7], lowerOuter: [27, 6], wheelCenter: [30, 12.5], tireRadius: 12.5, staticCamber: -.5 };
const strutFront = { top: [22, 30], lowerInner: [8, 6], lowerOuter: [26, 5], wheelCenter: [29, 12], tireRadius: 12, staticCamber: -.5 };
const slaRear = { upperInner: [12, 17], upperOuter: [24, 18], lowerInner: [9, 7], lowerOuter: [27, 6.5], wheelCenter: [30, 12.5], tireRadius: 12.5, staticCamber: -1 };
const strutRear = { top: [21, 28], lowerInner: [8, 6.5], lowerOuter: [26, 5.5], wheelCenter: [29, 12], tireRadius: 12, staticCamber: -1 };

// ---- live axles: x forward from the axle centre, y driver's right, z up from the road (in) ----
const lowers = [
  { name: 'Left lower link', group: 'lower', axle: [0, -22, 11], chassis: [32, -22, 15] },
  { name: 'Right lower link', group: 'lower', axle: [0, 22, 11], chassis: [32, 22, 15] },
];
const panhard = { name: 'Panhard bar', group: 'lateral', axle: [-6, -24, 14], chassis: [-6, 22, 15.5] };
const uppers = tri => [-1, 1].map(s => ({ name: s < 0 ? 'Left upper link' : 'Right upper link', group: 'upper',
  axle: [-1, s * (tri ? 8 : 17), 19], chassis: [23, s * (tri ? 23 : 17), 19.5] }));
const live = {
  three: [...lowers, { name: 'Upper link', group: 'upper', axle: [-1, 0, 20], chassis: [23, 0, 20.5] }, panhard],
  parallel: [...lowers, ...uppers(false), panhard],
  triangulated: [...lowers, ...uppers(true)],
  torque: [...lowers, panhard, { name: 'Torque arm', group: 'slider', axle: [40, 0, 14], chassis: [40, 0, 14] }],
};

/**
 * Architecture registry. model: 'planar' (sla|strut corner solver), 'live' (axle links), or null (illustration only).
 * `equivalent` marks a simplification that is stated wherever results appear.
 */
export const architectures = {
  front: {
    sla: { name: 'Short/long arm', long: 'Short/long arm (double wishbone)', model: 'planar', kind: 'sla', preset: slaFront },
    strut: { name: 'MacPherson strut', long: 'MacPherson strut', model: 'planar', kind: 'strut', preset: strutFront },
    multilink: { name: 'Front multilink', long: 'Front multilink (as an equivalent short/long arm)', model: 'planar', kind: 'sla', preset: slaFront,
      equivalent: 'Multilink is shown as the short/long arm with the same front-view instant center. Real multilink virtual pivots move with travel.' },
    twinIBeam: { name: 'Twin I-Beam', long: 'Ford Twin I-Beam', model: null, note: 'the Twin I-Beam model is not built yet.' },
    solidAxle: { name: 'Solid front axle', long: 'Solid front axle', model: null, note: 'the solid front axle model is not built yet.' },
  },
  rear: {
    threeLink: { name: 'Three-link + Panhard', long: 'Live axle, three-link + Panhard bar', model: 'live', layout: 'three' },
    fourLinkParallel: { name: 'Parallel four-link + Panhard', long: 'Live axle, parallel four-link + Panhard bar', model: 'live', layout: 'parallel' },
    fiveLink: { name: 'Five-link', long: 'Live axle, five-link (parallel four-link + Panhard bar)', model: 'live', layout: 'parallel' },
    fourLinkTriangulated: { name: 'Triangulated four-link', long: 'Live axle, triangulated four-link', model: 'live', layout: 'triangulated' },
    torqueArm: { name: 'Torque arm + Panhard', long: 'Live axle, torque arm + Panhard bar', model: 'live', layout: 'torque' },
    leaf: { name: 'Leaf springs', long: 'Live axle, leaf springs', model: null, note: 'leaf springs wind up and bend rather than pivot, so the rigid-link model does not apply. A leaf model is not built yet.' },
    truckArm: { name: 'Truck arms', long: 'Live axle, GM truck arms', model: null, note: 'the truck-arm model is not built yet.' },
    irsControlArm: { name: 'Independent control arms', long: 'Independent rear, upper/lower control arms', model: 'planar', kind: 'sla', preset: slaRear },
    irsMultilink: { name: 'Independent multilink', long: 'Independent rear multilink (as equivalent control arms)', model: 'planar', kind: 'sla', preset: slaRear,
      equivalent: 'Multilink is shown as equivalent upper and lower arms in rear view. Real multilink toe and camber paths depend on 3-D link positions.' },
    irsStrut: { name: 'Independent strut', long: 'Independent rear strut', model: 'planar', kind: 'strut', preset: strutRear },
    semiTrailing: { name: 'Semi-trailing arm', long: 'Independent semi-trailing arm', model: null, note: 'semi-trailing arms swing about a diagonal axis that a 2-D view cannot represent. Model not built yet.' },
  },
};
export const galleryOrder = {
  front: ['sla', 'strut', 'multilink', 'twinIBeam', 'solidAxle'],
  rear: ['threeLink', 'fourLinkParallel', 'fourLinkTriangulated', 'torqueArm', 'leaf', 'truckArm', 'irsControlArm', 'irsMultilink', 'irsStrut', 'semiTrailing'],
};

export const pointNames = { upperInner: 'Upper arm inner pivot', upperOuter: 'Upper ball joint', lowerInner: 'Lower arm inner pivot',
  lowerOuter: 'Lower ball joint', top: 'Strut top mount', wheelCenter: 'Wheel center' };
export const movable = { sla: ['upperInner', 'upperOuter', 'lowerInner', 'lowerOuter'], strut: ['top', 'lowerInner', 'lowerOuter'] };
export const TRAVEL = 4; // in each way: wide enough to show real limits, narrower than any practical travel
export const ROLL = 8;   // degrees, live axle body-to-axle roll
export const BOUNDS = { planar: { y: [0, 40], z: [-2, 36] }, live: { x: [-20, 60], y: [-34, 34], z: [2, 32] } };

export const defaultEnd = arch => ({ arch, pts: {}, travel: 0, roll: 0, camber: null, history: [], sym: true });
export const defaults = () => ({ v: 1, tab: 'front', vehicle: null, overlay: true, front: defaultEnd('sla'), rear: defaultEnd('threeLink') });

const finite = (x, lo, hi) => Number.isFinite(x) && x >= lo && x <= hi;
/** Validate stored/shared state. Bad parts fall back to defaults; never throws. */
export function cleanState(raw) {
  const s = defaults();
  if (!raw || typeof raw !== 'object') return s;
  if (raw.tab === 'rear') s.tab = 'rear';
  if (typeof raw.vehicle === 'string' && vehicleById(raw.vehicle)) s.vehicle = raw.vehicle;
  if (raw.overlay === false) s.overlay = false;
  for (const end of ['front', 'rear']) {
    const r = raw[end]; if (!r || !architectures[end][r.arch]) continue;
    const a = architectures[end][r.arch], out = defaultEnd(r.arch);
    if (finite(r.travel, -TRAVEL, TRAVEL)) out.travel = r.travel;
    if (finite(r.roll, -ROLL, ROLL)) out.roll = r.roll;
    if (finite(r.camber, -10, 10)) out.camber = r.camber;
    if (r.sym === false) out.sym = false;
    if (Array.isArray(r.history)) out.history = r.history.filter(h => typeof h === 'string').slice(-4).map(h => h.slice(0, 160));
    if (r.pts && typeof r.pts === 'object') {
      for (const [k, p] of Object.entries(r.pts)) {
        if (!Array.isArray(p) || !p.every(Number.isFinite)) continue;
        if (a.model === 'planar' && [...movable[a.kind], 'wheelCenter'].includes(k) && p.length === 2 && finite(p[0], ...BOUNDS.planar.y) && finite(p[1], ...BOUNDS.planar.z)) out.pts[k] = p;
        if (a.model === 'live' && /^\d+\.(axle|chassis)$/.test(k) && p.length === 3 && +k.split('.')[0] < live[a.layout].length &&
          finite(p[0], ...BOUNDS.live.x) && finite(p[1], ...BOUNDS.live.y) && finite(p[2], ...BOUNDS.live.z)) out.pts[k] = p;
      }
    }
    s[end] = out;
  }
  return s;
}

// ---- geometry from state ----
export function planarGeometry(endState, end) {
  const a = architectures[end][endState.arch];
  const g = { ...a.preset };
  for (const [k, p] of Object.entries(endState.pts)) g[k] = [...p];
  if (Number.isFinite(endState.camber)) g.staticCamber = endState.camber;
  return g;
}
export function liveLinks(endState, end = 'rear') {
  const a = architectures[end][endState.arch];
  return live[a.layout].map((l, i) => ({ ...l,
    axle: [...(endState.pts[`${i}.axle`] ?? l.axle)],
    chassis: [...(l.group === 'slider' ? (endState.pts[`${i}.axle`] ?? l.axle) : (endState.pts[`${i}.chassis`] ?? l.chassis))] }));
}
export const isEdited = endState => Object.keys(endState.pts).length > 0 || Number.isFinite(endState.camber);

// Solver caches keyed by geometry so drags reuse traces.
const cache = new Map();
function memo(key, make) { if (!cache.has(key)) { if (cache.size > 40) cache.delete(cache.keys().next().value); cache.set(key, make()); } return cache.get(key); }
export function planarSolver(endState, end) {
  const a = architectures[end][endState.arch], g = planarGeometry(endState, end);
  return memo('p' + a.kind + JSON.stringify(g), () => corner(a.kind, g, { maxTravel: TRAVEL + 2 }));
}
export function liveSolver(endState, end = 'rear') {
  const links = liveLinks(endState, end);
  return memo('l' + JSON.stringify(links), () => axleSolver(links, { radius: 13 }));
}

// ---- vehicles: architecture only ----
export const vehicleById = id => vehicleArchitectures.find(v => v[0] === id) ?? null;
export function vehicleChoice(id) {
  const v = vehicleById(id); if (!v) return null;
  const [, name, f, r, wb, cg] = v;
  return { id, name, front: architectures.front[f] ? f : null, rear: architectures.rear[r] ? r : null,
    frontCode: f, rearCode: r, wheelbase: wb, cg };
}
export const vehicleList = () => vehicleArchitectures.map(v => ({ id: v[0], name: v[1] })).sort((a, b) => a.name.localeCompare(b.name));

/** Wheelbase and CG used for anti-squat, with where they came from. */
export function chassisDims(state) {
  const v = state.vehicle && vehicleChoice(state.vehicle);
  if (v?.wheelbase && v?.cg) return { wheelbase: v.wheelbase[0], cg: v.cg[0], source: `${v.name}: wheelbase ${v.wheelbase[1] === 'estimated' ? 'estimated' : 'published'}, CG height ${v.cg[1] === 'estimated' ? 'estimated' : 'published'}` };
  return { wheelbase: 108, cg: 20, source: 'Generic example: 108 in wheelbase, 20 in CG height' };
}

/** Share fragment (canonical inches only). */
export function encodeState(s) {
  const slim = { tab: s.tab, vehicle: s.vehicle, overlay: s.overlay };
  for (const end of ['front', 'rear']) { const e = s[end]; slim[end] = { arch: e.arch, pts: e.pts, travel: e.travel, roll: e.roll, camber: e.camber, sym: e.sym }; }
  return btoa(unescape(encodeURIComponent(JSON.stringify(slim)))).replace(/=+$/, '');
}
export function decodeState(text) { try { return cleanState(JSON.parse(decodeURIComponent(escape(atob(text))))); } catch { return null; } }

/** Mirror twin of link i (left ↔ right of the same group), or -1 for centre links and the Panhard bar. */
export function partnerOf(links, i) {
  const l = links[i];
  if (!/^(Left|Right) /.test(l.name)) return -1;
  const twin = l.name.replace(/^(Left|Right) /, m => m === 'Left ' ? 'Right ' : 'Left ');
  return links.findIndex(m => m.name === twin);
}
