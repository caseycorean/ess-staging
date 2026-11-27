// ESS Test → Simulations. One page, six progressive maneuvers on the shared engine (engine/maneuvers.mjs).
// Each result compares the car as it is (stock or the visitor's active configuration) with one change the visitor
// tries. Results are ESS model estimates (quasi-steady), labelled as such; published tests are shown beside them.
import { accelerationProfile, brakeBetween, BRAKING_CONVENTIONS, steadyCorner, runPath, MANEUVERS, DIFFS, rollDefaults, brakeAvailable, MPH, entrySegments, exitSegments } from '../../engine/maneuvers.mjs';
import { tireGrip } from '../../engine/acceleration.mjs';
import { vehicles, browseIds } from '../vehicles.mjs';
import { missingFor, missingText } from '../readiness.mjs';
import { resolve, newSetup } from '../models.mjs';
import { getActive, useConfig } from '../configuration.mjs';

const root = document.querySelector('[data-simulate]');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fx = (n, d = 0) => Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
const sgn = (n, d = 2) => !Number.isFinite(n) ? '—' : Math.abs(n) < .5 * 10 ** -d ? 'no change' : (n > 0 ? '+' : '−') + fx(Math.abs(n), d);

const TABS = [
  ['accelerate', '1 · Accelerate'], ['brake', '2 · Brake'], ['corner', '3 · Corner'],
  ['entry', '4 · Brake into a corner'], ['exit', '5 · Power out'], ['sequence', '6 · Corner sequences'],
];
const S = {
  tab: TABS.some(([k]) => k === location.hash.slice(1)) ? location.hash.slice(1) : 'accelerate',
  id: null, mode: 'before', published: null,
  change: { tire: '', weight: 0, cg: 0, frontRoll: null, diff: 'open', power: 0 },
  acc: { kind: 'distance', ft: 1320, from: 0, to: 60 }, brk: { from: 60, to: 0, convention: 'roadTest', abs: true },
  cor: { radius: 150 }, ent: { mph: 80, radius: 150 }, ext: { radius: 75 }, seq: { key: 'corner90' },
};

// ---------------------------------------------------------------- vehicle: active configuration or a chosen car
const active = getActive();
const asked = new URLSearchParams(location.search).get('car');
S.id = asked && vehicles[asked] ? asked : active?.setup.id ?? 'camaro'; S.mode = active?.mode ?? 'before';
let activeSetup = active?.setup ?? null;
const baseCar = () => {
  const setup = activeSetup && activeSetup.id === S.id ? activeSetup : newSetup(S.id);
  const v = resolve(setup, S.mode === 'after');
  return { ...v, frontLb: v.frontLb ?? v.weight * v.front, rearLb: v.rearLb ?? v.weight * (1 - v.front) };
};
const changed = base => {
  const c = S.change, v = { ...base };
  if (c.tire && tireGrip[c.tire]) v.grip = tireGrip[c.tire].mu;
  if (c.weight) { const f = v.frontLb / v.weight; v.weight += c.weight; v.frontLb = v.weight * f; v.rearLb = v.weight - v.frontLb; }
  if (c.cg) v.cg = v.cg + c.cg;
  if (c.power) { v.hp *= 1 + c.power / 100; v.torque *= 1 + c.power / 100; }
  return v;
};
const anyChange = () => S.change.tire || S.change.weight || S.change.cg || S.change.power || S.change.frontRoll != null || S.change.diff !== 'open';
const name = id => vehicles[id]?.name ?? id;

async function loadPublished() {
  S.published = null;
  try {
    loadPublished.all ??= await (await fetch(new URL('../../simulate/published.json', import.meta.url))).json();
    const p = loadPublished.all[S.id];
    if (p) S.published = p;
  } catch { S.published = null; }
}

