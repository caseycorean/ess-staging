// ESS graphical simulations: the six experiments as replayable runs. Claude, 26 Nov 2026.
// Pure (no DOM): every run is one call to the shared engine (engine/maneuvers.mjs); this module only reshapes
// its trace into samples {t (s), s (ft along the road), mph} so the replay can place each car at the right
// place at the right time. Tests: engine/test/replay.test.mjs (replay end time = model time for every preset).
import { accelerationProfile, brakeBetween, steadyCorner, runPath, MANEUVERS, DIFFS, MPH, entrySegments, exitSegments } from '../../engine/maneuvers.mjs';
import { circleSegments } from '../../engine/path-geometry.mjs';
import { tireGrip } from '../../engine/acceleration.mjs';
import { resolve, newSetup, cleanSetup, usableSetup } from '../models.mjs';
import { vehicles } from '../vehicles.mjs';
import { missingFor, missingText } from '../readiness.mjs';

// ---------------------------------------------------------------- what the visitor can say about the evidence
export const EVIDENCE = {
  checked: 'Model checked against published tests',
  estimate: 'Model estimate, not yet checked against measured times',
};

export const SEQUENCES = ['corner90', 'hairpin', 'sweeper', 'esses'];

export const EXPERIMENTS = {
  accelerate: { label: 'Accelerate', short: 'Launch and run', evidence: 'checked',
    check: 'Quarter-mile model about 2% from 17 published road tests on average.',
    params: { ft: 1320 }, presets: [[330, '330 ft'], [660, '⅛ mile'], [1320, '¼ mile'], [2640, '½ mile'], [5280, '1 mile']] },
  brake: { label: 'Brake', short: 'Stop from speed', evidence: 'checked',
    check: 'Braking model about 2.5% from 20 held-out Car and Driver stops on average (road-test timing).',
    params: { from: 60 }, presets: [[60, '60–0'], [70, '70–0'], [100, '100–0']] },
  corner: { label: 'Corner', short: 'Steady circle', evidence: 'checked',
    check: 'Cornering grip about 2.5% from 19 published skidpad figures on average (load sensitivity k = 0.15, provisional).',
    params: { radius: 100 }, presets: [[60, 'Tight 60 ft'], [100, '200-ft skidpad'], [150, '300-ft skidpad'], [300, 'Fast 300 ft']] },
  entry: { label: 'Brake into a corner', short: 'Late braking', evidence: 'estimate',
    check: 'Path model: braking and cornering share one grip budget. Not yet checked against measured segment times.',
    params: { mph: 80, radius: 150 }, presets: [[60, 'From 60 mph'], [80, 'From 80 mph'], [100, 'From 100 mph']] },
  exit: { label: 'Power out', short: 'Corner exit', evidence: 'estimate',
    check: 'Path model with open, limited-slip or locked differential. Not yet checked against measured segment times.',
    params: { radius: 75 }, presets: [[40, 'Tight 40 ft'], [75, '75 ft apex'], [150, '150 ft apex']] },
  sequence: { label: 'Corner sequences', short: '90°, hairpin, sweeper, S', evidence: 'estimate',
    check: 'Path model on original ESS layouts (not real circuits). Not yet checked against measured times.',
    params: { key: 'corner90' }, presets: SEQUENCES.map(k => [k, MANEUVERS[k].label]) },
};
export const EXPERIMENT_KEYS = Object.keys(EXPERIMENTS);
export const NO_CHANGE = Object.freeze({ tire: '', weight: 0, cg: 0, power: 0 });

// Demonstration matchups (owner review 26 Nov: Camaro vs Mustang were too alike to teach anything). Each pairs real
// catalogue records whose difference has a clear engineering reason; no figures are adjusted to make a point.
const TA77 = 'firebird', FIREHAWK = 'sx-2002-pontiac-slp-firebird-firehawk', CHEVELLE = 'chevrolet-chevelle-2nd-gen--1970-ss-454-ls6-m22-coupe',
  Z28_69 = 'chevrolet-camaro-1st-gen--1969-z28-302-m4-3.73-sport-coupe', Z28_15 = 'chevrolet-camaro-5th-gen--2015-z28-ls7-m6-coupe',
  CIVIC = 'honda-civic-fl5--2023-type-r-k20c1-m6-hatch', MX5 = 'mazda-mx5-nd--2024-club-2.0-m6-soft-top', TRX = 'ram-1500-dt--2021-trx-6.2-a8-crew-cab-4wd',
  GR86 = 'toyota-gr86-zn8--2022-premium-2.4-m6-coupe', PP2 = 'ford-mustang-s550--2018-gt-pp2-5.0-m6-fastback', S2000 = 'honda-s2000-ap--2005-ap2-2.2-m6-roadster';
