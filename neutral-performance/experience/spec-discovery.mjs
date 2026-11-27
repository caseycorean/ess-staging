// ESS specification page, guided-discovery demonstration (Claude, 25 Nov 2026 night). Owner review only: F40.
// Hydrates the static page built by _build/spec_discovery.py from the embedded knowledge record (#ess-spec-data).
//
// What this keeps from experience/spec-page.mjs (same rules, same engine path):
//  - No physics here. Every number comes from the shared engine (experience/models.mjs, engine/traction.mjs,
//    engine/acceleration.mjs) or is plain geometry (gear speed, tire diameter) from the same canonical inputs.
//  - One experiment state {tune, parts, conditions} for the whole page; every change is listed, reversible and carried
//    into the Vehicle Lab, Garage and share links.
//  - Published values, archive figures, ESS estimates and model results are labeled differently.
// What is new: questions with live headline numbers, one workbench that answers the chosen question in place, a
// persistent "Your car" readout (side column on wide screens, docked sheet on phones) and next questions suggested
// from the model result of the last change.
import { vehicles } from './vehicles.mjs';
import { newSetup, resolve, straightLine, validValue, limits, ride } from './models.mjs';
import { shareFragment, saveToGarage, shareResult } from './configuration.mjs';
import * as units from './units.mjs';
import { torqueAt, resistanceAt, defaults as engineDefaults } from '../engine/acceleration.mjs';
import { parseTire } from '../engine/tires.mjs';
import { tireClasses, pickerOrder, byGear, tractionCheck, compareTires } from '../engine/traction.mjs';

const dataEl = document.getElementById('ess-spec-data');
const R = dataEl ? JSON.parse(dataEl.textContent) : null;
const labRoot = new URL('../../experience/', location.href);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const wide = matchMedia('(min-width: 1000px)');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fx = (n, d = 0) => Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
const sign = (n, d = 0) => !Number.isFinite(n) ? '—' : Math.abs(n) < .5 * 10 ** -d ? fx(0, d) : (n > 0 ? '+' : '−') + fx(Math.abs(n), d);
const U = (q, v, o) => units.format(q, v, o);
const MPH_FT = 5280 / 3600;
const ordinal = n => n + ({ 1: 'st', 2: 'nd', 3: 'rd' }[n] ?? 'th');
const statusEl = document.querySelector('[data-sp-status]');
const say = text => { if (statusEl) { statusEl.textContent = ''; requestAnimationFrame(() => { statusEl.textContent = text; }); } };

// ---------- units on the static facts (same as spec-page.mjs) ----------
function renderStaticUnits() {
  const system = units.getUnits();
  for (const el of document.querySelectorAll('[data-q][data-v]')) {
    const q = el.dataset.q, v = Number(el.dataset.v);
    if (q === 'ppw') { el.textContent = system === 'metric' ? `${fx(v * 0.45359237 / 0.745699872, 2)} kg/kW` : system === 'dual' ? `${fx(v, 1)} lb/hp (${fx(v * 0.45359237 / 0.745699872, 2)} kg/kW)` : `${fx(v, 1)} lb/hp`; continue; }
    if (!units.quantities[q]) continue;
    el.textContent = U(q, v, { digits: q === 'length' ? 1 : 0, metricDigits: 0 });
  }
}
const unitSlot = document.querySelector('[data-sp-units]');
if (unitSlot) { unitSlot.innerHTML = units.unitsControl('sd-units'); units.bindUnitControls(unitSlot); }
units.bindUnitControls(document);
renderStaticUnits();

// ---------- experiment state ----------
const id = R?.model?.labId && vehicles[R.model.labId] ? R.model.labId : null;
const runnable = !!(id && R.links?.lab && !R.model.competition);
const state = { tune: {}, parts: [], conditions: null, compare: [], q: 'launch', gear: 0, last: null };
const STORE = 'ess.spec-discovery.v1';
try { const s = JSON.parse(sessionStorage.getItem(STORE)); if (s?.id === id && s.state) Object.assign(state, s.state); } catch { /* fresh page */ }
const persist = () => { try { sessionStorage.setItem(STORE, JSON.stringify({ id, state })); } catch { /* fine */ } };
const setup = () => ({ ...newSetup(id), tune: { ...state.tune }, parts: state.parts.map(p => ({ ...p })), ...(state.conditions ? { conditions: { ...state.conditions } } : {}) });
const isModified = () => !!(Object.keys(state.tune).length || state.parts.length || state.conditions);
const stockV = () => resolve(newSetup(id), false);
const nowV = () => resolve(setup(), true);
const runCache = new Map();
function run(v) {
  const key = JSON.stringify(['weight', 'front', 'wheelbase', 'cg', 'hp', 'hpRpm', 'torque', 'torqueRpm', 'redline', 'gears', 'finalDrive', 'diameter', 'grip', 'cda', 'drivetrain', 'transmission'].map(k => v[k]));
  if (!runCache.has(key)) { const r = straightLine(v); runCache.set(key, r.issue ? null : r); }
  return runCache.get(key);
}
// Grip for the traction view: the chosen tire class (with its uncertainty range) or this car's own model grip input.
const fOpts = v => state.conditions?.tire ? { tire: state.conditions.tire } : { customMu: v.grip };
const gearRows = v => byGear(v, fOpts(v));
const gearSpeed = (v, ratio) => v.redline / (ratio * v.finalDrive) * (Math.PI * v.diameter) / 12 / 5280 * 60;
const roadHp = (v, mph) => resistanceAt(v, mph * MPH_FT) * mph * MPH_FT / 550;
function topSpeed(v) { for (let mph = 40; mph < 320; mph += .5) if (roadHp(v, mph) >= v.hp * engineDefaults.driveline) return mph; return null; }
const STATUS = { green: 'Grip to spare', yellow: 'Near the limit', red: 'Wheelspin likely' };
const gripLabel = () => state.conditions?.tire ? tireClasses[state.conditions.tire].label : `this car’s model grip (${fx(nowV().grip, 2)}, ESS estimate)`;

// ---------- change list, Lab handoff ----------
const CHANGE_TEXT = {
  hp: (v, s) => `Power ${sign((v / s.hp - 1) * 100)}%`, torque: () => null, finalDrive: v => `Final drive ${fx(v, 2)}`,
  diameter: v => `Driven tire ${U('length', v, { digits: 2 })} tall`, frontSpring: v => `Front spring ${U('rate', v)}`, rearSpring: v => `Rear spring ${U('rate', v)}`,
  cda: (v, s) => `Drag area ${sign((v / s.cda - 1) * 100)}%`,
};
function changes() {
  const s = stockV(), list = [];
  for (const [k, v] of Object.entries(state.tune)) { const t = CHANGE_TEXT[k]?.(v, s); if (t) list.push({ text: t, undo: () => { delete state.tune[k]; if (k === 'hp') delete state.tune.torque; } }); }
  state.parts.forEach((p, i) => list.push({ text: p.label, undo: () => state.parts.splice(i, 1) }));
  if (state.conditions) list.push({ text: `Tires: ${tireClasses[state.conditions.tire]?.label ?? 'custom'}`, undo: () => { state.conditions = null; } });
  return list;
}
let library = null;
async function loadLibrary() {
  if (library) return library;
  try { library = (await (await fetch(new URL('../data/index.json', location.href))).json()).vehicles; } catch { library = []; }
  return library;
}
function labHref(view = 'build') {
  const a = setup(), mod = isModified();
  const other = state.compare[0] && library?.find(x => x.slug === state.compare[0])?.labId;
  const b = other && vehicles[other] ? newSetup(other) : newSetup(id);
  const st = { a, b, aMode: mod ? 'after' : 'before', bMode: 'before', focus: 'a' };
  if (view === 'compare-strip') return new URL('?via=reference' + shareFragment({ ...st, event: 'strip' }, 'compare'), labRoot).href;
  return new URL('?via=reference' + shareFragment(st, view), labRoot).href;
}
const opponentName = () => { const o = state.compare[0] && library?.find(x => x.slug === state.compare[0]); return o?.labId && vehicles[o.labId] ? o.title : 'stock car'; };
const shortName = R ? R.title.replace(/^\d{4} /, '') : '';

