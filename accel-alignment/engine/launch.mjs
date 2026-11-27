// ESS engineering library — launch dynamics: clutch, engine speed, wheelspin and shifts as explicit states.
// Owner directions 25 Nov (acceleration validation experiments; launch strategies): model launch RPM, clutch
// engagement, wheelspin, bogging and shift timing; offer typical / performance / maximum-effort presets; show the
// time each limiting factor costs; one tire/surface setting shared by the run and the traction check.
//
// What is different from acceleration.mjs `straightLine` (which stays unchanged and remains the Vehicle Lab default):
//   • Three speeds instead of one: car V, driven-wheel surface speed W, engine speed E (expressed as the road
//     speed it would give in the current gear). Clutch slips while E > W; tires spin while W > V (stick–slip).
//   • Engine rpm can fall after the clutch engages (bog) and the flywheel's stored energy can push extra torque
//     through on a fast engagement (the shock load behind "dumping the clutch").
//   • When the tires are at the grip limit the car accelerates at (grip − resistance)/mass: the engine, not the
//     road, spins up the wheels and flywheel. straightLine divides by 1.04 there (a 4% under-estimate).
//   • A spinning tire gives sliding friction (lower than peak) until the wheels slow to road speed.
// Same inertia basis as acceleration.mjs (Gillespie): wheels + driveline 0.04·m, engine 0.0025·N²·m (as road mass).
// Manual and dual-clutch only; automatics fall back to straightLine (converter model). Units: lb, in, ft, s, mph.
import { straightLine, driveAt, torqueAt, resistanceAt, tractionLimit, launchSettings, defaults, wheelRpm, inertiaScale } from './acceleration.mjs';
import { frictionFor, tractionCheck, sources as tireSources } from './traction.mjs';

const G = 32.174;
const MPH = 5280 / 3600;

export const sources = {
  gillespie: 'T.D. Gillespie, Fundamentals of Vehicle Dynamics (SAE 1992) ch. 2: effective mass factor 1 + 0.04 + 0.0025·N² (wheels/driveline and engine inertia).',
  slide: 'J.Y. Wong, Theory of Ground Vehicles (2nd ed.) p. 26: dry asphalt peak 0.80–0.90 vs sliding 0.75 (ratio ≈0.83–0.94); wet asphalt 0.50–0.70 vs 0.45–0.60. Used for the spinning-tire friction (estimate).',
  clutch: 'Clutch torque capacity is normally specified 1.2–1.5× engine torque (estimate 1.5× used; a clutch that slips at full engagement is not modelled).',
};

/** Tire friction while spinning, as a fraction of peak (Wong's sliding/peak ratios; estimate). */
export const slideRatio = { low: .83, typical: .88, high: .94 };

/**
 * Launch presets. Values are labelled estimates for a closed-course comparison, not driving advice.
 *   driver 'hold'  — the driver holds launch rpm while the clutch slips and feathers the throttle at the grip limit.
 *   driver 'full'  — full throttle from the launch; the clutch engages over clutchSeconds; any wheelspin is not corrected.
 */
export const presets = {
  typical: { label: 'Typical launch', launchRpm: 2000, clutchSeconds: .7, shiftSeconds: .5, shiftAt: .9, driver: 'hold',
    note: 'Smooth, repeatable street-style start: low rpm, gradual clutch, relaxed shifts a little before redline.' },
  performance: { label: 'Performance launch', launchRpm: 'model', clutchSeconds: .35, shiftSeconds: .25, shiftAt: 1, driver: 'hold',
    note: 'A skilled road-test driver: the shared model\'s launch rpm, quick clutch, throttle fed in to hold the tires at their limit.' },
  maximum: { label: 'Maximum effort (closed course)', launchRpm: 'best', clutchSeconds: .15, shiftSeconds: .2, shiftAt: 1, driver: 'hold',
    note: 'Best launch rpm found for this car, fast clutch, tires held right at their limit, quick shifts. On a low-power car a clutch dump can be quicker still (flywheel energy); a comparison scenario, not a recommendation.' },
  dump: { label: 'Clutch dump, no throttle control', launchRpm: 'best', clutchSeconds: .1, shiftSeconds: .2, shiftAt: 1, driver: 'full',
    note: 'Full throttle and a dropped clutch; any wheelspin is not corrected. Shows why spinning the tires is slower on a car that has more power than grip, and the extra shock load. Hard on clutch, axles and tires.' },
};

/** Clutch/flywheel shock: peak torque through the driveline as a multiple of peak engine torque (relative, not a rating). */
function shockMultiple(peakClutchForce, v, gear = 0) {
  const peakEngine = driveAt(v, v.torqueRpm, gear);
  return Math.round(peakClutchForce / peakEngine * 100) / 100;
}