const car = (id, change) => ({ id, change: { ...NO_CHANGE, ...(change ?? {}) } });
export const MATCHUPS = {
  accelerate: [
    { label: '’77 Trans Am vs ’02 Firehawk', note: 'Same F-body name, 25 years apart: emissions-era 200 hp against an LS1.', mode: 'car', lanes: [car(TA77), car(FIREHAWK)] },
    { label: 'Ram TRX vs Mustang GT', note: 'A 6,350 lb truck with 702 hp and all-wheel drive against a 3,833 lb Mustang.', mode: 'car', lanes: [car(TRX), car(PP2)] },
    { label: '’70 Chevelle 454 vs ’04 GTO', note: 'More torque on 1970 tires against less on modern rubber.', mode: 'car', lanes: [car(CHEVELLE), car('gto')] },
  ],
  brake: [
    { label: '’69 vs ’15 Camaro Z/28', note: 'Same name, 46 years apart: mostly tires.', mode: 'car', lanes: [car(Z28_69), car(Z28_15)] },
    { label: '’77 Trans Am: modern tires', note: 'One change: 1970s radials to modern summer tires, nothing else.', mode: 'change', lanes: [car(TA77), car(TA77, { tire: 'uhp' })] },
    { label: 'Ram TRX vs Mustang GT', note: 'Mass and all-terrain tires against a light car on track-ready rubber.', mode: 'car', lanes: [car(TRX), car(PP2)] },
  ],
  corner: [
    { label: '’90 Miata vs ’24 MX-5', note: 'The same idea 34 years apart.', mode: 'car', lanes: [car('miata'), car(MX5)] },
    { label: '’77 Trans Am vs ’02 Firehawk', note: 'Tires and chassis development in one F-body family.', mode: 'car', lanes: [car(TA77), car(FIREHAWK)] },
    { label: 'Ram TRX vs GR86', note: 'Off-road truck against a light sports coupe.', mode: 'car', lanes: [car(TRX), car(GR86)] },
  ],
  entry: [
    { label: 'Civic Type R: trail braking', note: 'Keep braking as you turn in, or finish braking in a straight line.', mode: 'technique', lanes: [{ ...car(CIVIC), technique: 'trail' }, { ...car(CIVIC), technique: 'straight' }] },
    { label: '’77 Trans Am: trail braking', note: 'The same technique on a heavier car with less grip.', mode: 'technique', lanes: [{ ...car(TA77), technique: 'trail' }, { ...car(TA77), technique: 'straight' }] },
  ],
  exit: [
    { label: '’70 Chevelle 454: differentials', note: 'Big torque out of a tight corner: open, limited-slip, locked. The model leaves out how a locked axle resists turning in.', mode: 'diff', lanes: ['open', 'lsd', 'locked'].map(diff => ({ ...car(CHEVELLE), diff })) },
    { label: '’90 Miata: differentials', note: 'A light car with modest power: compare the gap with the Chevelle’s.', mode: 'diff', lanes: ['open', 'lsd', 'locked'].map(diff => ({ ...car('miata'), diff })) },
  ],
  sequence: [
    { label: 'Ram TRX vs MX-5 · 90°', note: '702 hp against 181 hp: the corner decides it.', mode: 'car', params: { key: 'corner90' }, lanes: [car(TRX), car(MX5)] },
    { label: 'Ram TRX vs MX-5 · hairpin', note: 'Same pair; longer straights favour power.', mode: 'car', params: { key: 'hairpin' }, lanes: [car(TRX), car(MX5)] },
    { label: 'GR86 vs S2000 · S-curve', note: 'Two light rear-drive coupes through a left-right.', mode: 'car', params: { key: 'esses' }, lanes: [car(GR86), car(S2000)] },
  ],
};

