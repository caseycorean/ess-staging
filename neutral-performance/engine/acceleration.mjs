// ESS engineering library — straight-line acceleration, version 2 (Vehicle Lab private review).
// Same vehicle fields as experience/models.mjs (weight, front, wheelbase, cg, hp, hpRpm, torque, torqueRpm,
// redline, gears[], finalDrive, diameter, grip, cda). Differences from the shipped model, each switchable:
//   1. rotating inertia (engine, flywheel, driveline, wheels) — the shipped model treats the car as a sliding block
//   2. clutch-slip launch at a realistic RPM; while the clutch slips the engine's own inertia is not being accelerated
//   3. tire grip defaults by tire type instead of one 0.90 for every car
//   4. results reported both from standstill and with the 1-ft rollout US magazines use
// Units: lb, in, ft, s, mph. Limitations: flat torque-curve shape from four anchor points, constant shift time,
// no tire growth, no wheel hop or traction control. Automatic converter behavior is illustrative.

const G = 32.174;
const MPH = 5280 / 3600;
const AIR = .002377;

export function resistanceAt(v, speed, rolling = defaults.rollResistance) {
  return rolling * v.weight + .5 * AIR * v.cda * speed ** 2;
}

export function wheelRpm(v, speed, gear) {
  return speed * 60 * v.gears[gear] * v.finalDrive / (Math.PI * v.diameter / 12);
}

export function driveAt(v, rpm, gear, driveline = defaults.driveline) {
  return torqueAt(v, rpm) * v.gears[gear] * v.finalDrive * driveline / (v.diameter / 24);
}

/** Longitudinal grip defaults by tire type: labelled estimates, calibrated on four road tests and checked on three others. */
export const tireGrip = {
  bias: { mu: .75, label: 'Bias-ply street tire (pre-1975)' },
  radial70s: { mu: .85, label: '1970s street radial' },
  perf80s: { mu: .95, label: '1980s–90s performance radial' },
  uhp: { mu: 1.05, label: '2000s ultra-high-performance summer tire' },
  extreme: { mu: 1.10, label: 'Extreme-performance summer tire (C5 Z06 class)' },
  track200: { mu: 1.15, label: '200-treadwear track tire' },
  dragRadial: { mu: 1.4, label: 'Drag radial on a prepped surface' },
};

export const defaults = { driveline: .85, shiftSeconds: .25, rollResistance: .015, inertia: true, inertiaScale: true, rolloutFt: 1, dt: .002 };

export function torqueAt(v, rpm) {
  const atPower = v.hp * 5252 / v.hpRpm;
  const anchors = [[1000, v.torque * .68], [v.torqueRpm, v.torque], [v.hpRpm, atPower],
    [v.redline, .88 * v.hp * 5252 / v.redline]];
  for (let i = 1; i < anchors.length; i++) {
    const [end, high] = anchors[i];
    if (rpm <= end) {
      const [start, low] = anchors[i - 1];
      const t = Math.max(0, (rpm - start) / (end - start));
      return Math.min(low + (high - low) * t, v.hp * 5252 / rpm);
    }
  }
  return 0;
}

/** Gillespie's rule-of-thumb mass factor for an overall ratio N (gear × final drive). */
export const massFactor = overall => 1.04 + .0025 * overall * overall;

/**
 * Engine inertia seen at the road is I·(N/r)²/m. Gillespie's 0.0025·N² carries one tire radius inside the constant,
 * so it over-penalises large tires (37 in truck tires: ×2.1) and under-penalises small ones. Scaling N by
 * 25.5 in / tire diameter keeps his rule for a typical 25.5 in tire (assumed reference, not fitted). Default from
 * 25 Nov (validation: _build/validation/launch-promotion.mjs); o.inertiaScale = false restores the plain rule.
 */
export const inertiaScale = v => 25.5 / v.diameter;

/** Driven-tire limit (lb) from longitudinal load transfer and front-lift cap.
 * AWD assumes that the drivetrain can use the available grip at both axles.
 */
export function tractionLimit(v, resistance, mu = v.grip, drive = v.drive ?? ({FWD:'front', AWD:'all'})[v.drivetrain] ?? 'rear') {
  const front = v.weight * v.front;
  const lever = v.cg / v.wheelbase;
  const lift = front / lever + resistance;
  let grip;
  if (drive === 'front') grip = mu * (front + resistance * lever) / (1 + mu * lever);
  else if (drive === 'all') grip = mu * v.weight;
  // mu·h/L ≥ 1: the rear tires can push harder than it takes to lift the front, so the front-lift cap governs.
  else grip = 1 - mu * lever > 0 ? mu * (v.weight - front - resistance * lever) / (1 - mu * lever) : Infinity;
  return Math.max(0, Math.min(grip, lift));
}

// Generic converter from the shared component pipeline. Replace these values with measured converter data when available.
export const converter = {stallRpm: 2200, stallRatio: 2, couplingSpeedRatio: .85, shiftSeconds: .12};

export function launchSettings(v) {
  return v.transmission === 'automatic' ?
    {launchRpm: converter.stallRpm, shiftSeconds: converter.shiftSeconds, converter} :
    {launchRpm: Math.min(Math.max(3000, v.torqueRpm), v.redline - 500),
      shiftSeconds: v.transmission === 'dual-clutch' ? .12 : defaults.shiftSeconds};
}