// ---------------------------------------------------------------- small chart: speed against distance, stock vs change
function chart(series, { xLabel = 'distance (ft)', yLabel = 'mph', phases = null } = {}) {
  const W = 640, H = 220, P = { l: 44, r: 10, t: 10, b: 30 };
  const all = series.flatMap(s => s.pts);
  if (!all.length) return '';
  const xm = Math.max(...all.map(p => p[0])) || 1, ym = Math.max(...all.map(p => p[1])) * 1.08 || 1;
  const X = x => P.l + x / xm * (W - P.l - P.r), Y = y => H - P.b - y / ym * (H - P.t - P.b);
  const step = n => { const r = 10 ** Math.floor(Math.log10(n / 4)); return [1, 2, 5, 10].map(k => k * r).find(k => n / k <= 6); };
  const xs = step(xm), ys = step(ym);
  let g = '';
  for (let y = 0; y <= ym; y += ys) g += `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(y)}" y2="${Y(y)}" class="sim-grid"/><text x="${P.l - 6}" y="${Y(y) + 4}" text-anchor="end" class="sim-ax">${fx(y)}</text>`;
  for (let x = 0; x <= xm; x += xs) g += `<text x="${X(x)}" y="${H - 10}" text-anchor="middle" class="sim-ax">${fx(x)}</text>`;
  const band = phases ? phases.map(([a, b, cls]) => `<rect x="${X(a)}" y="${P.t}" width="${Math.max(0, X(b) - X(a))}" height="${H - P.t - P.b}" class="sim-band ${cls}"/>`).join('') : '';
  const lines = series.map(s => `<polyline class="sim-line ${s.cls}" points="${s.pts.map(p => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ')}"/>`).join('');
  return `<figure class="sim-fig"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(yLabel)} against ${esc(xLabel)}">${band}${g}${lines}</svg>
    <figcaption><span class="sim-xl">Speed (mph) against ${esc(xLabel)}.</span> ${series.map(s => `<span class="sim-key ${s.cls}"></span>${esc(s.label)}`).join(' ')}${phases ? ' <span class="sim-key band-braking"></span>braking <span class="sim-key band-limit"></span>at the cornering limit' : ''}</figcaption></figure>`;
}
const thin = (pts, n = 400) => pts.filter((_, i) => i % Math.max(1, Math.ceil(pts.length / n)) === 0 || i === pts.length - 1);
const phaseBands = trace => { const out = []; let cur = null;
  for (const p of trace) { const cls = p.phase === 'braking' ? 'band-braking' : p.phase === 'cornering limit' ? 'band-limit' : null;
    if (cur && cur[2] !== cls) { out.push(cur); cur = null; } if (cls && !cur) cur = [p.s, p.s, cls]; if (cur) cur[1] = p.s; }
  if (cur) out.push(cur); return out; };

// ---------------------------------------------------------------- shared result row: stock vs your change
const pair = (label, a, b, d, unit, lowerBetter = true) => {
  const delta = Number.isFinite(a) && Number.isFinite(b) ? b - a : NaN, show = anyChange() && Number.isFinite(delta);
  const better = show && Math.abs(delta) >= .5 * 10 ** -d ? (delta < 0) === lowerBetter : null;
  return `<div class="sim-num"><span>${esc(label)}</span><b>${fx(a, d)}<small>${unit}</small></b>${show ? (better === null ? '<em>no change with your change</em>' : `<em class="${better ? 'good' : 'bad'}">${sgn(delta, d)} ${unit} with your change → ${fx(b, d)}</em>`) : ''}</div>`;
};
const est = '<p class="sim-label">ESS model estimate · quasi-steady · not a measured result</p>';

