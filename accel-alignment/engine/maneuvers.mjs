// ESS engineering library — progressive maneuvers built on the shared primitives. Claude, 26 Nov 2026.
// One engine, many scenarios: acceleration over any distance or speed range, braking between any two speeds,
// steady cornering, the combined (friction-ellipse) envelope, corner exit with differential behavior, and a
// quasi-steady path solver for corner sequences. Pure functions, no DOM. Units: lb, in, ft, s, mph, g.
//
// Maturity (Operating Framework E-scale): E1–E2. Quasi-steady: no yaw/roll transients, no tire temperature,
// no racing-line optimisation (the path is given). Results are labelled estimates; use them for comparisons.
//
// Re-used, not re-implemented:
//   acceleration.mjs  straightLine (launch, shifting, inertia), driveAt, wheelRpm, resistanceAt, massFactor
//   braking.mjs       decelAt (load transfer, load sensitivity, ABS / fixed split, brake torque limits)
//   cornering.mjs     corneringLimit (lateral load transfer + tire load sensitivity per axle)
//   loads.mjs         tireLoads (the Load Transfer calculator's elastic + geometric split)
import { straightLine, wheelRpm, driveAt, resistanceAt, massFactor, inertiaScale, tractionLimit } from './acceleration.mjs';
import { decelAt, brakingStop } from './braking.mjs';
import { corneringLimit, LOAD_SENSITIVITY } from './cornering.mjs';
import { tireLoads } from './loads.mjs';

export const G = 32.174;
export const MPH = 5280 / 3600;

// ---------------------------------------------------------------- roll stiffness and roll centers (estimates)
// Typical static roll-center heights (in above ground) by suspension type. Textbook ranges (e.g. Milliken & Milliken,
// RCVD ch. 17; Gillespie ch. 9): short/long arm 0.5–4, strut 1–5, live axle at about the axle or locator height
// (10–14), independent rears 2–6. ESS ESTIMATES; a measured or geometry-derived value replaces them.
export const ROLL_CENTER_IN = {
  front: { sla: 2, strut: 3, multilink: 2.5, twinIBeam: 4, solidAxle: 13 },
  rear: { leaf: 11, truckArm: 12, threeLink: 12, fourLinkParallel: 12, fourLinkTriangulated: 12, fiveLink: 12, torqueArm: 12,
    irsControlArm: 4, irsMultilink: 4, semiTrailing: 5, irsStrut: 4 },
};
/**
 * Estimated front share of roll stiffness. Production cars are set up to push mildly at the limit, which needs the
 * front axle to carry somewhat more of the lateral load transfer than its share of weight. Rule of thumb used here:
 * front weight share + 0.05, clamped 0.45–0.75 (ESS estimate; Milliken RCVD ch. 18 discusses TLLTD ≈ weight
 * distribution + ~5% for neutral-to-mild understeer). Replaced by spring and bar data when ESS has it.
 */
export function rollDefaults(v) {
  const front = v.frontLb ? v.frontLb / v.weight : v.front;
  return {
    frontRoll: Math.min(.75, Math.max(.45, front + .05)),
    frontCenter: ROLL_CENTER_IN.front[v.archFront] ?? 2,
    rearCenter: ROLL_CENTER_IN.rear[v.archRear] ?? (v.drivetrain === 'FWD' ? 5 : 8),
    estimated: true,
  };
}
const withAxles = v => ({ ...v, frontLb: v.frontLb ?? v.weight * v.front, rearLb: v.rearLb ?? v.weight * (1 - v.front) });
const rollOpts = (v, o = {}) => ({ ...rollDefaults(v), ...Object.fromEntries(Object.entries(o).filter(([k, x]) =>
  ['frontRoll', 'frontCenter', 'rearCenter'].includes(k) && Number.isFinite(x))) });

