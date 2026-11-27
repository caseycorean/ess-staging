// ESS engineering library — tire traction: evidence-based grip classes and "drive force vs available grip".
// Owner direction 25 Nov: show demanded tire force against available longitudinal traction, with selectable tire
// classes, surface, custom friction, uncertainty, and comparison across classes at the same configuration.
// Pure functions, no DOM. Units: lb, in, °F. All friction values are labelled estimates bracketed by sources;
// none is a measurement of a specific tire. Treadwear (UTQG) is NOT used as grip — see `sources.treadwear`.
import { tireGrip, tractionLimit, torqueAt, launchSettings } from './acceleration.mjs';

/** Sources referred to by id from every class, surface and rule. */
export const sources = {
  wong: 'J.Y. Wong, Theory of Ground Vehicles (2nd ed., 1993) p. 26 — average peak tire friction: dry asphalt/concrete 0.80–0.90, wet asphalt 0.50–0.70, gravel 0.60 (via hpwizard.com/tire-friction-coefficient.html)',
  bosch: 'Bosch Automotive Handbook (4th ed., 1996) p. 335 — passenger tire at 50 km/h: dry 0.85 new / 1.00 at 1.6 mm tread; wet 0.2 mm water 0.65 / 0.50; racing tires "up to 1.8" (via hpwizard.com)',
  tireRack2024: 'Tire Rack, "Breaking Down Tire Performance Categories" (2 Aug 2024, BMW 330i xDrive, 225/45R18): ranking all-season < UHP all-season < max-performance summer < extreme-performance summer in dry braking, skid pad and laps; max summer stops ≥13 ft shorter from 60 mph than any all-season category; extreme summer 7.5 ft shorter again. tirerack.com/tires/tests/testDisplay.jsp?ttid=333',
  tireRack2025: 'Tire Rack, "Ultra High Performance vs. Max Performance Summer" (23 May 2025, BMW M2, 275/35R19): max-performance summer ahead of UHP summer in dry laps and braking. tirerack.com/tires/tests/testDisplay.jsp?ttid=340',
  treadwear: 'UTQG (49 CFR 575.104): the traction grade is a wet, locked-wheel sliding coefficient at 40 mph (AA > 0.54 asphalt / 0.38 concrete) and the treadwear grade is a wear ratio. Neither measures dry peak grip; compound quality can triple treadwear "without lessening the friction coefficient" (en.wikipedia.org/wiki/Uniform_Tire_Quality_Grading). Used here only as a cross-check, never as an input.',
  calibration: 'ESS acceleration v2 calibration: four road-test calibration cars plus 59 Supercar X archive hold-out road tests (engine/README.md; ess-knowledge inbox/2026-11-25_claude_archive-resolver.md)',
  sixtyFoot: 'Derived: a launch averaging a over the first 60 ft takes t = √(120/a); with nearly all weight on the driven rear tires the mean friction used is at least a/g. Drag-radial street cars commonly run 1.5–1.7 s (1.3–1.7 g); slick door cars 1.2–1.4 s (1.9–2.6 g, part of it from wheelie bars and tire growth). See muFromSixtyFoot().',
  cold: 'Summer and competition compounds harden below about 40–45 °F; tire makers and Tire Rack advise against summer tires near freezing (tirerack.com/tires/tiretech/techpage.jsp?techid=220). The size of the grip loss is not published as a number here; the factor is an estimate.',
};

const r2 = x => Math.round(x * 100) / 100;
const range = (low, typical, high) => ({ low, typical, high });

/**
 * Tire classes. `longitudinal` is peak friction on the class's reference surface (dry asphalt, or a prepped drag
 * strip for drag tires). Each `typical` equals the acceleration-model value already calibrated against road tests,
 * so selecting a class here never changes an existing result. `lateralRatio` converts to cornering grip.
 */
