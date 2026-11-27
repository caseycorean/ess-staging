// ESS engineering library — straight-line braking. Claude sprint, 26 Nov 2026 (roadmap item 2).
// Pure functions, no DOM. Units: lb, in, ft, s, mph, g. Same vehicle fields as the acceleration and cornering
// models (weight, frontLb/rearLb or front, cg, wheelbase, grip, cda, diameter).
//
// Model (quasi-steady, flat dry road, straight line):
//  • Longitudinal load transfer ΔW = W·h·a/L onto the front axle (engine/loads.mjs longitudinalTransfer).
//  • Each axle's tire capacity uses the SAME degressive load sensitivity as engine/cornering.mjs:
//      μ(Fz) = μ0·(1 − k·(Fz/F0 − 1)),  axle capacity = μ0·N·(1 − k·(N/N0 − 1)),
//    so total capacity = μ0·(W − k·ΔW²·(1/Wf + 1/Wr)): moving load forward costs grip, and a lower CG stops shorter.
//  • ABS (default): each axle is held near its own peak; it averages absEfficiency × peak (cycling around peak slip).
//  • No ABS: a fixed front/rear brake split (bias) and an ideal "threshold" driver; the stop is limited by the first
//    axle to reach its peak (front lock = car goes straight; rear lock = car can spin, flagged as unstable).
//  • Optional brake-system torque limit per axle (lb-ft at max pedal): if it is below the tire capacity the stop is
//    torque-limited and bigger brakes help; otherwise the tires limit a single stop and bigger brakes do not.
//  • Aerodynamic drag and rolling resistance help (same AIR and rolling constants as engine/acceleration.mjs).
//    No downforce, no drag pitch moment, no brake fade (single stop), no speed dependence of μ.
//  • Brake rise time: deceleration builds linearly over riseTime seconds after the stop starts, the way a test clock
//    starts at brake application. Wheel and driveline inertia do not change a tire-limited stop (the brake torque
//    absorbs their energy; the tire force decelerates the car), so they are not modelled here.
// Every constant below is a labelled ESTIMATE with its basis; none was tuned to the validation tests.
import { longitudinalTransfer } from './loads.mjs';
import { LOAD_SENSITIVITY } from './cornering.mjs';

const G = 32.174;
const MPH = 5280 / 3600;
const AIR = .002377;

export const brakingDefaults = {
  abs: true,
  // ABS averages close to, not at, peak friction. Published ABS efficiency figures for modern systems on dry
  // asphalt are commonly 0.90–0.98 of peak (e.g. Burckhardt, "Fahrwerktechnik: Radschlupf-Regelsysteme", 1993;
  // Limpert, "Brake Design and Safety", 3rd ed., ch. 9). 0.95 = mid-range estimate.
  absEfficiency: .95,
  // Fully locked tires slide at roughly 0.7–0.8 of peak on dry asphalt (Wong, Theory of Ground Vehicles, ch. 1).
  slideRatio: .78,
  // Time for deceleration to build after the brake is applied. Hydraulic pressure rise with a booster is
  // about 0.1–0.3 s (Limpert ch. 5); 0.15 s estimate. Shown in results so its effect is visible.
  riseTime: .15,
  rollResistance: .015,
  sensitivity: LOAD_SENSITIVITY,
  // front share of brake force for the no-ABS mode; null → installedBias(v). When comparing a change (tires, CG),
  // pass the STOCK car's installedBias: the split is fixed hardware and does not follow the tire or CG being tried.
  bias: null,
  brakeTorque: null, // {front, rear} lb-ft per axle at max pedal; null → not limited by the brake hardware
  dt: .002,
};

const frontOf = v => v.frontLb ?? v.weight * v.front;

/** Peak capacity (lb) of one axle carrying N lb whose static load is N0 lb. */
export function axleCapacity(mu0, N, N0, k = LOAD_SENSITIVITY) {
  const n = Math.max(0, N);
  return n * Math.max(0, mu0 * (1 - k * (n / N0 - 1)));
}

