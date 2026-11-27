import { fields, stock, vehicles, customEstimates } from './vehicles.mjs';
import { components, componentOverrides, componentProvenance } from './components.mjs';
import { axleWeights as sharedAxles, applyItems, tireLoads as sharedLoads, ride as sharedRide } from '../engine/loads.mjs';
import { availableDrive, driveAt, resistanceAt, straightLine as sharedStrip, tractionLimit, wheelRpm } from '../engine/acceleration.mjs';
import { missingFor, missingText } from './readiness.mjs';
import { engineFamilyFor, engineFamilies } from '../engine/data/engines.mjs';
import { swapMassChange } from '../engine/resolve.mjs';
import { tireClasses as tractionClasses, surfaces as tractionSurfaces, frictionFor, pickerOrder as tirePickerOrder } from '../engine/traction.mjs';

export const G = 32.174;
export const FT_PER_MILE = 5280;
export const MPH = FT_PER_MILE / 3600;
export const choices = {drivetrain: ['RWD', 'FWD', 'AWD'], transmission: ['manual', 'automatic', 'dual-clutch']};

export const limits = {
  weight: [1000, 9000], front: [0.25, 0.75], wheelbase: [75, 160],
  frontTrack: [42, 90], rearTrack: [42, 90], cg: [8, 34],
  hp: [35, 1500], torque: [35, 1350], hpRpm: [2000, 10000], torqueRpm: [1100, 9500],
  redline: [2600, 11500], finalDrive: [2, 6], diameter: [20, 40], grip: [.35, 1.4], cda: [3, 20],
  frontSpring: [40, 2000], rearSpring: [40, 2000], frontMotion: [.25, 1.5],
  rearMotion: [.25, 1.5], frontUnsprung: [0, 300], rearUnsprung: [0, 300], tireRate: [500, 4000],
};

export const presets = {
  seats: { label: 'Remove Firebird rear seats', firebird: true,
    note: '17.5 lb back + 5.5 lb bottom, measured by ESS. Location estimated at 76 in behind the front axle.',
    oldWeight: 23, oldX: 76, newWeight: 0, newX: 76 },
  radiator: { label: 'Fit Firebird aluminum radiator', firebird: true,
    note: '31 lb drained stock radiator → 11 lb dry aluminum. Center estimated 16 in ahead of the front axle.',
    oldWeight: 31, oldX: -16, newWeight: 11, newX: -16 },
  ballast: { label: 'Move 40 lb rearward',
    note: 'Illustrative component relocation from 18 in to 90 in behind the front axle.',
    oldWeight: 40, oldX: 18, newWeight: 40, newX: 90 },
  remove: { label: 'Remove 50 lb from rear cabin',
    note: 'Common hypothetical deletion for comparing platforms. Position is 70% of the wheelbase.',
    oldWeight: 50, oldX: 0, newWeight: 0, newX: 0 },
  driveline: { label: 'Model measured LS1/T5 package', firebird: true,
    note: 'ESS measured the dressed LS1/T5 at 558 lb, plus 50 lb for the GTO clutch and flywheel. Enter the removed package weight and its location. Engine output and gear overrides are entered separately.',
    oldWeight: 0, oldX: 18, newWeight: 608, newX: 18, requiresOld: true },
};

const between = (x, low, high) => Number.isFinite(x) && x >= low && x <= high;
const isObject = x => x !== null && typeof x === 'object' && !Array.isArray(x);

export function validValue(key, value) {
  if (Object.hasOwn(choices, key)) return choices[key].includes(value);
  if (key === 'gears') {
    return Array.isArray(value) && between(value.length, 2, 10) &&
      value.every((n, i) => between(n, .3, 7) && (!i || n < value[i - 1]));
  }
  return Object.hasOwn(limits, key) && between(value, ...limits[key]);
}

/**
 * Tire and surface conditions travel with a configuration (gearing page, Compare, Build, Garage, shared links).
 * {tire: traction class id, surface: traction surface id, customMu: 0.1–3}. Returns {} for defaults, null if invalid.
 */