/**
 * Full straight-line run with launch dynamics. opts (all optional):
 *   mu, launchRpm, clutchSeconds, shiftSeconds, shiftAt (fraction of redline), driver ('hold'|'full'),
 *   slide (spinning/peak friction ratio), clutchCapacity (× peak engine torque), rolloutFt, distanceFt, dt, drive.
 * Returns the same shape as straightLine (zeroTo60, finish, magazine, trace, time) plus sixtyFt, peakShock, launchRpm.
 */
export function launchRun(v, opts = {}) {
  const base = launchSettings(v);
  if (base.converter) {
    const r = straightLine(v, { mu: opts.mu ?? v.grip, shiftSeconds: opts.shiftSeconds ?? base.shiftSeconds });
    return { ...r, model: 'converter (straightLine)', note: 'Automatic: torque-converter launch from acceleration.mjs; launch presets change only shift time.' };
  }
  const o = { mu: v.grip, launchRpm: base.launchRpm, clutchSeconds: .35, shiftSeconds: base.shiftSeconds, shiftAt: 1, driver: 'hold',
    slide: slideRatio.typical, clutchCapacity: 1.5, rolloutFt: defaults.rolloutFt, distanceFt: 1320, dt: .0005, maxTime: 45,
    rollResistance: defaults.rollResistance, ...opts };
  const m = v.weight / G;
  const Mw = .04 * m;                                   // wheels + driveline, as road-equivalent mass
  const Me = gear => .0025 * (v.gears[gear] * v.finalDrive * ((opts.inertiaScale ?? defaults.inertiaScale) ? inertiaScale(v) : 1)) ** 2 * m; // engine + flywheel in this gear
  const rpmOf = (E, gear) => wheelRpm(v, E, gear);      // road-equivalent engine speed → rpm
  const speedOf = (rpm, gear) => rpm / wheelRpm(v, 1, gear);
  const drive = (rpm, gear) => rpm > v.redline ? 0 : driveAt(v, Math.max(rpm, 600), gear); // rev limiter; stall floor
  const cap = (speed) => tractionLimit(v, resistanceAt(v, speed, o.rollResistance), o.mu, o.drive);
  const shiftRpm = Math.min(v.redline - 50, o.shiftAt * v.redline);
  const clutchMax = o.clutchCapacity * driveAt(v, v.torqueRpm, 0);

  let gear = 0, t = 0, V = 0, W = 0, x = 0;
  let E = speedOf(o.launchRpm, 0);
  let locked = false, spinning = false, shift = 0;
  let t60 = null, tRollout = null, sixty = null, finish = null, stripFinish = null, peakClutch = 0, minRpmAfterLock = Infinity;
  let clutchReentries = 0, everLocked = false; // QA 25 Nov: a re-launch after the first lock-up is a model fault
  const time = { wheelspin: 0, grip: 0, clutch: 0, bog: 0, engine: 0, shifting: 0 };
  const trace = [{ t: 0, speed: 0, x: 0, gear: 1, rpm: o.launchRpm, limit: 'clutch' }];
  let nextSample = .02;
  while (t < o.maxTime) {
    const dt = o.dt;
    const R = resistanceAt(v, V, o.rollResistance);
    const grip = cap(V);
    let aV, aW = 0, aE = 0, label;
    if (shift > 0) {
      // Clutch open: wheels roll with the car, engine drops to the next gear's speed (rev-matched on re-engagement).
      spinning = false; W = V;
      aV = -R / (m + Mw); label = 'shifting';
      shift -= dt;
      if (shift <= 0) { E = W; locked = true; }
    } else if (locked) {
      const rpm = rpmOf(E, gear);
      const F = drive(rpm, gear);
      if (!spinning) {
        const aFree = (F - R) / (m + Mw + Me(gear));
        const Fx = R + m * aFree;
        if (Fx <= grip) { aV = aFree; label = rpm < v.torqueRpm && torqueAt(v, rpm) < .75 * v.torque ? 'bog' : 'engine'; } // bog: below 75% of peak torque
        else if (o.driver === 'hold') { aV = (grip - R) / m; label = 'grip'; }   // throttle fed to the limit
        else { spinning = true; }
        if (!spinning) { aW = aV; aE = aV; }
      }
      if (spinning) {
        const Fx = o.slide * grip;
        aV = (Fx - R) / m; aW = (F - Fx) / (Mw + Me(gear)); aE = aW; label = 'wheelspin';
        if (W + aW * dt <= V + aV * dt) { spinning = false; aW = aV; aE = aV; }
      }
      // Shift on engine rpm only while the tires grip; a spinning tire just runs the engine into the rev limiter.
      if (!spinning && rpm >= shiftRpm && gear < v.gears.length - 1) {
        gear++; shift = o.shiftSeconds; E = W; // new gear: E re-expressed in the next ratio
        // Instant shift (shiftSeconds 0, the timeLost counterfactual): stay locked and rev-matched; never a second clutch launch.
        locked = !(shift > 0);
      }
    } else {
      // Clutch slipping (first-gear launch): capacity ramps in over clutchSeconds.
      if (everLocked) clutchReentries++;
      const ramp = o.clutchSeconds > 0 ? Math.min(1, (t + dt) / o.clutchSeconds) : 1;
      const rpm = rpmOf(E, gear);
      let Fc = ramp * clutchMax;
      let Fe = drive(rpm, gear);
      if (o.driver === 'hold') Fc = Math.min(Fc, drive(o.launchRpm, gear));      // the driver lets the clutch out no faster than rpm holds
      peakClutch = Math.max(peakClutch, Fc);
      // Engine side: full throttle accelerates the engine with any surplus; holding keeps rpm at launch while it can.
      aE = o.driver === 'hold' && rpm >= o.launchRpm && Fe >= Fc ? 0 : (Fe - Fc) / Me(gear);
      if (!spinning) {
        const aFree = (Fc - R) / (m + Mw);
        const Fx = R + m * aFree;
        if (Fx <= grip) { aV = aFree; aW = aV; label = 'clutch'; }
        else if (o.driver === 'hold') { aV = (grip - R) / m; aW = aV; label = 'grip'; }
        else spinning = true;
      }
      if (spinning) {
        const Fx = o.slide * grip;
        aV = (Fx - R) / m; aW = (Fc - Fx) / Mw; label = 'wheelspin';
        if (W + aW * dt <= V + aV * dt) { spinning = false; aW = aV; }
      }
      // Lock-up when the engine has been pulled down to the driveline speed.
      if (E + aE * dt <= W + aW * dt) { locked = true; E = W = Math.max(W, V); }
    }
    const nV = Math.max(0, V + aV * dt), nX = x + (V + nV) / 2 * dt;
    W = Math.max(nV, W + aW * dt);
    if (locked) everLocked = true;
    if (!locked && shift <= 0) E = Math.max(E + aE * dt, W); else if (locked && shift <= 0) E = W;
    if (locked && shift <= 0 && gear === 0) minRpmAfterLock = Math.min(minRpmAfterLock, rpmOf(E, gear));
    time[label] += dt;
    if (tRollout === null && nX >= o.rolloutFt) tRollout = t + dt * (o.rolloutFt - x) / Math.max(1e-9, nX - x);
    if (sixty === null && nX >= 60) sixty = t + dt * (60 - x) / Math.max(1e-9, nX - x);
    if (t60 === null && nV >= 60 * MPH) t60 = t + dt * (60 * MPH - V) / Math.max(1e-9, nV - V);
    t += dt;
    if (t >= nextSample) { trace.push({ t, speed: nV / MPH, x: nX, gear: shift > 0 ? 0 : gear + 1, rpm: Math.round(rpmOf(E, gear)), slip: V > 1 ? (W - nV) / nV : 0, limit: label }); nextSample += .02; }
    if (!finish && nX >= o.distanceFt) { const f = (o.distanceFt - x) / (nX - x); finish = { t: t - dt + f * dt, trap: (V + f * (nV - V)) / MPH }; }
    if (nX >= o.distanceFt + o.rolloutFt) { const f = (o.distanceFt + o.rolloutFt - x) / (nX - x); stripFinish = { t: t - dt + f * dt, trap: (V + f * (nV - V)) / MPH }; break; }
    V = nV; x = nX;
  }
  const r0 = tRollout ?? 0;
  const round = (o) => Object.fromEntries(Object.entries(o).map(([k, s]) => [k, Math.round(s * 100) / 100]));
  return {
    model: 'launch dynamics', zeroTo60: t60, finish, completed: !!stripFinish, clutchReentries,
    magazine: { zeroTo60: t60 == null ? null : t60 - r0, et: stripFinish ? stripFinish.t - r0 : null, trap: stripFinish?.trap ?? null,
      sixtyFt: sixty == null ? null : sixty - r0, note: 'Comparison clock starts after the chosen rollout distance.' },
    time: round(time), trace, launchRpm: o.launchRpm,
    bogRpm: Number.isFinite(minRpmAfterLock) ? Math.round(minRpmAfterLock) : null,
    peakShock: shockMultiple(peakClutch, v),
    assumptions: { ...o, mu: o.mu },
  };
}