// What the replay itself is (shown with every result): faithful in time, distance and speed; schematic in pose.
export const REPLAY_NOTE = 'Each car moves along the road exactly as the model calculates: same time, distance and speed. The cars are symbols: body roll, slip and steering are not drawn, and the line through each corner is fixed, not an optimised racing line.';

// ---------------------------------------------------------------- one change at a time (shared with the Simulations page)
export const isChanged = c => !!c && (!!c.tire || !!c.weight || !!c.cg || !!c.power);
/** Apply a simple change to a resolved vehicle: tire class, added/removed weight at the same balance, CG height, power %. */
export function applyChange(base, c = NO_CHANGE) {
  const v = { ...base };
  if (c.tire && tireGrip[c.tire]) v.grip = tireGrip[c.tire].mu;
  if (c.weight) { const f = v.frontLb / v.weight; v.weight += c.weight; v.frontLb = v.weight * f; v.rearLb = v.weight - v.frontLb; }
  if (c.cg) v.cg = v.cg + c.cg;
  if (c.power) { v.hp *= 1 + c.power / 100; v.torque *= 1 + c.power / 100; }
  return v;
}
export function changeLabel(c) {
  if (!isChanged(c)) return '';
  const out = [];
  if (c.tire && tireGrip[c.tire]) out.push(tireGrip[c.tire].label.replace(/ \(.*\)$/, '').toLowerCase());
  if (c.weight) out.push(`${c.weight > 0 ? '+' : '−'}${Math.abs(c.weight)} lb`);
  if (c.power) out.push(`${c.power > 0 ? '+' : '−'}${Math.abs(c.power)}% power`);
  if (c.cg) out.push(`CG ${c.cg > 0 ? '+' : '−'}${Math.abs(c.cg)} in`);
  return out.join(', ');
}
/** Quick changes offered as one tap, relevant to the experiment. */
export function quickChanges(key, v) {
  const next = Object.entries(tireGrip).filter(([k, t]) => k !== 'dragRadial' && t.mu > (v?.grip ?? 1) + .02).sort((a, b) => a[1].mu - b[1].mu)[0];
  const list = [];
  if (next) list.push([{ tire: next[0] }, `Stickier tires`]);
  if (key === 'accelerate') list.push([{ tire: 'dragRadial' }, 'Drag radials, prepped strip']);
  list.push([{ weight: -200 }, '200 lb lighter']);
  if (!['brake', 'corner'].includes(key)) list.push([{ power: 20 }, '20% more power']);
  if (key === 'corner' || key === 'brake') list.push([{ weight: 200 }, '200 lb heavier']);
  list.push([{ cg: -1 }, 'CG 1 in lower']);
  return list.map(([c, label]) => [{ ...NO_CHANGE, ...c }, label]);
}

// ---------------------------------------------------------------- lanes: which car, in which state
/**
 * A lane = { id, setup?, change, diff?, technique? }. `setup` is a saved/shared configuration (Garage build);
 * without it the stock record is used. Resolution never writes to the visitor's Garage.
 */
export function laneVehicle(lane) {
  if (!lane || !vehicles[lane.id]) return null;
  let setup = null;
  if (lane.setup) { const s = cleanSetup(lane.setup); if (s && s.id === lane.id && usableSetup(s)) setup = s; }
  const v = resolve(setup ?? newSetup(lane.id), !!setup);
  const base = { ...v, frontLb: v.frontLb ?? v.weight * v.front, rearLb: v.rearLb ?? v.weight * (1 - v.front) };
  return applyChange(base, lane.change ?? NO_CHANGE);
}
export const vehicleName = id => vehicles[id]?.name ?? id;
export function laneLabel(lane, others = []) {
  const name = vehicleName(lane.id);
  const bits = [];
  if (lane.setup) bits.push('your build');
  const c = changeLabel(lane.change); if (c) bits.push(c);
  if (lane.diff && lane.diff !== 'open' && DIFFS[lane.diff]) bits.push(DIFFS[lane.diff].label.toLowerCase());
  if (lane.technique === 'straight') bits.push('straight-line braking');
  if (lane.technique === 'trail' && others.some(o => o.technique === 'straight')) bits.push('trail braking');
  if (lane.diff === 'open' && others.some(o => o.diff && o.diff !== 'open')) bits.push('open differential');
  return bits.length ? `${name} · ${bits.join(', ')}` : name;
}