export function cleanConditions(raw) {
  if (!isObject(raw)) return null;
  const out = {};
  if (raw.tire != null) { if (typeof raw.tire !== 'string' || !Object.hasOwn(tractionClasses, raw.tire)) return null; out.tire = raw.tire; }
  if (raw.surface != null) { if (typeof raw.surface !== 'string' || !Object.hasOwn(tractionSurfaces, raw.surface)) return null; if (raw.surface !== 'dryAsphalt') out.surface = raw.surface; }
  if (raw.customMu != null) { if (!between(raw.customMu, .1, 3)) return null; out.customMu = raw.customMu; delete out.tire; }
  return out;
}

/** Street tire class whose calibrated typical value equals a grip input (dry asphalt reference). */
export function matchedTire(grip) {
  if (!Number.isFinite(grip)) return null;
  return tirePickerOrder.find(id => tractionClasses[id].reference === 'dryAsphalt' && Math.abs(tractionClasses[id].longitudinal.typical - grip) < .001) ?? null;
}

/** Typical friction for conditions on a car whose own grip input is `grip` (shared engine values). */
export function conditionsGrip(conditions, grip) {
  if (!conditions) return null;
  if (conditions.customMu != null) return conditions.customMu;
  const tire = conditions.tire ?? matchedTire(grip);
  const surface = conditions.surface ?? 'dryAsphalt';
  if (tire) return frictionFor({ tire, surface }).typical;
  if (Number.isFinite(grip) && surface !== 'dryAsphalt') return Math.round(grip * tractionSurfaces[surface].factor.typical * 100) / 100;
  return null;
}

export function cleanSetup(raw) {
  if (!isObject(raw) || typeof raw.id !== 'string' || !Object.hasOwn(vehicles, raw.id) ||
      !isObject(raw.base) || !isObject(raw.tune) || !Array.isArray(raw.parts) || raw.parts.length > 8) return null;
  if (raw.name !== undefined && (typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > 36)) return null;
  const setup = { id: raw.id, base: {}, tune: {}, parts: [], ...(raw.name ? {name: raw.name.trim()} : {}) };
  if (raw.estimates !== undefined) {
    if (!Array.isArray(raw.estimates) || raw.id !== 'custom' || raw.estimates.length > Object.keys(customEstimates).length ||
        raw.estimates.some(key => typeof key !== 'string' || !Object.hasOwn(customEstimates, key))) return null;
    setup.estimates = [...new Set(raw.estimates)];
  }
  if (raw.conditions !== undefined) {
    const conditions = cleanConditions(raw.conditions);
    if (conditions === null) return null;
    if (Object.keys(conditions).length) setup.conditions = conditions;
  }
  if (raw.components !== undefined) {
    if (!isObject(raw.components)) return null;
    setup.components = {};
    for (const [kind, id] of Object.entries(raw.components)) {
      if (!Object.hasOwn(components, kind) || typeof id !== 'string' || !Object.hasOwn(components[kind], id)) return null;
      setup.components[kind] = id;
    }
  }
  for (const section of ['base', 'tune']) {
    for (const [key, value] of Object.entries(raw[section])) {
      if (!validValue(key, value)) return null;
      setup[section][key] = Array.isArray(value) ? [...value] : value;
    }
  }
  for (const part of raw.parts) {
    if (!isObject(part) || typeof part.label !== 'string' || !part.label.trim() || part.label.length > 60 ||
        !between(part.oldWeight, 0, 1800) || !between(part.newWeight, 0, 1800) ||
        !between(part.oldX, -75, 220) || !between(part.newX, -75, 220) ||
        (part.preset !== undefined && !Object.hasOwn(presets, part.preset))) return null;
    // Validate the stored numbers, even when the operation began as a preset.
    const { label, oldWeight, oldX, newWeight, newX, preset } = part;
    setup.parts.push({ label, oldWeight, oldX, newWeight, newX, ...(preset ? {preset} : {}) });
  }
  return setup;
}

export function newSetup(id) {
  return { id, base: {}, tune: {}, parts: [], ...(id === 'custom' ? {estimates: []} : {}) };
}

/**
 * Installed-mass consequence of an engine swap (owner review 26 Nov: a swap changed power and shift point but not mass).
 * Uses the shared component library's dressed engine weights and the engine adapter's rule (engine centre of mass 8 in
 * behind the front axle, estimate). Returns {part, from, to} when both engine weights are known on a front-engine car,
 * {unchanged: reason} when the mass cannot be estimated (the result then keeps the stock mass, and says so), or null.
 */