// ---------- the picture: a layout schematic drawn from the car's own numbers ----------
// Generic mid/front/rear-engine outline (not a styling drawing of the car); wheel sizes, wheelbase, axle loads, CG
// position and any weight changes are to scale.
function locations(v) {
  const wb = v.wheelbase, mid = R.identity.layout === 'MR', rear = R.identity.layout === 'RR';
  return [['Front bumper', -Math.round(wb * .34)], ['Front axle', 0], ['Driver seat', Math.round(wb * (mid ? .4 : .5))],
    [mid ? 'Engine bay' : rear ? 'Rear seat area' : 'Engine bay', Math.round(wb * (mid ? .72 : rear ? .8 : .12))], ['Rear axle', Math.round(wb)], ['Rear bumper', Math.round(wb * 1.4)]];
}
function schematic(v, s, { compact = false } = {}) {
  const W = 640, H = compact ? 230 : 270, ground = H - (compact ? 44 : 54);
  const wb = v.wheelbase, len = wb * 1.78, k = (W - 40) / len, ax0 = 20 + wb * .34 * k, ax1 = ax0 + wb * k;
  const tf = R.tires?.tireFront?.diameter ?? v.diameter, tr = R.tires?.tireRear?.diameter ?? v.diameter;
  const rf = tf / 2 * k, rr = tr / 2 * k, X = x => ax0 + x * k;
  const mid = R.identity.layout === 'MR', front = R.identity.layout !== 'MR' && R.identity.layout !== 'RR';
  const belt = ground - 27 * k, sill = ground - 7 * k;
  // Generic outline in inches (x from the front axle, y above the ground): low nose, raked screen, short roof, long deck.
  const P = (x, y) => `${(ax0 + x * wb * k).toFixed(1)},${(ground - y * k).toFixed(1)}`;
  const body = mid
    ? `M${P(-.34, 8)} L${P(-.35, 15)} Q${P(-.3, 21)} ${P(-.12, 23)} L${P(.12, 27)} Q${P(.2, 29)} ${P(.26, 33)} L${P(.38, 43)} Q${P(.44, 44.5)} ${P(.55, 44)} L${P(.7, 40)} L${P(1.25, 37)} Q${P(1.4, 37)} ${P(1.41, 34)} L${P(1.41, 12)} Q${P(1.38, 8)} ${P(1.3, 7)} L${P(-.28, 7)} Z`
    : `M${P(-.34, 9)} L${P(-.35, 20)} Q${P(-.3, 27)} ${P(-.1, 29)} L${P(.3, 32)} Q${P(.38, 34)} ${P(.44, 40)} L${P(.56, 49)} Q${P(.64, 51)} ${P(.82, 50)} L${P(1.02, 40)} Q${P(1.25, 38)} ${P(1.4, 36)} L${P(1.41, 14)} Q${P(1.38, 9)} ${P(1.3, 8)} L${P(-.28, 8)} Z`;
  const eng = mid ? [X(wb * .62), X(wb * .9)] : front ? [X(-wb * .08), X(wb * .28)] : [X(wb * 1.02), X(wb * 1.32)];
  const cgX = X(wb * (1 - v.front)), cgY = ground - v.cg * k, cgS = X(wb * (1 - s.front));
  const wheel = (cx, r, label) => `<g class="sd-wheel"><circle cx="${cx}" cy="${ground - r}" r="${r}"/><circle cx="${cx}" cy="${ground - r}" r="${r * .55}" class="sd-rim"/>${compact ? '' : `<text x="${cx}" y="${ground - 2 * r - 8}" text-anchor="middle" class="sd-svg-small">${esc(label)}</text>`}</g>`;
  const parts = (state.parts ?? []).map(p => {
    const add = p.newWeight > p.oldWeight || (p.newX !== p.oldX);
    const x = X(p.newWeight ? p.newX : p.oldX);
    return `<g class="sd-mass ${p.newWeight ? 'add' : 'remove'}"><circle cx="${Math.max(12, Math.min(W - 12, x))}" cy="${belt - 2}" r="${compact ? 7 : 9}"/><text x="${Math.max(12, Math.min(W - 12, x))}" y="${belt + 2}" text-anchor="middle">${add && p.newWeight ? '+' : '−'}</text></g>`;
  }).join('');
  const loads = `<text x="${ax0}" y="${ground + 22}" text-anchor="middle" class="sd-svg-load">${esc(U('weight', v.frontLb))}</text>
    <text x="${ax1}" y="${ground + 22}" text-anchor="middle" class="sd-svg-load">${esc(U('weight', v.rearLb))}</text>
    <text x="${(ax0 + ax1) / 2}" y="${ground + 22}" text-anchor="middle" class="sd-svg-split">${fx(v.front * 100)} / ${fx(100 - v.front * 100)}</text>
    ${compact ? '' : `<text x="${(ax0 + ax1) / 2}" y="${ground + 40}" text-anchor="middle" class="sd-svg-small">front / rear weight, % · axle loads</text>`}`;
  return `<svg viewBox="0 0 ${W} ${H}" class="sd-schematic" role="img" aria-label="${esc(`Layout schematic: ${U('length', wb, { digits: 1 })} wheelbase, ${fx(v.front * 100)}% of ${U('weight', v.weight)} on the front axle, ${R.identity.layout === 'MR' ? 'engine between the cabin and the rear axle' : 'engine position typical for the layout'}.`)}">
    <line x1="0" x2="${W}" y1="${ground}" y2="${ground}" class="sd-ground"/>
    <path d="${body}" class="sd-body"/>
    <rect x="${eng[0]}" y="${belt + 2}" width="${eng[1] - eng[0]}" height="${sill - belt - 10}" rx="4" class="sd-engine"/>
    ${compact ? '' : `<text x="${(eng[0] + eng[1]) / 2}" y="${(belt + sill) / 2 + 2}" text-anchor="middle" class="sd-svg-engine">ENGINE</text>`}
    ${wheel(ax0, rf, R.tires?.tireFront?.size ?? '')}${wheel(ax1, rr, R.tires?.tireRear?.size ?? '')}
    <line x1="${ax0}" x2="${ax1}" y1="${ground + 8}" y2="${ground + 8}" class="sd-wb"/>
    ${Math.abs(cgX - cgS) > .5 ? `<circle cx="${cgS}" cy="${cgY}" r="6" class="sd-cg-was"/>` : ''}
    <g class="sd-cg"><circle cx="${cgX}" cy="${cgY}" r="8"/><path d="M${cgX - 8},${cgY}h16M${cgX},${cgY - 8}v16"/></g>
    ${compact ? '' : `<path d="M${cgX - 6},${cgY - 9} L${cgX - 34},${cgY - 58}" class="sd-leader"/><text x="${cgX - 36}" y="${cgY - 62}" text-anchor="end" class="sd-svg-small">center of mass · ${esc(U('length', v.cg, { digits: 0 }))} high (estimate)</text>`}
    ${parts}${loads}</svg>`;
}

// ---------- the gear chart (owner reference: bars per gear, common 100% line, selectable, status in words) ----------
function gearChart(rows, sel, { mini = false } = {}) {
  if (!rows.length) return '<p class="sd-empty">This car needs gear ratios, final drive, tire size and weight split to compare drive force with grip.</p>';
  const max = 2;
  return `<div class="sd-gears${mini ? ' mini' : ''}" role="${mini ? 'img' : 'group'}" aria-label="Share of tire grip the drivetrain asks for in each gear${mini ? ': ' + rows.map(r => `${ordinal(r.gear)} ${fx(r.utilization * 100)}%`).join(', ') : ''}">
    <span class="sd-gears-line" style="--y:${(1 / max) * 100}%"><span>${mini ? '' : '100% of grip'}</span></span>
    ${rows.map((r, i) => {
      const h = Math.min(r.utilization, max) / max * 100;
      const inner = `<span class="sd-gear-pct">${fx(r.utilization * 100)}%</span><span class="sd-gear-bar s-${r.status}" style="--h:${h.toFixed(1)}%">${r.utilization > max ? '<span class="sd-over" aria-hidden="true">▲</span>' : ''}</span><span class="sd-gear-n">${ordinal(r.gear)}</span>`;
      return mini ? `<span class="sd-gear">${inner}</span>` : `<button type="button" class="sd-gear" data-gear="${i}" aria-pressed="${i === sel}" aria-label="${ordinal(r.gear)} gear: ${fx(r.utilization * 100)}% of grip, ${STATUS[r.status].toLowerCase()}">${inner}</button>`;
    }).join('')}</div>`;
}

// ---------- context for one render ----------
function ctx() {
  const s = stockV(), v = nowV();
  return { s, v, rs: run(s), rm: run(v), rows: gearRows(v), rowsStock: gearRows(s) };
}
const deltaText = (a, b, d = 2) => {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return '';
  const x = b - a; if (Math.abs(x) < .005) return '<span class="sd-delta same">no change</span>';
  return `<span class="sd-delta ${x < 0 ? 'better' : 'worse'}">${sign(x, d)} s ${x < 0 ? 'quicker' : 'slower'}</span>`;
};
const modelLine = c => c.rm ? `<p class="sd-result"><span>ESS model</span> 0–60 mph <strong>${fx(c.rm.magazine.zeroTo60, 2)} s</strong>${isModified() ? ' ' + deltaText(c.rs?.magazine.zeroTo60, c.rm.magazine.zeroTo60) : ''} · quarter mile <strong>${fx(c.rm.magazine.et, 2)} s</strong>${isModified() ? ' ' + deltaText(c.rs?.magazine.et, c.rm.magazine.et) : ''}</p>`
  : '<p class="sd-empty">The acceleration model cannot run this configuration; the geometry above still applies.</p>';