// ---------------------------------------------------------------- 1. acceleration over any distance or speed range
/**
 * One full-throttle run from rest (the shared launch/shift model), read at any distance or between any two speeds.
 * Rolling-start figures (e.g. 30–70) are taken inside the same run, the way a data logger reads a passing interval.
 * Also returns the highest speed reached and whether drag/power or the rev limiter set it.
 */
export function accelerationProfile(v, { distanceFt = 1320, fromMph = 0, toMph = 60, maxDistanceFt = 26400, ...options } = {}) {
  const run = straightLine(v, { ...options, distanceFt: Math.max(distanceFt, maxDistanceFt), maxTime: 240 });
  const tr = run.trace;
  const atSpeed = mph => { const s = mph * MPH; for (let i = 1; i < tr.length; i++) if (tr[i].speed >= s) {
    const a = tr[i - 1], b = tr[i], f = (s - a.speed) / (b.speed - a.speed || 1); return { t: a.t + f * (b.t - a.t), x: a.x + f * (b.x - a.x) }; }
    return null; };
  const atDistance = ft => { for (let i = 1; i < tr.length; i++) if (tr[i].x >= ft) {
    const a = tr[i - 1], b = tr[i], f = (ft - a.x) / (b.x - a.x || 1); return { t: a.t + f * (b.t - a.t), mph: (a.speed + f * (b.speed - a.speed)) / MPH }; }
    return null; };
  const top = tr.reduce((m, s) => s.speed > m.speed ? s : m, tr[0]);
  const lastGear = v.gears.length - 1;
  const rpmTop = wheelRpm(v, top.speed, lastGear);
  const maxMph = top.speed / MPH;
  const a0 = atSpeed(fromMph === 0 ? 0.001 : fromMph), a1 = atSpeed(toMph);
  return {
    distance: { ft: distanceFt, ...(atDistance(distanceFt) ?? { t: null, mph: null }) },
    interval: a0 && a1 ? { fromMph, toMph, t: a1.t - (fromMph === 0 ? 0 : a0.t), ft: a1.x - (fromMph === 0 ? 0 : a0.x) } : { fromMph, toMph, t: null, ft: null, unreachable: !a1 },
    top: { mph: maxMph, reachedAtFt: top.x, reachedAtT: top.t,
      limit: rpmTop >= v.redline - 60 ? 'rev limit in top gear' : 'power vs aerodynamic drag and rolling resistance',
      cdaEstimated: !Number.isFinite(v.cda) },
    // The long run above ends at maxDistanceFt, so its own finish/magazine figures describe that distance, not a
    // quarter mile (QA-FAIL 26 Nov: the page captioned the 5-mile time, 122.68 s, as "Quarter mile"). The standard
    // strip figures come from the same model stopped at 1,320 ft — identical physics up to that point.
    ...(() => { const strip = straightLine(v, { ...options, distanceFt: 1320 });
      return { quarter: strip.finish, magazine: strip.magazine }; })(),
    trace: tr,
  };
}

// ---------------------------------------------------------------- 2. braking between any two speeds
/** Braking from any speed to any lower speed (0 = a full stop). Thin wrapper so every maneuver uses one braking model. */
export const brakeBetween = (v, fromMph, toMph = 0, { convention, ...options } = {}) =>
  brakingStop(withAxles(v), { from: fromMph, to: toMph, ...(BRAKING_CONVENTIONS[convention] ?? {}).params, ...options });
/**
 * How the clock and tape are started matters as much as the physics. Calibration (26 Nov, Claude): on 117 Supercar X
 * archive stops (51 street cars, 60–100 mph; independent of the 24 modern validation stops) the best brake build-up
 * time was 0.05 s (MAD 5.1%, signed 0.0%) with ABS efficiency unchanged at 0.95. Applied to the 20 held-out Car and
 * Driver stops it cut the bias from +5.1% to +2.5% (MAD 7.2% → 6.1%). Read as: published distances are timed once the
 * brakes are essentially applied. The 0.15 s literature value is kept for a real-world emergency stop.
 */