// ---------------------------------------------------------------- the road each experiment is drawn on
export function road(key, params) {
  if (key === 'accelerate') return { kind: 'strip', lengthFt: params.ft };
  if (key === 'brake') return { kind: 'strip' };
  if (key === 'corner') return { kind: 'path', segments: circleSegments(params.radius), closed: true };
  if (key === 'entry') return { kind: 'path', segments: entrySegments(params.radius), marks: [{ s: 700, label: 'turn-in' }] };
  if (key === 'exit') return { kind: 'path', segments: exitSegments(params.radius), marks: [{ s: 0, label: 'apex' }] };
  return { kind: 'path', segments: MANEUVERS[params.key]?.segments ?? MANEUVERS.corner90.segments };
}

// ---------------------------------------------------------------- one run → replay samples
const finite = n => Number.isFinite(n);
/** Linear position at time t, consistent with the speed at both ends (trapezoid within a sample interval). */
export function sampleAt(run, t) {
  const S = run.samples;
  if (run.cruise) return { t, s: run.cruise * t, mph: run.cruise / MPH };
  if (t <= 0) return S[0];
  if (t >= S.at(-1).t) return S.at(-1);
  let lo = 0, hi = S.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m].t <= t) lo = m; else hi = m; }
  const a = S[lo], b = S[hi], dt = b.t - a.t || 1e-9, f = (t - a.t) / dt;
  const va = a.mph * MPH, vb = b.mph * MPH, acc = (vb - va) / dt, tau = t - a.t;
  // constant acceleration between samples, scaled so the interval still ends exactly at b.s
  const raw = va * tau + acc * tau * tau / 2, full = va * dt + acc * dt * dt / 2;
  const s = a.s + (full > 0 ? raw / full : f) * (b.s - a.s);
  return { t, s, mph: a.mph + f * (b.mph - a.mph) };
}

function accelerateRun(v, p) {
  const r = accelerationProfile(v, { distanceFt: p.ft });
  if (!(r.top.mph > 1) || !finite(r.distance.t)) return { ok: false, reason: 'drivetrain' };
  const samples = [];
  for (const q of r.trace) { if (q.x >= p.ft) break; samples.push({ t: q.t, s: q.x, mph: q.speed / MPH, limit: q.limit }); }
  samples.push({ t: r.distance.t, s: p.ft, mph: r.distance.mph });
  const tractionT = r.trace.filter(q => q.t <= r.distance.t && q.limit === 'traction').reduce((m, q) => Math.max(m, q.t), 0);
  return { ok: true, samples, time: r.distance.t, distance: p.ft, endMph: r.distance.mph,
    quarter: p.ft === 1320 ? { et: r.magazine?.et, trap: r.magazine?.trap } : null, zeroTo60: r.magazine?.zeroTo60,
    why: tractionT > .3 ? `Wheelspin limits the first ${tractionT.toFixed(1)} s` : 'Engine power limits it from the start' };
}
function brakeRun(v, p) {
  const r = brakeBetween(v, p.from, 0, { convention: 'roadTest', abs: true });
  if (r.status !== 'ok') return { ok: false, reason: 'brakes', text: r.text };
  const samples = [{ t: 0, s: 0, mph: p.from }, ...r.trace.map(q => ({ t: q.t, s: q.ft, mph: q.mph }))];
  if (samples.at(-1).t < r.time) samples.push({ t: r.time, s: r.distance, mph: 0 });
  else { samples.at(-1).t = r.time; samples.at(-1).s = r.distance; samples.at(-1).mph = 0; }
  const tires = /tires/.test(r.limit);
  return { ok: true, samples, time: r.time, distance: r.distance, endMph: 0, meanG: r.meanG,
    why: tires ? 'Tire grip limits the stop' : `The ${r.limit} limit the stop before the tires do` };
}
function cornerRun(v, p) {
  const r = steadyCorner(v, { radiusFt: p.radius });
  if (!finite(r.mph) || r.mph <= 0) return { ok: false, reason: 'grip' };
  const speed = r.mph * MPH, lap = 2 * Math.PI * p.radius / speed;
  return { ok: true, cruise: speed, samples: [{ t: 0, s: 0, mph: r.mph }, { t: lap, s: 2 * Math.PI * p.radius, mph: r.mph }],
    time: lap, distance: 2 * Math.PI * p.radius, endMph: r.mph, ay: r.ay, mph: r.mph,
    why: `${r.ay.toFixed(2)} g of steady cornering grip` };
}
function pathRun(v, segments, o) {
  const r = runPath(v, segments, o);
  // a path run slower than 20 mph on average means the drive model had nothing to work with: show no run, not a number
  if (!finite(r.time) || r.lengthFt / r.time < 20 * MPH) return { ok: false, reason: 'path' };
  const samples = r.trace.map(q => ({ t: q.t, s: q.s, mph: q.mph, phase: q.phase }));
  const braking = r.trace.filter(q => q.phase === 'braking').length, limit = r.trace.filter(q => q.phase === 'cornering limit').length;
  return { ok: true, samples, time: r.time, distance: r.lengthFt, endMph: r.exitMph, minMph: r.minMph, entryMph: r.entryMph,
    zones: r.brakingZones, phases: r.trace.map(q => [q.s, q.phase]),
    why: `Slowest point ${r.minMph.toFixed(1)} mph; ${Math.round(limit / r.trace.length * 100)}% of the road at the grip limit, ${Math.round(braking / r.trace.length * 100)}% braking` };
}