const deeper = links => `<div class="sd-deeper"><h4>Go deeper</h4><ul>${links.map(([href, label, why]) => `<li><a href="${esc(href)}">${esc(label)}</a><span>${esc(why)}</span></li>`).join('')}</ul></div>`;
const article = slug => new URL(`../../articles/${slug}/`, location.href).href;
const tool = slug => new URL(`../../tools/${slug}/`, location.href).href;
const qLink = (q, text) => `<a href="#q-${q}" data-sd-q="${q}">${esc(text)}</a>`;

// ---------- the questions ----------
const Q = {};

Q.launch = {
  fig: c => c.rows[0] ? { big: fx(c.rows[0].utilization * 100) + '%', small: 'of rear grip asked for in 1st', level: c.rows[0].status } : null,
  teaser: c => {
    const r = c.rows; if (!r.length) return 'Drive force against tire grip, gear by gear.';
    const spin = r.filter(x => x.status === 'red').length;
    return spin ? `The engine can push harder than the tires can hold through ${ordinal(spin)} gear.` : `Even 1st gear stays inside the tires’ grip.`;
  },
  html() {
    return `<p class="sd-lede">A launch is a contest between the force the drivetrain can send to the road and the force the tires can hold. Each bar compares the two in one gear, at peak torque.</p>
      <div class="sd-split"><div data-chart></div><div data-gear-detail></div></div>
      <div class="sd-control"><span class="sd-control-label" id="sd-tire-l">Tire type</span><div class="sd-chips" role="group" aria-labelledby="sd-tire-l">
        <button type="button" data-tire="" aria-pressed="${!state.conditions}">Model default</button>
        ${['allSeason', 'maxSummer', 'extremeSummer', 'track200', 'perf80s'].map(k => `<button type="button" data-tire="${k}" aria-pressed="${state.conditions?.tire === k}">${esc(tireClasses[k].label.replace(/ \(.*\)/, ''))}</button>`).join('')}</div></div>
      <div data-out></div>
      <details class="sd-more"><summary>Every tire class in ${ordinal(1)} gear</summary><div data-classes></div></details>
      ${deeper([[article('traction-circle'), 'Understanding the traction circle', 'Why one tire has one grip budget for braking, turning and accelerating.'],
        [labHref('performance'), 'Gearing and traction in the Vehicle Lab', 'Change surface, final drive and tire on this exact configuration.'],
        [labHref('compare-strip'), 'Watch the quarter-mile run', 'See where the grip-limited start costs time.']])}`;
  },
  bind(body) {
    for (const b of body.querySelectorAll('[data-tire]')) b.onclick = () => {
      state.conditions = b.dataset.tire ? { tire: b.dataset.tire } : null; state.last = 'tire';
      for (const x of body.querySelectorAll('[data-tire]')) x.setAttribute('aria-pressed', String(x === b));
      update(b.dataset.tire ? `${tireClasses[b.dataset.tire].label} applied.` : 'Back to the model’s grip for this car.');
    };
    body.addEventListener('click', e => { const g = e.target.closest('[data-gear]'); if (!g) return; state.gear = +g.dataset.gear; persist(); this.refresh(body); });
    this.refresh(body);
  },
  refresh(body) {
    const c = ctx(), sel = Math.min(state.gear, Math.max(0, c.rows.length - 1)), row = c.rows[sel];
    body.querySelector('[data-chart]').innerHTML = gearChart(c.rows, sel);
    if (row) {
      const check = tractionCheck(c.v, { ...fOpts(c.v), gear: sel, rpm: c.v.torqueRpm });
      body.querySelector('[data-gear-detail]').innerHTML = `<div class="sd-callout s-${row.status}"><p class="sd-callout-h">${ordinal(row.gear)} gear · <strong>${STATUS[row.status]}</strong></p>
        <p>The drivetrain can send about <strong>${U('force', row.demandLb)}</strong> to the road; ${esc(gripLabel())} holds about <strong>${U('force', row.availableLb.typical)}</strong>${row.availableLb.low !== row.availableLb.high ? ` (range ${U('force', row.availableLb.low)}–${U('force', row.availableLb.high)})` : ''}.</p>
        <p>${row.status === 'red' ? 'Full throttle here spins the tires: the driver has to feed the power in, and the tires set the pace.' : row.status === 'yellow' ? 'Right at the edge: tire, surface and the driver’s right foot decide it.' : 'The engine and gearing, not the tires, set the pace here.'} At ${fx(c.v.redline)} rpm this gear tops out near <strong>${U('speed', gearSpeed(c.v, row.ratio))}</strong>.</p>
        <details><summary>Engineering details</summary><p>Ratio ${fx(row.ratio, 2)} × final drive ${fx(c.v.finalDrive, 2)} = ${fx(row.ratio * c.v.finalDrive, 2)} overall. Torque ${U('torque', check.inputs?.torqueLbFt ?? c.v.torque)} at ${fx(c.v.torqueRpm)} rpm, ${fx((check.inputs?.efficiency ?? .85) * 100)}% driveline efficiency, ${U('length', c.v.diameter / 2, { digits: 2 })} tire radius. Grip limit for rear drive uses the rear axle load plus the load that moves rearward under acceleration (CG height ${U('length', c.v.cg, { digits: 1 })}, ${esc(R.model.inputs.cg?.evidence ?? '')}). Steady state; ignores wheel hop, squat and drag.</p></details></div>`;
    }
    const s = c.rm, total = s ? Object.values(s.time).reduce((a, b) => a + b, 0) : 0;
    body.querySelector('[data-out]').innerHTML = (s ? `<h4 class="sd-mini">What sets the modeled quarter mile</h4><ul class="sd-split-bars">${[['traction', 'Limited by tire grip'], ['engine', 'Limited by engine power'], ['shifting', 'Shifting']].map(([k, l]) =>
      `<li><span>${l}</span><strong>${fx(s.time[k], 2)} s</strong><span class="sd-bar" style="--w:${(s.time[k] / total * 100).toFixed(1)}%" aria-hidden="true"></span></li>`).join('')}</ul>
      <p>${s.time.traction > s.time.engine * .4 ? `About <strong>${fx(s.time.traction / total * 100)}%</strong> of the run is spent waiting on grip. That is why ${qLink('power', 'more power buys less than you might expect')} and ${qLink('balance', 'where the weight sits matters')}.` : `Most of the run is limited by power, not grip: ${qLink('power', 'more power pays off directly')}.`}</p>` : '') + modelLine(c);
    const cls = body.querySelector('[data-classes]');
    if (cls) { const list = compareTires(c.v, { gear: 0, rpm: c.v.torqueRpm }); cls.innerHTML = `<ul class="sd-split-bars">${list.map(t => `<li><span>${esc(t.label)}</span><strong>${t.utilization ? fx(t.utilization * 100) + '%' : '—'}</strong><span class="sd-bar s-${t.status}" style="--w:${Math.min(100, (t.utilization ?? 0) / 3 * 100).toFixed(1)}%" aria-hidden="true"></span></li>`).join('')}</ul><p class="sd-note">Share of grip used in 1st gear at peak torque, typical value for each class. Class grip is an estimate with a range, not a measurement of a particular tire.</p>`; }
  },
};