export const BRAKING_CONVENTIONS = {
  roadTest: { label: 'Road-test timing', params: { riseTime: .05 },
    note: 'Timed the way magazines usually report a stop: from when the brakes are applied. Build-up 0.05 s, calibrated on 117 archive stops and checked on 20 held-out Car and Driver tests (about 2.5% long on average).' },
  emergency: { label: 'Real-world emergency stop', params: { riseTime: .15 },
    note: 'Adds a typical 0.15 s of brake-pressure build-up (literature estimate). Driver reaction time is not included: at 60 mph a 1.5 s reaction adds about 130 ft.' },
};

// ---------------------------------------------------------------- 3. steady cornering
/** Steady-state cornering on a radius (ft): limit lateral g, speed, limiting axle (balance) and lateral load transfer split. */
export function steadyCorner(v0, { radiusFt = 150, ...o } = {}) {
  const v = withAxles(v0), ro = rollOpts(v, o);
  const lim = corneringLimit(v, { ...ro, sensitivity: o.sensitivity ?? LOAD_SENSITIVITY });
  const loads = tireLoads(v, 0, lim.ay, ro);
  return { ay: lim.ay, mph: Math.sqrt(lim.ay * G * radiusFt) / MPH, radiusFt, limitingAxle: lim.limitingAxle,
    balance: lim.limitingAxle === 'front' ? 'understeer (front tires run out first)' : lim.limitingAxle === 'rear' ? 'oversteer (rear tires run out first)' : 'neutral',
    frontAy: lim.front, rearAy: lim.rear, lltdFront: loads.lltdFront, roll: ro, gripOnly: lim.gripOnly, loss: lim.loss };
}

// ---------------------------------------------------------------- 4. combined grip (friction ellipse)
const cache = new WeakMap();
function limits(v, o) {
  const key = JSON.stringify(o);
  let m = cache.get(v); if (!m) cache.set(v, m = new Map());
  if (!m.has(key)) m.set(key, { ayMax: steadyCorner(v, o).ay, brake: new Map() });
  return m.get(key);
}
/** Braking deceleration (g) available while cornering at ay (g): friction ellipse on the shared braking peak. */
export function brakeAvailable(v, speed, ay, o = {}) {
  const L = limits(v, o), bucket = Math.round(speed / 2) * 2;
  if (!L.brake.has(bucket)) L.brake.set(bucket, decelAt(v, bucket, o.braking ?? {}).a);
  const axMax = L.brake.get(bucket);
  if (o.trailBraking === false && ay > .05) return 0;
  const r = Math.min(1, ay / L.ayMax);
  return axMax * Math.sqrt(Math.max(0, 1 - r * r));
}

// ---------------------------------------------------------------- 5. corner exit: engine, traction, differential
export const DIFFS = {
  open: { label: 'Open differential', note: 'Both driven tires get the same torque, so the lightly loaded inside tire sets the limit.' },
  lsd: { label: 'Limited-slip (torque-biasing)', note: 'Sends up to the bias ratio more torque to the outside tire.' },
  locked: { label: 'Locked / spool', note: 'Both tires turn together: each can use its own grip (and the car resists turning).' },
};
/** Best engine-limited acceleration (g) at a speed, over the gears that fit under the redline. No shift time (quasi-steady). */
export function engineAccel(v, speed) {
  let best = -Infinity, gear = null;
  for (let g = 0; g < v.gears.length; g++) {
    const rpm = wheelRpm(v, speed, g);
    if (rpm > v.redline) continue;
    const force = driveAt(v, Math.max(rpm, Math.min(v.torqueRpm ?? 3000, v.redline - 500)), g);
    const a = (force - resistanceAt(v, speed)) / v.weight * G / massFactor(v.gears[g] * v.finalDrive * inertiaScale(v)) / G;
    if (a > best) { best = a; gear = g + 1; }
  }
  return { a: best, gear };
}
/**
 * Drive force the driven tires can put down (lb) while cornering at ay (g) and accelerating at ax (g), by differential.
 * Lateral force on each axle = its load × ay (steady state), shared between its tires in proportion to their capacity;
 * the rest of each tire's friction ellipse is available for drive.
 */