/**
 * Inputs each experiment needs. A record without them gets "no run" and the missing fields, never a number:
 * (acceptance review 26 Nov: cars with weight 0 or no drivetrain data produced 0.85 g corners and multi-day
 * corner sequences from the path solver).
 */
export function readiness(key, v) {
  const positive = ['weight', 'wheelbase', 'cg'].filter(k => !(v[k] > 0));
  const study = key === 'brake' || key === 'corner' ? 'load-transfer' : 'quarter';
  return [...new Set([...positive, ...missingFor(v, study)])];
}

/** Catalogue cars that can run every experiment (the replay's car picker offers only these). */
export function readyIds(ids) {
  return ids.filter(id => { const v = laneVehicle({ id }); return v && EXPERIMENT_KEYS.every(k => !readiness(k, v).length); });
}

/** Run one lane of an experiment. Returns {ok, samples, time, distance, …} or {ok:false, reason}. */
export function runLane(key, params, lane) {
  const v = laneVehicle(lane);
  if (!v) return { ok: false, reason: 'vehicle' };
  const missing = readiness(key, v);
  if (missing.length) return { ok: false, reason: 'missing', text: `This car’s record is missing ${missingText(missing).toLowerCase()}, so it cannot run this test yet.` };
  const diff = lane.diff ?? 'open', trailBraking = lane.technique !== 'straight';
  try {
    if (key === 'accelerate') return accelerateRun(v, params);
    if (key === 'brake') return brakeRun(v, params);
    if (key === 'corner') return cornerRun(v, params);
    // arrive at a steady speed: hold it down the approach (no faster), then brake for the corner
    if (key === 'entry') return pathRun(v, entrySegments(params.radius), { startMph: params.mph, vmaxMph: params.mph, diff, trailBraking });
    if (key === 'exit') return pathRun(v, exitSegments(params.radius), { diff, trailBraking });
    const m = MANEUVERS[params.key] ?? MANEUVERS.corner90;
    return pathRun(v, m.segments, { startMph: m.startMph ?? undefined, diff, trailBraking });
  } catch (e) {
    return { ok: false, reason: 'error', text: String(e?.message ?? e) };
  }
}

/** Replay duration: until every car has finished (the steady circle: until the slowest completes a lap). */
export const replayDuration = runs => Math.max(0, ...runs.filter(r => r.ok).map(r => r.time));