Q.gearing = {
  fig: c => ({ big: U('speed', gearSpeed(c.v, c.v.gears[1] ?? c.v.gears[0])), small: `in ${ordinal(c.v.gears[1] ? 2 : 1)} gear at ${fx(c.v.redline)} rpm` }),
  teaser: c => { const top = topSpeed(c.v), last = gearSpeed(c.v, c.v.gears.at(-1));
    if (!top) return `${c.v.gears.length} gears spread ${fx(c.v.redline)} rpm across the speed range.`;
    return last > top + 3 ? `Top gear could reach ${U('speed', last)} at redline; drag stops it near ${U('speed', top)}.` : `Top gear runs out at ${U('speed', last)} at redline, before drag would stop it near ${U('speed', top)}.`; },
  html() {
    const s = stockV(), fd = state.tune.finalDrive ?? s.finalDrive;
    const opts = [...new Set([-.15, -.1, -.05, 0, .05, .1, .15].map(k => +(s.finalDrive * (1 + k)).toFixed(2)))].filter(x => validValue('finalDrive', x));
    return `<p class="sd-lede">Each gear multiplies engine torque and divides speed. Shorter gearing (a numerically higher final drive) pulls harder in every gear but runs out of speed sooner.</p>
      <div data-ladder></div>
      <div class="sd-control"><span class="sd-control-label" id="sd-fd-l">Final drive</span><div class="sd-chips" role="group" aria-labelledby="sd-fd-l">${opts.map(o => `<button type="button" data-fd="${o}" aria-pressed="${o === fd}">${fx(o, 2)}${o === s.finalDrive ? ' · stock' : ''}</button>`).join('')}</div></div>
      <div data-out></div>
      ${deeper([[labHref('performance'), 'Gear-by-gear traction in the Vehicle Lab', 'See where shorter gearing runs out of grip.'], [labHref('compare-strip'), 'Race the change against stock', 'Quarter-mile replay with your gearing.']])}`;
  },
  bind(body) {
    for (const b of body.querySelectorAll('[data-fd]')) b.onclick = () => {
      const s = stockV(), x = +b.dataset.fd;
      if (Math.abs(x - s.finalDrive) < .005) delete state.tune.finalDrive; else if (validValue('finalDrive', x)) state.tune.finalDrive = x; else return say(`Use a ratio between ${limits.finalDrive[0]} and ${limits.finalDrive[1]}.`);
      state.last = 'finalDrive';
      for (const y of body.querySelectorAll('[data-fd]')) y.setAttribute('aria-pressed', String(y === b));
      update(`Final drive ${fx(x, 2)} applied.`);
    };
    this.refresh(body);
  },
  refresh(body) {
    const c = ctx(), top = topSpeed(c.v), speeds = c.v.gears.map(g => gearSpeed(c.v, g)), stock = c.s.gears.map(g => gearSpeed(c.s, g));
    const max = Math.max(...speeds, ...stock, top ?? 0) * 1.04, changed = c.v.finalDrive !== c.s.finalDrive || c.v.diameter !== c.s.diameter;
    body.querySelector('[data-ladder]').innerHTML = `<figure class="sd-ladder"><ol aria-label="Road speed at ${fx(c.v.redline)} rpm in each gear">${speeds.map((sp, i) =>
      `<li><span class="sd-ladder-g">${ordinal(i + 1)}</span><span class="sd-ladder-track"><span class="sd-ladder-bar" style="--w:${(sp / max * 100).toFixed(1)}%"></span>${changed ? `<span class="sd-ladder-was" style="--w:${(stock[i] / max * 100).toFixed(1)}%" title="stock"></span>` : ''}</span><strong>${U('speed', sp)}</strong></li>`).join('')}</ol>
      ${top ? `<span class="sd-ladder-limit" style="--x:${(top / max * 100).toFixed(1)}%"><span>drag limit ≈ ${U('speed', top)}</span></span>` : ''}
      <figcaption>Speed at ${fx(c.v.redline)} rpm in each gear${changed ? '; thin marks show stock' : ''}. The dashed line is the power-limited top speed (ESS estimate from ${R.model.inputs.cda?.evidence === 'estimate' ? 'an estimated' : 'the'} drag area): gearing beyond it is speed the car cannot reach. ${qLink('speed', 'Why drag sets the limit')}.</figcaption></figure>`;
    const rpm70 = x => 70 * MPH_FT * 60 / (Math.PI * x.diameter / 12) * x.gears.at(-1) * x.finalDrive;
    body.querySelector('[data-out]').innerHTML = `<p>Cruising at ${U('speed', 70)} in top gear: <strong>${fx(rpm70(c.v))} rpm</strong>${changed ? ` (stock ${fx(rpm70(c.s))})` : ''}. Launch: 1st gear asks for <strong>${c.rows[0] ? fx(c.rows[0].utilization * 100) + '%' : '—'}</strong> of the grip${changed && c.rowsStock[0] ? ` (stock ${fx(c.rowsStock[0].utilization * 100)}%)` : ''}, so ${c.rows[0]?.status === 'red' ? 'shorter gearing mostly makes more wheelspin; ' + qLink('launch', 'see the grip by gear') : 'the tires can still take more; ' + qLink('launch', 'see the grip by gear')}.</p>${modelLine(c)}`;
  },
};

Q.power = {
  fig: c => ({ big: fx(c.v.weight / c.v.hp, 1), small: 'lb per horsepower' }),
  teaser: c => { const v = nowV(); const m = run(resolve({ ...setup(), tune: { ...state.tune, hp: Math.round(v.hp * 1.1), torque: Math.round(v.torque * 1.1) } }, true)); return c.rm && m ? `In the model, 10% more power trims the quarter mile by ${fx(c.rm.magazine.et - m.magazine.et, 2)} s.` : 'Power, weight and the torque curve.'; },
  html() {
    const pct = state.tune.hp ? Math.round((state.tune.hp / stockV().hp - 1) * 100) : 0;
    return `<p class="sd-lede">Power sets acceleration only once the tires can use it. Weight per horsepower is the first number to look at; the torque curve and grip decide how much of it reaches the road.</p>
      <label class="sd-control sd-range"><span class="sd-control-label">Engine output change <output data-o>${sign(pct)}%</output></span><input type="range" min="-30" max="50" step="5" value="${pct}" data-in></label>
      <div class="sd-split"><div data-curve></div><div data-out></div></div>
      ${deeper([[labHref('build'), 'Build this engine in the Vehicle Lab', 'Enter your own power and torque peaks.'], [article('traction-circle'), 'Grip is a budget', 'Why extra power first shows up as wheelspin.']])}`;
  },
  bind(body) {
    body.querySelector('[data-in]').oninput = e => {
      const p = +e.target.value, s = stockV();
      if (!p) { delete state.tune.hp; delete state.tune.torque; }
      else { const hp = Math.round(s.hp * (1 + p / 100)), tq = Math.round(s.torque * (1 + p / 100)); if (validValue('hp', hp) && validValue('torque', tq)) { state.tune.hp = hp; state.tune.torque = tq; } }
      body.querySelector('[data-o]').textContent = sign(p) + '%'; state.last = 'power'; update();
    };
    this.refresh(body);
  },
  refresh(body) {
    const c = ctx(), v = c.v, top = v.redline, pts = [];
    for (let rpm = 1000; rpm <= top; rpm += 250) pts.push([rpm, torqueAt(v, rpm), torqueAt(v, rpm) * rpm / 5252]);
    const maxY = Math.max(...pts.map(p => Math.max(p[1], p[2]))) * 1.1, W = 340, H = 170;
    const X = r => 30 + (r - 1000) / (top - 1000) * (W - 40), Y = y => H - 22 - y / maxY * (H - 36);
    const line = i => pts.map((p, j) => `${j ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[i]).toFixed(1)}`).join('');
    body.querySelector('[data-curve]').innerHTML = `<figure class="sd-curve"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Estimated torque and power curve shape, 1,000 to ${fx(top)} rpm">
      <line x1="30" x2="${W - 10}" y1="${H - 22}" y2="${H - 22}" class="sd-axis"/><path d="${line(1)}" class="sd-tq"/><path d="${line(2)}" class="sd-hp"/>
      <text x="${X(v.torqueRpm)}" y="${Y(v.torque) - 8}" text-anchor="middle">${esc(U('torque', v.torque))}</text><text x="${X(v.hpRpm)}" y="${Y(v.hp) - 8}" text-anchor="middle">${esc(U('power', v.hp))}</text>
      <text x="30" y="${H - 6}">1,000</text><text x="${W - 10}" y="${H - 6}" text-anchor="end">${fx(top)} rpm</text></svg>
      <figcaption><span class="sd-key-tq">Torque</span> and <span class="sd-key-hp">power</span>. <strong>Curve shape is an ESS estimate</strong> drawn through the published peaks; it is not a dyno chart.</figcaption></figure>`;
    const gain = c.rs && c.rm ? c.rs.magazine.et - c.rm.magazine.et : 0;
    body.querySelector('[data-out]').innerHTML = `<dl class="sd-readings"><div><dt>Power</dt><dd>${U('power', v.hp)}${v.hp !== c.s.hp ? `<small>stock ${U('power', c.s.hp)}</small>` : ''}</dd></div>
      <div><dt>Weight per hp</dt><dd>${fx(v.weight / v.hp, 2)} lb/hp${v.hp !== c.s.hp ? `<small>stock ${fx(c.s.weight / c.s.hp, 2)}</small>` : ''}</dd></div>
      <div><dt>1st gear grip use</dt><dd>${c.rows[0] ? fx(c.rows[0].utilization * 100) + '%' : '—'}<small>${c.rows[0] ? STATUS[c.rows[0].status] : ''}</small></dd></div></dl>
      ${modelLine(c)}${isModified() && v.hp > c.s.hp && c.rm && c.rs ? `<p>${gain < (v.hp / c.s.hp - 1) * c.rs.magazine.et * .35 ? `A ${fx((v.hp / c.s.hp - 1) * 100)}% power gain buys ${fx(gain, 2)} s: the first gears were already grip-limited, so much of the extra power becomes wheelspin. ${qLink('tires', 'Tires')} or ${qLink('balance', 'more load on the rear wheels')} unlock it.` : `The gain shows up almost fully: this run is mostly power-limited.`}</p>` : ''}`;
  },
};