// ---------------------------------------------------------------- 1 · accelerate
function accelerate(v0, v1) {
  const a = S.acc, opt = a.kind === 'distance' ? { distanceFt: a.ft } : { fromMph: a.from, toMph: a.to, distanceFt: 1320 };
  const r0 = accelerationProfile(v0, opt), r1 = anyChange() ? accelerationProfile(v1, opt) : r0;
  // A record without gearing or redline cannot move in the model: say what is missing instead of an empty chart.
  if (!(r0.top.mph > 1)) { const need = missingFor(v0, 'quarter');
    return `<div class="sim-out"><p class="warn">The acceleration run needs ${need.length ? esc(missingText(need)) : 'drivetrain data'} for this car, which its record does not have yet. Braking and cornering work without it.</p></div>`; }
  const presetsD = [[60, '60 ft'], [330, '330 ft'], [660, '⅛ mile'], [1320, '¼ mile'], [2640, '½ mile'], [5280, '1 mile']];
  const presetsS = [[0, 60], [0, 100], [30, 70], [50, 100], [60, 130], [0, 150]];
  const pub = S.published?.et?.[0], pub60 = S.published?.t60?.[0];
  const res = a.kind === 'distance' ? pair(`Time to ${fx(a.ft)} ft`, r0.distance.t, r1.distance.t, 2, 's') + pair('Speed there', r0.distance.mph, r1.distance.mph, 1, 'mph', false)
    : a.kind === 'speed' ? (r0.interval.t == null ? `<p class="warn">This car does not reach ${fx(a.to)} mph in the model.</p>` : pair(`${fx(a.from)}–${fx(a.to)} mph`, r0.interval.t, r1.interval.t, 2, 's') + pair('Distance covered', r0.interval.ft, r1.interval.ft, 0, 'ft'))
    : pair('Highest speed reached', r0.top.mph, r1.top.mph, 0, 'mph', false) + `<p class="sim-note">Set by ${esc(r0.top.limit)}${r0.top.cdaEstimated ? ' (drag area is an estimate)' : ''}. Reached after about ${fx(r0.top.reachedAtFt / 5280, 1)} miles.</p>`;
  const series = [{ cls: 'stock', label: 'As set', pts: thin(r0.trace.map(p => [a.kind === 'top' ? p.x / 5280 : p.x, p.speed / MPH]).filter(p => a.kind === 'top' || p[0] <= Math.max(a.ft ?? 1320, r0.interval.ft ?? 0) * 1.05)) }];
  if (anyChange()) series.push({ cls: 'mod', label: 'With your change', pts: thin(r1.trace.map(p => [a.kind === 'top' ? p.x / 5280 : p.x, p.speed / MPH]).filter(p => a.kind === 'top' || p[0] <= Math.max(a.ft ?? 1320, r0.interval.ft ?? 0) * 1.05)) });
  return `<div class="sim-ctl">
    <div class="sim-seg" role="group" aria-label="What to measure">${[['distance', 'Over a distance'], ['speed', 'Between two speeds'], ['top', 'Top speed']].map(([k, l]) => `<button type="button" data-acc-kind="${k}" aria-pressed="${a.kind === k}">${l}</button>`).join('')}</div>
    ${a.kind === 'distance' ? `<div class="sim-chips">${presetsD.map(([ft, l]) => `<button type="button" data-acc-ft="${ft}" aria-pressed="${a.ft === ft}">${l}</button>`).join('')}</div>
      <label class="sim-range"><span>Distance</span><input type="range" min="60" max="10560" step="10" value="${a.ft}" data-acc="ft" aria-label="Distance in feet"><input type="number" min="10" max="26000" step="10" value="${a.ft}" data-acc="ft" aria-label="Distance in feet, exact"><span class="u">ft</span></label>`
    : a.kind === 'speed' ? `<div class="sim-chips">${presetsS.map(([f, t]) => `<button type="button" data-acc-from="${f}" data-acc-to="${t}" aria-pressed="${a.from === f && a.to === t}">${f}–${t}</button>`).join('')}</div>
      <label class="sim-range"><span>From</span><input type="range" min="0" max="200" step="5" value="${a.from}" data-acc="from" aria-label="Start speed"><input type="number" min="0" max="250" value="${a.from}" data-acc="from" aria-label="Start speed, exact"><span class="u">mph</span></label>
      <label class="sim-range"><span>To</span><input type="range" min="10" max="220" step="5" value="${a.to}" data-acc="to" aria-label="Target speed"><input type="number" min="5" max="260" value="${a.to}" data-acc="to" aria-label="Target speed, exact"><span class="u">mph</span></label>` : ''}
  </div>
  <div class="sim-out">${est}<div class="sim-nums">${res}</div>${chart(series, { xLabel: a.kind === 'top' ? 'distance (miles)' : 'distance (ft)' })}
    <p class="sim-note">Full throttle from rest with the shared launch and shift model; rolling intervals are read inside the same run, as a data logger would. Model estimate on the magazine clock (starts after the 1 ft rollout drag strips and road tests use): ¼ mile ${fx(r0.magazine.et, 2)} s at ${fx(r0.magazine.trap, 1)} mph, 0–60 ${fx(r0.magazine.zeroTo60, 1)} s; from a dead stop the same run takes ${fx(r0.quarter?.t, 2)} s to 1,320 ft${pub || pub60 ? `; published road test: ${pub ? `¼ mile ${fx(pub.s, 2)} s` : ''}${pub && pub60 ? ', ' : ''}${pub60 ? `0–60 ${fx(pub60.s, 1)} s` : ''} (${esc((pub ?? pub60).pub ?? 'road test')})` : ''}.</p></div>`;
}

