// ESS specification page, second demonstration (Claude, 25 Nov 2026 night). Owner review only: 1977 Firebird Formula.
// Hydrates the static page built by _build/spec_story.py from the embedded knowledge record (#ess-spec-data).
// Same rules as spec-page.mjs / spec-discovery.mjs: no physics here (shared engine only), one reversible experiment
// state carried into the Vehicle Lab, and published values, archive figures, estimates and model results labeled apart.
// New here: a gauge-cluster strip that stays with the visitor, a contents-style question index, a guided "next
// question" path, sources shown on demand, and questions chosen for this car (torque vs rpm, period tires, nose weight,
// tall gearing, factory chassis settings, 25 years of Firebird).
import { vehicles } from './vehicles.mjs';
import { newSetup, resolve, straightLine, validValue, limits, ride } from './models.mjs';
import { shareFragment, saveToGarage, shareResult } from './configuration.mjs';
import * as units from './units.mjs';
import { torqueAt, resistanceAt, defaults as engineDefaults } from '../engine/acceleration.mjs';
import { parseTire } from '../engine/tires.mjs';
import { tireClasses, byGear, tractionCheck } from '../engine/traction.mjs';

const dataEl = document.getElementById('ess-spec-data');
const R = dataEl ? JSON.parse(dataEl.textContent) : null;
const labRoot = new URL('../../experience/', document.baseURI);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fx = (n, d = 0) => Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
const sign = (n, d = 0) => !Number.isFinite(n) ? '—' : Math.abs(n) < .5 * 10 ** -d ? fx(0, d) : (n > 0 ? '+' : '−') + fx(Math.abs(n), d);
const U = (q, v, o) => units.format(q, v, o);
const MPH_FT = 5280 / 3600;
const ordinal = n => n + ({ 1: 'st', 2: 'nd', 3: 'rd' }[n] ?? 'th');
const statusEl = document.querySelector('[data-sp-status]');
const say = t => { if (statusEl) { statusEl.textContent = ''; requestAnimationFrame(() => { statusEl.textContent = t; }); } };
const page = slug => new URL(`../${slug}/`, document.baseURI).href;
const article = slug => new URL(`../../articles/${slug}/`, document.baseURI).href;
const tool = slug => new URL(`../../tools/${slug}/`, document.baseURI).href;

// ---------- units on the static figures ----------
function renderStaticUnits() {
  for (const el of document.querySelectorAll('[data-q][data-v]')) {
    const q = el.dataset.q, v = Number(el.dataset.v);
    if (!units.quantities[q]) continue;
    if (el.hasAttribute('data-bare')) {
      const metric = units.getUnits() === 'metric';
      el.textContent = fx(metric ? units.toDisplay(q, v) : v);
      const u = el.parentElement?.nextElementSibling; if (u) u.textContent = units.unitLabel(q, metric ? 'metric' : 'us');
      continue;
    }
    el.textContent = U(q, v, { digits: el.dataset.p != null ? Math.min(2, +el.dataset.p) : q === 'length' ? 1 : 0, metricDigits: 0 });
  }
}
const unitSlot = document.querySelector('[data-sp-units]');
if (unitSlot) { unitSlot.innerHTML = units.unitsControl('st-units'); units.bindUnitControls(unitSlot); }
units.bindUnitControls(document);
renderStaticUnits();
// Sources on demand: the figures stay prominent; evidence and references appear when asked for.
const srcToggle = document.querySelector('[data-st-sources]');
const plates = document.querySelector('[data-st-plates]');
if (srcToggle && plates) {
  try { srcToggle.checked = localStorage.getItem('ess.story.sources') === '1'; } catch { /* default off */ }
  const apply = () => { plates.classList.toggle('show-sources', srcToggle.checked); try { localStorage.setItem('ess.story.sources', srcToggle.checked ? '1' : '0'); } catch { /* fine */ } };
  srcToggle.onchange = apply; apply();
}

// ---------- experiment state (same shape as the other specification pages) ----------
const id = R?.model?.labId && vehicles[R.model.labId] ? R.model.labId : null;
const runnable = !!(id && R.links?.lab && !R.model.competition);
const state = { tune: {}, parts: [], conditions: null, compare: [], q: 'torque', gear: 0, rpm: null, last: null, altTire: '' };
const STORE = 'ess.spec-story.v1';
try { const s = JSON.parse(sessionStorage.getItem(STORE)); if (s?.id === id && s.state) Object.assign(state, s.state); } catch { /* fresh */ }
const persist = () => { try { sessionStorage.setItem(STORE, JSON.stringify({ id, state })); } catch { /* fine */ } };
const setup = (extra = {}) => ({ ...newSetup(id), tune: { ...state.tune, ...(extra.tune ?? {}) }, parts: [...state.parts.map(p => ({ ...p })), ...(extra.parts ?? [])],
  ...((extra.conditions ?? state.conditions) ? { conditions: { ...(extra.conditions ?? state.conditions) } } : {}) });
const isModified = () => !!(Object.keys(state.tune).length || state.parts.length || state.conditions);
const stockV = () => resolve(newSetup(id), false);
const nowV = () => resolve(setup(), true);
const runCache = new Map();
function run(v) {
  const key = JSON.stringify(['weight', 'front', 'wheelbase', 'cg', 'hp', 'hpRpm', 'torque', 'torqueRpm', 'redline', 'gears', 'finalDrive', 'diameter', 'grip', 'cda', 'drivetrain', 'transmission'].map(k => v[k]));
  if (!runCache.has(key)) { const r = straightLine(v); runCache.set(key, r.issue ? null : r); }
  return runCache.get(key);
}
const fOpts = v => state.conditions?.tire ? { tire: state.conditions.tire } : { customMu: v.grip };
const gearRows = v => byGear(v, fOpts(v));
const gearSpeed = (v, ratio) => v.redline / (ratio * v.finalDrive) * (Math.PI * v.diameter) / 12 / 5280 * 60;
const roadHp = (v, mph) => resistanceAt(v, mph * MPH_FT) * mph * MPH_FT / 550;
function topSpeed(v) { for (let mph = 40; mph < 320; mph += .5) if (roadHp(v, mph) >= v.hp * engineDefaults.driveline) return mph; return null; }
const rpmAt = (v, mph, gear) => mph * MPH_FT * 60 / (Math.PI * v.diameter / 12) * v.gears[gear] * v.finalDrive;
const STATUS = { green: 'Grip to spare', yellow: 'Near the limit', red: 'Wheelspin likely' };
const ctx = () => { const s = stockV(), v = nowV(); return { s, v, rs: run(s), rm: run(v), rows: gearRows(v), rowsStock: gearRows(s) }; };
const short = R ? R.title.replace(/^\d{4} Pontiac Firebird /, '').replace(/ · .*/, '') : '';