export function tractionAvailable(v0, ay, ax, o = {}) {
  const v = withAxles(v0), ro = rollOpts(v, o), k = o.sensitivity ?? LOAD_SENSITIVITY, mu = v.grip;
  if (![v.cg, v.wheelbase, v.frontTrack, v.rearTrack].every(Number.isFinite)) {
    // Not enough geometry for per-tire loads: driven-axle limit on a friction ellipse, no differential effect (labelled).
    const r = Math.min(1, ay / Math.max(1e-6, limits(v, o).ayMax));
    return tractionLimit(v, 0) * Math.sqrt(Math.max(0, 1 - r * r));
  }
  const t = tireLoads(v, -ax, ay, ro).tires; // [outside front, inside front, outside rear, inside rear]
  const axle = (out, inn, static2) => {
    const n0 = static2 / 2, cap = n => Math.max(0, n) * Math.max(0, mu * (1 - k * (Math.max(0, n) / n0 - 1)));
    const co = cap(out), ci = cap(inn), fy = static2 * ay, share = co + ci || 1;
    const xo = Math.sqrt(Math.max(0, co * co - (fy * co / share) ** 2)), xi = Math.sqrt(Math.max(0, ci * ci - (fy * ci / share) ** 2));
    const diff = o.diff ?? 'open', tbr = o.biasRatio ?? 2.5;
    return diff === 'locked' ? xo + xi : diff === 'lsd' ? Math.min(xo + xi, xi * (1 + tbr)) : 2 * Math.min(xo, xi);
  };
  const drive = v.drive ?? ({ FWD: 'front', AWD: 'all' })[v.drivetrain] ?? 'rear';
  const f = axle(t[0], t[1], v.frontLb), r = axle(t[2], t[3], v.rearLb);
  return drive === 'front' ? f : drive === 'all' ? f + r : r;
}
/** Forward acceleration (g) available at speed (ft/s) while cornering at ay: the lower of engine and traction. */
export function driveAvailable(v, speed, ay, o = {}) {
  const e = engineAccel(v, speed);
  if (ay >= limits(v, o).ayMax) return { a: 0, limit: 'cornering limit', gear: e.gear };
  let ax = Math.max(0, e.a);
  for (let i = 0; i < 3; i++) ax = Math.max(0, Math.min(e.a, (tractionAvailable(v, ay, ax, o) - resistanceAt(v, speed)) / v.weight));
  const traction = (tractionAvailable(v, ay, ax, o) - resistanceAt(v, speed)) / v.weight;
  return { a: Math.max(0, Math.min(e.a, traction)), limit: traction < e.a ? 'traction' : 'engine', gear: e.gear };
}

// ---------------------------------------------------------------- 6. quasi-steady path solver (combined maneuvers)
/**
 * segments: [{type:'straight', ft}, {type:'arc', radiusFt, deg}, {type:'spiral', ft, fromRadiusFt, toRadiusFt}]. Speeds in mph.
 * Forward pass: accelerate with driveAvailable; backward pass: brake with brakeAvailable (friction ellipse);
 * every point capped at the steady cornering speed of its radius. The slower of the passes wins.
 * options: startMph (default: the cornering limit of the first arc or 60), endMph (exit cap, default none),
 *          closed (lap: start speed = finish speed), diff, biasRatio, frontRoll, trailBraking, ds (ft).
 */