export const tireClasses = {
  allSeason: { label: 'All-season street tire', era: 'current', longitudinal: range(.80, .88, .95), lateralRatio: .97,
    reference: 'dryAsphalt', cold: false, src: ['wong', 'tireRack2024'], evidence: 'estimated',
    note: 'Bottom of the Tire Rack 2024 category ranking; Wong\'s dry range 0.80–0.90 for ordinary tires.' },
  maxSummer: { label: 'Max-performance summer tire', era: 'current', longitudinal: range(.95, tireGrip.uhp.mu, 1.12), lateralRatio: .97,
    reference: 'dryAsphalt', cold: true, src: ['tireRack2024', 'tireRack2025', 'calibration'], evidence: 'calibrated',
    note: 'Same value as the model\'s "uhp" default, checked on six archive road tests (mean ET error +0.22 s).' },
  extremeSummer: { label: 'Extreme-performance summer tire (≈200 treadwear)', era: 'current', longitudinal: range(1.03, tireGrip.extreme.mu, 1.22), lateralRatio: .98,
    reference: 'dryAsphalt', cold: true, src: ['tireRack2024', 'calibration'], evidence: 'calibrated',
    note: 'Same value as the model\'s "extreme" default, checked on 47 archive road tests (mean ET error +0.12 s).' },
  track200: { label: '200-treadwear track tire (warm)', era: 'current', longitudinal: range(1.05, tireGrip.track200.mu, 1.28), lateralRatio: .98,
    reference: 'dryAsphalt', cold: true, src: ['tireRack2024', 'bosch'], evidence: 'estimated',
    note: 'Needs heat: cold first-lap grip is closer to the extreme-summer value.' },
  dragRadial: { label: 'Drag radial', era: 'current', longitudinal: range(1.2, tireGrip.dragRadial.mu, 1.8), lateralRatio: .75,
    reference: 'preppedStrip', street: range(.95, 1.1, 1.25), cold: true, src: ['sixtyFoot', 'calibration'], evidence: 'derived',
    note: 'Range from public 60-ft times. On an unprepped street the soft compound helps less (street range shown).' },
  slick: { label: 'Drag slick (bias or radial)', era: 'current', longitudinal: range(1.5, 1.8, 2.5), lateralRatio: .7,
    reference: 'preppedStrip', street: range(1.0, 1.15, 1.3), cold: true, src: ['sixtyFoot', 'bosch'], evidence: 'derived',
    note: 'Not street legal. Very high values need tire growth, wheelie bars and a heavily prepped track.' },
  bias: { label: 'Bias-ply street tire (pre-1975)', era: 'classic', longitudinal: range(.65, tireGrip.bias.mu, .85), lateralRatio: .9,
    reference: 'dryAsphalt', cold: false, src: ['wong', 'calibration'], evidence: 'estimated', note: 'Period tire; no modern equivalent is sold as a performance tire.' },
  radial70s: { label: '1970s street radial', era: 'classic', longitudinal: range(.75, tireGrip.radial70s.mu, 1.0), lateralRatio: .95,
    reference: 'dryAsphalt', cold: false, src: ['wong', 'calibration'], evidence: 'estimated',
    note: 'Hold-out: four 1968–77 road tests run +0.70 s slow on average; the two Firebirds are also 5.5 mph slow at the trap (a power or test-condition issue, not grip). Grip sweep: the 1968 Z/28 matches at μ≈0.89 and the 1970 Z/28 at μ≈0.97 (both inside this range); not tuned on n = 2.' },
  perf80s: { label: '1980s–90s performance radial', era: 'classic', longitudinal: range(.85, tireGrip.perf80s.mu, 1.05), lateralRatio: .96,
    reference: 'dryAsphalt', cold: true, src: ['wong', 'calibration'], evidence: 'estimated', note: '' },
};

/** Owner-requested picker order: the five illustrative classes first, then period classes. */
export const pickerOrder = ['allSeason', 'maxSummer', 'extremeSummer', 'dragRadial', 'slick', 'track200', 'perf80s', 'radial70s', 'bias'];

/** Surfaces: multipliers on the class's dry-asphalt value (range, estimated) and which classes they suit. */
export const surfaces = {
  dryAsphalt: { label: 'Dry street asphalt', factor: range(1, 1, 1), src: ['wong'] },
  dryConcrete: { label: 'Dry concrete', factor: range(.95, 1, 1.02), src: ['wong'] },
  preppedStrip: { label: 'Prepped drag strip (traction compound)', factor: range(1, 1.05, 1.12), src: ['sixtyFoot'],
    note: 'Street tires gain a little; drag radials and slicks use their prepped values.' },
  wetAsphalt: { label: 'Wet asphalt', factor: range(.55, .72, .8), src: ['wong', 'bosch'],
    note: 'Treaded tires; worn tread and standing water reduce it further (Bosch: 0.5 at 1.6 mm tread).' },
  gravel: { label: 'Gravel / loose surface', factor: range(.6, .7, .8), src: ['wong'] },
};
// Drag tires on wet or loose surfaces: little or no tread to clear water. Estimated, deliberately wide.
const DRAG_POOR = { wetAsphalt: range(.25, .4, .6), gravel: range(.5, .6, .75) };