const CHANGE_TEXT = {
  hp: (v, s) => `Power ${sign((v / s.hp - 1) * 100)}%`, torque: () => null, finalDrive: v => `Axle ratio ${fx(v, 2)}`,
  diameter: v => `Tire ${U('length', v, { digits: 1 })} tall`, cda: (v, s) => `Drag area ${sign((v / s.cda - 1) * 100)}%`,
};
function changes() {
  const s = stockV(), list = [];
  for (const [k, v] of Object.entries(state.tune)) { const t = CHANGE_TEXT[k]?.(v, s); if (t) list.push({ text: t, undo: () => { delete state.tune[k]; if (k === 'hp') delete state.tune.torque; } }); }
  state.parts.forEach((p, i) => list.push({ text: p.label, undo: () => state.parts.splice(i, 1) }));
  if (state.conditions) list.push({ text: tireClasses[state.conditions.tire]?.label ?? 'Tires', undo: () => { state.conditions = null; } });
  return list;
}
let library = null;
async function loadLibrary() {
  if (library) return library;
  try { library = (await (await fetch(new URL('../data/index.json', document.baseURI))).json()).vehicles; } catch { library = []; }
  return library;
}
const lib = slug => library?.find(x => x.slug === slug);
function labHref(view = 'build') {
  const a = setup(), mod = isModified();
  const other = state.compare[0] && lib(state.compare[0])?.labId;
  const b = other && vehicles[other] ? newSetup(other) : newSetup(id);
  const st = { a, b, aMode: mod ? 'after' : 'before', bMode: 'before', focus: 'a' };
  if (view === 'compare-strip') return new URL('?via=reference' + shareFragment({ ...st, event: 'strip' }, 'compare'), labRoot).href;
  return new URL('?via=reference' + shareFragment(st, view), labRoot).href;
}

// ---------- shared pieces ----------
const delta = (a, b, d = 2) => { if (!Number.isFinite(a) || !Number.isFinite(b)) return ''; const x = b - a; if (Math.abs(x) < .005) return '<span class="st-d same">same</span>'; return `<span class="st-d ${x < 0 ? 'up' : 'down'}">${sign(x, d)} s</span>`; };
const qLink = (q, t) => `<a href="#q-${q}" data-st-q="${q}">${esc(t)}</a>`;
const deeper = links => `<div class="st-deeper"><h4>Go deeper</h4><ul>${links.map(([href, label, why]) => `<li><a href="${esc(href)}">${esc(label)}</a><span>${esc(why)}</span></li>`).join('')}</ul></div>`;
const est = k => R.model.inputs[k]?.evidence === 'estimate';
const modelLine = c => c.rm ? `<p class="st-model"><span>ESS model</span> 0–60 mph <strong>${fx(c.rm.magazine.zeroTo60, 2)} s</strong> ${isModified() ? delta(c.rs?.magazine.zeroTo60, c.rm.magazine.zeroTo60) : ''} · quarter mile <strong>${fx(c.rm.magazine.et, 2)} s</strong> ${isModified() ? delta(c.rs?.magazine.et, c.rm.magazine.et) : ''}</p>` : '<p class="st-empty">The model cannot run this configuration.</p>';
function gearChart(rows, sel, mini = false) {
  if (!rows.length) return '<p class="st-empty">Needs gear ratios, axle ratio, tire size and weight split.</p>';
  return `<div class="st-gears${mini ? ' mini' : ''}" role="${mini ? 'img' : 'group'}" aria-label="Share of rear-tire grip the drivetrain asks for in each gear${mini ? ': ' + rows.map(r => `${ordinal(r.gear)} ${fx(r.utilization * 100)}%`).join(', ') : ''}">
    <span class="st-gears-line"><span>${mini ? '' : '100% of grip'}</span></span>${rows.map((r, i) => {
      const inner = `<span class="st-g-pct">${fx(r.utilization * 100)}%</span><span class="st-g-bar s-${r.status}" style="--h:${(Math.min(r.utilization, 2) / 2 * 100).toFixed(1)}%"></span><span class="st-g-n">${ordinal(r.gear)}</span>`;
      return mini ? `<span class="st-g">${inner}</span>` : `<button type="button" class="st-g" data-gear="${i}" aria-pressed="${i === sel}" aria-label="${ordinal(r.gear)} gear, ${fx(r.utilization * 100)}% of grip, ${STATUS[r.status].toLowerCase()}">${inner}</button>`;
    }).join('')}</div>`;
}
function curve(v, mark) {
  const top = v.redline, pts = [];
  for (let rpm = 1000; rpm <= top; rpm += 100) pts.push([rpm, torqueAt(v, rpm), torqueAt(v, rpm) * rpm / 5252]);
  const W = 520, H = 230, maxY = Math.max(...pts.map(p => Math.max(p[1], p[2]))) * 1.12;
  const X = r => 40 + (r - 1000) / (top - 1000) * (W - 56), Y = y => H - 30 - y / maxY * (H - 50);
  const line = i => pts.map((p, j) => `${j ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[i]).toFixed(1)}`).join('');
  const t = torqueAt(v, mark), hp = t * mark / 5252;
  return `<svg viewBox="0 0 ${W} ${H}" class="st-curve" role="img" aria-label="Estimated torque and power curve shape from 1,000 to ${fx(top)} rpm; at ${fx(mark)} rpm ${fx(t)} lb-ft and ${fx(hp)} hp">
    ${[1000, 2000, 3000, 4000, 5000, 6000, 7000].filter(r => r <= top).map(r => `<line x1="${X(r)}" x2="${X(r)}" y1="${H - 30}" y2="18" class="st-grid"/><text x="${X(r)}" y="${H - 12}" text-anchor="middle">${fx(r)}</text>`).join('')}
    <path d="${line(1)}" class="st-tq"/><path d="${line(2)}" class="st-hp"/>
    <line x1="${X(mark)}" x2="${X(mark)}" y1="${H - 30}" y2="14" class="st-mark"/>
    <circle cx="${X(mark)}" cy="${Y(t)}" r="5" class="st-dot-tq"/><circle cx="${X(mark)}" cy="${Y(hp)}" r="5" class="st-dot-hp"/>
    <text x="${X(v.torqueRpm)}" y="${Y(v.torque) - 12}" text-anchor="middle" class="st-lab-tq">torque ${esc(U('torque', v.torque))}</text><text x="${X(v.hpRpm)}" y="${Y(v.hp) + 22}" text-anchor="middle" class="st-lab-hp">power ${esc(U('power', v.hp))}</text>
    <text x="40" y="12" class="st-axis-l">engine speed, rpm</text></svg>`;
}