export function runPath(v0, segments, o = {}) {
  const v = withAxles(v0), ds = o.ds ?? 2, opts = { diff: o.diff, biasRatio: o.biasRatio, frontRoll: o.frontRoll,
    frontCenter: o.frontCenter, rearCenter: o.rearCenter, trailBraking: o.trailBraking, braking: o.braking };
  const ayMax = limits(v, opts).ayMax;
  const pts = []; let s = 0;
  const curv = r => (r && Number.isFinite(r) ? 1 / r : 0);
  for (const [i, seg] of segments.entries()) {
    const len = seg.type === 'arc' ? seg.radiusFt * seg.deg * Math.PI / 180 : seg.ft;
    const n = Math.max(1, Math.round(len / ds));
    for (let j = 0; j < n; j++) {
      // spiral: curvature changes linearly from 1/fromRadiusFt to 1/toRadiusFt (Infinity or null = straight)
      const k = seg.type === 'arc' ? 1 / seg.radiusFt : seg.type === 'spiral' ? curv(seg.fromRadiusFt) + (curv(seg.toRadiusFt) - curv(seg.fromRadiusFt)) * (j + .5) / n : 0;
      pts.push({ s, k, seg: i }); s += len / n;
    }
  }
  pts.push({ s, k: 0, seg: segments.length - 1 });
  const vCap = o.vmaxMph ? o.vmaxMph * MPH : 400;
  const lim = pts.map(p => p.k > 0 ? Math.min(vCap, Math.sqrt(ayMax * G / p.k)) : vCap);
  const firstArc = segments.find(x => x.type === 'arc');
  let start = (o.startMph ?? (firstArc ? Math.sqrt(ayMax * G * firstArc.radiusFt) / MPH : 60)) * MPH;
  let result;
  for (let lap = 0; lap < (o.closed ? 6 : 1); lap++) {
    const fwd = [Math.min(start, lim[0])], phase = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const vi = fwd[i], ay = vi * vi * pts[i].k / G, d = driveAvailable(v, vi, ay, opts);
      fwd.push(Math.min(lim[i + 1], Math.sqrt(vi * vi + 2 * d.a * G * (pts[i + 1].s - pts[i].s))));
    }
    const bwd = new Array(pts.length); bwd[pts.length - 1] = Math.min(fwd[pts.length - 1], o.endMph != null ? o.endMph * MPH : Infinity);
    for (let i = pts.length - 2; i >= 0; i--) {
      const vn = bwd[i + 1], ay = Math.min(ayMax, vn * vn * pts[i].k / G);
      bwd[i] = Math.min(fwd[i], Math.sqrt(vn * vn + 2 * brakeAvailable(v, vn, ay, opts) * G * (pts[i + 1].s - pts[i].s)));
    }
    let t = 0; const trace = [];
    for (let i = 0; i < pts.length; i++) {
      const sp = bwd[i];
      if (i) t += (pts[i].s - pts[i - 1].s) * 2 / (sp + bwd[i - 1] || 1e-9);
      phase[i] = bwd[i] < fwd[i] - .05 ? 'braking' : Math.abs(sp - lim[i]) < .05 && pts[i].k > 0 ? 'cornering limit' : 'accelerating';
      trace.push({ s: pts[i].s, mph: sp / MPH, t, phase: phase[i], ay: sp * sp * pts[i].k / G, seg: pts[i].seg });
    }
    result = { time: t, trace, ayMax, entryMph: bwd[0] / MPH, exitMph: bwd[pts.length - 1] / MPH,
      minMph: Math.min(...bwd) / MPH, lengthFt: s };
    if (!o.closed || Math.abs(bwd[pts.length - 1] - start) < .01) break;
    start = bwd[pts.length - 1];
  }
  // where braking starts and how far it runs, for each braking zone
  const zones = []; let cur = null;
  for (const p of result.trace) { if (p.phase === 'braking') { if (!cur) cur = { fromFt: p.s, fromMph: p.mph }; cur.toFt = p.s; cur.toMph = p.mph; } else if (cur) { zones.push(cur); cur = null; } }
  if (cur) zones.push(cur);
  return { ...result, brakingZones: zones, assumptions: { quasiSteady: true, diff: opts.diff ?? 'open', trailBraking: opts.trailBraking !== false } };
}