/** Cold-tire factor for summer/competition compounds (estimate, see sources.cold). */
export function coldFactor(cls, ambientF) {
  if (!cls.cold || ambientF == null || ambientF >= 50) return range(1, 1, 1);
  if (ambientF >= 40) return range(.85, .93, 1);
  return range(.7, .82, .95);
}

const mul = (a, b) => range(a.low * b.low, a.typical * b.typical, a.high * b.high);
const round = x => range(r2(x.low), r2(x.typical), r2(x.high));

/**
 * Friction range for a tire class on a surface. {customMu} overrides everything (shown as "your value").
 * Returns {low, typical, high, lateral:{...}, label, evidence, notes[], src[]}.
 */
export function frictionFor({ tire = 'maxSummer', surface = 'dryAsphalt', ambientF = null, customMu = null } = {}) {
  if (customMu != null) {
    const m = Math.max(.05, +customMu);
    return { ...range(m, m, m), lateral: range(m, m, m), label: 'Your friction value', evidence: 'user', notes: ['Your value; no uncertainty range applied.'], src: [] };
  }
  const cls = tireClasses[tire]; if (!cls) throw new Error(`unknown tire class ${tire}`);
  const surf = surfaces[surface]; if (!surf) throw new Error(`unknown surface ${surface}`);
  const drag = cls.reference === 'preppedStrip';
  const notes = [cls.note].filter(Boolean); const src = [...cls.src, ...surf.src];
  let mu;
  if (drag && surface === 'preppedStrip') mu = cls.longitudinal;
  else if (drag && DRAG_POOR[surface]) { mu = mul(cls.street, DRAG_POOR[surface]); notes.push('Drag tires have little or no tread: very low and unpredictable grip on this surface.'); }
  else if (drag) mu = mul(cls.street, surf.factor);
  else mu = mul(cls.longitudinal, surf.factor);
  const c = coldFactor(cls, ambientF);
  if (c.typical < 1) { mu = mul(mu, c); notes.push(`Below 50 °F this compound loses grip (estimate ×${c.typical}).`); src.push('cold'); }
  if (surf.note) notes.push(surf.note);
  const out = round(mu);
  return { ...out, lateral: round(mul(out, range(cls.lateralRatio, cls.lateralRatio, cls.lateralRatio))),
    label: cls.label, evidence: cls.evidence, notes, src: [...new Set(src)] };
}

/** Lower bound on the mean longitudinal friction used over the first 60 ft (see sources.sixtyFoot). */
export function muFromSixtyFoot(t60) { return r2(120 / t60 ** 2 / 32.174); }

/** Optional tire load sensitivity: mu falls as load per tire rises. k ≈ 0.1 is an illustrative estimate, not applied by default. */
export function muAtLoad(mu, load, refLoad, k = .1) { return mu * (load / refLoad) ** -k; }

/**
 * Drive force at the tires vs available traction, steady state (owner model, Race Car Design eq. 1.6):
 * RWD F = μ·Wr / (1 − μ·h/L), FWD F = μ·Wf / (1 + μ·h/L), AWD F = μ·W; capped where the front would lift.
 * Ignores resistance, uses constant μ, assumes both driven tires share the load (no wheel hop, no differential effect).
 * opts: {tire, surface, ambientF, customMu, gear (index, default 0), rpm (default launch rpm), torque (lb-ft override),
 *        efficiency (default .85), drive ('rear'|'front'|'all')}.
 */