// ---------- the questions ----------
const Q = {};
Q.torque = {
  fig: c => ({ big: fx(c.v.torque), unit: 'lb-ft', small: `at ${fx(c.v.torqueRpm)} rpm` }),
  teaser: c => `Peak torque arrives at ${fx(c.v.torqueRpm)} rpm; peak power at only ${fx(c.v.hpRpm)}.`,
  html() {
    const v = nowV(), rpm = state.rpm ?? v.torqueRpm, pct = state.tune.hp ? Math.round((state.tune.hp / stockV().hp - 1) * 100) : 0;
    return `<p class="st-lede">Torque is the twisting force the engine makes. Horsepower is torque multiplied by how fast the engine turns: <b>hp = torque × rpm ÷ 5,252</b>. A big engine that runs out of breath at low rpm makes plenty of torque and modest horsepower.</p>
      <figure class="st-fig" data-curve>${curve(v, rpm)}</figure>
      <label class="st-ctl"><span>Engine speed <output data-o="rpm">${fx(rpm)} rpm</output></span><input type="range" min="1000" max="${v.redline}" step="100" value="${rpm}" data-in="rpm"></label>
      <p class="st-formula" data-formula></p>
      <label class="st-ctl"><span>Try an engine output change <output data-o="pct">${sign(pct)}%</output></span><input type="range" min="-20" max="60" step="5" value="${pct}" data-in="pct"></label>
      <div data-out></div>
      ${deeper([[page('1991-ferrari-f40'), 'Ferrari F40', 'The opposite recipe: a small, high-revving engine.'], [labHref('build'), 'Try a different engine in the Vehicle Lab', 'Swap in another engine package and keep the rest of this car.']])}`;
  },
  bind(b) {
    b.querySelector('[data-in="rpm"]').oninput = e => { state.rpm = +e.target.value; persist(); this.refresh(b); };
    b.querySelector('[data-in="pct"]').oninput = e => {
      const p = +e.target.value, s = stockV();
      if (!p) { delete state.tune.hp; delete state.tune.torque; } else { const hp = Math.round(s.hp * (1 + p / 100)), tq = Math.round(s.torque * (1 + p / 100)); if (validValue('hp', hp) && validValue('torque', tq)) { state.tune.hp = hp; state.tune.torque = tq; } }
      b.querySelector('[data-o="pct"]').textContent = sign(p) + '%'; state.last = 'power'; update();
    };
    this.refresh(b);
  },
  refresh(b) {
    const c = ctx(), v = c.v, rpm = Math.min(state.rpm ?? v.torqueRpm, v.redline), t = torqueAt(v, rpm);
    b.querySelector('[data-curve]').innerHTML = curve(v, rpm) + `<figcaption><span class="st-k-tq">Torque</span> and <span class="st-k-hp">horsepower</span> through the published peaks. The curve’s shape is an ESS estimate, not a dyno chart.</figcaption>`;
    b.querySelector('[data-o="rpm"]').textContent = fx(rpm) + ' rpm';
    b.querySelector('[data-formula]').innerHTML = `At <b>${fx(rpm)} rpm</b>: ${esc(U('torque', t))} × ${fx(rpm)} ÷ 5,252 = <b>${esc(U('power', t * rpm / 5252))}</b>`;
    const gain = c.rs && c.rm ? c.rs.magazine.et - c.rm.magazine.et : 0;
    b.querySelector('[data-out]').innerHTML = `<p>This engine reaches its torque peak at ${fx(v.torqueRpm)} rpm, its power peak at ${fx(v.hpRpm)} rpm, and shifts at ${fx(v.redline)}. It pulls hard from low speed but has little left to give near the shift point, which is why ${qLink('gearing', 'the gearing')} matters so much.</p>
      ${isModified() && v.hp !== c.s.hp ? `<p>${v.hp > c.s.hp ? `${fx((v.hp / c.s.hp - 1) * 100)}% more power` : 'Less power'} changes the modeled quarter mile by ${sign(-gain, 2)} s. ${c.rows[0]?.status === 'red' ? `1st gear now asks for ${fx(c.rows[0].utilization * 100)}% of the rear grip, so some of it becomes ${qLink('launch', 'wheelspin')}.` : ''}</p>` : ''}${modelLine(c)}`;
  },
};
Q.launch = {
  fig: c => c.rows[0] ? { big: fx(c.rows[0].utilization * 100), unit: '%', small: 'of rear grip asked for in 1st', level: c.rows[0].status } : null,
  teaser: c => ({ red: 'Full throttle in 1st asks the rear tires for more than they can give.', yellow: 'In 1st it runs right at the edge of what the rear tires can hold.' })[c.rows[0]?.status] ?? 'Even in 1st, the tires can take what the engine sends.',
  html() {
    return `<p class="st-lede">Flooring it is a contest between the force the drivetrain sends to the rear tires and the force those tires can hold. Each bar compares the two in one gear.</p>
      <div class="st-two"><div data-chart></div><div data-detail></div></div><div data-out></div>
      ${deeper([[article('traction-circle'), 'Understanding the traction circle', 'One tire, one grip budget, shared by braking, turning and accelerating.'], [labHref('compare-strip'), 'Watch the quarter-mile run', 'See where the launch costs time.']])}`;
  },
  bind(b) { b.addEventListener('click', e => { const g = e.target.closest('[data-gear]'); if (!g) return; state.gear = +g.dataset.gear; persist(); this.refresh(b); }); this.refresh(b); },
  refresh(b) {
    const c = ctx(), sel = Math.min(state.gear, Math.max(0, c.rows.length - 1)), r = c.rows[sel];
    b.querySelector('[data-chart]').innerHTML = gearChart(c.rows, sel);
    if (r) b.querySelector('[data-detail]').innerHTML = `<div class="st-callout s-${r.status}"><p class="st-callout-h">${ordinal(r.gear)} gear · <b>${STATUS[r.status]}</b></p>
      <p>The drivetrain can send about <b>${esc(U('force', r.demandLb))}</b> to the road; ${state.conditions ? esc(tireClasses[state.conditions.tire].label.toLowerCase()) + 's' : `its 1970s radials (model grip ${fx(c.v.grip, 2)}, an ESS estimate)`} hold about <b>${esc(U('force', r.availableLb.typical))}</b>.</p>
      <p>${r.status === 'red' ? 'Full throttle spins the tires; the driver has to feed the power in.' : r.status === 'yellow' ? 'Right at the edge: surface and technique decide it.' : 'The tires can take everything the engine sends here.'} This gear runs to about <b>${esc(U('speed', gearSpeed(c.v, r.ratio)))}</b> at ${fx(c.v.redline)} rpm.</p></div>`;
    const s = c.rm, total = s ? Object.values(s.time).reduce((a, x) => a + x, 0) : 0;
    b.querySelector('[data-out]').innerHTML = (s ? `<h4 class="st-h4">Where the modeled quarter mile goes</h4><ul class="st-bars">${[['traction', 'Waiting on tire grip'], ['engine', 'Limited by engine power'], ['shifting', 'Shifting']].map(([k, l]) => `<li><span>${l}</span><b>${fx(s.time[k], 2)} s</b><i style="--w:${(s.time[k] / total * 100).toFixed(1)}%"></i></li>`).join('')}</ul>
      <p>${s.time.traction > .5 ? `Grip costs time only at the start; after that, the engine sets the pace. ${qLink('tires', 'How much do modern tires buy back?')}` : `Power, not grip, sets the pace almost all the way.`}</p>` : '') + modelLine(c);
  },
};
const TIRE_ORDER = ['bias', 'radial70s', 'perf80s', 'allSeason', 'maxSummer', 'extremeSummer', 'track200'];
Q.tires = {
  fig: () => { const list = Q.tires.runs(), base = list.find(x => x.id === 'radial70s'), best = Q.tires.best(); return best && base ? { big: sign(best.et - base.et, 2), unit: 's', small: 'quarter mile on modern tires (model)' } : null; },
  teaser: () => { const best = Q.tires.best(); return best ? `Modern rubber helps until about ${tireClasses[best.id].label.toLowerCase()}; past that, the engine is the limit.` : 'Every tire class through the same model.'; },
  runs() { return TIRE_ORDER.map(k => { const v = resolve(setup({ conditions: { tire: k } }), true); const m = run(v); const g = byGear(v, { tire: k })[0]; return { id: k, et: m?.magazine.et, t60: m?.magazine.zeroTo60, g: g?.utilization, st: g?.status }; }); },
  best() { const rs = this.runs().filter(x => Number.isFinite(x.et)); if (!rs.length) return null; const min = Math.min(...rs.map(x => x.et)); return rs.find(x => x.et - min < .01); },
  html() {
    return `<p class="st-lede">The same car, the same engine, a different tire under it. Tire grip limits the start; once the tires can hold the engine, better tires stop paying off in a straight line.</p>
      <div data-list></div>
      <h4 class="st-h4">A different size</h4><p class="st-note">Size changes diameter, which acts like an axle-ratio change. It does not tell you about fitment, clearance or load rating.</p>
      <div class="st-inline"><input type="text" aria-label="Tire size" placeholder="${esc(R.tires?.tireRear?.size ?? '245/60R15')}" value="${esc(state.altTire)}" data-in="size" autocomplete="off" spellcheck="false">${['245/60R15', '255/50R16', '275/40R17'].map(x => `<button type="button" class="st-chip" data-size="${x}">${x}</button>`).join('')}</div>
      <div data-alt aria-live="polite"></div>
      ${deeper([[article('traction-circle'), 'The tire revolution nobody talks about', 'How tire compounds have grown the grip budget since 1977.'], [labHref('performance'), 'Every tire class, gear by gear', 'In the Vehicle Lab with this configuration.']])}`;
  },
  bind(b) {
    b.addEventListener('click', e => { const t = e.target.closest('[data-tire]'); if (!t) return; state.conditions = t.dataset.tire === 'radial70s' ? null : { tire: t.dataset.tire }; state.last = 'tire'; update(t.dataset.tire === 'radial70s' ? 'Back to the period tires.' : `${tireClasses[t.dataset.tire].label} applied.`); });
    const inp = b.querySelector('[data-in="size"]');
    inp.oninput = () => { state.altTire = inp.value; this.alt(b); };
    for (const x of b.querySelectorAll('[data-size]')) x.onclick = () => { inp.value = state.altTire = x.dataset.size; this.alt(b); };
    this.refresh(b);
  },
  alt(b) {
    const s = stockV(), t = parseTire(state.altTire), el = b.querySelector('[data-alt]');
    if (!state.altTire) { el.innerHTML = ''; return; }
    if (!t) { el.innerHTML = '<p class="st-empty">Enter a size like 245/60R15.</p>'; return; }
    const ratio = t.diameter / s.diameter;
    el.innerHTML = `<dl class="st-read"><div><dt>Diameter</dt><dd>${esc(U('length', t.diameter, { digits: 1 }))}<small>${sign((ratio - 1) * 100, 1)}% vs ${esc(U('length', s.diameter, { digits: 1 }))}</small></dd></div><div><dt>Acts like an axle ratio of</dt><dd>${fx(s.finalDrive / ratio, 2)}<small>stock ${fx(s.finalDrive, 2)}</small></dd></div><div><dt>Speedometer at a true ${esc(U('speed', 60))}</dt><dd>${esc(U('speed', 60 / ratio, { digits: 1 }))}</dd></div></dl>
      <p><button type="button" class="st-btn" data-apply>Use this diameter in the experiment</button></p>`;
    el.querySelector('[data-apply]').onclick = () => { if (!validValue('diameter', t.diameter)) return say('That diameter is outside the model range.'); state.tune.diameter = t.diameter; state.last = 'diameter'; update('Tire diameter applied.'); };
  },
  refresh(b) {
    const list = this.runs(), stock = list.find(x => x.id === 'radial70s'), cur = state.conditions?.tire ?? 'radial70s';
    const ets = list.map(x => x.et).filter(Number.isFinite), lo = Math.min(...ets) - .3, hi = Math.max(...ets) + .1;
    b.querySelector('[data-list]').innerHTML = `<ul class="st-tires">${list.map(x => `<li><button type="button" data-tire="${x.id}" aria-pressed="${x.id === cur}">
      <span class="st-t-name">${esc(tireClasses[x.id].label)}${x.id === 'radial70s' ? ' <small>period tire · model default</small>' : ''}</span>
      <span class="st-t-bar"><i style="--w:${Number.isFinite(x.et) ? ((hi - x.et) / (hi - lo) * 100).toFixed(1) : 0}%"></i></span>
      <span class="st-t-et">${fx(x.et, 2)} s${stock && x.id !== 'radial70s' ? ` <small>${sign(x.et - stock.et, 2)}</small>` : ''}</span>
      <span class="st-t-g s-${x.st}">${x.g ? fx(x.g * 100) + '% in 1st' : ''}</span></button></li>`).join('')}</ul>
      <p class="st-note">ESS model quarter mile with each tire class, everything else as configured. Longer bar is quicker. Tire-class grip is a typical value with a range, not a test of a particular tire.</p>`;
    this.alt(b);
  },
};
Q.balance = {
  fig: c => ({ big: fx(c.v.front * 100), unit: '%', small: 'of the weight on the front axle' }),
  teaser: c => `Only ${fx(100 - c.v.front * 100)}% of the weight presses on the rear tires that drive it.`,
  html() {
    const wb = stockV().wheelbase;
    const spots = [['Front bumper', -Math.round(wb * .3)], ['Engine bay', Math.round(wb * .05)], ['Front seats', Math.round(wb * .5)], ['Rear axle', Math.round(wb)], ['Trunk', Math.round(wb * 1.25)]];
    return `<p class="st-lede">A rear-drive car can only push with the grip its rear tires have, and that grows with the load on them. With a heavy iron V8 ahead of the front axle line, this car starts with most of its weight on the wheels that don’t drive it.</p>
      <div data-balance></div>
      <div class="st-ctl"><span>Try a common change</span><div class="st-chips"><button type="button" class="st-chip" data-preset="battery">Battery to the trunk <small>assumes 45 lb</small></button><button type="button" class="st-chip" data-preset="driver">Add a 180 lb driver</button></div></div>
      <div class="st-ctl"><span>Or add weight</span><div class="st-chips">${spots.map(([n, x]) => `<button type="button" class="st-chip" data-at="${x}" data-name="${esc(n)}">+${esc(U('weight', 100))} at ${esc(n.toLowerCase())}</button>`).join('')}</div></div>
      <p class="st-note">Positions are typical locations measured from the front axle on this ${esc(U('length', wb, { digits: 1 }))} wheelbase. Enter exact positions in the Lab.</p>
      <div data-out></div>
      ${deeper([[article('weight-distribution-50-50'), 'What 50/50 weight distribution really means', 'Why the percentage alone does not say where the mass sits.'], [page('1991-ferrari-f40'), 'Ferrari F40', 'The same idea turned around: 58% on the rear.'], [tool('load-transfer'), 'Load transfer calculator', 'How load moves under braking, acceleration and cornering.']])}`;
  },
  bind(b) {
    const wb = stockV().wheelbase;
    const push = p => { if (state.parts.length >= 8) return say('Up to eight weight changes per experiment.'); state.parts.push(p); state.last = 'weight'; update(p.label + '.'); };
    for (const x of b.querySelectorAll('[data-preset]')) x.onclick = () => push(x.dataset.preset === 'battery'
      ? { label: 'Move 45 lb battery from the front to the trunk', oldWeight: 45, oldX: -Math.round(wb * .25), newWeight: 45, newX: Math.round(wb * 1.25) }
      : { label: 'Add a 180 lb driver', oldWeight: 0, oldX: Math.round(wb * .5), newWeight: 180, newX: Math.round(wb * .5) });
    for (const x of b.querySelectorAll('[data-at]')) x.onclick = () => push({ label: `Add 100 lb at ${x.dataset.name.toLowerCase()}`, oldWeight: 0, oldX: +x.dataset.at, newWeight: 100, newX: +x.dataset.at });
    this.refresh(b);
  },
  refresh(b) {
    const c = ctx(), v = c.v, s = c.s, f = v.front * 100, f40 = lib('1991-ferrari-f40')?.key?.front?.value;
    b.querySelector('[data-balance]').innerHTML = `<figure class="st-scale"><div class="st-scale-bar" role="img" aria-label="${fx(f, 1)}% front, ${fx(100 - f, 1)}% rear"><span class="st-sc-f" style="--w:${f.toFixed(1)}%">Front ${fx(f, 1)}%<small>${esc(U('weight', v.frontLb))}</small></span><span class="st-sc-r">Rear ${fx(100 - f, 1)}%<small>${esc(U('weight', v.rearLb))}</small></span></div>
      <span class="st-sc-mid" aria-hidden="true"></span>${Math.abs(v.front - s.front) > .0005 ? `<span class="st-sc-was" style="--x:${(s.front * 100).toFixed(1)}%" title="stock"></span>` : ''}
      <figcaption>Static axle loads of ${esc(U('weight', v.weight))}${Math.abs(v.front - s.front) > .0005 ? ` · stock ${fx(s.front * 100, 1)}% front` : ''}.${f40 ? ` For contrast, the mid-engine Ferrari F40 carries ${fx(f40 * 100)}% on its front axle.` : ''}</figcaption></figure>`;
    b.querySelector('[data-out]').innerHTML = `<dl class="st-read"><div><dt>Grip the rear can hold at launch</dt><dd>${c.rows[0] ? esc(U('force', c.rows[0].availableLb.typical)) : '—'}${c.rowsStock[0] && c.rows[0] && c.rows[0].availableLb.typical !== c.rowsStock[0].availableLb.typical ? `<small>stock ${esc(U('force', c.rowsStock[0].availableLb.typical))}</small>` : ''}</dd></div>
      <div><dt>1st gear grip use</dt><dd>${c.rows[0] ? fx(c.rows[0].utilization * 100) + '%' : '—'}<small>${c.rows[0] ? STATUS[c.rows[0].status] : ''}</small></dd></div></dl>
      <p>Moving weight rearward adds rear load, but adding weight anywhere also adds mass to accelerate. The model weighs both: ${qLink('launch', 'see the grip by gear')}.</p>${modelLine(c)}`;
  },
};
Q.gearing = {
  fig: c => ({ big: fx(rpmAt(c.v, 70, c.v.gears.length - 1) / 100) + '00', unit: 'rpm', small: `at ${U('speed', 70)} in top gear` }),
  teaser: c => `${c.v.gears.length} speeds, a ${fx(c.v.gears.at(-1), 2)} top gear and a ${fx(c.v.finalDrive, 2)} axle: relaxed at highway speed.`,
  ratios() { const s = stockV(); return [...new Set([2.73, 3.08, 3.23, 3.42, 3.73, 4.10, s.finalDrive].map(x => +x.toFixed(2)))].filter(x => validValue('finalDrive', x)).sort((a, b) => a - b); },
  html() {
    const fd = state.tune.finalDrive ?? stockV().finalDrive;
    return `<p class="st-lede">The transmission and rear axle multiply the engine’s torque and divide its speed. A numerically higher axle ratio pulls harder in every gear but revs higher on the highway.</p>
      <div data-ladder></div>
      <div class="st-ctl"><span>Axle ratio</span><div class="st-chips">${this.ratios().map(o => `<button type="button" data-fd="${o}" aria-pressed="${o === fd}">${fx(o, 2)}${o === stockV().finalDrive ? ' · stock' : ''}</button>`).join('')}</div></div>
      <div data-out></div>
      ${deeper([[labHref('performance'), 'Gearing and grip in the Vehicle Lab', 'Each gear against the tires, with this configuration.']])}`;
  },
  bind(b) {
    for (const x of b.querySelectorAll('[data-fd]')) x.onclick = () => { const s = stockV(), r = +x.dataset.fd; if (Math.abs(r - s.finalDrive) < .005) delete state.tune.finalDrive; else state.tune.finalDrive = r; state.last = 'finalDrive';
      for (const y of b.querySelectorAll('[data-fd]')) y.setAttribute('aria-pressed', String(y === x)); update(`Axle ratio ${fx(r, 2)} applied.`); };
    this.refresh(b);
  },
  refresh(b) {
    const c = ctx(), v = c.v, top = topSpeed(v), sp = v.gears.map(g => gearSpeed(v, g)), max = Math.max(...sp, top ?? 0) * 1.05;
    b.querySelector('[data-ladder]').innerHTML = `<figure class="st-ladder"><ol>${sp.map((x, i) => `<li><span>${ordinal(i + 1)} <small>${fx(v.gears[i], 2)}</small></span><span class="st-l-track"><i style="--w:${(x / max * 100).toFixed(1)}%"></i></span><b>${esc(U('speed', x))}</b></li>`).join('')}</ol>
      ${top ? `<span class="st-l-limit" style="--x:${(top / max * 100).toFixed(1)}"><span>drag limit ≈ ${esc(U('speed', top))}</span></span>` : ''}
      <figcaption>Road speed at ${fx(v.redline)} rpm in each gear. The dashed line is the power-limited top speed, an ESS estimate from ${est('cda') ? 'an estimated' : 'the'} drag area.</figcaption></figure>`;
    const rows = this.ratios().map(r => { const m = run(resolve(setup({ tune: { finalDrive: r } }), true)); return { r, et: m?.magazine.et }; });
    const best = rows.filter(x => Number.isFinite(x.et)).reduce((a, x) => (!a || x.et < a.et ? x : a), null);
    b.querySelector('[data-out]').innerHTML = `<p>At ${esc(U('speed', 70))} in top gear the engine turns about <b>${fx(rpmAt(v, 70, v.gears.length - 1))} rpm</b>${v.finalDrive !== c.s.finalDrive ? ` (stock ${fx(rpmAt(c.s, 70, c.s.gears.length - 1))})` : ''}${Math.abs(rpmAt(v, 70, v.gears.length - 1) / v.torqueRpm - 1) < .2 ? ', close to its torque peak' : `; its torque peak is at ${fx(v.torqueRpm)}`}.</p>
      <h4 class="st-h4">Modeled quarter mile with each axle ratio</h4><ul class="st-bars compact">${rows.map(x => `<li${x.r === v.finalDrive ? ' class="on"' : ''}><span>${fx(x.r, 2)}${x.r === c.s.finalDrive ? ' stock' : ''}</span><b>${fx(x.et, 2)} s</b></li>`).join('')}</ul>
      ${best ? `<p>${Math.abs(best.r - c.s.finalDrive) < .005 ? 'The stock ratio is already the quickest of these in the model.' : `In the model, ${fx(best.r, 2)} is quickest, but by only ${fx((rows.find(x => x.r === c.s.finalDrive)?.et ?? best.et) - best.et, 2)} s.`} ${c.rows[0]?.status === 'red' ? `With these tires, shorter gearing mostly buys ${qLink('launch', 'more wheelspin in 1st')}.` : ''}</p>` : ''}${modelLine(c)}`;
  },
};
const fact = label => (R.facts ?? []).find(f => f.label === label);
// Factory figures parsed from the published facts (never typed in here).
const ALIGN = (() => { const t = String(fact('Factory alignment at curb')?.value ?? ''); const m = re => t.match(re)?.slice(1);
  return { caster: m(/[Cc]aster ([+−-]?[\d.]+)° (±[\d.]+°)/), camber: m(/camber ([+−-]?[\d.]+)° (±[\d.]+°)/), toe: m(/toe-in ([\d/.]+ in) (±[\d/.]+ in)/) }; })();