/** Search launch rpm (hardware fixed) for the quickest 0–60 or ET. Returns {best, rows[]} — the sensitivity sweep. */
export function bestLaunchRpm(v, opts = {}, target = 'et') {
  const lo = Math.max(1500, Math.round(.3 * v.redline / 250) * 250), hi = v.redline - 250;
  const rows = [];
  for (let rpm = lo; rpm <= hi; rpm += 250) {
    const r = launchRun(v, { ...opts, launchRpm: rpm, dt: .001 });
    rows.push({ rpm, et: r.magazine.et, zeroTo60: r.magazine.zeroTo60, sixtyFt: r.magazine.sixtyFt, wheelspin: r.time.wheelspin, bog: r.time.bog, shock: r.peakShock });
  }
  const key = target === '60' ? 'zeroTo60' : 'et';
  const ok = rows.filter(r => Number.isFinite(r[key]));
  // No launch rpm completes the run (e.g. too little power for maxTime): a structured "unavailable", never a TypeError.
  if (!ok.length) return { best: null, quickest: null, rows, unavailable: `No launch rpm completes the ${key === 'et' ? 'quarter mile' : '0–60'} within ${opts.maxTime ?? 45} s.` };
  const quickest = Math.min(...ok.map(r => r[key]));
  // Lowest rpm within 0.02 s of the quickest that does not bog: no slower in the model, and easier on the clutch.
  const near = ok.filter(r => r[key] <= quickest + .02);
  const best = near.find(r => r.bog === 0) ?? near[0];
  return { best, quickest, rows };
}