// ---------------------------------------------------------------- 2 · brake
function brake(v0, v1) {
  const b = S.brk, o = { convention: b.convention, abs: b.abs };
  const r0 = brakeBetween(v0, b.from, b.to, o), r1 = anyChange() ? brakeBetween(v1, b.from, b.to, o) : r0;
  if (r0.status !== 'ok') return `<p class="warn">${esc(r0.text)}</p>`;
  const stops = S.published?.stops ?? [];
  const series = [{ cls: 'stock', label: 'As set', pts: r0.trace.map(p => [p.ft, p.mph]) }];
  if (anyChange() && r1.status === 'ok') series.push({ cls: 'mod', label: 'With your change', pts: r1.trace.map(p => [p.ft, p.mph]) });
  const match = stops.find(s => s.mph === b.from) && b.to === 0 ? stops.find(s => s.mph === b.from) : null;
  return `<div class="sim-ctl">
    <div class="sim-chips" aria-label="Common road-test speeds">${[50, 60, 70, 80, 100, 150].map(m => `<button type="button" data-brk-from="${m}" aria-pressed="${b.from === m && b.to === 0}">${m}–0</button>`).join('')}</div>
    <label class="sim-range"><span>From</span><input type="range" min="10" max="200" step="1" value="${b.from}" data-brk="from" aria-label="Starting speed"><input type="number" min="5" max="250" value="${b.from}" data-brk="from" aria-label="Starting speed, exact"><span class="u">mph</span></label>
    <label class="sim-range"><span>Down to</span><input type="range" min="0" max="${Math.max(0, b.from - 5)}" step="1" value="${b.to}" data-brk="to" aria-label="Ending speed"><input type="number" min="0" max="${Math.max(0, b.from - 1)}" value="${b.to}" data-brk="to" aria-label="Ending speed, exact"><span class="u">mph</span></label>
    <div class="sim-seg" role="group" aria-label="Timing">${Object.entries(BRAKING_CONVENTIONS).map(([k, c]) => `<button type="button" data-brk-conv="${k}" aria-pressed="${b.convention === k}">${esc(c.label)}</button>`).join('')}</div>
    <label class="sim-check"><input type="checkbox" data-brk-abs ${b.abs ? 'checked' : ''}> ABS</label>
    ${stops.length ? `<p class="sim-note">Reproduce a published test: ${stops.map(s => `<button type="button" class="sim-link" data-brk-from="${s.mph}">${s.mph}–0 mph: ${fx(s.ft)} ft (${esc(s.pub ?? 'road test')})</button>`).join(' ')}</p>` : ''}
  </div>
  <div class="sim-out">${est}<div class="sim-nums">${pair(`${b.from}–${b.to} mph`, r0.distance, r1.distance, 0, 'ft')}${pair('Time', r0.time, r1.time, 2, 's')}
    <div class="sim-num"><span>Average deceleration</span><b>${fx(r0.meanG, 2)}<small>g</small></b></div></div>
    ${match ? `<p class="sim-compare">Published road test: <b>${fx(match.ft)} ft</b> (${esc(match.pub ?? 'road test')}) · ESS estimate ${fx(r0.distance)} ft (${sgn((r0.distance / match.ft - 1) * 100, 1)}%).</p>` : ''}
    ${chart(series, { xLabel: 'distance (ft)' })}
    <ul class="sim-why">${(r0.notes ?? []).map(n => `<li>${esc(n)}</li>`).join('')}<li>${esc(BRAKING_CONVENTIONS[b.convention].note)}</li>
      <li>Front brakes do ${fx(r0.energyShare.front * 100)}% of the work in this stop.</li></ul></div>`;
}

// ---------------------------------------------------------------- 3 · steady cornering
function corner(v0, v1) {
  const c = S.cor, fr = S.change.frontRoll;
  const r0 = steadyCorner(v0, { radiusFt: c.radius }), r1 = anyChange() ? steadyCorner(v1, { radiusFt: c.radius, ...(fr != null ? { frontRoll: fr } : {}) }) : r0;
  const pad = S.published?.skidpad?.[0];
  return `<div class="sim-ctl">
    <div class="sim-chips">${[[60, 'Autocross'], [100, '200-ft skidpad'], [150, '300-ft skidpad'], [300, 'Highway ramp'], [600, 'Fast sweeper']].map(([r, l]) => `<button type="button" data-cor-r="${r}" aria-pressed="${c.radius === r}">${l}</button>`).join('')}</div>
    <label class="sim-range"><span>Radius</span><input type="range" min="30" max="1500" step="5" value="${c.radius}" data-cor="radius" aria-label="Corner radius"><input type="number" min="20" max="5000" value="${c.radius}" data-cor="radius" aria-label="Corner radius, exact"><span class="u">ft</span></label>
  </div>
  <div class="sim-out">${est}<div class="sim-nums">${pair('Highest steady speed', r0.mph, r1.mph, 1, 'mph', false)}${pair('Lateral grip', r0.ay, r1.ay, 3, 'g', false)}
    <div class="sim-num"><span>At the limit</span><b class="sim-word">${esc(r0.balance)}</b>${anyChange() && r1.limitingAxle !== r0.limitingAxle ? `<em>with your change: ${esc(r1.balance)}</em>` : ''}</div></div>
    <div class="sim-axles">${[['Front axle', r0.frontAy, r1.frontAy], ['Rear axle', r0.rearAy, r1.rearAy]].map(([l, a, b]) => `<div><span>${l} runs out at</span><b>${fx(a, 3)} g</b>${anyChange() ? `<em>${fx(b, 3)} g</em>` : ''}<i style="--w:${Math.min(100, a / Math.max(r0.frontAy, r0.rearAy) * 100).toFixed(1)}%"></i></div>`).join('')}</div>
    ${pad ? `<p class="sim-compare">Published skidpad: <b>${fx(pad.g, 2)} g</b> (${esc(pad.pub ?? 'road test')}) · ESS estimate ${fx(r0.ay, 2)} g (${sgn((r0.ay / pad.g - 1) * 100, 1)}%).</p>` : ''}
    <ul class="sim-why"><li>Lateral load transfer moves load to the outside tires, and a tire's grip grows less than its load (load sensitivity, an ESS estimate k = 0.15), so each axle runs out at its own limit; the lower one sets the speed and the balance.</li>
      <li>Front share of roll stiffness ${fx(r0.roll.frontRoll * 100)}% (estimate: front weight share + 5%); roll centers ${fx(r0.roll.frontCenter, 1)} in front, ${fx(r0.roll.rearCenter, 1)} in rear (typical for this suspension type). Change the split under “Try a change”: springs and anti-roll bars move it.</li>
      <li>Not modelled yet: aerodynamic downforce, camber change, tire temperature.</li></ul></div>`;
}