const TRAVEL = { up: fact('Full front jounce')?.value, down: fact('Full front rebound')?.value };
Q.chassis = {
  fig: () => ALIGN.camber ? ({ big: ALIGN.camber[0] + '°', unit: '', small: 'factory camber at curb' }) : null,
  teaser: () => 'Alignment, steering axis and wheel travel as the factory published them, and what each one does.',
  html() {
    return `<p class="st-lede">Factory specifications describe how the car was set up when new. Each term below is one way a wheel is angled or allowed to move. These are historical factory figures, not a setup recommendation for a modified car.</p>
      <div class="st-terms">
        ${ALIGN.camber ? `<figure class="st-term"><svg viewBox="0 0 160 120" role="img" aria-label="Front view of a wheel leaning outward at the top: positive camber"><line x1="10" x2="150" y1="108" y2="108" class="st-ground"/><line x1="80" x2="80" y1="12" y2="108" class="st-ref"/><g transform="rotate(${Math.max(-12, Math.min(12, parseFloat(ALIGN.camber[0].replace('−', '-')) * 5))} 80 108)"><rect x="62" y="22" width="36" height="86" rx="8" class="st-wheel"/></g></svg>
          <figcaption><b>Camber ${esc(ALIGN.camber[0])}°</b><span class="st-tol">tolerance ${esc(ALIGN.camber[1])}</span> Positive camber leans the top of the tire outward. Drawn five times steeper so it is visible.</figcaption></figure>` : ''}
        ${ALIGN.caster ? `<figure class="st-term"><svg viewBox="0 0 160 120" role="img" aria-label="Side view of the wheel and its steering axis"><line x1="10" x2="150" y1="108" y2="108" class="st-ground"/><circle cx="80" cy="74" r="34" class="st-wheel"/><g transform="rotate(${parseFloat(ALIGN.caster[0].replace('−', '-')) * 5} 80 74)"><line x1="80" x2="80" y1="10" y2="108" class="st-axis-line"/></g></svg>
          <figcaption><b>Caster ${esc(ALIGN.caster[0])}°</b><span class="st-tol">tolerance ${esc(ALIGN.caster[1])}</span> The tilt of the steering axis seen from the side. More caster adds self-centering and steering weight.</figcaption></figure>` : ''}
        ${ALIGN.toe ? `<figure class="st-term"><svg viewBox="0 0 160 120" role="img" aria-label="Top view: front tires pointing slightly inward, toe-in"><line x1="20" x2="140" y1="60" y2="60" class="st-ref"/><g transform="rotate(4 45 60)"><rect x="36" y="25" width="18" height="70" rx="5" class="st-wheel"/></g><g transform="rotate(-4 115 60)"><rect x="106" y="25" width="18" height="70" rx="5" class="st-wheel"/></g></svg>
          <figcaption><b>Toe-in ${esc(ALIGN.toe[0])}</b><span class="st-tol">total, tolerance ${esc(ALIGN.toe[1])}</span> The fronts of the tires point slightly toward each other, which steadies the car in a straight line. Angle exaggerated.</figcaption></figure>` : ''}
        ${TRAVEL.up && TRAVEL.down ? `<figure class="st-term"><svg viewBox="0 0 160 120" role="img" aria-label="Front wheel travel: ${TRAVEL.up} inches up, ${TRAVEL.down} inches down" style="font-size:11px"><line x1="10" x2="150" y1="60" y2="60" class="st-ref"/><rect x="48" y="${60 - TRAVEL.up * 12}" width="28" height="${TRAVEL.up * 12}" class="st-up"/><rect x="48" y="60" width="28" height="${TRAVEL.down * 12}" class="st-down"/><text x="84" y="${60 - TRAVEL.up * 6 + 4}">${TRAVEL.up} in up</text><text x="84" y="${60 + TRAVEL.down * 6 + 4}">${TRAVEL.down} in down</text></svg>
          <figcaption><b>Front wheel travel</b><span class="st-tol">as published</span> ${TRAVEL.up} in of jounce (bump) and ${TRAVEL.down} in of rebound from ride height.</figcaption></figure>` : ''}
      </div>
      <div data-out></div>
      ${deeper([[labHref('suspension'), 'Front geometry in the Vehicle Lab', 'Move the pickup points and see camber change through travel.'], [tool('spring-rate'), 'Spring rate and ride frequency', 'Work from a target frequency to a spring.'], [article('traction-circle'), 'Understanding the traction circle', 'Why the tire’s contact with the road matters in every direction.']])}`;
  },
  bind(b) { this.refresh(b); },
  refresh(b) {
    const v = nowV(), rf = ride(v, 'front'), rr = ride(v, 'rear'), sai = fact('Steering axis inclination'), fs = fact('Front suspension'), rs = fact('Rear suspension');
    b.querySelector('[data-out]').innerHTML = `<dl class="st-read">${sai ? `<div><dt>Steering axis inclination</dt><dd>${esc(sai.value)}°<small>at 1° camber · factory</small></dd></div>` : ''}
      <div><dt>Front ride frequency</dt><dd>${fx(rf.hz, 2)} Hz <span class="st-est">est.</span><small>wheel rate ${esc(U('rate', rf.wheel))}</small></dd></div>
      <div><dt>Rear ride frequency</dt><dd>${fx(rr.hz, 2)} Hz <span class="st-est">est.</span><small>wheel rate ${esc(U('rate', rr.wheel))}</small></dd></div></dl>
      <p>${fs ? `Front: ${esc(fs.value)}. ` : ''}${rs ? `Rear: ${esc(rs.value)}. ` : ''}Spring rates and motion ratios for this car are ESS estimates chosen for a typical ride frequency; the factory figures above are published.</p>`;
  },
};
const DECADE_PICKS = ['1977-pontiac-firebird-trans-am-w72-four-speed-m4-us', '2002-pontiac-slp-firebird-firehawk-wu6'];
Q.decades = {
  fig: () => { const fh = lib('2002-pontiac-slp-firebird-firehawk-wu6'); return fh ? { big: String(fh.year - R.identity.year), unit: 'years', small: 'to the 2002 Firehawk' } : null; },
  teaser: () => { const fh = lib('2002-pontiac-slp-firebird-firehawk-wu6'), me = lib(R.slug); return fh?.key?.power && me?.key?.power ? `The 2002 Firehawk makes ${fx(fh.key.power.value - me.key.power.value)} more hp with about the same weight.` : 'Side by side with later Pontiacs.'; },
  html: () => `<p class="st-lede">The same badge, the same front-engine, rear-drive layout, and 25 years apart. Published numbers side by side, with the ESS model run on each.</p><div data-cmp></div>
    ${deeper([[page('2002-pontiac-slp-firebird-firehawk-wu6'), '2002 SLP Firehawk', 'Fourth-generation F-body with the LS1.'], [page('1977-pontiac-firebird-trans-am-w72-four-speed-m4-us'), '1977 Trans Am W72', 'The same year and engine, dressed differently.'], [page('1991-ferrari-f40'), 'Ferrari F40', 'A mid-engine contrast, also on this site.']])}`,
  bind(b) { this.refresh(b); },
  async refresh(b) {
    const root = b.querySelector('[data-cmp]'); const L = await loadLibrary(); if (!L.length) { root.innerHTML = `<p><a href="${esc(new URL('../compare/?a=' + R.slug, document.baseURI).href)}">Open the comparison</a></p>`; return; }
    if (!state.compare.length) state.compare = DECADE_PICKS.filter(s => lib(s));
    const cars = [lib(R.slug), ...state.compare.map(lib).filter(Boolean)];
    const model = cars.map(x => { const m = x.labId && vehicles[x.labId] && x.runs ? run(x.slug === R.slug ? nowV() : resolve(newSetup(x.labId), false)) : null; return m?.magazine ?? null; });
    const rows = [['Power', x => x.key.power, o => U('power', o.value)], ['Torque', x => x.key.torque, o => U('torque', o.value)], ['Weight', x => x.key.weight, o => U('weight', o.value) + (o.basis ? ` <small>${esc(o.basis)}</small>` : '')],
      ['Weight per hp', x => x.key.weightPerHp, o => fx(o.value, 1) + ' lb/hp'], ['Front share', x => x.key.front, o => fx(o.value * 100) + '%'], ['Transmission', x => x.key.transmission, o => esc(o.value)],
      ['Rear tire', x => x.key.tireRear, o => esc(o.value)], ['Quarter mile (test)', x => x.key.et, o => fx(o.value, 1) + ' s']];
    root.innerHTML = `<div class="st-table"><table><thead><tr><th></th>${cars.map((x, i) => `<th scope="col">${i ? `<a href="${esc(page(x.slug))}">${esc(x.title.replace(/ · .*/, ''))}</a>` : esc(x.title.replace(/ · .*/, ''))}</th>`).join('')}</tr></thead><tbody>
      ${rows.filter(r => cars.some(x => r[1](x))).map(r => `<tr><th scope="row">${r[0]}</th>${cars.map(x => { const o = r[1](x); return `<td>${o && o.value != null ? r[2](o) : '—'}</td>`; }).join('')}</tr>`).join('')}
      <tr class="st-model-row"><th scope="row">ESS model, quarter mile</th>${model.map(m => `<td>${m ? fx(m.et, 2) + ' s' : '<small>not modeled</small>'}</td>`).join('')}</tr></tbody></table></div>
      <p class="st-note">Published values with their own definitions; weights may be curb or as tested. Model times are ESS estimates with magazine timing${isModified() ? '; this car’s column includes your changes' : ''}.</p>
      ${cars.length > 1 && model.every(Boolean) ? `<p><a class="st-btn" href="${esc(this.lab(cars))}">Race them in the Vehicle Lab</a></p>` : ''}`;
  },
  lab(cars) { const keys = ['a', 'b', 'c'], st = { focus: 'a', event: 'strip' }; cars.forEach((x, i) => { st[keys[i]] = x.slug === R.slug ? setup() : newSetup(x.labId); st[keys[i] + 'Mode'] = x.slug === R.slug && isModified() ? 'after' : 'before'; }); return new URL('?via=reference' + shareFragment(st, 'compare'), labRoot).href; },
};