export function tractionCheck(v, opts = {}) {
  const missing = missingFor(v, opts);
  if (missing.length) return { status: 'missing', missing, text: `Needs ${missing.join(', ')} to compare drive force with grip.` };
  const gear = opts.gear ?? 0;
  const rpm = opts.rpm ?? launchSettings(v).launchRpm;
  const torque = opts.torque ?? torqueAt(v, rpm);
  const eff = opts.efficiency ?? .85;
  const drive = opts.drive ?? v.drive ?? ({ FWD: 'front', AWD: 'all' })[v.drivetrain] ?? 'rear';
  const launch = launchSettings(v);
  // Automatic at stall in first gear: the converter multiplies engine torque (generic converter from acceleration.mjs).
  const conv = v.transmission === 'automatic' && gear === 0 && opts.rpm == null && opts.torque == null ? (launch.converter?.stallRatio ?? 1) : 1;
  const overall = v.gears[gear] * v.finalDrive * conv;
  const demand = torque * overall * eff / (v.diameter / 24);
  const mu = frictionFor(opts);
  const avail = range(...['low', 'typical', 'high'].map(k => tractionLimit(v, 0, mu[k], drive)));
  const liftCap = v.weight * v.front * v.wheelbase / v.cg;
  const frontLift = drive === 'rear' && avail.high >= liftCap - .5;
  const utilization = demand / avail.typical;
  let status, text;
  if (demand <= .9 * avail.low) {
    status = 'green';
    text = `Grip to spare: the tires can likely take about ${Math.round(avail.typical - demand)} lb more drive force (${Math.round((1 - utilization) * 100)}% reserve at the typical grip).`;
  } else if (demand > avail.high) {
    status = 'red';
    text = `More drive force than the tires can likely use: about ${Math.round(demand - avail.typical)} lb (${Math.round((utilization - 1) * 100)}%) over the typical grip. Expect wheelspin unless you feed the power in gradually.`;
  } else {
    status = 'yellow';
    text = `Near the limit: inside the uncertainty range for this tire (${Math.round(avail.low)}–${Math.round(avail.high)} lb). It may hook or spin depending on tire, surface and launch.`;
  }
  if (frontLift) text += ' The front end would lift before the rear tires reach their grip limit.';
  return {
    demandLb: Math.round(demand), availableLb: { low: Math.round(avail.low), typical: Math.round(avail.typical), high: Math.round(avail.high) },
    utilization: r2(utilization), reserveLb: Math.round(avail.typical - demand), status, text, frontLift,
    inputs: { torqueLbFt: Math.round(torque), rpm, converterRatio: conv, gear: gear + 1, overallRatio: r2(overall), efficiency: eff, drive, tireRadiusIn: v.diameter / 2 },
    friction: mu,
    assumptions: [
      conv > 1 ? `Automatic at a generic ${rpm} rpm stall with ${conv}:1 converter multiplication; a real converter's stall and ratio may differ.`
        : `Engine torque at ${rpm} rpm, not the actual launch torque: a clutch drop can briefly exceed it.`,
      'Steady state, constant friction, both driven tires share the load equally; ignores wheel hop, suspension squat and air drag.',
      'Friction is a class estimate with a range, not a measured value for a specific tire.',
    ],
  };
}

/** Facts the check needs; torque curve facts are not needed when a torque value is given. */
export function missingFor(v, opts = {}) {
  const need = { 'gear ratios': v.gears?.length, 'final drive': v.finalDrive, 'tire diameter': v.diameter, weight: v.weight,
    'weight distribution': v.front, wheelbase: v.wheelbase, 'CG height': v.cg };
  if (opts.torque == null) Object.assign(need, { torque: v.torque, 'torque and power rpm': v.torqueRpm && v.hpRpm && v.redline });
  return Object.entries(need).filter(([, x]) => !x).map(([k]) => k);
}

/** Gear by gear at peak-torque rpm: where does the drive force fall inside the grip? (Gearing calculator view.) */
export function byGear(v, opts = {}) {
  if (missingFor(v, opts).length) return [];
  return v.gears.map((ratio, gear) => {
    const r = tractionCheck(v, { ...opts, gear, rpm: opts.rpm ?? v.torqueRpm });
    return { gear: gear + 1, ratio, demandLb: r.demandLb, availableLb: r.availableLb, utilization: r.utilization, status: r.status };
  });
}

/** Same configuration, every tire class (owner request: compare alternative tire classes). */
export function compareTires(v, opts = {}, ids = pickerOrder) {
  return ids.map(id => ({ id, label: tireClasses[id].label, ...tractionCheck(v, { ...opts, tire: id, customMu: null }) }));
}