// ---------------------------------------------------------------- 4 · brake into a corner (friction ellipse)
const entrySegs = entrySegments;
function entry(v0, v1) {
  const e = S.ent, segs = entrySegs(e.radius), opt = pathOpts();
  // hold the approach speed down the straight (vmaxMph), so 'arrive at' means the speed at the brake point
  const trail = runPath(v0, segs, { startMph: e.mph, vmaxMph: e.mph, ...opt }), straight = runPath(v0, segs, { startMph: e.mph, vmaxMph: e.mph, ...opt, trailBraking: false });
  const mod = anyChange() ? runPath(v1, segs, { startMph: e.mph, vmaxMph: e.mph, ...pathOpts(true) }) : null;
  const zone = r => r.brakingZones[0];
  const turnIn = 700;
  const ell = gg(v0, trail);
  return `<div class="sim-ctl">
    <label class="sim-range"><span>Arrive at</span><input type="range" min="30" max="160" step="1" value="${e.mph}" data-ent="mph" aria-label="Approach speed"><input type="number" min="20" max="200" value="${e.mph}" data-ent="mph" aria-label="Approach speed, exact"><span class="u">mph</span></label>
    <label class="sim-range"><span>Corner radius</span><input type="range" min="40" max="800" step="5" value="${e.radius}" data-ent="radius" aria-label="Corner radius"><input type="number" min="30" max="2000" value="${e.radius}" data-ent="radius" aria-label="Corner radius, exact"><span class="u">ft</span></label>
  </div>
  <div class="sim-out">${est}<div class="sim-nums">
    <div class="sim-num"><span>Brake ${fx(turnIn - zone(trail)?.fromFt)} ft before turn-in</span><b>${fx(trail.time, 2)}<small>s</small></b><em>trail braking: keep braking as you turn in</em></div>
    <div class="sim-num"><span>Brake ${fx(turnIn - zone(straight)?.fromFt)} ft before turn-in</span><b>${fx(straight.time, 2)}<small>s</small></b><em class="bad">straight-line braking only: ${sgn(straight.time - trail.time, 2)} s</em></div>
    ${mod ? pair('With your change (trail braking)', trail.time, mod.time, 2, 's') : ''}
    <div class="sim-num"><span>Corner speed</span><b>${fx(trail.minMph, 1)}<small>mph</small></b></div></div>
    ${chart([{ cls: 'stock', label: 'Trail braking', pts: thin(trail.trace.map(p => [p.s, p.mph])) }, { cls: 'alt', label: 'Straight-line braking only', pts: thin(straight.trace.map(p => [p.s, p.mph])) }], { xLabel: 'distance (ft) · turn-in at 700 ft', phases: phaseBands(trail.trace) })}
    ${ell}
    <ul class="sim-why"><li>A tire has one grip budget for braking and turning together (the friction circle, modelled as an ellipse between the car's braking and cornering limits). Easing off the brakes as steering is added lets you brake later and still make the corner.</li>
      <li>Quasi-steady estimate: the driver is assumed to use exactly the available grip; yaw and weight-transfer delays are not modelled.</li></ul></div>`;
}
function gg(v, run) {
  const W = 260, H = 260, c = W / 2, ayMax = run.ayMax, axMax = brakeAvailable(v, 60 * MPH, 0, pathOpts()), sc = 110 / Math.max(ayMax, axMax);
  const pts = run.trace.filter((p, i) => i % 4 === 0).map(p => { const i = run.trace.indexOf(p), n = run.trace[i + 1]; if (!n) return null;
    const ax = (n.mph ** 2 - p.mph ** 2) * MPH ** 2 / (2 * (n.s - p.s || 1)) / 32.174; return [p.ay, ax]; }).filter(Boolean);
  const ell = Array.from({ length: 73 }, (_, i) => { const t = i / 72 * 2 * Math.PI; return `${(c + Math.cos(t) * ayMax * sc).toFixed(1)},${(c - Math.sin(t) * axMax * sc).toFixed(1)}`; }).join(' ');
  return `<figure class="sim-gg"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Grip used: braking against cornering"><polygon points="${ell}" class="sim-ell"/>
    <line x1="${c}" x2="${c}" y1="10" y2="${H - 10}" class="sim-grid"/><line y1="${c}" y2="${c}" x1="10" x2="${W - 10}" class="sim-grid"/>
    ${pts.map(([y, x]) => `<circle cx="${(c + y * sc).toFixed(1)}" cy="${(c - x * sc).toFixed(1)}" r="2.2" class="sim-dot"/>`).join('')}
    <text x="${W - 12}" y="${c - 6}" text-anchor="end" class="sim-ax">cornering g</text><text x="${c + 6}" y="${H - 14}" class="sim-ax">braking</text><text x="${c + 6}" y="20" class="sim-ax">accelerating</text></svg>
    <figcaption>Grip used through the maneuver (dots) inside the car's grip envelope (outline).</figcaption></figure>`;
}