Q.balance = {
  fig: c => ({ big: fx(100 - c.v.front * 100) + '%', small: 'of the weight on the driven wheels' }),
  teaser: c => R.identity.layout === 'MR' ? `With the engine behind the cabin, ${fx(100 - c.v.front * 100)}% of the weight presses on the rear tires that drive the car.` : `${fx(c.v.front * 100)}% of the weight sits on the front axle.`,
  html() {
    const v = stockV(), spots = locations(v);
    return `<p class="sd-lede">A rear-drive car can only push with the grip its rear tires have, and grip grows with the load on them. Putting the heaviest part between the cabin and the rear axle loads the driving wheels before the car even moves.</p>
      <div class="sd-control"><span class="sd-control-label" id="sd-op-l">Change</span><div class="sd-chips" role="radiogroup" aria-labelledby="sd-op-l">${[['add', 'Add'], ['remove', 'Remove'], ['move', 'Move']].map(([k, l], i) => `<button type="button" role="radio" data-op="${k}" aria-checked="${!i}">${l}</button>`).join('')}</div></div>
      <div class="sd-control"><span class="sd-control-label" id="sd-amt-l">Amount</span><div class="sd-chips" role="radiogroup" aria-labelledby="sd-amt-l">${[50, 100, 200].map((a, i) => `<button type="button" role="radio" data-amt="${a}" aria-checked="${i === 1}">${esc(U('weight', a))}</button>`).join('')}</div></div>
      <div class="sd-control"><span class="sd-control-label" id="sd-at-l" data-at-label>Where</span><div class="sd-chips" role="group" aria-labelledby="sd-at-l">${spots.map(([n, x]) => `<button type="button" data-at="${x}" data-name="${esc(n)}">${esc(n)}</button>`).join('')}</div></div>
      <p class="sd-note" data-hint>Pick where the weight goes; the change applies straight away. Locations are typical positions on this ${esc(U('length', v.wheelbase, { digits: 1 }))} wheelbase.</p>
      <div data-out></div>
      ${deeper([[article('weight-distribution-50-50'), 'What 50/50 weight distribution really means', 'Why the percentage alone does not tell you where the mass sits.'],
        [tool('load-transfer'), 'Load transfer calculator', 'How much load moves when this car brakes, accelerates and turns.'], [labHref('build'), 'Place parts exactly in the Vehicle Lab', 'Enter real positions and part weights.']])}`;
  },
  bind(body) {
    let op = 'add', amt = 100, from = null;
    const pick = (sel, attr, val) => { for (const b of body.querySelectorAll(sel)) b.setAttribute('aria-checked', String(b.dataset[attr] === String(val))); };
    for (const b of body.querySelectorAll('[data-op]')) b.onclick = () => { op = b.dataset.op; from = null; pick('[data-op]', 'op', op); body.querySelector('[data-hint]').textContent = op === 'move' ? 'Pick where the weight comes from, then where it goes.' : 'Pick where the weight goes; the change applies straight away.'; };
    for (const b of body.querySelectorAll('[data-amt]')) b.onclick = () => { amt = +b.dataset.amt; pick('[data-amt]', 'amt', amt); };
    for (const b of body.querySelectorAll('[data-at]')) b.onclick = () => {
      const x = +b.dataset.at, name = b.dataset.name.toLowerCase();
      if (state.parts.length >= 8) return say('Up to eight weight changes per experiment.');
      let part;
      if (op === 'move') {
        if (!from) { from = { x, name }; body.querySelector('[data-hint]').textContent = `Moving ${U('weight', amt)} from the ${name}. Now pick where it goes.`; return; }
        if (from.x === x) return;
        part = { label: `Move ${amt} lb from ${from.name} to ${name}`, oldWeight: amt, oldX: from.x, newWeight: amt, newX: x }; from = null;
        body.querySelector('[data-hint]').textContent = 'Pick where the weight comes from, then where it goes.';
      } else part = op === 'add' ? { label: `Add ${amt} lb at ${name}`, oldWeight: 0, oldX: x, newWeight: amt, newX: x } : { label: `Remove ${amt} lb at ${name}`, oldWeight: amt, oldX: x, newWeight: 0, newX: x };
      state.parts.push(part); state.last = 'weight'; update(part.label + '.');
    };
    this.refresh(body);
  },
  refresh(body) {
    const c = ctx(), s = c.s, v = c.v;
    body.querySelector('[data-out]').innerHTML = `<dl class="sd-readings"><div><dt>Rear axle</dt><dd>${U('weight', v.rearLb)}<small>${fx(100 - v.front * 100, 1)}% of ${U('weight', v.weight)}${v.weight !== s.weight || v.front !== s.front ? ` · stock ${fx(100 - s.front * 100, 1)}%` : ''}</small></dd></div>
      <div><dt>Grip the rear can hold</dt><dd>${c.rows[0] ? U('force', c.rows[0].availableLb.typical) : '—'}<small>launching, ${esc(gripLabel())}</small></dd></div>
      <div><dt>1st gear grip use</dt><dd>${c.rows[0] ? fx(c.rows[0].utilization * 100) + '%' : '—'}${c.rowsStock[0] && c.rows[0] && c.rows[0].utilization !== c.rowsStock[0].utilization ? `<small>stock ${fx(c.rowsStock[0].utilization * 100)}%</small>` : `<small>${c.rows[0] ? STATUS[c.rows[0].status] : ''}</small>`}</dd></div></dl>
      <p>${R.identity.layout === 'MR' ? `For comparison, a front-engine car with the same weight and ${fx(100 - (1 - .54) * 100)}% on the front would start with about ${U('weight', v.weight * .46)} on its driven wheels, ${U('weight', v.rearLb - v.weight * .46)} less than this car. ` : ''}Weight added behind the rear axle loads the driven tires but makes the car slower to change direction; ${qLink('compare', 'compare it with other layouts')}.</p>${modelLine(c)}`;
  },
};

Q.tires = {
  fig: c => { const f = R.tires?.tireFront?.diameter, r = R.tires?.tireRear?.diameter ?? c.v.diameter; return { big: U('length', state.tune.diameter ?? r, { digits: 1 }), small: f ? `rear tire height · front ${U('length', f, { digits: 1 })}` : 'driven tire height' }; },
  teaser: () => { const t = R.tires; if (t?.tireFront && t?.tireRear) return `Staggered: ${t.tireRear.width ?? ''} mm rears against ${t.tireFront.width ?? ''} mm fronts, the rears ${fx((t.tireRear.diameter / t.tireFront.diameter - 1) * 100, 1)}% taller.`; return 'Diameter, gearing and grip.'; },
  html() {
    const rear = R.tires?.tireRear?.size ?? '';
    return `<p class="sd-lede">A tire changes a car twice: its diameter acts like a gear change, and its compound sets the grip. Size here is geometry only; tire type is the grip.</p>
      <div data-geo></div>
      <div class="sd-control"><label class="sd-control-label" for="sd-size">Try another rear size</label><div class="sd-inline"><input id="sd-size" type="text" value="${esc(state.altTire ?? '')}" placeholder="${esc(rear || 'e.g. 285/35R18')}" data-in autocomplete="off" spellcheck="false" inputmode="text">
        ${['335/30R18', '345/35R17', '315/40R17'].map(x => `<button type="button" class="sd-chip" data-size="${x}">${x}</button>`).join('')}</div></div>
      <div data-alt aria-live="polite"></div>
      <p class="sd-note">Example sizes for geometry only: no claim about fitment, clearance or load rating. ${qLink('launch', 'Change the tire type (grip) with the launch question')}.</p>
      <div data-out></div>
      ${deeper([[article('traction-circle') + '#tire-revolution', 'The tire revolution nobody talks about', 'From Understanding the Traction Circle: how much tire compounds have grown the grip budget since this car’s era.'], [labHref('performance'), 'Every tire class, gear by gear', 'In the Vehicle Lab with this configuration.']])}`;
  },
  bind(body) {
    const size = body.querySelector('[data-in]');
    size.oninput = () => { state.altTire = size.value; this.alt(body); };
    for (const b of body.querySelectorAll('[data-size]')) b.onclick = () => { size.value = state.altTire = b.dataset.size; this.alt(body); };
    this.refresh(body);
  },
  alt(body) {
    const s = stockV(), t = parseTire(state.altTire), el = body.querySelector('[data-alt]');
    if (!state.altTire) { el.innerHTML = ''; return; }
    if (!t) { el.innerHTML = '<p class="sd-empty">Enter a size like 285/35R18 or 275/40ZR17.</p>'; return; }
    const ratio = t.diameter / s.diameter, eff = s.finalDrive / ratio;
    el.innerHTML = `<dl class="sd-readings"><div><dt>New diameter</dt><dd>${U('length', t.diameter, { digits: 2 })}<small>${sign((ratio - 1) * 100, 1)}% vs ${U('length', s.diameter, { digits: 2 })}</small></dd></div>
      <div><dt>Acts like a final drive of</dt><dd>${fx(eff, 2)}<small>stock ${fx(s.finalDrive, 2)}</small></dd></div>
      <div><dt>Speedometer at a true ${U('speed', 60)}</dt><dd>${U('speed', 60 / ratio, { digits: 1 })}<small>if calibrated for the original size</small></dd></div></dl>
      <p><button type="button" class="sd-btn" data-apply>Apply this height to the experiment</button></p>`;
    el.querySelector('[data-apply]').onclick = () => {
      if (!validValue('diameter', t.diameter)) return say('That diameter is outside the model range.');
      state.tune.diameter = t.diameter; state.last = 'diameter'; update(`Driven tire height ${U('length', t.diameter, { digits: 2 })} applied.`);
    };
  },
  refresh(body) {
    const c = ctx(), t = R.tires ?? {}, f = t.tireFront, r = t.tireRear;
    const W = 340, H = 150, scale = (H - 28) / Math.max(f?.diameter ?? 0, r?.diameter ?? 0, state.tune.diameter ?? 0, c.v.diameter);
    const circ = (x, tt, label, cls = '') => tt ? `<g class="sd-tire ${cls}"><circle cx="${x}" cy="${H - 14 - tt.diameter * scale / 2}" r="${tt.diameter * scale / 2}"/><circle cx="${x}" cy="${H - 14 - tt.diameter * scale / 2}" r="${(tt.rim ?? tt.diameter * .65) * scale / 2}" class="sd-rim"/><text x="${x}" y="${H - 1}" text-anchor="middle">${esc(label)}</text></g>` : '';
    body.querySelector('[data-geo]').innerHTML = f || r ? `<figure class="sd-tires"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Front and rear tire diameters to scale">
      <line x1="0" x2="${W}" y1="${H - 14}" y2="${H - 14}" class="sd-ground"/>${circ(90, f, 'Front ' + (f?.size ?? ''))}${circ(250, r, 'Rear ' + (r?.size ?? ''))}</svg>
      <figcaption>${f && r ? `Front ${U('length', f.diameter, { digits: 2 })} and rear ${U('length', r.diameter, { digits: 2 })} tall, ${f.width ?? '—'} and ${r.width ?? '—'} mm wide. The wide rears carry the drive and most of the weight.` : 'Published size, nominal unloaded geometry.'}</figcaption></figure>` : '<p class="sd-empty">No published tire size; the model uses a labeled estimate.</p>';
    this.alt(body);
    body.querySelector('[data-out]').innerHTML = modelLine(c);
  },
};