export function availableDrive(v, speed, gear, options = launchSettings(v)) {
  const coupled = wheelRpm(v, speed, gear);
  if (options.converter) {
    const conv = options.converter;
    const rpm = Math.max(conv.stallRpm, coupled, 1000);
    const speedRatio = Math.min(1, coupled / rpm / conv.couplingSpeedRatio);
    const multiplier = conv.stallRatio - (conv.stallRatio - 1) * speedRatio;
    const slipping = speedRatio < 1;
    return {slipping, force: multiplier * driveAt(v, slipping ? rpm : Math.max(1000, coupled), gear, options.driveline)};
  }
  const slipping = gear === 0 && coupled < options.launchRpm;
  const rpm = slipping ? options.launchRpm : Math.max(1000, coupled);
  return {slipping, force: driveAt(v, rpm, gear, options.driveline)};
}

export function straightLine(v, options = {}) {
  const o = { ...defaults, ...launchSettings({...v, transmission: options.transmission ?? v.transmission}), distanceFt: 1320,
    maxTime: 45, mu: v.grip, ...options };
  if (o.converter) o.converter = {...converter, ...o.converter};
  let gear = 0, shift = 0, speed = 0, x = 0, t = 0;
  let t60 = null, tRollout = null, finish = null, stripFinish = null;
  const time = { traction: 0, engine: 0, clutch: 0, shifting: 0 };
  const trace = [{ t: 0, speed: 0, x: 0, gear: 1, g: 0, limit: 'traction' }];
  let nextSample = .02;
  let finishTrace = null;
  while (t < o.maxTime) {
    const coupled = wheelRpm(v, speed, gear);
    if (shift <= 0 && gear < v.gears.length - 1 && coupled >= v.redline - 50) { gear++; shift = o.shiftSeconds; }
    const resistance = resistanceAt(v, speed, o.rollResistance);
    const cap = tractionLimit(v, resistance, o.mu, o.drive);
    const {slipping, force: demand} = availableDrive(v, speed, gear, o);
    const available = shift > 0 ? (o.converter ? .5 * demand : 0) : demand;
    const coupledFactor = !o.inertia ? 1 : massFactor(v.gears[gear] * v.finalDrive * (o.inertiaScale ? inertiaScale(v) : 1)), gripFactor = !o.inertia ? 1 : 1.04;
    // Traction is limited only when the force that actually reaches the road exceeds grip. With the engine coupled,
    // part of the drive force spins up the engine and driveline, so compare the inertia-reduced acceleration with the
    // grip-limited one. Continuous in grip, so more grip is never slower (fix 25 Nov: the old rule compared the
    // pre-inertia force and made 39 of 90 vehicles slower on a grippier tire). o.legacyTraction restores the old rule.
    const engineAccel = (available - resistance) / v.weight * G / (slipping || shift > 0 ? gripFactor : coupledFactor);
    // At the grip limit the engine has torque to spare, so it (not the road) spins up wheels and engine: the car gets
    // (grip − resistance)/mass, as in launch.mjs. The old rule divided by 1.04 here (legacyTraction keeps it).
    const gripAccel = (cap - resistance) / v.weight * G / (o.legacyTraction ? gripFactor : 1);
    const overGrip = o.legacyTraction ? available > cap : engineAccel > gripAccel;
    let limit = shift > 0 ? 'shifting' : overGrip ? 'traction' : slipping ? 'clutch' : 'engine';
    const accel = shift > 0 ? (Math.min(available, cap) - resistance) / v.weight * G / gripFactor : overGrip ? gripAccel : engineAccel;
    const nextSpeed = Math.max(0, speed + accel * o.dt);
    const nextX = x + (speed + nextSpeed) / 2 * o.dt;
    time[limit] += o.dt;
    if (tRollout === null && nextX > x && nextX >= o.rolloutFt) tRollout = t + o.dt * (o.rolloutFt - x) / (nextX - x);
    if (t60 === null && nextSpeed >= 60 * MPH) t60 = t + o.dt * (60 * MPH - speed) / (nextSpeed - speed);
    if (shift > 0) shift -= o.dt;
    t += o.dt;
    if (t >= nextSample) { trace.push({ t, speed: nextSpeed, x: nextX, gear: shift > 0 ? 0 : gear + 1, g: accel / G, limit }); nextSample += .02; }
    // Standstill quarter mile (as the shipped model) and the drag-strip version: timer starts after rollout,
    // then runs a full quarter mile from that point.
    if (!finish && nextX >= o.distanceFt) {
      const f = (o.distanceFt - x) / (nextX - x);
      finish = { t: t - o.dt + f * o.dt, trap: (speed + f * (nextSpeed - speed)) / MPH };
      finishTrace = {t: finish.t, speed: finish.trap * MPH, x: o.distanceFt, gear: shift > 0 ? 0 : gear + 1, g: accel / G, limit};
    }
    if (nextX >= o.distanceFt + o.rolloutFt) {
      const f = (o.distanceFt + o.rolloutFt - x) / (nextX - x);
      stripFinish = { t: t - o.dt + f * o.dt, trap: (speed + f * (nextSpeed - speed)) / MPH };
      break;
    }
    speed = nextSpeed; x = nextX;
  }
  const r = tRollout ?? 0;
  return {
    trace: finishTrace ? [...trace.filter(sample => sample.t < finish.t), finishTrace] : trace, zeroTo60: t60, finish,
    magazine: { zeroTo60: t60 === null ? null : t60 - r, et: stripFinish ? stripFinish.t - r : null,
      trap: stripFinish?.trap ?? null, note: 'Comparison clock starts after the chosen rollout distance.' },
    time, assumptions: { ...o, mu: o.mu },
  };
}