// ---------- what the last change did (one model-grounded sentence in the cluster) ----------
function whatChanged(c) {
  const r1 = c.rows[0], r0 = c.rowsStock[0];
  switch (state.last) {
    case 'power': return r1 ? ['launch', `1st gear now asks for ${fx(r1.utilization * 100)}% of the rear grip.`] : null;
    case 'tire': return r1 ? ['launch', `With these tires, 1st gear uses ${fx(r1.utilization * 100)}% of grip${r0 ? ` (was ${fx(r0.utilization * 100)}%)` : ''}.`] : null;
    case 'weight': return ['balance', `Front share is now ${fx(c.v.front * 100, 1)}% (stock ${fx(c.s.front * 100, 1)}%).`];
    case 'finalDrive': return ['gearing', `Top gear at ${U('speed', 70)}: ${fx(rpmAt(c.v, 70, c.v.gears.length - 1))} rpm.`];
    case 'diameter': return ['gearing', `The new tire acts like a ${fx(c.v.finalDrive * c.s.diameter / c.v.diameter, 2)} axle ratio.`];
    default: return null;
  }
}

// ---------- the gauge cluster ----------
const cluster = document.querySelector('[data-st-cluster]');
function renderCluster() {
  if (!cluster) return;
  const c = ctx(), list = changes(), mod = list.length > 0, wc = mod ? whatChanged(c) : null;
  const gauge = (label, val, sub = '') => `<div class="st-gauge"><span>${label}</span><b>${val}</b>${sub}</div>`;
  cluster.innerHTML = `<div class="st-shell st-cluster-in"><div class="st-cluster-name"><span>Your</span> <b>${esc(short || 'car')}</b> <small>${mod ? `${list.length} change${list.length > 1 ? 's' : ''}` : 'as built'}</small></div>
    <div class="st-gauges">${c.rm ? gauge('0–60', fx(c.rm.magazine.zeroTo60, 1) + '<i>s</i>', mod ? delta(c.rs?.magazine.zeroTo60, c.rm.magazine.zeroTo60, 1) : '') + gauge('¼ mile', fx(c.rm.magazine.et, 2) + '<i>s</i>', mod ? delta(c.rs?.magazine.et, c.rm.magazine.et) : '') : ''}
      ${c.rows[0] ? gauge('Grip in 1st', fx(c.rows[0].utilization * 100) + '<i>%</i>', `<em class="s-${c.rows[0].status}">${STATUS[c.rows[0].status]}</em>`) : ''}${gauge('Front', fx(c.v.front * 100) + '<i>%</i>')}</div>
    <details class="st-cluster-more"><summary>${mod ? 'Changes & actions' : 'Actions'}</summary><div>
      ${wc ? `<p class="st-wc">${esc(wc[1])} <a href="#q-${wc[0]}" data-st-q="${wc[0]}">See why</a></p>` : ''}
      ${mod ? `<ul>${list.map((x, i) => `<li>${esc(x.text)} <button type="button" class="st-link" data-undo="${i}" aria-label="Undo ${esc(x.text)}">Undo</button></li>`).join('')}</ul><p><button type="button" class="st-link" data-reset>Reset all</button></p>` : '<p>Make a change in any answer; it shows here and goes with you into the Lab.</p>'}
      <p class="st-acts"><a class="st-btn st-btn-hot" href="${esc(labHref('build'))}">Continue in the Vehicle Lab</a><a class="st-btn" href="${esc(labHref('compare-strip'))}">Race it</a>${mod ? '<button type="button" class="st-btn" data-save>Save</button><button type="button" class="st-btn" data-share>Share</button>' : ''}</p>
      <p class="st-note">ESS model, magazine timing. The archive road test: ${R.key.t60 ? fx(R.key.t60.value, 1) + ' s to 60, ' : ''}${R.key.et ? fx(R.key.et.value, 1) + ' s quarter mile' : '—'}.</p></div></details></div>`;
  const more = cluster.querySelector('details'); if (clusterOpen) more.open = true; more.ontoggle = () => { clusterOpen = more.open; };
  cluster.querySelector('[data-reset]')?.addEventListener('click', () => { state.tune = {}; state.parts = []; state.conditions = null; state.last = null; rebuild(); update('Back to the car as built.'); });
  for (const x of cluster.querySelectorAll('[data-undo]')) x.onclick = () => { list[+x.dataset.undo].undo(); state.last = null; rebuild(); update('Change undone.'); };
  cluster.querySelector('[data-save]')?.addEventListener('click', () => say(saveToGarage(setup(), 'after') ? 'Saved in My Garage on this browser.' : 'Could not save on this browser.'));
  cluster.querySelector('[data-share]')?.addEventListener('click', async () => { const url = new URL(labHref('build')); url.searchParams.set('via', 'share'); const o = await shareResult(url.href, R.title + ' experiment', changes().map(x => x.text).join(', ')); say({ shared: 'Shared.', copied: 'Link copied.', cancelled: 'Sharing cancelled.' }[o] ?? 'Copy this link: ' + url.href); });
}
let clusterOpen = false;