export function engineSwapMass(setup) {
  const id = setup.components?.engine;
  if (!id) return null;
  const v = vehicles[setup.id];
  const to = components.engine[id]?.family ?? null;
  const from = v ? engineFamilyFor(`${setup.id} ${v.ref ?? ''} ${v.name ?? ''} ${v.trim ?? ''}`) : null;
  if (v?.layout && v.layout !== 'FR' && v.layout !== 'F4' && !/^F/.test(v.layout))
    return {unchanged: 'Engine position is not modeled for mid- or rear-engine cars, so the stock mass and balance are kept.'};
  if (!from) return {unchanged: 'The stock engine is not in the component weight library yet, so the stock mass and balance are kept.'};
  if (!to || !engineFamilies[to]) return {unchanged: 'The swap engine’s installed weight is not in the component library yet, so the stock mass and balance are kept.'};
  if (from === to) return {unchanged: 'Same engine family: installed mass treated as unchanged.'};
  const part = swapMassChange({fromFamily: from, toFamily: to});
  return part ? {part, from, to} : {unchanged: 'Engine weights incomplete; stock mass kept.'};
}

export function resolve(setup, modified = true) {
  const estimateKeys = setup.estimates ?? Object.keys(customEstimates);
  const original = {...stock(setup.id)};
  const evidence = Object.fromEntries(Object.entries(vehicles[setup.id].data).map(([key, info]) => [key, info[1]]));
  if (setup.id === 'custom') {
    for (const key of estimateKeys) {
      original[key] = customEstimates[key][0];
      evidence[key] = 'estimated';
    }
  }
  const overrides = modified ? {...componentOverrides(setup), ...setup.tune} : {};
  if (modified) Object.assign(evidence, componentProvenance(setup));
  for (const key of [...Object.keys(setup.base), ...Object.keys(modified ? setup.tune : {})])
    if (Object.hasOwn(modified ? setup.tune : {}, key) || !Object.hasOwn(overrides, key)) evidence[key] = 'user';
  const tuned = {...original, ...setup.base, ...overrides, evidence};
  // Tire/surface conditions set the grip input everywhere (unless an explicit grip value was typed in).
  if (modified && setup.conditions && !Object.hasOwn(setup.tune, 'grip')) {
    const mu = conditionsGrip(setup.conditions, tuned.grip);
    if (Number.isFinite(mu)) { tuned.grip = mu; evidence.grip = 'user'; }
  }
  if (!Number.isFinite(tuned.weight) || !Number.isFinite(tuned.front))
    return {...tuned, frontLb: null, rearLb: null, cgX: null};
  if (!Number.isFinite(tuned.wheelbase)) {
    const frontLb = tuned.weight * tuned.front;
    return {...tuned, frontLb, rearLb: tuned.weight - frontLb, cgX: null};
  }
  const swap = modified ? engineSwapMass(setup) : null;
  const ownMass = Object.hasOwn(setup.tune ?? {}, 'weight') || Object.hasOwn(setup.tune ?? {}, 'front');
  const items = [...(swap?.part && !ownMass ? [swap.part] : []), ...(modified ? setup.parts : [])];
  if (swap?.part && !ownMass) { evidence.weight = 'estimated'; evidence.front = 'estimated'; }
  const extra = swap ? {engineSwap: ownMass && swap.part ? {unchanged: 'Your own weight or balance entry is used instead of the library estimate.'} : swap} : {};
  return {...tuned, ...(items.length ? applyItems(tuned, items) : sharedAxles(tuned)), ...extra};
}

export function massIssue(v) {
  if (![v.weight, v.front, v.wheelbase].every(Number.isFinite))
    return 'Add weight, front share and wheelbase to calculate axle movement and balance.';
  if (!Number.isFinite(v.weight) || v.weight <= 0 || v.frontLb <= 0 || v.rearLb <= 0)
    return 'The calculated center of gravity falls outside the axles, or the vehicle has no remaining weight.';
  if (!between(v.weight, ...limits.weight) || !between(v.front, ...limits.front))
    return 'The calculated mass or axle split is outside the prototype model range.';
  return '';
}