// ---------------------------------------------------------------- 5 · power out (differentials)
const exitSegs = exitSegments;
function exit(v0, v1) {
  const x = S.ext, segs = exitSegs(x.radius), base = { ...pathOpts(), diff: undefined };
  const runs = Object.keys(DIFFS).map(k => [k, runPath(v0, segs, { ...base, diff: k })]);
  const mod = anyChange() ? runPath(v1, segs, pathOpts(true)) : null;
  const best = Math.min(...runs.map(([, r]) => r.time));
  const drive = v0.drive ?? ({ FWD: 'front', AWD: 'all' })[v0.drivetrain] ?? 'rear';
  return `<div class="sim-ctl">
    <label class="sim-range"><span>Apex radius</span><input type="range" min="30" max="400" step="5" value="${x.radius}" data-ext="radius" aria-label="Apex radius"><input type="number" min="20" max="1000" value="${x.radius}" data-ext="radius" aria-label="Apex radius, exact"><span class="u">ft</span></label>
    <p class="sim-note">From the apex the corner opens over 300 ft, then a 600 ft straight (${esc(drive === 'front' ? 'front-wheel drive' : drive === 'all' ? 'all-wheel drive' : 'rear-wheel drive')}).</p>
  </div>
  <div class="sim-out">${est}<div class="sim-bars">${runs.map(([k, r]) => `<div><span>${esc(DIFFS[k].label)}</span><b>${fx(r.time, 2)} s</b><em>exit ${fx(r.exitMph, 1)} mph · ${r.time - best < .005 ? 'quickest' : '+' + fx(r.time - best, 2) + ' s'}</em><i style="--w:${Math.max(4, 100 - (r.time / best - 1) * 1000).toFixed(1)}%"></i></div>`).join('')}</div>
    ${mod ? `<div class="sim-nums">${pair(`With your change (${DIFFS[S.change.diff].label.toLowerCase()})`, runs.find(([k]) => k === S.change.diff)[1].time, mod.time, 2, 's')}</div>` : ''}
    ${chart(runs.map(([k, r], i) => ({ cls: ['stock', 'alt', 'mod'][i], label: DIFFS[k].label, pts: thin(r.trace.map(p => [p.s, p.mph])) })), { xLabel: 'distance from the apex (ft)' })}
    <ul class="sim-why">${Object.values(DIFFS).map(d => `<li><b>${esc(d.label)}:</b> ${esc(d.note)}</li>`).join('')}
      <li>Each driven tire can only add drive force from what it has left after cornering (friction ellipse); the inside tire is lightly loaded by lateral load transfer. Limited-slip bias ratio 2.5 (estimate). Engine-limited cars show little difference.</li></ul></div>`;
}