// ---------- index, answer, guided path ----------
const ORDER = [...document.querySelectorAll('.st-q[data-st-q]')].map(a => a.dataset.stQ);
const TITLE = Object.fromEntries([...document.querySelectorAll('.st-q[data-st-q]')].map(a => [a.dataset.stQ, a.querySelector('strong').textContent]));
const answer = document.querySelector('[data-st-answer]');
function renderIndex() {
  const c = ctx();
  for (const a of document.querySelectorAll('.st-q[data-st-q]')) {
    const q = a.dataset.stQ, f = Q[q]?.fig(c);
    a.setAttribute('aria-current', String(q === state.q));
    const fig = a.querySelector('[data-st-fig]');
    fig.innerHTML = f ? `<b>${esc(f.big)}</b>${f.unit ? `<i>${esc(f.unit)}</i>` : ''}<small>${esc(f.small)}</small>` : ''; fig.dataset.level = f?.level ?? '';
    try { a.querySelector('[data-st-teaser]').textContent = Q[q].teaser(c); } catch { /* keep static */ }
  }
}
function rebuild() {
  if (!answer) return;
  const q = Q[state.q] ? state.q : ORDER[0], i = ORDER.indexOf(q), next = ORDER[(i + 1) % ORDER.length];
  answer.innerHTML = `<header class="st-a-head"><p class="st-kicker">Question ${i + 1} of ${ORDER.length}</p><h3 id="q-${q}">${esc(TITLE[q])}</h3></header>
    <div class="st-a-body">${Q[q].html()}</div>
    <footer class="st-a-next"><a href="#q-${next}" data-st-q="${next}"><span>Next question</span><b>${esc(TITLE[next])}</b></a></footer>`;
  Q[q].bind(answer.querySelector('.st-a-body'));
}
const refreshAnswer = () => { const b = answer?.querySelector('.st-a-body'); if (b) Q[state.q]?.refresh(b); };
function update(message) { persist(); renderIndex(); renderCluster(); refreshAnswer(); if (message) say(message); }
function open(q) {
  if (!Q[q]) return;
  state.q = q; persist(); rebuild(); renderIndex();
  const toc = document.querySelector(`.st-q[data-st-q="${q}"]`); toc?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest', inline: 'center' });
  answer.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }); answer.focus({ preventScroll: true });
}

if (R && runnable) {
  document.addEventListener('click', e => { const a = e.target.closest('[data-st-q]'); if (!a) return; e.preventDefault(); open(a.dataset.stQ); });
  for (const a of document.querySelectorAll('[data-sp-lab]')) a.addEventListener('click', () => { a.href = labHref(a.dataset.spLab); });
  const fromHash = location.hash.match(/^#q-([a-z]+)$/)?.[1]; if (fromHash && Q[fromHash]) state.q = fromHash;
  rebuild(); renderIndex(); renderCluster();
  loadLibrary().then(() => { renderIndex(); if (state.q === 'decades' || state.q === 'balance') refreshAnswer(); });
  if (fromHash) open(fromHash);
  document.addEventListener('ess:units-changed', () => { renderStaticUnits(); rebuild(); renderIndex(); renderCluster(); });
} else if (R) document.querySelector('.st-explore')?.remove();
export { state as _state, Q as _questions, ctx as _ctx };