export function usableSetup(setup) {
  const result = resolve(setup);
  if ([result.weight, result.front, result.wheelbase].some(x => x == null)) return setup.parts.length === 0;
  return !massIssue(result);
}

export function tireLoads(v, brake, lateral, options) {
  const missing = missingFor(v, 'load-transfer');
  if (missing.length || massIssue(v)) return {tires: [null, null, null, null], invalid: true, missing};
  return sharedLoads(v, brake, lateral, options);
}

export function ride(v, axle) {
  const cornerLb = v[axle + 'Lb'] / 2;
  const unsprung = v[axle + 'Unsprung'];
  const spring = v[axle + 'Spring'];
  const motion = v[axle + 'Motion'];
  if (!Number.isFinite(v[axle + 'Lb']) || ![unsprung, spring, motion].every(Number.isFinite))
    return {wheel: null, rate: null, sprung: null, hz: null};
  return sharedRide({cornerLb, unsprung, spring, motion, tireRate: v.tireRate});
}

export function powerIssue(v, tool = 'quarter') {
  const missing = missingFor(v, tool);
  if (missing.length) return 'Add ' + missingText(missing) + '.';
  const required = ['hp','hpRpm','torque','torqueRpm','redline','gears','finalDrive','diameter','drivetrain',
    ...(tool === 'quarter' ? ['transmission'] : [])];
  const invalid = required.filter(key => !validValue(key, v[key]));
  if (invalid.length) return 'Check ' + missingText(invalid) + '.';
  if (v.torqueRpm >= v.hpRpm || v.hpRpm >= v.redline ||
      v.hp * 5252 / v.hpRpm > v.torque * 1.015 || v.torque * v.torqueRpm / 5252 > v.hp * 1.015)
    return 'Check torque, horsepower and RPM. This model needs a torque peak below the power peak, with mutually consistent peak ratings and a higher shift RPM.';
  return '';
}

export const driveResistance = resistanceAt;
export const tractiveLimit = tractionLimit;

export function driveForce(v, speed, gear, launch = false) {
  return launch ? availableDrive(v, speed, gear).force : driveAt(v, Math.max(1000, wheelRpm(v, speed, gear)), gear);
}

export function straightLine(v, {distance = 1320, ...options} = {}) {
  const issue = powerIssue(v) || massIssue(v);
  if (issue) return { issue };
  const result = sharedStrip(v, {...options, distanceFt: distance});
  const trace = result.trace.map(sample => ({...sample, limited: sample.limit === 'traction'}));
  return {...result, trace, maxSpeed: Math.max(...trace.map(s => s.speed)) / MPH};
}

export function atTime(run, t) {
  const trace = run.trace;
  if (t <= 0) return trace[0];
  if (t >= trace.at(-1).t) return trace.at(-1);
  let low = 0;
  let high = trace.length - 1;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (trace[middle].t <= t) low = middle;
    else high = middle;
  }
  const a = trace[low];
  const b = trace[high];
  const f = (t - a.t) / (b.t - a.t);
  return { ...a, t, speed: a.speed + f * (b.speed - a.speed), x: a.x + f * (b.x - a.x) };
}

// Front-view teaching model. The lower joint stays fixed as the top moves horizontally.
export function camberIllustration(offset, height = 10) {
  const x = Math.min(1, Math.max(-1, offset));
  return Math.atan2(x, height) * 180 / Math.PI;
}


export function tractionReadout(v) {
  if (powerIssue(v) || massIssue(v)) return null;
  const resistance = driveResistance(v, 0);
  const demand = driveForce(v, 0, 0, true);
  const limit = tractiveLimit(v, resistance);
  if (limit <= 0) return null;
  const utilization = demand / limit;
  const net = Math.min(demand, limit) - resistance;
  return {demand, limit, utilization, rear: v.rearLb + net * v.cg / v.wheelbase,
    mphInFirst: v.redline / wheelRpm(v, MPH, 0),
    cruiseRpm: wheelRpm(v, MPH * 70, v.gears.length - 1),
    color: utilization > 1 ? 'red' : utilization > .85 ? 'yellow' : 'green'};
}