// ---------------------------------------------------------------- 6 · corner sequences
function sequence(v0, v1) {
  const m = MANEUVERS[S.seq.key], r0 = runPath(v0, m.segments, { startMph: m.startMph ?? undefined, ...pathOpts() }), r1 = anyChange() ? runPath(v1, m.segments, { startMph: m.startMph ?? undefined, ...pathOpts(true) }) : r0;
  const series = [{ cls: 'stock', label: 'As set', pts: thin(r0.trace.map(p => [p.s, p.mph])) }];
  if (anyChange()) series.push({ cls: 'mod', label: 'With your change', pts: thin(r1.trace.map(p => [p.s, p.mph])) });
  return `<div class="sim-ctl"><div class="sim-chips">${Object.entries(MANEUVERS).filter(([k]) => !['exit', 'entry'].includes(k)).map(([k, x]) => `<button type="button" data-seq="${k}" aria-pressed="${S.seq.key === k}">${esc(x.label)}</button>`).join('')}</div>
    <p class="sim-note">${esc(m.note)} Original ESS layouts, not real circuits.</p></div>
  <div class="sim-out">${est}<div class="sim-nums">${pair('Time through', r0.time, r1.time, 2, 's')}${pair('Slowest point', r0.minMph, r1.minMph, 1, 'mph', false)}${pair('Exit speed', r0.exitMph, r1.exitMph, 1, 'mph', false)}</div>
    ${chart(series, { xLabel: 'distance (ft)', phases: phaseBands(r0.trace) })}
    <ul class="sim-why"><li>Built from the same pieces as tabs 1–5: braking and cornering share one grip budget, and the car accelerates out with whatever the engine, tires and differential allow.</li>
      <li>Use it to compare changes. It is not a lap-time prediction: the line is fixed, and quick changes of direction (yaw response) are not modelled yet.</li></ul></div>`;
}
const pathOpts = (mod = false) => ({ diff: mod ? S.change.diff : 'open', ...(mod && S.change.frontRoll != null ? { frontRoll: S.change.frontRoll } : {}) });