Q.speed = {
  fig: c => ({ big: U('power', roadHp(c.v, 150)), small: `to hold ${U('speed', 150)} against drag` }),
  teaser: c => { const t = topSpeed(c.v); return t ? `Drag grows with the cube of speed; ${U('power', c.v.hp)} runs out near ${U('speed', t)} in the model.` : 'Drag and the power-limited top speed.'; },
  html() {
    const pct = state.tune.cda ? Math.round((state.tune.cda / stockV().cda - 1) * 100) : 0;
    return `<p class="sd-lede">At low speed nearly all the engine’s power accelerates the car. At high speed most of it goes into pushing air aside, and the power needed rises with the cube of speed.</p>
      <label class="sd-control sd-range"><span class="sd-control-label">Drag area change <output data-o>${sign(pct)}%</output></span><input type="range" min="-30" max="30" step="5" value="${pct}" data-in></label>
      <div data-out></div>
      ${deeper([[labHref('performance'), 'Speed in each gear in the Vehicle Lab', 'Gearing and drag on one chart.']])}`;
  },
  bind(body) {
    body.querySelector('[data-in]').oninput = e => {
      const p = +e.target.value, s = stockV(); if (!p) delete state.tune.cda; else { const x = +(s.cda * (1 + p / 100)).toFixed(2); if (validValue('cda', x)) state.tune.cda = x; }
      body.querySelector('[data-o]').textContent = sign(p) + '%'; state.last = 'cda'; update();
    };
    this.refresh(body);
  },
  refresh(body) {
    const c = ctx(), v = c.v, t = topSpeed(v), ts = topSpeed(c.s), avail = v.hp * engineDefaults.driveline;
    body.querySelector('[data-out]').innerHTML = `<ul class="sd-split-bars sd-road">${[60, 100, 150, 200].map(m => { const hp = roadHp(v, m); return `<li><span>${U('speed', m)}</span><strong>${U('power', hp)}</strong><span class="sd-bar${hp > avail ? ' s-red' : ''}" style="--w:${Math.min(100, hp / avail * 100).toFixed(1)}%" aria-hidden="true"></span></li>`; }).join('')}</ul>
      <p class="sd-note">Power to overcome drag and rolling resistance, as a share of the ${U('power', avail)} that reaches the wheels (${fx(engineDefaults.driveline * 100)}% driveline efficiency).</p>
      ${t ? `<p>Power-limited top speed: about <strong>${U('speed', t)}</strong>${ts && Math.abs(t - ts) > .4 ? ` (stock ${U('speed', ts)})` : ''}. In top gear the engine would reach redline at ${U('speed', gearSpeed(v, v.gears.at(-1)))}, so ${gearSpeed(v, v.gears.at(-1)) > t ? 'drag, not gearing, sets the limit' : 'gearing, not drag, sets the limit'}; ${qLink('gearing', 'see the gear ladder')}.</p>` : ''}
      ${R.model.inputs.cda?.evidence === 'estimate' ? `<p class="sd-note"><strong>Drag area is an ESS estimate</strong> (${fx(v.cda, 2)} ft²) for this type of car, not a published or measured value. Lift and downforce are not modeled.</p>` : ''}${modelLine(c)}`;
  },
};

Q.ride = {
  fig: c => ({ big: `${fx(ride(c.v, 'front').hz, 1)} / ${fx(ride(c.v, 'rear').hz, 1)}`, small: 'Hz ride frequency, front / rear (estimate)' }),
  teaser: () => 'Springs, wheel rates and ride frequency. This car’s rates are ESS estimates.',
  html() {
    const s = stockV(), f = state.tune.frontSpring ?? s.frontSpring, r = state.tune.rearSpring ?? s.rearSpring;
    return `<p class="sd-lede">Ride frequency is how quickly each end bounces on its springs. Road cars sit near 1–1.5 Hz, sports cars around 1.5–2, race cars higher. A slightly faster rear keeps the car level over bumps.</p>
      ${['frontSpring', 'rearSpring'].map(k => `<label class="sd-control sd-range"><span class="sd-control-label">${k === 'frontSpring' ? 'Front' : 'Rear'} spring <output data-o="${k}">${U('rate', k === 'frontSpring' ? f : r)}</output></span><input type="range" min="${Math.round(s[k] * .5)}" max="${Math.round(s[k] * 2)}" step="5" value="${k === 'frontSpring' ? f : r}" data-in="${k}"></label>`).join('')}
      <div data-out></div>
      ${deeper([[tool('spring-rate'), 'Spring rate and ride frequency calculator', 'Work from a target frequency to a spring.'], [labHref('suspension'), 'Suspension geometry in the Vehicle Lab', 'Move the pickup points on this configuration.']])}`;
  },
  bind(body) {
    for (const k of ['frontSpring', 'rearSpring']) body.querySelector(`[data-in="${k}"]`).oninput = e => {
      const x = +e.target.value; if (x === stockV()[k]) delete state.tune[k]; else if (validValue(k, x)) state.tune[k] = x;
      body.querySelector(`[data-o="${k}"]`).textContent = U('rate', x); state.last = 'spring'; update();
    };
    this.refresh(body);
  },
  refresh(body) {
    const c = ctx(), v = c.v, rf = ride(v, 'front'), rr = ride(v, 'rear'), sf = ride(c.s, 'front'), sr = ride(c.s, 'rear');
    const est = ['frontSpring', 'rearSpring', 'frontMotion', 'rearMotion'].some(k => R.model.inputs[k]?.evidence === 'estimate');
    body.querySelector('[data-out]').innerHTML = `<dl class="sd-readings"><div><dt>Front</dt><dd>${fx(rf.hz, 2)} Hz<small>wheel rate ${U('rate', rf.wheel)}${rf.hz !== sf.hz ? ` · was ${fx(sf.hz, 2)}` : ''}</small></dd></div><div><dt>Rear</dt><dd>${fx(rr.hz, 2)} Hz<small>wheel rate ${U('rate', rr.wheel)}${rr.hz !== sr.hz ? ` · was ${fx(sr.hz, 2)}` : ''}</small></dd></div><div><dt>Rear ÷ front</dt><dd>${fx(rr.hz / rf.hz, 2)}</dd></div></dl>
      <p class="sd-note">Wheel rate = spring rate × motion ratio². ${est ? '<strong>Springs and motion ratios are ESS estimates</strong> (typical frequencies for a sports car), not this car’s published rates.' : ''} Springs do not change the straight-line model.</p>`;
  },
};