/** Run one preset ('typical' | 'performance' | 'maximum') with optional overrides. */
export function runPreset(v, id, overrides = {}) {
  const p = presets[id]; if (!p) throw new Error(`unknown preset ${id}`);
  const { label, note, ...settings } = p;
  const o = { ...settings, ...overrides };
  if (o.launchRpm === 'model') o.launchRpm = launchSettings(v).launchRpm;
  let fallback = null;
  if (o.launchRpm === 'best') {
    const b = bestLaunchRpm(v, { ...o, launchRpm: undefined });
    if (b.best) o.launchRpm = b.best.rpm;
    else { o.launchRpm = launchSettings(v).launchRpm; fallback = `${b.unavailable} Using the model launch rpm instead.`; }
  }
  if (v.transmission === 'dual-clutch') o.shiftSeconds = Math.min(o.shiftSeconds, .12);
  const r = launchRun(v, o);
  return { preset: id, label, note, ...r, ...(fallback ? { launchRpmFallback: fallback } : {}) };
}

/**
 * Time lost to each limiting factor, by switching it off one at a time (counterfactuals; they do not add up exactly).
 *   shifts   — same run with instant shifts
 *   traction — same run with unlimited tire grip (the front-lift cap still applies)
 *   launch   — same run at the best launch rpm instead of the chosen one
 */
export function timeLost(v, opts = {}) {
  const run = o => launchRun(v, { ...opts, ...o, dt: .001 }).magazine;
  const base = run({});
  const d = (alt, k) => alt[k] == null || base[k] == null ? null : Math.round((base[k] - alt[k]) * 100) / 100;
  const noShift = run({ shiftSeconds: 0 }), noGrip = run({ mu: 9 });
  const best = bestLaunchRpm(v, opts).best;           // null when no launch rpm completes the run
  const atBest = best ? run({ launchRpm: best.rpm }) : {};
  return {
    base: { et: base.et, zeroTo60: base.zeroTo60 },
    lost: {
      shifts: { et: d(noShift, 'et'), zeroTo60: d(noShift, 'zeroTo60') },
      traction: { et: d(noGrip, 'et'), zeroTo60: d(noGrip, 'zeroTo60') },
      launchRpm: { et: d(atBest, 'et'), zeroTo60: d(atBest, 'zeroTo60'), bestRpm: best?.rpm ?? null },
    },
    note: 'Each factor is removed on its own; the savings overlap, so they do not sum to the total.',
  };
}

/**
 * One tire/surface setting for both the run and the traction check (so they always agree), with the run repeated at
 * the class's low and high friction to show the uncertainty. tireOpts: {tire, surface, ambientF, customMu}.
 */
export function performanceWithTires(v, tireOpts = {}, launchOpts = {}, preset = 'performance') {
  const f = frictionFor(tireOpts);
  const run = mu => runPreset(v, preset, { ...launchOpts, mu, dt: .001 });
  const typical = run(f.typical), low = run(f.low), high = run(f.high);
  const check = tractionCheck(v, { ...tireOpts, gear: 0 });
  const pick = r => ({ et: r.magazine.et, zeroTo60: r.magazine.zeroTo60, sixtyFt: r.magazine.sixtyFt, trap: r.magazine.trap });
  return {
    friction: f, check,
    result: pick(typical), range: { slowest: pick(low), quickest: pick(high) },
    time: typical.time, sources: f.src.map(s => tireSources[s]).filter(Boolean),
    note: 'Same tire and surface feed the run and the drive-force check. The range repeats the run at the low and high friction for this tire class.',
  };
}