// ---------------------------------------------------------------- page
function changePanel(v0) {
  const c = S.change, d = rollDefaults(v0);
  return `<details class="sim-change" ${anyChange() ? 'open' : ''}><summary>Try a change ${anyChange() ? '<span class="sim-pill">active</span>' : ''}</summary>
    <div class="sim-change-grid">
      <label>Tires<select data-chg="tire"><option value="">As set (μ ${fx(v0.grip, 2)})</option>${Object.entries(tireGrip).map(([k, t]) => `<option value="${k}" ${c.tire === k ? 'selected' : ''}>${esc(t.label)} (μ ${t.mu})</option>`).join('')}</select></label>
      <label>Weight<span class="sim-inline"><input type="number" step="10" value="${c.weight}" data-chg="weight" aria-label="Weight change in pounds"> lb</span></label>
      <label>CG height<span class="sim-inline"><input type="number" step=".5" value="${c.cg}" data-chg="cg" aria-label="CG height change in inches"> in</span></label>
      <label>Power<span class="sim-inline"><input type="number" step="5" value="${c.power}" data-chg="power" aria-label="Power change in percent"> %</span></label>
      <label>Front roll stiffness<span class="sim-inline"><input type="range" min="30" max="80" step="1" value="${Math.round((c.frontRoll ?? d.frontRoll) * 100)}" data-chg="frontRoll" aria-label="Front share of roll stiffness"> ${fx((c.frontRoll ?? d.frontRoll) * 100)}%</span><small>Stiffer front bar or springs → more; rear → less.</small></label>
      <label>Differential<select data-chg="diff">${Object.entries(DIFFS).map(([k, x]) => `<option value="${k}" ${c.diff === k ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select><small>Used in tabs 4–6.</small></label>
    </div>${anyChange() ? '<button type="button" class="sim-link" data-chg-reset>Back to the car as set</button>' : ''}</details>`;
}
function render() {
  const v0 = baseCar(), v1 = changed(v0);
  const body = { accelerate, brake, corner, entry, exit, sequence }[S.tab](v0, v1);
  const opts = (browseIds.includes(S.id) ? browseIds : [S.id, ...browseIds]).map(id => `<option value="${esc(id)}" ${id === S.id ? 'selected' : ''}>${esc(name(id))}</option>`).join('');
  root.innerHTML = `<div class="sim-head"><p class="kicker">Test · Simulations</p><h1>Accelerate, brake, corner.</h1>
    <p class="lede">Six steps from a straight line to a sequence of corners, on one engineering model. Pick a car, try one change, see what it does.</p>
    <label class="sim-car"><span>Vehicle</span><select data-car aria-label="Vehicle">${opts}</select>${activeSetup && activeSetup.id === S.id ? `<small>Your active ${S.mode === 'after' ? 'modified' : 'stock'} setup from Test${S.published?.route ? ` · <a href="..${esc(S.published.route)}">specifications</a>` : ''}</small>` : S.published?.route ? `<small><a href="..${esc(S.published.route)}">Specifications and sources</a></small>` : ''}</label>
    ${changePanel(v0)}</div>
    <nav class="sim-tabs" aria-label="Simulations">${TABS.map(([k, l]) => `<a href="#${k}" data-tab="${k}" ${S.tab === k ? 'aria-current="page"' : ''}>${l}</a>`).join('')}</nav>
    <section class="sim-panel" aria-live="polite">${body}</section>
    <p class="sim-foot">Maturity: quasi-steady vehicle model (ESS E1–E2). Validation so far: quarter mile about 2% slower than 17 published tests; braking within about 2.5% on average of 20 Car and Driver stops (road-test timing); steady cornering about 4% above 19 published skidpad figures. <a href="../learn/">How ESS models and tests</a>.</p>`;
}
function bind() {
  root.addEventListener('click', e => {
    const t = e.target.closest('button, a[data-tab]'); if (!t) return;
    const d = t.dataset;
    if (d.tab) { e.preventDefault(); S.tab = d.tab; history.replaceState(null, '', '#' + d.tab); }
    else if (d.accKind) S.acc.kind = d.accKind;
    else if (d.accFt) S.acc.ft = +d.accFt;
    else if (d.accFrom) { S.acc.from = +d.accFrom; S.acc.to = +d.accTo; }
    else if (d.brkFrom) { S.brk.from = +d.brkFrom; S.brk.to = 0; if (S.tab !== 'brake') S.tab = 'brake'; }
    else if (d.brkConv) S.brk.convention = d.brkConv;
    else if (d.corR) S.cor.radius = +d.corR;
    else if (d.seq) S.seq.key = d.seq;
    else if ('chgReset' in d) S.change = { tire: '', weight: 0, cg: 0, frontRoll: null, diff: 'open', power: 0 };
    else return;
    render();
  });
  root.addEventListener('change', async e => {
    const t = e.target;
    if (t.matches('[data-car]')) { S.id = t.value; if (!activeSetup || activeSetup.id !== S.id) S.mode = 'before'; try { useConfig(newSetup(S.id), 'before'); activeSetup = newSetup(S.id); } catch { /* storage unavailable */ } await loadPublished(); render(); return; }
    if (t.matches('[data-brk-abs]')) { S.brk.abs = t.checked; render(); return; }
    if (t.matches('[data-chg]')) { const k = t.dataset.chg; S.change[k] = k === 'tire' || k === 'diff' ? t.value : k === 'frontRoll' ? +t.value / 100 : +t.value || 0; render(); }
  });
  root.addEventListener('input', e => {
    const t = e.target, val = +t.value; if (!Number.isFinite(val) || t.value === '') return;
    const set = (obj, key, lo, hi) => { obj[key] = Math.min(hi, Math.max(lo, val)); };
    if (t.dataset.acc) set(S.acc, t.dataset.acc, t.dataset.acc === 'ft' ? 10 : 0, t.dataset.acc === 'ft' ? 26000 : 260);
    else if (t.dataset.brk) { set(S.brk, t.dataset.brk, 0, 250); if (S.brk.to >= S.brk.from) S.brk.to = Math.max(0, S.brk.from - 1); }
    else if (t.dataset.cor) set(S.cor, 'radius', 20, 5000);
    else if (t.dataset.ent) set(S.ent, t.dataset.ent, t.dataset.ent === 'mph' ? 20 : 30, t.dataset.ent === 'mph' ? 200 : 2000);
    else if (t.dataset.ext) set(S.ext, 'radius', 20, 1000);
    else if (t.dataset.chg === 'frontRoll') { S.change.frontRoll = val / 100; }
    else return;
    if (S.acc.kind === 'speed' && S.acc.to <= S.acc.from) S.acc.to = S.acc.from + 5;
    // keep focus while dragging: re-render only after the value settles
    clearTimeout(bind.timer); const id = t.getAttribute('aria-label');
    bind.timer = setTimeout(() => { render(); const again = [...root.querySelectorAll('input')].find(x => x.getAttribute('aria-label') === id); again?.focus(); }, t.type === 'range' ? 60 : 350);
  });
  addEventListener('hashchange', () => { const k = location.hash.slice(1); if (TABS.some(([x]) => x === k)) { S.tab = k; render(); } });
}
if (root) { bind(); render(); loadPublished().then(render); }