Q.compare = {
  fig: () => ({ big: String(1 + (state.compare.length || Math.min(2, R.compareWith?.length ?? 0))), small: 'cars side by side' }),
  teaser: () => { const n = (R.compareWith ?? []).slice(0, 2).map(s => library?.find(x => x.slug === s)?.title.replace(/^\d{4} /, '')).filter(Boolean); return n.length ? `Against the ${n.join(' and the ')}, or any car in the library.` : 'Against any car in the library.'; },
  html: () => `<p class="sd-lede">Published numbers side by side, each with its source’s definition. Bars only illustrate the printed values.</p><div data-sp-compare></div>`,
  bind(body) { this.refresh(body); },
  refresh(body) { renderCompare(body.querySelector('[data-sp-compare]')); },
};

// ---------- compare (from spec-page.mjs, rendered into the workbench) ----------
const ROWS = [
  ['Power', x => x.key.power, o => U('power', o.value), 'power'], ['Torque', x => x.key.torque, o => U('torque', o.value), 'torque'],
  ['Weight', x => x.key.weight, o => U('weight', o.value) + (o.basis ? ` <small>${esc(o.basis)}</small>` : ''), 'weight'],
  ['Weight per hp', x => x.key.weightPerHp, o => fx(o.value, 2) + ' lb/hp', 'ppw'], ['Front share', x => x.key.front, o => fx(o.value * 100, 1) + '%', 'front'],
  ['Wheelbase', x => x.key.wheelbase, o => U('length', o.value, { digits: 1 }), 'length'], ['Rear tire', x => x.key.tireRear, o => esc(o.value), null],
  ['Transmission', x => x.key.transmission, o => esc(o.value), null], ['Final drive', x => x.key.finalDrive, o => fx(o.value, 2), 'ratio'],
  ['0–60 mph (test)', x => x.key.t60, o => fx(o.value, 1) + ' s', 't'], ['Quarter mile (test)', x => x.key.et, o => fx(o.value, 2) + ' s', 't'],
];
let compareTouched = false;
async function renderCompare(root) {
  if (!root) return;
  const lib = await loadLibrary(); if (!lib.length) { root.innerHTML = `<p><a href="${esc(new URL('../compare/?a=' + R.slug, location.href).href)}">Open the specification comparison</a></p>`; return; }
  const self = lib.find(x => x.slug === R.slug);
  if (!state.compare.length && !compareTouched && R.compareWith?.length) state.compare = R.compareWith.slice(0, 2);
  const cars = [self, ...state.compare.map(s => lib.find(x => x.slug === s)).filter(Boolean)];
  const modelRow = cars.map(c => { const lab = c.labId && vehicles[c.labId] && c.runs ? run(c.slug === R.slug ? nowV() : resolve(newSetup(c.labId), false)) : null; return lab?.magazine ?? null; });
  const cell = (c, [, get, show, kind]) => {
    const o = get(c); if (!o || o.value == null) return '<td>—</td>';
    const nums = cars.map(x => get(x)?.value).filter(Number.isFinite), max = Math.max(...nums);
    const bar = Number.isFinite(o.value) && nums.length > 1 && kind && kind !== 'ratio' ? `<span class="sp-bar" style="--w:${(o.value / max * 100).toFixed(1)}%" aria-hidden="true"></span>` : '';
    const ev = o.evidence ? ` <small class="sp-ev sp-ev-${esc(o.evidence.replace(' ', '-'))}">${esc({ archive: 'archive', 'road test': 'road test', manufacturer: 'factory' }[o.evidence] ?? o.evidence)}</small>` : '';
    return `<td><span class="sp-cv">${show(o)}</span>${ev}${bar}</td>`;
  };
  const suggestions = (R.compareWith ?? []).filter(s => !state.compare.includes(s)).map(s => lib.find(x => x.slug === s)).filter(Boolean);
  root.innerHTML = `<div class="sd-compare-pick"><label class="sd-control-label" for="sd-cmp">Add a vehicle</label> <input id="sd-cmp" list="sd-lib" data-cmp-in placeholder="Search the library" ${state.compare.length >= 2 ? 'disabled' : ''}>
    <datalist id="sd-lib">${lib.filter(x => x.slug !== R.slug).map(x => `<option value="${esc(x.title)}"></option>`).join('')}</datalist>
    ${suggestions.length && state.compare.length < 2 ? `<div class="sd-chips" role="group" aria-label="Suggested comparisons">${suggestions.map(x => `<button type="button" data-cmp-add="${esc(x.slug)}">+ ${esc(x.title)}</button>`).join('')}</div>` : ''}</div>
    <div class="sp-table-wrap"><table class="sp-cmp"><caption>Specifications as published, with their sources’ definitions</caption><thead><tr><th></th>${cars.map((c, i) => `<th scope="col">${i ? `<a href="../${esc(c.slug)}/">${esc(c.title)}</a> <button type="button" class="sd-link" data-cmp-rm="${esc(c.slug)}" aria-label="Remove ${esc(c.title)}">Remove</button>` : esc(c.title) + (isModified() ? ' <small>(your experiment in the model row)</small>' : '')}</th>`).join('')}</tr></thead><tbody>
    ${ROWS.filter(r => cars.some(c => r[1](c))).map(r => `<tr><th scope="row">${r[0]}</th>${cars.map(c => cell(c, r)).join('')}</tr>`).join('')}
    <tr class="sp-model-row"><th scope="row">ESS model 0–60 / quarter</th>${modelRow.map(m => `<td>${m ? `${fx(m.zeroTo60, 2)} s / ${fx(m.et, 2)} s` : '<small>not modeled: inputs incomplete or inconsistent</small>'}</td>`).join('')}</tr></tbody></table></div>
    <p class="sd-note">Weights can differ in definition (curb, as tested); check the label before comparing.</p>
    ${cars.length > 1 && modelRow.every(Boolean) ? `<p><a class="sd-btn" href="${esc(compareLab(cars))}">Race these in the Vehicle Lab</a></p>` : ''}`;
  const inp = root.querySelector('[data-cmp-in]');
  if (inp) inp.onchange = () => { const hit = lib.find(x => x.title === inp.value); if (hit) addCompare(hit.slug, root); };
  for (const b of root.querySelectorAll('[data-cmp-add]')) b.onclick = () => addCompare(b.dataset.cmpAdd, root);
  for (const b of root.querySelectorAll('[data-cmp-rm]')) b.onclick = () => { compareTouched = true; state.compare = state.compare.filter(s => s !== b.dataset.cmpRm); persist(); syncQuery(); renderCompare(root); renderReadout(); say('Vehicle removed from the comparison.'); };
}
function addCompare(slug, root) {
  compareTouched = true;
  if (slug === R.slug || state.compare.includes(slug) || state.compare.length >= 2) return;
  state.compare.push(slug); persist(); syncQuery(); renderCompare(root); renderReadout(); say('Vehicle added to the comparison.');
}
function compareLab(cars) {
  const keys = ['a', 'b', 'c'], st = { focus: 'a', event: 'strip' };
  cars.forEach((c, i) => { st[keys[i]] = c.slug === R.slug ? setup() : newSetup(c.labId); st[keys[i] + 'Mode'] = c.slug === R.slug && isModified() ? 'after' : 'before'; });
  return new URL('?via=reference' + shareFragment(st, 'compare'), labRoot).href;
}
function syncQuery() {
  const u = new URL(location.href);
  if (state.compare.length) u.searchParams.set('compare', state.compare.join(',')); else u.searchParams.delete('compare');
  history.replaceState(null, '', u);
}
{ const q = new URLSearchParams(location.search).get('compare');
  if (q) { state.compare = q.split(',').filter(s => /^[a-z0-9-]{3,120}$/.test(s)).slice(0, 2); compareTouched = true; } }

// ---------- next questions, from the model result of the last change ----------
function nextQuestions(c) {
  const out = [], r1 = c.rows[0], r1s = c.rowsStock[0];
  const add = (q, text) => { if (q !== state.q && !out.some(o => o[0] === q)) out.push([q, text]); };
  switch (state.last) {
    case 'power': if (r1) add('launch', `1st gear now asks for ${fx(r1.utilization * 100)}% of the rear grip. See which gears can use the extra power.`); add('tires', 'Grippier tires are what let extra power reach the road.'); break;
    case 'tire': if (r1) add('launch', `With this tire, 1st gear uses ${fx(r1.utilization * 100)}% of grip${r1s ? ` (was ${fx(r1s.utilization * 100)}%)` : ''}.`); add('power', 'With more grip, does more power now pay off?'); break;
    case 'finalDrive': add('gearing', `Every gear is now ${fx(Math.abs(c.v.finalDrive / c.s.finalDrive - 1) * 100)}% ${c.v.finalDrive > c.s.finalDrive ? 'shorter' : 'taller'}. See the new speeds.`); if (r1) add('launch', `1st gear grip use: ${fx(r1.utilization * 100)}%.`); break;
    case 'diameter': add('gearing', `The new tire height acts like a ${fx(c.v.finalDrive * c.s.diameter / c.v.diameter, 2)} final drive. See every gear.`); break;
    case 'weight': if (r1) add('launch', `Rear grip at launch is now ${U('force', r1.availableLb.typical)}${r1s ? ` (was ${U('force', r1s.availableLb.typical)})` : ''}.`); add('compare', 'See how its balance compares with other layouts.'); break;
    case 'cda': { const t = topSpeed(c.v); if (t) add('gearing', `Top speed estimate is now ${U('speed', t)}. Does top gear still reach it?`); break; }
    case 'spring': add('balance', 'Springs set ride; weight placement sets how much load the tires carry.'); break;
  }
  if (!out.length) for (const q of ['launch', 'balance', 'gearing', 'power']) if (q !== state.q && out.length < 2) add(q, Q[q].teaser(c));
  return out.slice(0, 2);
}