/** Axle loads (lb) at a deceleration of a (g). */
export function axleLoadsAt(v, a) {
  const dW = longitudinalTransfer(v.weight, v.cg, v.wheelbase, a);
  const Wf = frontOf(v);
  return { front: Wf + dW, rear: v.weight - Wf - dW, transfer: dW };
}

/** Front share of total brake force that makes both axles reach their peak together at a (g) — the "ideal" split. */
export function idealBias(v, a, k = LOAD_SENSITIVITY) {
  const Wf = frontOf(v), Wr = v.weight - Wf;
  const { front, rear } = axleLoadsAt(v, a);
  const cf = axleCapacity(1, front, Wf, k), cr = axleCapacity(1, rear, Wr, k);
  return cf / (cf + cr);
}

/**
 * Estimated installed split when nothing is known: makers set the fixed split so the FRONT locks first on a
 * high-grip road (stability). Estimate = ideal split at the car's grip + 0.04 toward the front. Labelled estimate.
 */
export function installedBias(v, k = LOAD_SENSITIVITY) {
  return Math.min(.9, idealBias(v, v.grip, k) + .04);
}

function resistance(v, speed, o) {
  return o.rollResistance * v.weight + .5 * AIR * (v.cda ?? 0) * speed ** 2;
}

/**
 * Peak sustainable deceleration (g) at one speed (ft/s), and what limits it.
 * Returns {a, front, rear (axle brake forces lb), loads, limit: 'tires'|'front tires'|'rear tires'|'front brakes'|'rear brakes',
 *          utilization:{front, rear} (force ÷ that axle's peak tire capacity), unstable (rear reaches its peak first)}.
 */
export function decelAt(v, speed, options = {}) {
  const o = { ...brakingDefaults, ...options };
  const Wf = frontOf(v), Wr = v.weight - Wf, k = o.sensitivity, mu = v.grip;
  const R = resistance(v, speed, o);
  const r = (v.diameter ?? 25.5) / 24 * .97; // loaded radius (ft) ≈ 97% of unloaded
  const torqueCap = o.brakeTorque ? { front: o.brakeTorque.front / r, rear: o.brakeTorque.rear / r } : { front: Infinity, rear: Infinity };
  const bias = o.bias ?? installedBias(v, k);
  // For a trial deceleration a, the largest brake force the axles can give at the loads a creates.
  const supply = a => {
    const L = axleLoadsAt(v, a);
    const cf = axleCapacity(mu, L.front, Wf, k), cr = axleCapacity(mu, L.rear, Wr, k);
    if (o.abs) {
      const tf = o.absEfficiency * cf, tr = o.absEfficiency * cr;
      const f = Math.min(tf, torqueCap.front), rr = Math.min(tr, torqueCap.rear);
      const limit = f < tf && rr < tr ? 'brakes' : f < tf ? 'front brakes' : rr < tr ? 'rear brakes' : 'tires';
      return { f, r: rr, cf, cr, L, limit, unstable: false };
    }
    // fixed split: total B with f = bias·B, r = (1−bias)·B; the first axle to reach its tire or torque cap limits B
    const caps = [
      [cf / bias, 'front tires'], [cr / (1 - bias), 'rear tires'],
      [torqueCap.front / bias, 'front brakes'], [torqueCap.rear / (1 - bias), 'rear brakes'],
    ].sort((x, y) => x[0] - y[0]);
    const B = caps[0][0];
    return { f: bias * B, r: (1 - bias) * B, cf, cr, L, limit: caps[0][1], unstable: caps[0][1] === 'rear tires' };
  };
  // Solve W·a = f(a) + r(a) + R for a (supply falls as a rises, so bisection on the surplus is monotonic).
  let lo = 0, hi = 3;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2, s = supply(mid);
    if (s.f + s.r + R >= v.weight * mid) lo = mid; else hi = mid;
  }
  const s = supply(lo);
  return { a: lo, front: s.f, rear: s.r, loads: s.L, limit: s.limit, unstable: s.unstable, bias: o.abs ? s.f / (s.f + s.r) : bias,
    utilization: { front: s.cf ? s.f / s.cf : 0, rear: s.cr ? s.r / s.cr : 0 }, resistance: R };
}