// ---------------------------------------------------------------- the result, in words
const f1 = n => n.toFixed(1), f2 = n => n.toFixed(2);
/** Headline and per-lane figures for the result card and the share image. */
export function summarize(key, params, lanes, runs) {
  const ok = runs.map((r, i) => ({ r, i, lane: lanes[i] })).filter(x => x.r.ok);
  const names = lanes.map(l => laneLabel(l, lanes));
  const short = lanes.map(l => vehicleName(l.id).split(' · ')[0]);
  const same = new Set(lanes.map(l => l.id)).size === 1;
  // same car: name the difference ("Trail braking", "+20% power", "Stock"); different cars: the car names
  const bit = i => { const n = names[i], c = vehicleName(lanes[i].id); const rest = n.startsWith(c + ' · ') ? n.slice(c.length + 3) : ''; return rest ? rest[0].toUpperCase() + rest.slice(1) : 'As set'; };
  const who = i => same ? bit(i) : short[i];
  const figure = {
    accelerate: r => [`${f2(r.time)} s`, `${f1(r.endMph)} mph`],
    brake: r => [`${Math.round(r.distance)} ft`, `${f2(r.time)} s`],
    corner: r => [`${f1(r.mph)} mph`, `${f2(r.ay)} g`],
  }[key] ?? (r => [`${f2(r.time)} s`, `exit ${f1(r.endMph)} mph`]);
  const what = ({
    accelerate: () => `${params.ft === 1320 ? 'Quarter mile' : params.ft === 660 ? 'Eighth mile' : params.ft === 5280 ? 'One mile' : `${params.ft.toLocaleString('en-US')} ft`} from a standing start`,
    brake: () => `${params.from}–0 mph stop`,
    corner: () => `Steady corner, ${params.radius} ft radius`,
    entry: () => `Braking from ${params.mph} mph into a ${params.radius} ft corner`,
    exit: () => `Powering out of a ${params.radius} ft corner`,
    sequence: () => `${MANEUVERS[params.key]?.label ?? 'Corner sequence'}`,
  })[key]();
  let headline = '';
  if (ok.length >= 2) {
    const better = key === 'corner' ? (a, b) => b.r.mph - a.r.mph : key === 'brake' ? (a, b) => a.r.distance - b.r.distance : (a, b) => a.r.time - b.r.time;
    const sorted = [...ok].sort(better), w = sorted[0];
    // two lanes: winner against the other; three (differentials): winner against the first lane, the baseline
    const l = ok.length > 2 ? (ok[0] === w ? sorted[1] : ok[0]) : sorted[1];
    const vs = ok.length > 2 ? ` than ${same ? bit(l.i).toLowerCase() : short[l.i]}` : '';
    const lead = same ? `${short[0]}: ` : '';
    if (key === 'brake') {
      const d = l.r.distance - w.r.distance;
      headline = d < 1 ? 'They stop in the same distance.' : `${lead}${who(w.i)} stops ${Math.round(d)} ft shorter${vs}.`;
    } else if (key === 'corner') {
      const d = w.r.mph - l.r.mph;
      headline = d < .05 ? 'They corner at the same speed.' : `${lead}${who(w.i)} holds ${f1(d)} mph more around the corner${vs}.`;
    } else {
      const d = l.r.time - w.r.time;
      const gapFt = Math.max(0, w.r.distance - sampleAt(l.r, w.r.time).s);
      headline = d < .005 ? 'A dead heat.' : `${lead}${who(w.i)} is ${f2(d)} s quicker${vs}${gapFt >= 1 ? `, ${Math.round(gapFt)} ft ahead at the line` : ''}.`;
    }
  } else if (ok.length === 1) headline = `${who(ok[0].i)}: ${figure(ok[0].r).join(' · ')}`;
  return { what, headline, lanes: runs.map((r, i) => ({ name: names[i], short: short[i], ok: r.ok, figures: r.ok ? figure(r) : [], why: r.ok ? r.why : missingWhy(r) })) };
}
function missingWhy(r) {
  if (r.reason === 'drivetrain') return 'This car’s record has no gearing or redline yet, so it cannot run this test.';
  if (r.reason === 'brakes') return r.text ?? 'This car’s record is missing braking inputs.';
  if (r.reason === 'vehicle') return 'Unknown car.';
  if (r.reason === 'missing') return r.text;
  return 'The model could not complete this run.';
}