// ---------- the readout: "Your F40" ----------
const readout = document.querySelector('[data-sd-readout]');
const readoutBody = document.querySelector('[data-sd-readout-body]');
const dock = document.querySelector('[data-sd-dock]');
function renderReadout() {
  if (!readout) return;
  const c = ctx(), list = changes(), mod = list.length > 0;
  dock.innerHTML = `<span class="sd-dock-name">Your ${esc(shortName)}</span><span class="sd-dock-res">${c.rm ? `¼ mile ${fx(c.rm.magazine.et, 2)} s` : ''}${mod && c.rs && c.rm ? ' ' + deltaText(c.rs.magazine.et, c.rm.magazine.et) : ''}</span><span class="sd-dock-n">${mod ? `${list.length} change${list.length > 1 ? 's' : ''}` : 'stock'}</span>`;
  const nq = nextQuestions(c);
  readoutBody.innerHTML = `<div class="sd-ro-head"><h2>Your ${esc(shortName)}</h2><span>${mod ? `${list.length} change${list.length > 1 ? 's' : ''}` : 'stock configuration'}</span></div>
    ${schematic(c.v, c.s, { compact: true })}
    ${c.rm ? `<dl class="sd-ro-times"><div><dt>0–60 mph</dt><dd>${fx(c.rm.magazine.zeroTo60, 2)} s${mod && c.rs ? deltaText(c.rs.magazine.zeroTo60, c.rm.magazine.zeroTo60) : ''}</dd></div><div><dt>Quarter mile</dt><dd>${fx(c.rm.magazine.et, 2)} s${mod && c.rs ? deltaText(c.rs.magazine.et, c.rm.magazine.et) : ''}</dd></div><div><dt>Trap</dt><dd>${U('speed', c.rm.magazine.trap)}</dd></div></dl>
      <p class="sd-ro-note">ESS model, magazine timing. ${c.rs && R.key.et ? `Published test: ${fx(R.key.et.value, 1)} s quarter mile.` : ''}</p>` : '<p class="sd-empty">The model cannot run this configuration.</p>'}
    <a class="sd-ro-gears" href="#q-launch" data-sd-q="launch"><span>Grip used in each gear</span>${gearChart(c.rows, -1, { mini: true })}</a>
    ${mod ? `<div class="sd-ro-changes"><h3>Changes <button type="button" class="sd-link" data-reset>Reset all</button></h3><ul>${list.map((x, i) => `<li>${esc(x.text)} <button type="button" class="sd-link" data-undo="${i}" aria-label="Undo ${esc(x.text)}">Undo</button></li>`).join('')}</ul></div>` : '<p class="sd-ro-note">Try a change in any question. It applies here, in every other question and in the Vehicle Lab.</p>'}
    ${nq.length ? `<div class="sd-ro-next"><h3>${mod ? 'What that changed' : 'Where to look next'}</h3><ul>${nq.map(([q, t]) => `<li><a href="#q-${q}" data-sd-q="${q}"><strong>${esc(QUESTIONS[q])}</strong><span>${esc(t)}</span></a></li>`).join('')}</ul></div>` : ''}
    <div class="sd-ro-actions"><a class="sd-btn sd-btn-hot" href="${esc(labHref('build'))}">Continue in the Vehicle Lab</a><a class="sd-btn" href="${esc(labHref('compare-strip'))}">Race it against the ${esc(opponentName())}</a>
      ${mod ? '<button type="button" class="sd-btn" data-save>Save to My Garage</button><button type="button" class="sd-btn" data-share>Share this experiment</button>' : ''}</div>`;
  readoutBody.querySelector('[data-reset]')?.addEventListener('click', () => { state.tune = {}; state.parts = []; state.conditions = null; state.last = null; rebuildBench(); update('All changes removed. Back to the stock configuration.'); });
  for (const b of readoutBody.querySelectorAll('[data-undo]')) b.onclick = () => { list[+b.dataset.undo].undo(); state.last = null; rebuildBench(); update('Change undone.'); };
  readoutBody.querySelector('[data-save]')?.addEventListener('click', () => say(saveToGarage(setup(), 'after') ? 'Saved in My Garage on this browser.' : 'Could not save. Check browser storage or My Garage space.'));
  readoutBody.querySelector('[data-share]')?.addEventListener('click', async () => {
    const url = new URL(labHref('build')); url.searchParams.set('via', 'share');
    const outcome = await shareResult(url.href, R.title + ' experiment', changes().map(c => c.text).join(', '));
    say({ shared: 'Shared.', copied: 'Experiment link copied.', cancelled: 'Sharing cancelled.' }[outcome] ?? 'Copy this link: ' + url.href);
  });
}
const QUESTIONS = Object.fromEntries([...document.querySelectorAll('.sd-card[data-sd-q]')].map(a => [a.dataset.sdQ, a.querySelector('.sd-card-q').textContent]));

// ---------- cards, workbench, hero ----------
const bench = document.querySelector('[data-sd-bench]');
function renderCards() {
  const c = ctx();
  for (const card of document.querySelectorAll('.sd-card[data-sd-q]')) {
    const q = card.dataset.sdQ, f = Q[q]?.fig(c);
    card.setAttribute('aria-current', String(q === state.q));
    const figEl = card.querySelector('[data-sd-fig]'), tEl = card.querySelector('[data-sd-teaser]');
    if (f) { figEl.innerHTML = `<strong>${esc(f.big)}</strong><small>${esc(f.small)}</small>`; figEl.dataset.level = f.level ?? ''; }
    try { tEl.textContent = Q[q].teaser(c); } catch { /* keep the static line */ }
  }
}
function rebuildBench() {
  if (!bench) return;
  const q = Q[state.q] ? state.q : 'launch';
  bench.innerHTML = `<div class="sd-bench-head"><p class="sd-bench-k">Question ${Object.keys(QUESTIONS).indexOf(q) + 1} of ${Object.keys(QUESTIONS).length}</p><h3 id="q-${q}">${esc(QUESTIONS[q])}</h3></div><div class="sd-bench-body">${Q[q].html()}</div>`;
  Q[q].bind(bench.querySelector('.sd-bench-body'));
}
function refreshBench() { const b = bench?.querySelector('.sd-bench-body'); if (b) Q[state.q]?.refresh(b); }
function renderHero() {
  const el = document.querySelector('[data-sd-hero-fig]'); if (!el || !runnable) return;
  const cap = el.querySelector('figcaption'); el.innerHTML = schematic(nowV(), stockV()); if (cap) el.append(cap);
}
function update(message) { persist(); renderCards(); renderReadout(); refreshBench(); renderHero(); if (message) say(message); }
function open(q, { focus = true } = {}) {
  if (!Q[q]) return;
  state.q = q; persist(); rebuildBench(); renderCards(); renderReadout();
  if (!wide.matches && readout) readout.open = false;
  if (focus) { bench.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }); bench.focus({ preventScroll: true }); }
}

// ---------- start ----------
if (R && runnable) {
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-sd-q]'); if (!a) return;
    e.preventDefault(); open(a.dataset.sdQ);
  });
  for (const a of document.querySelectorAll('[data-sp-lab]')) a.addEventListener('click', () => { a.href = labHref(a.dataset.spLab); });
  const syncDock = () => { if (readout) readout.open = wide.matches; };
  wide.addEventListener?.('change', syncDock); syncDock();
  const fromHash = location.hash.match(/^#q-([a-z]+)$/)?.[1];
  if (fromHash && Q[fromHash]) state.q = fromHash;
  loadLibrary().then(() => { renderCards(); renderReadout(); if (state.q === 'compare') refreshBench(); });
  rebuildBench(); renderCards(); renderReadout(); renderHero();
  if (fromHash) open(fromHash);
  document.addEventListener('ess:units-changed', () => { renderStaticUnits(); rebuildBench(); renderCards(); renderReadout(); renderHero(); });
} else if (R) {
  document.querySelector('.sd-discover')?.remove();
}
export { state as _state, setup as _setup, labHref as _labHref, Q as _questions, nextQuestions as _next, ctx as _ctx };