/** Readiness: the fields a braking estimate needs. */
export function brakingMissing(v) {
  const need = { weight: v.weight, cg: v.cg, wheelbase: v.wheelbase, grip: v.grip, front: frontOf(v) };
  return Object.entries(need).filter(([, x]) => !Number.isFinite(x) || x <= 0).map(([k]) => k);
}

/**
 * One stop from `from` to `to` mph. Returns distance (ft), time (s), mean and peak deceleration (g), what limited it,
 * axle utilization and share of the braking energy taken by each axle, plus plain-language notes.
 */
export function brakingStop(v, { from = 60, to = 0, ...options } = {}) {
  const missing = brakingMissing(v);
  if (missing.length) return { status: 'missing', missing, text: `Needs ${missing.join(', ')} to estimate a stop.` };
  const o = { ...brakingDefaults, ...options };
  let speed = from * MPH, t = 0, x = 0, peak = null, energyF = 0, energyR = 0;
  const end = to * MPH, trace = [];
  while (speed > end && t < 60) {
    const d = decelAt(v, speed, o);
    if (!peak || d.a > peak.a) peak = d;
    const ramp = o.riseTime > 0 ? Math.min(1, (t + o.dt / 2) / o.riseTime) : 1;
    // during the ramp only the resistance is at full strength; the brakes build linearly
    const brakeLb = (d.front + d.rear) * ramp;
    const a = (brakeLb + d.resistance) / v.weight * G; // ft/s²
    let dt = o.dt, last = false;
    if (speed - a * dt <= end) { dt = (speed - end) / a; last = true; }
    x += speed * dt - a * dt * dt / 2;
    energyF += d.front * ramp * speed * dt; energyR += d.rear * ramp * speed * dt;
    // Land exactly on the end speed: floating point could otherwise leave a tiny positive speed and loop forever.
    speed = last ? end : speed - a * dt; t += dt;
    if (trace.length === 0 || t - trace[trace.length - 1].t >= .05) trace.push({ t: +t.toFixed(3), mph: speed / MPH, ft: x, g: a / G });
  }
  const mean = ((from * MPH) ** 2 - end ** 2) / (2 * x) / G;
  const start = decelAt(v, from * MPH, o);
  const brakesHelp = /brakes/.test(start.limit);
  const notes = [];
  if (start.limit === 'tires' || /tires/.test(start.limit)) notes.push('The tires limit this stop. Bigger brakes would not shorten a single stop; they help with repeated stops (heat) and pedal feel.');
  if (brakesHelp) notes.push(`The ${start.limit} limit this stop before the tires do: more brake torque would shorten it.`);
  if (start.unstable) notes.push('Without ABS the rear tires reach their limit first at this brake split: a locked rear can make the car spin.');
  if (!o.abs && !start.unstable) notes.push('Without ABS the best stop needs the driver to hold the front tires just short of locking; a panic lock-up slides at lower friction and stops longer.');
  return { status: 'ok', from, to, distance: x, time: t, meanG: mean, peakG: peak.a, limit: start.limit, unstable: start.unstable,
    bias: start.bias, utilization: start.utilization, loads: start.loads,
    energyShare: { front: energyF / (energyF + energyR || 1), rear: energyR / (energyF + energyR || 1) },
    riseTime: o.riseTime, abs: o.abs, notes, trace };
}

/** Panic stop with every wheel locked (no ABS): every tire slides at slideRatio × its peak friction. */
export function lockedStop(v, { from = 60, to = 0, ...options } = {}) {
  const o = { ...brakingDefaults, ...options };
  return brakingStop({ ...v, grip: v.grip * o.slideRatio }, { from, to, ...o, abs: true, absEfficiency: 1 });
}

/** Stops from the standard magazine speeds. */
export function standardStops(v, options = {}) {
  return Object.fromEntries([60, 70, 100].map(mph => [mph, brakingStop(v, { from: mph, ...options })]));
}

/** Average deceleration (g) implied by a published stopping distance — for comparing tests at different speeds. */
export const impliedG = (mph, feet) => (mph * MPH) ** 2 / (2 * feet) / G;