// Presets: original synthetic layouts (not real circuits). Lengths and radii are typical of autocross/track corners.
// `turn` (left/right) is drawing metadata only: runPath's curvature is unsigned (engine/path-geometry.mjs uses it).
/** Braking into a corner: 700 ft approach, 120 ft entry spiral, 45° arc (Simulations tab 4 and the replay). */
export const entrySegments = (radiusFt, deg = 45) => [{ type: 'straight', ft: 700 }, { type: 'spiral', ft: 120, fromRadiusFt: null, toRadiusFt: radiusFt }, { type: 'arc', radiusFt, deg }];
/** Powering out: from the apex (20° of arc) the corner opens over 300 ft, then a 600 ft straight. */
export const exitSegments = radiusFt => [{ type: 'arc', radiusFt, deg: 20 }, { type: 'spiral', ft: 300, fromRadiusFt: radiusFt, toRadiusFt: null }, { type: 'straight', ft: 600 }];

export const MANEUVERS = {
  corner90: { label: '90° corner', note: 'Brake from a straight, turn in, hold a 100 ft radius, unwind and power out.', startMph: 70,
    segments: [{ type: 'straight', ft: 500 }, { type: 'spiral', ft: 60, fromRadiusFt: null, toRadiusFt: 100 }, { type: 'arc', radiusFt: 100, deg: 56 },
      { type: 'spiral', ft: 60, fromRadiusFt: 100, toRadiusFt: null }, { type: 'straight', ft: 500 }] },
  hairpin: { label: 'Hairpin', note: 'Long brake zone into a 180° turn on a 50 ft radius.', startMph: 80,
    segments: [{ type: 'straight', ft: 800 }, { type: 'spiral', ft: 40, fromRadiusFt: null, toRadiusFt: 50 }, { type: 'arc', radiusFt: 50, deg: 134 },
      { type: 'spiral', ft: 40, fromRadiusFt: 50, toRadiusFt: null }, { type: 'straight', ft: 800 }] },
  sweeper: { label: 'High-speed sweeper', note: 'A long bend on a 400 ft radius between short straights.', startMph: 90,
    segments: [{ type: 'straight', ft: 400 }, { type: 'spiral', ft: 120, fromRadiusFt: null, toRadiusFt: 400 }, { type: 'arc', radiusFt: 400, deg: 103 },
      { type: 'spiral', ft: 120, fromRadiusFt: 400, toRadiusFt: null }, { type: 'straight', ft: 600 }] },
  esses: { label: 'S-curve', note: 'Left then right on 150 ft radii. Quasi-steady: the change of direction itself (yaw response) is not modelled.', startMph: 60,
    segments: [{ type: 'straight', ft: 400 }, { type: 'spiral', ft: 50, fromRadiusFt: null, toRadiusFt: 150 }, { type: 'arc', radiusFt: 150, deg: 40, turn: 'left' },
      { type: 'spiral', ft: 100, fromRadiusFt: 150, toRadiusFt: null }, { type: 'arc', radiusFt: 150, deg: 40, turn: 'right' }, { type: 'spiral', ft: 50, fromRadiusFt: 150, toRadiusFt: null }, { type: 'straight', ft: 600 }] },
  exit: { label: 'Corner exit under power', note: 'From the apex of a 75 ft radius: the corner opens over 300 ft, then a 600 ft straight. Traction and the differential matter here.', startMph: null,
    segments: [{ type: 'arc', radiusFt: 75, deg: 20 }, { type: 'spiral', ft: 300, fromRadiusFt: 75, toRadiusFt: null }, { type: 'straight', ft: 600 }] },
  entry: { label: 'Braking into a corner', note: 'From 80 mph, brake and turn into a 150 ft radius. Compare trail braking with braking only in a straight line.', startMph: 80,
    segments: [{ type: 'straight', ft: 700 }, { type: 'spiral', ft: 120, fromRadiusFt: null, toRadiusFt: 150 }, { type: 'arc', radiusFt: 150, deg: 45 }] },
};
