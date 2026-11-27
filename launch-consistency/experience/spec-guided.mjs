// ESS specification page, third demonstration (Claude, 25 Nov 2026 night): Candidate A identity + guided experience.
// Hydrates the page built by _build/spec_guided.py from the embedded knowledge record (#ess-spec-data).
//
// Same rules as the F40 and Firebird demonstrations: no physics here (shared engine only), one reversible experiment state
// carried into the Vehicle Lab, and published values, estimates and model results labeled apart.
//
// New here: the questions are reusable ENGINEERING EXPERIENCES, not per-car pages. Each experience declares
//   needs(c)   which data it requires (it is skipped when the record cannot support it),
//   score(c)   how relevant it is to THIS car, from its own numbers (grip-limited launch, estimated axle ratio, unusual balance…),
//   title(c)   a question written from the car's data,
// and the page selects and orders them. The same registry can serve every configuration in the library; adding a car means
// adding a record, not authoring a page. Color carries meaning only: Candidate A's before/after pair for stock (amber) vs your
// change (blue), green/red for engineering limits, Candidate A's category colors for related articles, calculators and the Lab.
import { vehicles } from './vehicles.mjs';
import { newSetup, resolve, straightLine, validValue, ride } from './models.mjs';
import { shareFragment, saveToGarage, shareResult } from './configuration.mjs';
import * as units from './units.mjs';
import { torqueAt, resistanceAt, defaults as engineDefaults } from '../engine/acceleration.mjs';
import { parseTire } from '../engine/tires.mjs';
import { tireClasses, byGear } from '../engine/traction.mjs';

const dataEl = document.getElementById('ess-spec-data');
const R = dataEl ? JSON.parse(dataEl.textContent) : null;
const BASE = document.baseURI;
const labRoot = new URL('../../experience/', BASE);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fx = (n, d = 0) => Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
const sign = (n, d = 0) => !Number.isFinite(n) ? '—' : Math.abs(n) < .5 * 10 ** -d ? fx(0, d) : (n > 0 ? '+' : '−') + fx(Math.abs(n), d);
const U = (q, v, o) => units.format(q, v, o);
const MPH_FT = 5280 / 3600;
const ordinal = n => n + ({ 1: 'st', 2: 'nd', 3: 'rd' }[n] ?? 'th');
const say = t => { const el = document.querySelector('[data-sg-status]'); if (el) { el.textContent = ''; requestAnimationFrame(() => { el.textContent = t; }); } };
const href = path => new URL(path, BASE).href;
const vehiclePage = slug => href(`../${slug}/`);

// ---------- static figures: units and the sources switch ----------
function renderStaticUnits() {
  for (const el of document.querySelectorAll('[data-q][data-v]')) {
    const q = el.dataset.q, v = Number(el.dataset.v); if (!units.quantities[q]) continue;
    if (el.hasAttribute('data-bare')) { const m = units.getUnits() === 'metric'; el.textContent = fx(m ? units.toDisplay(q, v) : v); const u = el.parentElement?.querySelector(':scope > span:not([data-q])'); if (u) u.textContent = units.unitLabel(q, m ? 'metric' : 'us'); continue; }
    el.textContent = U(q, v, { digits: q === 'length' ? 1 : 0, metricDigits: 0 });
  }
}
units.bindUnitControls(document); renderStaticUnits();
{ const t = document.querySelector('[data-sg-sources]'), g = document.querySelector('[data-sg-groups]');
  if (t && g) { try { t.checked = localStorage.getItem('ess.guided.sources') === '1'; } catch { /* off */ }
    const apply = () => { g.classList.toggle('show-sources', t.checked); try { localStorage.setItem('ess.guided.sources', t.checked ? '1' : '0'); } catch { /* fine */ } }; t.onchange = apply; apply(); } }

// ---------- experiment state ----------
const id = R?.model?.labId && vehicles[R.model.labId] ? R.model.labId : null;
const actions = document.querySelector('.sg-hero .action-row');
if (id && actions) {
  const plan = document.createElement('a');
  plan.className = 'btn secondary';
  plan.href = href('../../plan/?car=' + encodeURIComponent(id));
  plan.textContent = 'Plan a build with this car';
  actions.append(plan);
}
const runnable = !!(id && R.links?.lab && !R.model.competition);
const state = { tune: {}, parts: [], conditions: null, compare: null, q: null, gear: 0, rpm: null, last: null, altTire: '' };
const STORE = 'ess.spec-guided.v1';
try { const s = JSON.parse(sessionStorage.getItem(STORE)); if (s?.id === id && s.state) Object.assign(state, s.state); } catch { /* fresh */ }
const persist = () => { try { sessionStorage.setItem(STORE, JSON.stringify({ id, state })); } catch { /* fine */ } };
const setupWith = ({ tune = {}, parts = [], conditions } = {}) => {
  const cond = conditions === undefined ? state.conditions : conditions;
  return { ...newSetup(id), tune: { ...state.tune, ...tune }, parts: [...state.parts.map(p => ({ ...p })), ...parts], ...(cond ? { conditions: { ...cond } } : {}) };
};
const setup = () => setupWith();
const isModified = () => !!(Object.keys(state.tune).length || state.parts.length || state.conditions);
const stockV = () => resolve(newSetup(id), false);
const nowV = () => resolve(setup(), true);
const runCache = new Map();
function run(v) {
  const key = JSON.stringify(['weight', 'front', 'wheelbase', 'cg', 'hp', 'hpRpm', 'torque', 'torqueRpm', 'redline', 'gears', 'finalDrive', 'diameter', 'grip', 'cda', 'drivetrain', 'transmission'].map(x => v[x]));
  if (!runCache.has(key)) { const r = straightLine(v); runCache.set(key, r.issue ? null : r); }
  return runCache.get(key);
}
const fOpts = (v, cond = state.conditions) => cond?.tire ? { tire: cond.tire } : { customMu: v.grip };
const gearRows = (v, cond) => byGear(v, fOpts(v, cond));
const gearSpeed = (v, ratio) => v.redline / (ratio * v.finalDrive) * (Math.PI * v.diameter) / 12 / 5280 * 60;
const rpmAt = (v, mph, gear) => mph * MPH_FT * 60 / (Math.PI * v.diameter / 12) * v.gears[gear] * v.finalDrive;
const roadHp = (v, mph) => resistanceAt(v, mph * MPH_FT) * mph * MPH_FT / 550;
function topSpeed(v) { for (let mph = 40; mph < 320; mph += .5) if (roadHp(v, mph) >= v.hp * engineDefaults.driveline) return mph; return null; }
const STATUS = { green: 'Within grip', yellow: 'At the limit', red: 'Past the limit: wheelspin' };
const ev = k => R.model.inputs[k]?.evidence;
const est = k => ev(k) === 'estimate';
const ctx = () => { const s = stockV(), v = nowV(); return { s, v, rs: run(s), rm: run(v), rows: gearRows(v), rowsStock: gearRows(s, null) }; };
const family = (() => { const t = R?.title.replace(/^\d{4} /, '') ?? ''; const make = R?.identity.make ?? ''; return t.startsWith(make + ' ') ? t.slice(make.length + 1).split(' ')[0] : t.split(' ')[0]; })();
const shortName = R ? R.title.replace(/ · .*/, '').replace(/^\d{4} /, '') : '';

const CHANGE_TEXT = {
  hp: (v, s) => `Power ${sign((v / s.hp - 1) * 100)}%`, torque: () => null, finalDrive: v => `Axle ratio ${fx(v, 2)}`,
  diameter: v => `Tire ${U('length', v, { digits: 1 })} tall`, redline: v => `Shift at ${fx(v)} rpm`, cda: (v, s) => `Drag ${sign((v / s.cda - 1) * 100)}%`,
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
  try { library = (await (await fetch(href('../data/index.json'))).json()).vehicles; } catch { library = []; }
  return library;
}
const lib = slug => library?.find(x => x.slug === slug);
function labHref(view = 'build', other) {
  const a = setup(), mod = isModified();
  const o = other && lib(other)?.labId;
  const b = o && vehicles[o] ? newSetup(o) : newSetup(id);
  const st = { a, b, aMode: mod ? 'after' : 'before', bMode: 'before', focus: 'a' };
  if (view === 'compare-strip') return new URL('?via=reference' + shareFragment({ ...st, event: 'strip' }, 'compare'), labRoot).href;
  return new URL('?via=reference' + shareFragment(st, view), labRoot).href;
}

// ---------- shared presentation pieces (color = meaning) ----------
const stockNum = (x, d = 2, u = 's') => `<span class="c-stock">${fx(x, d)}${u ? ' ' + u : ''}</span>`;
const modNum = (x, d = 2, u = 's') => `<span class="c-mod">${fx(x, d)}${u ? ' ' + u : ''}</span>`;
const delta = (a, b, d = 2) => { if (!Number.isFinite(a) || !Number.isFinite(b)) return ''; const x = b - a; if (Math.abs(x) < .005) return '<span class="sg-d same">no change</span>'; return `<span class="sg-d ${x < 0 ? 'quicker' : 'slower'}">${sign(x, d)} s ${x < 0 ? 'quicker' : 'slower'}</span>`; };

// ---------- B5 (26 Nov): published road test beside the ESS model, labelled, with an explanation when they differ ----------
// Validation on 17 cars with both figures (Claude, 26 Nov): model ¼ mile typically ~2% slower than the published test,
// 0–60 ~9% slower (launch grip is assumed conservatively). Gaps beyond these bands trigger the explanation, not removal.
const TEST_BAND = { et: .05, t60: .15 };
const testFact = k => (R?.facts ?? []).find(f => f.key === k && typeof f.value === 'number' && f.value > 0);
function roadTest(c) {
  const rs = c.rs ?? c.rm; if (!rs) return null;
  const rows = [['t60', '0–60 mph', 1, rs.magazine.zeroTo60], ['et', '¼ mile', 2, rs.magazine.et]]
    .map(([k, label, d, model]) => ({ k, label, d, model, test: testFact(k) })).filter(r => r.test && Number.isFinite(r.model));
  if (!rows.length) return null;
  const src = rows[0].test.source ?? {};
  const wide = rows.some(r => Math.abs(r.model / r.test.value - 1) > TEST_BAND[r.k]);
  return { rows, src, wide };
}
function roadTestHtml(c, compact = false) {
  const t = roadTest(c); if (!t) return '';
  const pub = esc(t.src.publisher || 'Road test');
  const line = `<b>Published road test</b> (${t.src.url ? `<a href="${esc(t.src.url)}" rel="noopener">${pub}</a>` : pub}): ${t.rows.map(r => `${r.label} ${fx(r.test.value, r.d)} s`).join(' · ')}` +
    ` · <b>ESS model, stock</b>: ${t.rows.map(r => `${r.label} ${fx(r.model, r.d)} s`).join(' · ')}`;
  const why = `<details class="sg-why"><summary>${t.wide ? 'Why are these so different?' : 'How do these compare?'}</summary>
    <p>A road test is one car on one day: its tires, surface, weather, tune, mileage and the driver's launch all show in the number. The ESS model is an ordinary car with the stated tire type and a typical launch, timed the way magazines time it (1-ft rollout).</p>
    <p>Across 17 cars with both figures, the model's quarter mile averaged about 2% slower than the published test and its 0–60 about 9% slower. Most of the gap is at the launch, where the model assumes ordinary grip; the largest gaps were traction-limited cars.</p>
    ${t.wide ? `<p>Gaps this large are common with period tests. Some test cars were not ordinary: the best-documented case is the 1964 GTO that Car and Driver tested, which had been secretly fitted with a larger engine (<a href="https://www.oldcarsweekly.com/features/car-of-the-week-1964-pontiac-gto-red-car" rel="noopener">Old Cars Weekly</a>, <a href="https://hagerty.com/media/?p=5657" rel="noopener">Hagerty</a>). We have no evidence about this particular test car. Treat both numbers as ballpark figures, and the model as a guide to what a typical example and your changes are likely to do.</p>` : ''}
  </details>`;
  return compact ? `<p class="sg-test-line">${line}. <a href="#sg-road-test">Compare</a></p>` : `<div class="sg-test"><p>${line}.</p>${why}</div>`;
}
function modelLine(c) {
  if (!c.rm) return '<p class="sg-empty">The model cannot run this configuration.</p>';
  if (!isModified()) return `<p class="sg-model">ESS model estimate, stock: 0–60 mph ${stockNum(c.rm.magazine.zeroTo60)} · quarter mile ${stockNum(c.rm.magazine.et)}</p>` + roadTestHtml(c);
  return `<p class="sg-model">ESS model: 0–60 mph ${stockNum(c.rs?.magazine.zeroTo60)} → ${modNum(c.rm.magazine.zeroTo60)} ${delta(c.rs?.magazine.zeroTo60, c.rm.magazine.zeroTo60)} · quarter mile ${stockNum(c.rs?.magazine.et)} → ${modNum(c.rm.magazine.et)} ${delta(c.rs?.magazine.et, c.rm.magazine.et)}</p>`;
}
const CAT = { article: ['cat-found', 'Article'], tool: ['cat-data', 'Calculator'], lab: ['cat-test', 'Vehicle Lab'], vehicle: ['cat-notes', 'Vehicle'], plan: ['cat-data', 'Plan'] };
const deeper = links => `<div class="sg-deeper"><div class="section-label">Go deeper</div><ul>${links.map(([kind, url, label, why]) => `<li class="${CAT[kind][0]}"><span class="sg-cat-l">${CAT[kind][1]}</span><a href="${esc(url)}">${esc(label)}</a><span>${esc(why)}</span></li>`).join('')}</ul></div>`;
const qLink = (q, t) => `<a href="#explore" data-sg-q="${q}">${esc(t)}</a>`;
const estTag = k => est(k) ? ' <span class="sg-est">estimate</span>' : '';
function gearChart(rows, sel, stockRows, mini = false) {
  if (!rows.length) return '<p class="sg-empty">Needs gear ratios, axle ratio, tire size and weight split.</p>';
  const showStock = isModified() && stockRows?.length === rows.length;
  return `<div class="sg-gears${mini ? ' mini' : ''}" role="${mini ? 'img' : 'group'}" aria-label="Share of driven-tire grip the drivetrain asks for in each gear${mini ? ': ' + rows.map(r => `${ordinal(r.gear)} ${fx(r.utilization * 100)}%`).join(', ') : ''}">
    <span class="sg-gears-line"><span>${mini ? '' : '100% of grip'}</span></span>${rows.map((r, i) => {
      const h = x => (Math.min(x, 2) / 2 * 100).toFixed(1);
      const inner = `<span class="sg-g-pct">${fx(r.utilization * 100)}%</span>${showStock ? `<span class="sg-g-stock" style="--h:${h(stockRows[i].utilization)}%" title="stock"></span>` : ''}<span class="sg-g-bar s-${r.status}" style="--h:${h(r.utilization)}%"></span><span class="sg-g-n">${ordinal(r.gear)}</span>`;
      return mini ? `<span class="sg-g">${inner}</span>` : `<button type="button" class="sg-g" data-gear="${i}" aria-pressed="${i === sel}" aria-label="${ordinal(r.gear)} gear, ${fx(r.utilization * 100)}% of grip, ${STATUS[r.status].toLowerCase()}">${inner}</button>`;
    }).join('')}</div>${mini ? '' : `<p class="sg-key-line"><span class="s-green">■</span> within grip <span class="s-yellow">■</span> at the limit <span class="s-red">■</span> past it${showStock ? ' · <span class="c-stock">▬</span> stock' : ''}</p>`}`;
}
// Layout schematic in Candidate A's diagram style: stock center of mass as an amber ring, your change as a blue diamond.
function schematic(v, s, compact = false) {
  const W = 640, H = compact ? 200 : 250, ground = H - (compact ? 40 : 52);
  const wb = v.wheelbase, k = (W - 40) / (wb * 1.78), ax0 = 20 + wb * .34 * k, ax1 = ax0 + wb * k;
  const d = (R.tires?.tireRear?.diameter ?? v.diameter) * k, P = (x, y) => `${(ax0 + x * wb * k).toFixed(1)},${(ground - y * k).toFixed(1)}`;
  const body = `M${P(-.34, 9)} L${P(-.35, 20)} Q${P(-.3, 27)} ${P(-.1, 29)} L${P(.3, 31)} Q${P(.38, 33)} ${P(.45, 41)} L${P(.56, 50)} Q${P(.66, 52)} ${P(.86, 51)} L${P(1.04, 41)} Q${P(1.25, 39)} ${P(1.4, 37)} L${P(1.41, 14)} Q${P(1.38, 9)} ${P(1.3, 8)} L${P(-.28, 8)} Z`;
  const mid = R.identity.layout === 'MR', front = !mid && R.identity.layout !== 'RR';
  const eng = mid ? [.62, .9] : front ? [-.06, .3] : [1.02, 1.32];
  const cgX = ax0 + wb * (1 - v.front) * k, cgY = ground - v.cg * k, cgS = ax0 + wb * (1 - s.front) * k, moved = Math.abs(cgX - cgS) > .4;
  const wheel = x => `<circle cx="${x}" cy="${ground - d / 2}" r="${d / 2}" class="gl-tire"/><circle cx="${x}" cy="${ground - d / 2}" r="${d / 2 * .5}" class="sg-rim"/>`;
  const parts = state.parts.map(p => { const x = Math.max(12, Math.min(W - 12, ax0 + (p.newWeight ? p.newX : p.oldX) * k)); return `<g class="sg-mass ${p.newWeight ? 'add' : 'remove'}"><circle cx="${x}" cy="${ground - 30 * k}" r="${compact ? 7 : 9}"/><text x="${x}" y="${ground - 30 * k + 4}" text-anchor="middle">${p.newWeight ? '+' : '−'}</text></g>`; }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="sg-schematic" role="img" aria-label="${esc(`Layout schematic: ${U('length', wb, { digits: 1 })} wheelbase, ${fx(v.front * 100)}% of the weight on the front axle${moved ? ` (stock ${fx(s.front * 100, 1)}%)` : ''}`)}">
    <line x1="0" x2="${W}" y1="${ground}" y2="${ground}" class="gl-park"/><path d="${body}" class="gl-body"/>
    <rect x="${P(eng[0], 0).split(',')[0]}" y="${ground - 38 * k}" width="${(eng[1] - eng[0]) * wb * k}" height="${12 * k}" rx="4" class="sg-engine"/>
    ${compact ? '' : `<text x="${ax0 + (eng[0] + eng[1]) / 2 * wb * k}" y="${ground - 30 * k}" text-anchor="middle" class="gl-lab">ENGINE</text>`}
    ${wheel(ax0)}${wheel(ax1)}
    ${moved ? `<circle cx="${cgS}" cy="${cgY}" r="8" class="sg-cg-stock"/>` : ''}
    <g class="${isModified() ? 'sg-cg-mod' : 'sg-cg-stock-fill'}"><rect x="${cgX - 7}" y="${cgY - 7}" width="14" height="14" transform="rotate(45 ${cgX} ${cgY})"/></g>
    ${compact ? '' : `<text x="${cgX + 14}" y="${cgY - 10}" class="gl-small">center of mass${est('cg') ? ' (height estimated)' : ''}</text>`}
    ${parts}
    <text x="${ax0}" y="${ground + 20}" text-anchor="middle" class="gl-num">${esc(U('weight', v.frontLb))}</text><text x="${ax1}" y="${ground + 20}" text-anchor="middle" class="gl-num">${esc(U('weight', v.rearLb))}</text>
    <text x="${(ax0 + ax1) / 2}" y="${ground + 20}" text-anchor="middle" class="gl-num ${isModified() && moved ? 'c-mod-fill' : ''}">${fx(v.front * 100)} / ${fx(100 - v.front * 100)}${est('front') ? '*' : ''}</text>
    ${compact ? '' : `<text x="${(ax0 + ax1) / 2}" y="${ground + 38}" text-anchor="middle" class="gl-small">front / rear %${est('front') ? ' · *estimated split' : ''}</text>`}</svg>`;
}
function curve(v, mark) {
  const top = v.redline, pts = [];
  for (let rpm = 1000; rpm <= top; rpm += 100) pts.push([rpm, torqueAt(v, rpm), torqueAt(v, rpm) * rpm / 5252]);
  const W = 520, H = 220, maxY = Math.max(...pts.map(p => Math.max(p[1], p[2]))) * 1.15;
  const X = r => 40 + (r - 1000) / (top - 1000) * (W - 56), Y = y => H - 30 - y / maxY * (H - 46);
  const line = i => pts.map((p, j) => `${j ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[i]).toFixed(1)}`).join('');
  const t = torqueAt(v, mark), hp = t * mark / 5252;
  return `<svg viewBox="0 0 ${W} ${H}" class="sg-curve" role="img" aria-label="Estimated torque and power curve from 1,000 to ${fx(top)} rpm; at ${fx(mark)} rpm ${fx(t)} lb-ft and ${fx(hp)} hp">
    ${[1000, 2000, 3000, 4000, 5000, 6000, 7000].filter(r => r <= top).map(r => `<line x1="${X(r)}" x2="${X(r)}" y1="${H - 30}" y2="16" class="sg-grid"/><text x="${X(r)}" y="${H - 12}" text-anchor="middle">${fx(r)}</text>`).join('')}
    <path d="${line(1)}" class="sg-tq"/><path d="${line(2)}" class="sg-hp"/><line x1="${X(mark)}" x2="${X(mark)}" y1="${H - 30}" y2="12" class="sg-mark"/>
    <circle cx="${X(mark)}" cy="${Y(t)}" r="5" class="sg-dot-tq"/><circle cx="${X(mark)}" cy="${Y(hp)}" r="5" class="sg-dot-hp"/>
    <text x="${X(v.torqueRpm)}" y="${Y(v.torque) - 10}" text-anchor="middle" class="sg-lab-tq">torque ${esc(U('torque', v.torque))}</text><text x="${X(v.hpRpm)}" y="${Y(v.hp) + 20}" text-anchor="middle" class="sg-lab-hp">power ${esc(U('power', v.hp))}</text>
    <text x="40" y="11" class="sg-axis-l">engine speed, rpm</text></svg>`;
}
const fact = label => (R.facts ?? []).find(f => f.label === label);
const ALIGN = (() => { const t = String(fact('Factory alignment at curb')?.value ?? ''); const m = re => t.match(re)?.slice(1); return { caster: m(/[Cc]aster ([+−-]?[\d.]+)° (±[\d.]+°)/), camber: m(/camber ([+−-]?[\d.]+)° (±[\d.]+°)/), toe: m(/toe-in ([\d/.]+ in) (±[\d/.]+ in)/) }; })();

// =====================================================================================================================
// REUSABLE ENGINEERING EXPERIENCES. Nothing below names a vehicle; every title, figure and sentence comes from the record.
// =====================================================================================================================
const E = {};
E.power = {
  needs: c => c.v.hp && c.v.torque && c.v.torqueRpm && c.v.hpRpm && c.v.redline,
  score: () => 80,
  title: c => `What do ${fx(c.s.hp)} hp and ${fx(c.s.torque)} lb-ft do in a ${fx(c.s.weight)} lb car?`,
  fig: c => ({ big: fx(c.v.weight / c.v.hp, 1), unit: 'lb/hp', small: 'weight each horsepower moves' }),
  teaser: c => `Peak torque at ${fx(c.v.torqueRpm)} rpm, peak power at ${fx(c.v.hpRpm)}; the weight it has to move sets how that feels.`,
  html() {
    const v = nowV(), rpm = state.rpm ?? v.torqueRpm, pct = state.tune.hp ? Math.round((state.tune.hp / stockV().hp - 1) * 100) : 0;
    // R4 (26 Nov): when the published rating is SAE gross (pre-1972), say why the model uses a lower net figure.
    const pf = (R?.facts ?? []).find(f => f.key === 'power' && typeof f.value === 'number'), tf = (R?.facts ?? []).find(f => f.key === 'torque' && typeof f.value === 'number');
    const gross = pf && pf.standard === 'gross' && Math.abs(pf.value - stockV().hp) > 1;
    const grossNote = gross ? `<p class="sg-note">Published rating: ${fx(pf.value)} hp${tf ? ` and ${fx(tf.value)} lb-ft` : ''} SAE gross. Gross ratings were measured on a bare engine; the model uses an estimated ${fx(stockV().hp)} hp${tf ? ` and ${fx(stockV().torque)} lb-ft` : ''} installed (net), which is why these numbers differ from the specifications above.</p>` : '';
    return `<p class="sg-lede">Torque is the twisting force; horsepower is torque times engine speed: <b>hp = torque × rpm ÷ 5,252</b>. What a driver feels is that force divided by the weight it has to move.</p>${grossNote}
      <figure class="sg-fig" data-curve></figure>
      <label class="sg-ctl"><span>Engine speed <output data-o="rpm">${fx(rpm)} rpm</output></span><input type="range" min="1000" max="${v.redline}" step="100" value="${rpm}" data-in="rpm"></label>
      <p class="sg-formula" data-formula></p>
      <div data-ppw></div>
      <label class="sg-ctl"><span>Try more or less power <output data-o="pct" class="c-mod">${sign(pct)}%</output></span><input type="range" min="-20" max="60" step="5" value="${pct}" data-in="pct"></label>
      <div data-out></div>
      ${deeper([['lab', labHref('build'), 'Swap the engine in the Vehicle Lab', 'Try another engine package on this car.'], ['article', href('../../articles/traction-circle/'), 'Grip is a budget', 'Why extra power first shows up as wheelspin.']])}`;
  },
  bind(b) {
    b.querySelector('[data-in="rpm"]').oninput = e => { state.rpm = +e.target.value; persist(); this.refresh(b); };
    b.querySelector('[data-in="pct"]').oninput = e => { const p = +e.target.value, s = stockV();
      if (!p) { delete state.tune.hp; delete state.tune.torque; } else { const hp = Math.round(s.hp * (1 + p / 100)), tq = Math.round(s.torque * (1 + p / 100)); if (validValue('hp', hp) && validValue('torque', tq)) { state.tune.hp = hp; state.tune.torque = tq; } }
      b.querySelector('[data-o="pct"]').textContent = sign(p) + '%'; state.last = 'power'; update(); };
    this.refresh(b);
  },
  refresh(b) {
    const c = ctx(), v = c.v, rpm = Math.min(state.rpm ?? v.torqueRpm, v.redline), t = torqueAt(v, rpm);
    b.querySelector('[data-curve]').innerHTML = curve(v, rpm) + `<figcaption><span class="sg-k-tq">Torque</span> and <span class="sg-k-hp">power</span> drawn through the published peaks. The curve’s shape between them is an ESS estimate, not a dyno chart${est('redline') ? `, and the ${fx(v.redline)} rpm end point is an estimated shift rpm` : ''}.</figcaption>`;
    b.querySelector('[data-o="rpm"]').textContent = fx(rpm) + ' rpm';
    b.querySelector('[data-formula]').innerHTML = `At <b>${fx(rpm)} rpm</b>: ${esc(U('torque', t))} × ${fx(rpm)} ÷ 5,252 = <b>${esc(U('power', t * rpm / 5252))}</b>`;
    const peers = (library ?? []).filter(x => x.slug !== R.slug && x.runs && x.key?.power && x.key?.weight && x.make === R.identity.make).sort((a, x) => a.year - x.year).slice(0, 4);
    const rows = [{ t: shortName + (isModified() ? ' (yours)' : ''), v: v.weight / v.hp, me: true }, ...peers.map(x => ({ t: x.title.replace(/ · .*/, ''), v: x.key.weight.value / x.key.power.value, slug: x.slug }))];
    const max = Math.max(...rows.map(x => x.v));
    b.querySelector('[data-ppw]').innerHTML = peers.length ? `<h4 class="sg-h4">Pounds per horsepower, lower is quicker</h4><ul class="sg-hbars">${rows.map(x => `<li${x.me ? ' class="me"' : ''}><span>${x.slug ? `<a href="${esc(vehiclePage(x.slug))}">${esc(x.t)}</a>` : esc(x.t)}</span><b>${fx(x.v, 1)}</b><i style="--w:${(x.v / max * 100).toFixed(1)}%"></i></li>`).join('')}</ul><p class="sg-note">Published power and weight; weight definitions differ between sources.</p>` : '';
    const g = c.rs && c.rm ? c.rs.magazine.et - c.rm.magazine.et : 0;
    b.querySelector('[data-out]').innerHTML = (isModified() && v.hp !== c.s.hp ? `<p>${fx(Math.abs(v.hp / c.s.hp - 1) * 100)}% ${v.hp > c.s.hp ? 'more' : 'less'} power changes the modeled quarter mile by <b class="c-mod">${sign(-g, 2)} s</b>. ${c.rows[0]?.status === 'red' ? `1st gear now asks for ${fx(c.rows[0].utilization * 100)}% of the grip: ${qLink('launch', 'see where it turns into wheelspin')}.` : ''}</p>` : '') + modelLine(c);
  },
};
E.launch = {
  needs: c => c.rows.length > 0,
  score: c => 40 + (c.rowsStock[0]?.utilization > 1 ? 35 : 0),
  title: () => 'Can it put the power down?',
  fig: c => c.rows[0] ? { big: fx(c.rows[0].utilization * 100), unit: '%', small: 'of driven-tire grip asked for in 1st', level: c.rows[0].status } : null,
  teaser: c => ({ red: 'At full throttle in 1st, the engine can send more force than the tires can hold.', yellow: 'In 1st it runs right at the edge of what the tires can hold.' })[c.rows[0]?.status] ?? 'The tires can take everything the engine sends, even in 1st.',
  html() {
    return `<p class="sg-lede">A launch is a contest between the force the drivetrain sends to the driven tires and the force those tires can hold. Each bar compares the two in one gear.</p>
      <div class="sg-two"><div data-chart></div><div data-detail></div></div><div data-out></div>
      ${deeper([['article', href('../../articles/traction-circle/'), 'Understanding the traction circle', 'One tire, one grip budget for braking, turning and accelerating.'], ['tool', href('../../tools/load-transfer/'), 'Load transfer calculator', 'How much load moves onto the rear tires as the car accelerates.'], ['lab', labHref('compare-strip'), 'Watch the quarter-mile run', 'See where the launch costs time.']])}`;
  },
  bind(b) { b.addEventListener('click', e => { const g = e.target.closest('[data-gear]'); if (!g) return; state.gear = +g.dataset.gear; persist(); this.refresh(b); }); this.refresh(b); },
  refresh(b) {
    const c = ctx(), sel = Math.min(state.gear, Math.max(0, c.rows.length - 1)), r = c.rows[sel];
    b.querySelector('[data-chart]').innerHTML = gearChart(c.rows, sel, c.rowsStock);
    if (r) b.querySelector('[data-detail]').innerHTML = `<div class="sg-callout s-${r.status}"><p class="sg-callout-h">${ordinal(r.gear)} gear · <b>${STATUS[r.status]}</b></p>
      <p>The drivetrain can send about <b>${esc(U('force', r.demandLb))}</b>; ${state.conditions ? esc(tireClasses[state.conditions.tire].label.toLowerCase()) + 's hold' : `the model’s tire grip (${fx(c.v.grip, 2)}${est('grip') ? ', an estimate' : ''}) holds`} about <b>${esc(U('force', r.availableLb.typical))}</b>.</p>
      <p>${r.status === 'red' ? 'Floor it here and the tires spin; the driver has to feed the power in.' : r.status === 'yellow' ? 'Right at the edge: surface and technique decide it.' : 'The tires can take everything the engine sends.'} This gear runs to about <b>${esc(U('speed', gearSpeed(c.v, r.ratio)))}</b> at ${fx(c.v.redline)} rpm${estTag('redline')}.</p></div>`;
    const s = c.rm, total = s ? Object.values(s.time).reduce((a, x) => a + x, 0) : 0;
    b.querySelector('[data-out]').innerHTML = (s ? `<h4 class="sg-h4">Where the modeled quarter mile goes</h4><ul class="sg-hbars split">${[['traction', 'Waiting on tire grip'], ['engine', 'Limited by engine power'], ['clutch', 'Clutch slip at launch'], ['shifting', 'Shifting']].filter(([k2]) => s.time[k2] > .005).map(([k2, l]) => `<li><span>${l}</span><b>${fx(s.time[k2], 2)} s</b><i style="--w:${(s.time[k2] / total * 100).toFixed(1)}%"></i></li>`).join('')}</ul>
      <p>${s.time.traction > .5 ? `Grip limits only the start; after that, engine power sets the pace. ${qLink('tires', 'What do stickier tires buy back?')}` : 'Engine power, not grip, sets the pace almost all the way.'}</p>` : '') + modelLine(c);
  },
};
const TIRE_ORDER = ['perf80s', 'allSeason', 'maxSummer', 'extremeSummer', 'track200', 'dragRadial', 'radial70s', 'bias'];
E.tires = {
  needs: c => c.rows.length > 0,
  score: c => 30 + (c.rowsStock[0]?.utilization > 1 ? 25 : 0) + (est('grip') ? 5 : 0),
  title: () => 'What would stickier tires do?',
  runs() { const def = matchedDefault(); return TIRE_ORDER.map(k => { const v = resolve(setupWith({ conditions: { tire: k } }), true); const m = run(v); const g = byGear(v, { tire: k })[0]; return { id: k, et: m?.magazine.et, g: g?.utilization, st: g?.status, isDefault: k === def }; }); },
  best() { const rs = this.runs().filter(x => Number.isFinite(x.et)); if (!rs.length) return null; const min = Math.min(...rs.map(x => x.et)); return rs.find(x => x.et - min < .01); },
  fig() { const l = this.runs(), b = l.find(x => x.isDefault) ?? l[0], best = this.best(); return best && b ? { big: sign(best.et - b.et, 2), unit: 's', small: 'quarter mile with the best street tire (model)' } : null; },
  teaser() { const b = this.best(); return b ? `Better tires help until about ${tireClasses[b.id].label.toLowerCase()}; past that, the engine is the limit.` : 'Every tire class through the same model.'; },
  html() {
    return `<p class="sg-lede">Same car, same engine, a different tire. Grip limits the start; once the tires can hold everything the engine sends, stickier tires stop paying off in a straight line.</p>
      <div data-list></div>
      <h4 class="sg-h4">A different size</h4><p class="sg-note">${R.tires?.tireRear ? `Published size ${esc(R.tires.tireRear.size)}.` : `No tire size is on record for this configuration; the model uses an estimated ${esc(U('length', stockV().diameter, { digits: 1 }))} diameter.`} A size change acts like an axle-ratio change; it says nothing about fitment, clearance or load rating.</p>
      <div class="sg-inline"><input type="text" aria-label="Tire size" placeholder="225/55R16" value="${esc(state.altTire)}" data-in="size" autocomplete="off" spellcheck="false">${['225/55R16', '245/45R17', '275/40R17'].map(x => `<button type="button" class="sg-chip" data-size="${x}">${x}</button>`).join('')}</div>
      <div data-alt aria-live="polite"></div>
      ${deeper([['article', href('../../articles/traction-circle/#tire-revolution'), 'The tire revolution nobody talks about', 'From Understanding the Traction Circle: how tire compounds have grown the grip budget.'], ['lab', labHref('performance'), 'Every tire class, gear by gear', 'In the Vehicle Lab with this configuration.']])}`;
  },
  bind(b) {
    b.addEventListener('click', e => { const t = e.target.closest('[data-tire]'); if (!t) return; state.conditions = t.dataset.tire === matchedDefault() ? null : { tire: t.dataset.tire }; state.last = 'tire'; update(state.conditions ? `${tireClasses[t.dataset.tire].label} applied.` : 'Back to the stock tire assumption.'); });
    const inp = b.querySelector('[data-in="size"]'); inp.oninput = () => { state.altTire = inp.value; this.alt(b); };
    for (const x of b.querySelectorAll('[data-size]')) x.onclick = () => { inp.value = state.altTire = x.dataset.size; this.alt(b); };
    this.refresh(b);
  },
  alt(b) {
    const s = stockV(), t = parseTire(state.altTire), el = b.querySelector('[data-alt]');
    if (!state.altTire) { el.innerHTML = ''; return; } if (!t) { el.innerHTML = '<p class="sg-empty">Enter a size like 245/45R17.</p>'; return; }
    const ratio = t.diameter / s.diameter;
    el.innerHTML = `<dl class="sg-read"><div><dt>Diameter</dt><dd class="c-mod">${esc(U('length', t.diameter, { digits: 1 }))}<small>${sign((ratio - 1) * 100, 1)}% vs ${esc(U('length', s.diameter, { digits: 1 }))}${estTag('diameter')}</small></dd></div><div><dt>Acts like an axle ratio of</dt><dd class="c-mod">${fx(s.finalDrive / ratio, 2)}<small>stock ${fx(s.finalDrive, 2)}</small></dd></div><div><dt>Speedometer at a true ${esc(U('speed', 60))}</dt><dd>${esc(U('speed', 60 / ratio, { digits: 1 }))}</dd></div></dl>
      <p><button type="button" class="btn-small primary" data-apply>Use this diameter in the experiment</button></p>`;
    el.querySelector('[data-apply]').onclick = () => { if (!validValue('diameter', t.diameter)) return say('That diameter is outside the model range.'); state.tune.diameter = t.diameter; state.last = 'diameter'; update('Tire diameter applied.'); };
  },
  refresh(b) {
    const list = this.runs(), base = list.find(x => x.isDefault) ?? list[0], cur = state.conditions?.tire ?? matchedDefault();
    const ets = list.map(x => x.et).filter(Number.isFinite), lo = Math.min(...ets) - .3, hi = Math.max(...ets) + .1;
    b.querySelector('[data-list]').innerHTML = `<ul class="sg-tires">${list.map(x => `<li><button type="button" data-tire="${x.id}" aria-pressed="${x.id === cur}" class="${x.isDefault ? 'is-stock' : ''}">
      <span class="sg-t-name">${esc(tireClasses[x.id].label)}${x.isDefault ? ' <small class="c-stock">stock assumption</small>' : ''}</span>
      <span class="sg-t-bar"><i style="--w:${Number.isFinite(x.et) ? ((hi - x.et) / (hi - lo) * 100).toFixed(1) : 0}%"></i></span>
      <span class="sg-t-et">${fx(x.et, 2)} s${base && !x.isDefault ? ` <small class="${x.et < base.et ? 'sg-d quicker' : 'sg-d slower'}">${sign(x.et - base.et, 2)}</small>` : ''}</span>
      <span class="sg-t-g s-${x.st}">${x.g ? fx(x.g * 100) + '% in 1st' : ''}</span></button></li>`).join('')}</ul>
      <p class="sg-note">ESS model quarter mile with each tire class, everything else as configured; a longer bar is quicker. Tire-class grip is a typical value with a range.</p>`;
    this.alt(b);
  },
};
function matchedDefault() { const g = stockV().grip; let best = null, d = 9; for (const k of TIRE_ORDER) { const m = tireClasses[k].longitudinal?.typical; if (Number.isFinite(m) && Math.abs(m - g) < d) { d = Math.abs(m - g); best = k; } } return best; }
const AXLES = [2.73, 3.08, 3.27, 3.55, 3.73, 4.10];
E.gearing = {
  needs: c => c.v.gears?.length > 1 && c.v.finalDrive,
  score: c => 35 + (est('finalDrive') ? 15 : 0) + (rpmAt(c.s, 70, c.s.gears.length - 1) < c.s.torqueRpm * .7 ? 10 : 0),
  title: () => 'What would different axle gears do?',
  fig: c => ({ big: fx(Math.round(rpmAt(c.v, 70, c.v.gears.length - 1) / 10) * 10), unit: 'rpm', small: `at ${U('speed', 70)} in top gear` }),
  teaser: c => `${c.v.gears.length} speeds${c.v.gears.at(-1) < 1 ? ` with a ${fx(c.v.gears.at(-1), 2)} overdrive` : ''} and a ${fx(c.v.finalDrive, 2)} axle${est('finalDrive') ? ' (ratio not confirmed for this car)' : ''}.`,
  ratios() { const s = stockV(); return [...new Set([...AXLES, s.finalDrive].map(x => +x.toFixed(2)))].filter(x => validValue('finalDrive', x)).sort((a, b) => a - b); },
  html() {
    const s = stockV(), fd = state.tune.finalDrive ?? s.finalDrive, rl = state.tune.redline ?? s.redline;
    return `<p class="sg-lede">The axle ratio multiplies the force at the rear tires in every gear and divides the road speed each gear can reach. Shorter (numerically higher) gears pull harder but rev higher and may need an extra shift.</p>
      ${est('finalDrive') ? `<p class="note sg-note-box">The axle ratio for this exact car is not on record. The model assumes <b class="c-stock">${fx(s.finalDrive, 2)}</b> (${esc(R.model.inputs.finalDrive.basis ?? 'estimate')}).</p>` : ''}
      <div class="sg-ctl"><span>Axle ratio</span><div class="sg-chips">${this.ratios().map(o => `<button type="button" data-fd="${o}" aria-pressed="${o === fd}" class="${o === s.finalDrive ? 'is-stock' : ''}">${fx(o, 2)}${o === s.finalDrive ? ' · stock' : ''}</button>`).join('')}</div></div>
      <div data-ladder></div>
      <label class="sg-ctl"><span>Shift rpm <output data-o="rl" class="${state.tune.redline ? 'c-mod' : 'c-stock'}">${fx(rl)}</output>${estTag('redline')}</span><input type="range" min="${Math.max(3000, Math.round(s.hpRpm / 100) * 100)}" max="${Math.min(7500, Math.round(s.hpRpm * 1.6 / 100) * 100)}" step="100" value="${rl}" data-in="rl"></label>
      <div data-out></div>
      ${deeper([['lab', labHref('performance'), 'Gearing and grip in the Vehicle Lab', 'Each gear against the tires, with this configuration.'], ['plan', href('../../plan/'), 'Plan your build', 'Turn a goal into changes you can test.']])}`;
  },
  bind(b) {
    for (const x of b.querySelectorAll('[data-fd]')) x.onclick = () => { const s = stockV(), r = +x.dataset.fd; if (Math.abs(r - s.finalDrive) < .005) delete state.tune.finalDrive; else state.tune.finalDrive = r; state.last = 'finalDrive';
      for (const y of b.querySelectorAll('[data-fd]')) y.setAttribute('aria-pressed', String(y === x)); update(`Axle ratio ${fx(r, 2)} applied.`); };
    b.querySelector('[data-in="rl"]').oninput = e => { const s = stockV(), x = +e.target.value; if (x === s.redline) delete state.tune.redline; else if (validValue('redline', x)) state.tune.redline = x;
      const o = b.querySelector('[data-o="rl"]'); o.textContent = fx(x); o.className = state.tune.redline ? 'c-mod' : 'c-stock'; state.last = 'redline'; update(); };
    this.refresh(b);
  },
  refresh(b) {
    const c = ctx(), v = c.v, s = c.s, top = topSpeed(v), sp = v.gears.map(g => gearSpeed(v, g)), sps = s.gears.map(g => gearSpeed(s, g)), max = Math.max(...sp, ...sps, top ?? 0) * 1.05, changed = isModified() && (v.finalDrive !== s.finalDrive || v.redline !== s.redline || v.diameter !== s.diameter);
    b.querySelector('[data-ladder]').innerHTML = `<figure class="sg-ladder"><ol>${sp.map((x, i) => `<li><span>${ordinal(i + 1)} <small>${fx(v.gears[i], 2)}</small></span><span class="sg-l-track"><i class="${changed ? 'mod' : 'stock'}" style="--w:${(x / max * 100).toFixed(1)}%"></i>${changed ? `<em class="sg-l-was" style="--w:${(sps[i] / max * 100).toFixed(1)}%" title="stock"></em>` : ''}</span><b class="${changed ? 'c-mod' : ''}">${esc(U('speed', x))}</b></li>`).join('')}</ol>
      ${top ? `<span class="sg-l-limit" style="--x:${(top / max * 100).toFixed(1)}"><span>drag limit ≈ ${esc(U('speed', top))}</span></span>` : ''}
      <figcaption>Road speed at ${fx(v.redline)} rpm in each gear${changed ? '; the amber tick is stock' : ''}. The dashed line is the power-limited top speed (ESS estimate).</figcaption></figure>`;
    const rows = this.ratios().map(r => { const m = run(resolve(setupWith({ tune: { finalDrive: r } }), true)); return { r, et: m?.magazine.et, shift: m?.time.shifting }; });
    const stockRow = rows.find(x => Math.abs(x.r - s.finalDrive) < .005), best = rows.filter(x => Number.isFinite(x.et)).reduce((a, x) => (!a || x.et < a.et ? x : a), null);
    const rpm70 = rpmAt(v, 70, v.gears.length - 1);
    const lo = Math.min(...rows.map(x => x.et)), hi = Math.max(...rows.map(x => x.et));
    b.querySelector('[data-out]').innerHTML = `<p>At ${esc(U('speed', 70))} in top gear the engine turns <b class="${v.finalDrive !== s.finalDrive ? 'c-mod' : ''}">${fx(rpm70)} rpm</b>${v.finalDrive !== s.finalDrive ? ` (stock <span class="c-stock">${fx(rpmAt(s, 70, s.gears.length - 1))}</span>)` : ''}; peak torque is at ${fx(v.torqueRpm)}. ${rpm70 < v.torqueRpm * .7 ? 'That is far below the torque peak: relaxed cruising, but passing in top gear needs a downshift.' : ''}</p>
      <h4 class="sg-h4">Modeled quarter mile with each axle ratio, shifting at ${fx(v.redline)} rpm</h4>
      <ul class="sg-ratios">${rows.map(x => `<li class="${Math.abs(x.r - v.finalDrive) < .005 ? 'on' : ''} ${Math.abs(x.r - s.finalDrive) < .005 ? 'is-stock' : ''}"><span>${fx(x.r, 2)}</span><b>${fx(x.et, 2)} s</b><i style="--w:${hi > lo ? ((hi - x.et) / (hi - lo) * 85 + 15).toFixed(0) : 50}%"></i><small>${fx(x.shift, 2)} s shifting</small></li>`).join('')}</ul>
      ${best && stockRow ? `<p>${Math.abs(best.r - s.finalDrive) < .005 ? `In the model, the ${fx(s.finalDrive, 2)} ratio is already quickest at this shift point. Shorter gears add force but ${rows.at(-1).shift > stockRow.shift ? `need another shift before the finish (shift time ${fx(stockRow.shift, 2)} → ${fx(rows.at(-1).shift, 2)} s)` : 'run out of grip in 1st'}, ${c.rowsStock[0]?.utilization > 1 ? 'and the stock tires already spin in 1st' : ''}.` : `In the model, ${fx(best.r, 2)} is quickest, ${fx((stockRow.et ?? best.et) - best.et, 2)} s ahead of ${fx(s.finalDrive, 2)}.`}</p>
      ${est('redline') || est('finalDrive') ? `<p class="sg-note">This answer depends on figures that are estimates here: ${[est('redline') && 'the shift rpm', est('finalDrive') && 'the stock axle ratio', 'the torque curve above the power peak'].filter(Boolean).join(', ')}. Try a different shift rpm above, and combine gears with ${qLink('tires', 'stickier tires')} to see how the answer changes.</p>` : ''}` : ''}${modelLine(c)}`;
  },
};
E.balance = {
  needs: c => c.v.front && c.v.wheelbase,
  score: c => 30 + (est('front') ? 15 : 0) + (Math.abs(c.s.front - .5) > .06 ? 10 : 0),
  title: c => R.identity.layout === 'MR' ? 'Why put the engine behind the driver?' : Math.abs(c.s.front - .5) > .06 ? 'Why so nose-heavy, and does it matter?' : 'Where does the weight sit?',
  fig: c => ({ big: fx(c.v.front * 100), unit: `%${est('front') ? '*' : ''}`, small: `on the front axle${est('front') ? ' (estimate)' : ''}` }),
  teaser: c => `${fx(100 - c.v.front * 100)}% of the weight presses on the ${c.v.drivetrain === 'FWD' ? 'front' : 'rear'} tires that drive it${est('front') ? '; the split is an estimate until someone weighs one' : ''}.`,
  html() {
    const wb = stockV().wheelbase, fr = R.identity.layout !== 'MR' && R.identity.layout !== 'RR';
    const spots = [['Front bumper', -Math.round(wb * .3)], ['Engine bay', Math.round(wb * (fr ? .05 : .75))], ['Front seats', Math.round(wb * .45)], ['Rear axle', Math.round(wb)], ['Trunk', Math.round(wb * 1.25)]];
    return `<p class="sg-lede">A rear-drive car can only push with the grip its rear tires have, and that grows with the load on them. Where the weight sits decides how much the driven tires carry before the car moves.</p>
      ${est('front') ? `<p class="note sg-note-box">This car’s front/rear split is not on record; the model uses <b class="c-stock">${fx(stockV().front * 100)}%</b> front, ${esc(R.model.inputs.front.basis ?? 'an estimate')}. Corner-weighing a real car replaces it.</p>` : ''}
      <div data-scale></div>
      <div class="sg-ctl"><span>Try a common change</span><div class="sg-chips">${fr ? '<button type="button" class="sg-chip" data-preset="battery">Battery to the trunk <small>assumes 45 lb</small></button>' : ''}<button type="button" class="sg-chip" data-preset="driver">Add a 180 lb driver</button><button type="button" class="sg-chip" data-preset="nose">Remove 50 lb from the nose</button></div></div>
      <div class="sg-ctl"><span>Or add weight</span><div class="sg-chips">${spots.map(([n, x]) => `<button type="button" class="sg-chip" data-at="${x}" data-name="${esc(n)}">+${esc(U('weight', 100))} at ${esc(n.toLowerCase())}</button>`).join('')}</div></div>
      <div data-out></div>
      ${deeper([['tool', href('../../tools/scale-delta/'), 'Part weight from corner scales', 'Weigh your own car and parts.'], ['tool', href('../../tools/cg-builder/'), 'Balance & CG builder', 'Move parts and see the balance change.'], ['article', href('../../articles/weight-distribution-50-50/'), 'What 50/50 really means', 'Why the percentage alone does not say where the mass sits.']])}`;
  },
  bind(b) {
    const wb = stockV().wheelbase, push = p => { if (state.parts.length >= 8) return say('Up to eight weight changes per experiment.'); state.parts.push(p); state.last = 'weight'; update(p.label + '.'); };
    const P = { battery: { label: 'Move 45 lb battery from the front to the trunk', oldWeight: 45, oldX: -Math.round(wb * .22), newWeight: 45, newX: Math.round(wb * 1.25) },
      driver: { label: 'Add a 180 lb driver', oldWeight: 0, oldX: Math.round(wb * .45), newWeight: 180, newX: Math.round(wb * .45) },
      nose: { label: 'Remove 50 lb from the nose', oldWeight: 50, oldX: -Math.round(wb * .3), newWeight: 0, newX: -Math.round(wb * .3) } };
    for (const x of b.querySelectorAll('[data-preset]')) x.onclick = () => push({ ...P[x.dataset.preset] });
    for (const x of b.querySelectorAll('[data-at]')) x.onclick = () => push({ label: `Add 100 lb at ${x.dataset.name.toLowerCase()}`, oldWeight: 0, oldX: +x.dataset.at, newWeight: 100, newX: +x.dataset.at });
    this.refresh(b);
  },
  refresh(b) {
    const c = ctx(), v = c.v, s = c.s, f = v.front * 100, moved = Math.abs(v.front - s.front) > .0005;
    b.querySelector('[data-scale]').innerHTML = `<figure class="sg-scale"><div class="sg-scale-bar" role="img" aria-label="${fx(f, 1)}% front, ${fx(100 - f, 1)}% rear"><span class="sg-sc-f ${moved ? 'mod' : 'stock'}" style="--w:${f.toFixed(1)}%">Front ${fx(f, 1)}%<small>${esc(U('weight', v.frontLb))}</small></span><span class="sg-sc-r">Rear ${fx(100 - f, 1)}%<small>${esc(U('weight', v.rearLb))}</small></span></div>
      <span class="sg-sc-mid" aria-hidden="true"></span>${moved ? `<span class="sg-sc-was" style="--x:${(s.front * 100).toFixed(1)}%" title="stock"></span>` : ''}
      <figcaption>Static axle loads, ${esc(U('weight', v.weight))}${moved ? ` · <span class="c-stock">stock ${fx(s.front * 100, 1)}% front</span>` : ''}.</figcaption></figure>`;
    b.querySelector('[data-out]').innerHTML = `<dl class="sg-read"><div><dt>Grip the rear can hold at launch</dt><dd class="${moved ? 'c-mod' : ''}">${c.rows[0] ? esc(U('force', c.rows[0].availableLb.typical)) : '—'}${moved && c.rowsStock[0] ? `<small class="c-stock">stock ${esc(U('force', c.rowsStock[0].availableLb.typical))}</small>` : ''}</dd></div>
      <div><dt>1st gear grip use</dt><dd class="s-${c.rows[0]?.status}">${c.rows[0] ? fx(c.rows[0].utilization * 100) + '%' : '—'}<small>${c.rows[0] ? STATUS[c.rows[0].status] : ''}</small></dd></div></dl>
      <p>Moving weight rearward adds load on the driven tires; adding weight anywhere also adds mass to accelerate. The model weighs both.</p>${modelLine(c)}`;
  },
};
E.chassis = {
  needs: () => !!(ALIGN.camber || ALIGN.caster || ALIGN.toe),
  score: () => 25,
  title: () => 'What did the factory specify for the chassis?',
  fig: () => ALIGN.camber ? { big: ALIGN.camber[0] + '°', unit: '', small: 'factory camber' } : null,
  teaser: () => 'Alignment and wheel travel as published, and what each one does.',
  html: () => `<p class="sg-lede">Factory alignment figures as published for this car: historical settings, not a setup recommendation for a modified car.</p><dl class="sg-read">${ALIGN.camber ? `<div><dt>Camber</dt><dd>${esc(ALIGN.camber[0])}°<small>tolerance ${esc(ALIGN.camber[1])}</small></dd></div>` : ''}${ALIGN.caster ? `<div><dt>Caster</dt><dd>${esc(ALIGN.caster[0])}°<small>tolerance ${esc(ALIGN.caster[1])}</small></dd></div>` : ''}${ALIGN.toe ? `<div><dt>Toe-in</dt><dd>${esc(ALIGN.toe[0])}<small>tolerance ${esc(ALIGN.toe[1])}</small></dd></div>` : ''}</dl>`,
  bind() {}, refresh() {},
};
// Which change first? A greedy, model-run ranking of common first modifications: reusable for any runnable car.
const CANDIDATES = c => {
  const s = c.s, fr = R.identity.layout !== 'MR' && R.identity.layout !== 'RR', list = [];
  const curTire = state.conditions?.tire ?? matchedDefault(), better = ['maxSummer', 'extremeSummer', 'track200', 'dragRadial', 'slick'];
  const tire = better.includes(curTire) ? null : 'maxSummer';
  if (tire) list.push({ key: 'tire', label: `Stickier tires (${tireClasses[tire].label.toLowerCase()})`, apply: st => ({ ...st, conditions: { tire } }) });
  const ax = AXLES.find(x => x > (state.tune.finalDrive ?? s.finalDrive) * 1.15 && validValue('finalDrive', x));
  if (ax) list.push({ key: 'gears', label: `${fx(ax, 2)} axle gears`, apply: st => ({ ...st, tune: { ...st.tune, finalDrive: ax } }) });
  list.push({ key: 'power', label: 'About 10% more power (intake, exhaust, tuning)', apply: st => ({ ...st, tune: { ...st.tune, hp: Math.round((st.tune.hp ?? s.hp) * 1.1), torque: Math.round((st.tune.torque ?? s.torque) * 1.1) } }) });
  list.push({ key: 'weight', label: 'Remove 100 lb from the cabin', apply: st => ({ ...st, parts: [...st.parts, { label: 'Remove 100 lb from the cabin', oldWeight: 100, oldX: Math.round(s.wheelbase * .5), newWeight: 0, newX: Math.round(s.wheelbase * .5) }] }) });
  if (fr) list.push({ key: 'battery', label: 'Battery to the trunk (45 lb assumed)', apply: st => ({ ...st, parts: [...st.parts, { label: 'Move 45 lb battery from the front to the trunk', oldWeight: 45, oldX: -Math.round(s.wheelbase * .22), newWeight: 45, newX: Math.round(s.wheelbase * 1.25) }] }) });
  return list;
};
E.plan = {
  needs: c => !!c.rm,
  score: () => 0, position: 'end',
  title: () => 'Which change should come first?',
  plan() {
    const c = ctx(); let cur = { tune: { ...state.tune }, parts: state.parts.map(p => ({ ...p })), conditions: state.conditions }, base = c.rm.magazine.et;
    const steps = [], pool = CANDIDATES(c);
    const etOf = st => run(resolve({ ...newSetup(id), tune: st.tune, parts: st.parts, ...(st.conditions ? { conditions: st.conditions } : {}) }, true))?.magazine.et;
    const alone = pool.map(m => ({ ...m, alone: base - etOf(m.apply(cur)) }));
    while (pool.length) {
      const tried = pool.map(m => ({ m, et: etOf(m.apply(cur)) })).filter(x => Number.isFinite(x.et)).sort((a, b) => a.et - b.et)[0];
      if (!tried || base - tried.et < .005) break;
      steps.push({ ...tried.m, gain: base - tried.et, total: c.rm.magazine.et - tried.et, et: tried.et, alone: alone.find(a => a.key === tried.m.key)?.alone });
      cur = tried.m.apply(cur); base = tried.et; pool.splice(pool.indexOf(tried.m), 1);
    }
    const none = alone.filter(a => !steps.some(st => st.key === a.key));
    return { steps, none, start: c.rm.magazine.et, final: cur };
  },
  fig() { const p = this.plan(); return p.steps.length ? { big: sign(-p.steps.at(-1).total, 2), unit: 's', small: `with ${p.steps.length} common changes (model)` } : null; },
  teaser() { const p = this.plan(); return p.steps[0] ? `In the model, ${p.steps[0].label.toLowerCase()} pays off most; then ${p.steps.slice(1).map(x => x.label.split(' (')[0].toLowerCase()).join(', ') || 'little else'}.` : 'A model-run order for common first changes.'; },
  html: () => `<p class="sg-lede">Common first changes, run through the same model one at a time and in the order that pays off most for <i>this</i> car${isModified() ? ' as you have configured it' : ''}. Each step is tested on top of the ones before it, because changes interact: grip, gearing and power limit each other.</p>
    <div data-plan></div>
    <p class="sg-note">Straight-line acceleration only. The ranking says nothing about cost, handling, reliability or legality, and it inherits every estimate this car’s model uses.</p>
    ${deeper([['plan', href('../../plan/'), 'Plan your build', 'Start from a goal (grip, turn-in, ride, weight) and get steps you can test.'], ['lab', labHref('build'), 'Build it in the Vehicle Lab', 'Enter real part weights, positions and power figures.']])}`,
  bind(b) { b.addEventListener('click', e => { const a = e.target.closest('[data-apply-plan]'); if (!a) return; const p = this.plan(); state.tune = p.final.tune; state.parts = p.final.parts; state.conditions = p.final.conditions; state.last = 'plan'; update('Plan applied. Every step is listed in “Your changes” and can be undone.'); }); this.refresh(b); },
  refresh(b) {
    const p = this.plan(), max = Math.max(.01, ...p.steps.map(s => s.total));
    b.querySelector('[data-plan]').innerHTML = p.steps.length ? `<ol class="sg-plan">${p.steps.map((s, i) => `<li><div class="sg-plan-h"><b>${esc(s.label)}</b><span class="c-mod">${sign(-s.gain, 2)} s</span></div><div class="sg-plan-bar"><i style="--w:${(s.total / max * 100).toFixed(1)}%"></i></div><small>Running total ${sign(-s.total, 2)} s → quarter mile <b class="c-mod">${fx(s.et, 2)} s</b>${Number.isFinite(s.alone) && Math.abs(s.alone - s.gain) > .02 ? ` · on its own ${sign(-s.alone, 2)} s` : ''}</small></li>`).join('')}</ol>
      ${p.none.length ? `<p class="sg-note">No modeled gain at this point: ${p.none.map(n => esc(n.label.split(' (')[0].toLowerCase()) + (n.alone < -.005 ? ` (${sign(-n.alone, 2)} s alone)` : '')).join('; ')}.</p>` : ''}
      <p>Starting from <span class="${isModified() ? 'c-mod' : 'c-stock'}">${fx(p.start, 2)} s</span>${isModified() ? ' (your current configuration)' : ' (stock)'}. <button type="button" class="btn-small primary" data-apply-plan>Apply this plan</button></p>`
      : '<p>None of the common first changes improves this configuration in the model.</p>';
  },
};
E.compare = {
  needs: () => true, score: () => 0, position: 'last',
  picks() { const fam = (library ?? []).filter(x => x.slug !== R.slug && x.runs && x.title.includes(family) && x.make === R.identity.make).sort((a, b) => a.year - b.year);
    const newer = fam.filter(x => x.year > R.identity.year), older = fam.filter(x => x.year < R.identity.year);
    return [newer[0], newer.at(-1), older.at(-1)].filter((x, i, a) => x && a.indexOf(x) === i).slice(0, 2).map(x => x.slug); },
  title: () => `How does it compare with other ${family}s?`,
  fig() { const p = this.picks().map(lib).filter(Boolean); return p.length ? { big: String(p.length + 1), unit: 'cars', small: p.map(x => x.year).join(' & ') + ' alongside' } : null; },
  teaser() { const p = this.picks().map(lib).filter(Boolean); return p.length ? `Side by side with the ${p.map(x => x.title.replace(/ · .*/, '')).join(' and the ')}.` : 'Side by side with related cars.'; },
  html: () => `<p class="sg-lede">Published numbers side by side, with the ESS model run on each${isModified() ? '; this car’s model row includes your changes' : ''}.</p><div data-cmp></div>`,
  bind(b) { this.refresh(b); },
  async refresh(b) {
    const root = b.querySelector('[data-cmp]'); const L = await loadLibrary(); if (!L.length) { root.innerHTML = `<p><a href="${esc(href('../compare/?a=' + R.slug))}">Open the comparison</a></p>`; return; }
    if (!state.compare) state.compare = this.picks();
    const cars = [lib(R.slug), ...state.compare.map(lib).filter(Boolean)];
    const model = cars.map(x => { const m = x.labId && vehicles[x.labId] && x.runs ? run(x.slug === R.slug ? nowV() : resolve(newSetup(x.labId), false)) : null; return m?.magazine ?? null; });
    const rows = [['Power', x => x.key.power, o => U('power', o.value)], ['Torque', x => x.key.torque, o => U('torque', o.value)], ['Weight', x => x.key.weight, o => U('weight', o.value) + (o.basis ? ` <small>${esc(o.basis)}</small>` : '')],
      ['Weight per hp', x => x.key.weightPerHp, o => fx(o.value, 1) + ' lb/hp'], ['Transmission', x => x.key.transmission, o => esc(o.value)], ['Quarter mile (test)', x => x.key.et, o => fx(o.value, 1) + ' s']];
    // Suggestions (owner review 26 Nov: compare selection was cumbersome): same family, the record's own comparisons, and the
    // nearest cars by weight per horsepower; plus a search over every car the model can run. Up to three cars alongside.
    const ppw = x => x.key?.weightPerHp?.value ?? (x.key?.weight?.value && x.key?.power?.value ? x.key.weight.value / x.key.power.value : null);
    const mine = ppw(lib(R.slug)) ?? (R.model?.inputs?.weight?.value && R.key?.power?.value ? R.model.inputs.weight.value / R.key.power.value : null);
    const near = mine ? L.filter(x => x.slug !== R.slug && x.runs && ppw(x)).sort((a, b) => Math.abs(ppw(a) - mine) - Math.abs(ppw(b) - mine)).slice(0, 4) : [];
    const free = x => x.slug !== R.slug && !state.compare.includes(x.slug);
    const fam = L.filter(x => x.runs && x.title.includes(family)).concat((R.compareWith ?? []).map(lib).filter(Boolean)).filter((x, i, a) => x && free(x) && a.indexOf(x) === i).slice(0, 5);
    const pw = near.filter(x => free(x) && !fam.includes(x)).slice(0, 3);
    const MAX = 3, room = state.compare.length < MAX;
    const chip = (x, why) => `<button type="button" class="sg-chip" data-add="${esc(x.slug)}">+ ${esc(x.title.replace(/ · .*/, ''))}${why ? ` <small>${esc(why)}</small>` : ''}</button>`;
    const pool = L.filter(x => x.runs && free(x));
    root.innerHTML = `<div class="table-wrap"><table class="data sg-cmp"><thead><tr><th></th>${cars.map((x, i) => `<th scope="col">${i ? `<a href="${esc(vehiclePage(x.slug))}">${esc(x.title.replace(/ · .*/, ''))}</a> <button type="button" class="sg-x" data-rm="${esc(x.slug)}" aria-label="Remove ${esc(x.title)}">×</button>` : esc(x.title.replace(/ · .*/, ''))}</th>`).join('')}</tr></thead><tbody>
      ${rows.filter(r => cars.some(x => r[1](x))).map(r => `<tr><th scope="row">${r[0]}</th>${cars.map(x => { const o = r[1](x); return `<td>${o && o.value != null ? r[2](o) : '<span class="sg-missing-v">not on record</span>'}</td>`; }).join('')}</tr>`).join('')}
      <tr class="sg-model-row"><th scope="row">ESS model, quarter mile</th>${model.map((m, i) => `<td class="${i === 0 && isModified() ? 'c-mod' : ''}">${m ? fx(m.et, 2) + ' s' : '<small>not modeled</small>'}</td>`).join('')}</tr></tbody></table></div>
      ${room ? `<div class="sg-add-panel"><p class="sg-h4">Add a car <small>(up to ${MAX} alongside)</small></p>
        ${fam.length ? `<div class="sg-chips sg-add" aria-label="Related cars">${fam.map(x => chip(x)).join('')}</div>` : ''}
        ${pw.length ? `<div class="sg-chips sg-add" aria-label="Similar power to weight">${pw.map(x => chip(x, fx(ppw(x), 1) + ' lb/hp')).join('')}</div>` : ''}
        <label class="sg-find"><span>Or find any car</span><input type="search" list="sg-cmp-list" data-find placeholder="Type a make or model" autocomplete="off"></label>
        <datalist id="sg-cmp-list">${pool.map(x => `<option value="${esc(x.title)}"></option>`).join('')}</datalist></div>`
        : `<p class="sg-note">Remove a car (×) to add another.</p>`}
      ${cars.length > 1 && model.slice(0, 3).every(Boolean) ? `<p><a class="btn-small primary sg-a" href="${esc(this.lab(cars.slice(0, 3)))}">Race ${cars.length > 3 ? 'the first three' : 'them'} in the Vehicle Lab</a></p>` : ''}`;
    const find = root.querySelector('[data-find]');
    if (find) find.onchange = () => { const x = pool.find(c => c.title === find.value.trim()); if (x && state.compare.length < MAX && !state.compare.includes(x.slug)) { state.compare.push(x.slug); persist(); this.refresh(b); } };
    for (const x of root.querySelectorAll('[data-rm]')) x.onclick = () => { state.compare = state.compare.filter(s => s !== x.dataset.rm); persist(); this.refresh(b); };
    for (const x of root.querySelectorAll('[data-add]')) x.onclick = () => { if (state.compare.length < 3 && !state.compare.includes(x.dataset.add)) state.compare.push(x.dataset.add); persist(); this.refresh(b); };
  },
  lab(cars) { const keys = ['a', 'b', 'c'], st = { focus: 'a', event: 'strip' }; cars.forEach((x, i) => { st[keys[i]] = x.slug === R.slug ? setup() : newSetup(x.labId); st[keys[i] + 'Mode'] = x.slug === R.slug && isModified() ? 'after' : 'before'; }); return new URL('?via=reference' + shareFragment(st, 'compare'), labRoot).href; },
};

// Select and order the experiences this car's record supports: highest relevance first, the plan and comparison last.
function selectExperiences() {
  const c = ctx(), ok = Object.entries(E).filter(([, x]) => { try { return x.needs(c); } catch { return false; } });
  const main = ok.filter(([, x]) => !x.position).sort((a, b) => b[1].score(c) - a[1].score(c));
  return [...main, ...ok.filter(([, x]) => x.position === 'end'), ...ok.filter(([, x]) => x.position === 'last')].map(([k]) => k);
}

// ---------- one sentence about what the last change did ----------
function whatChanged(c) {
  const r1 = c.rows[0], r0 = c.rowsStock[0];
  switch (state.last) {
    case 'power': case 'tire': case 'plan': return r1 ? ['launch', `1st gear now uses ${fx(r1.utilization * 100)}% of the grip${r0 ? ` (stock ${fx(r0.utilization * 100)}%)` : ''}.`] : null;
    case 'weight': return ['balance', `Front share is now ${fx(c.v.front * 100, 1)}% (stock ${fx(c.s.front * 100, 1)}%).`];
    case 'finalDrive': case 'redline': return ['gearing', `${ordinal(1)} gear now runs to ${U('speed', gearSpeed(c.v, c.v.gears[0]))}; top gear at ${U('speed', 70)} is ${fx(rpmAt(c.v, 70, c.v.gears.length - 1))} rpm.`];
    case 'diameter': return ['gearing', `The new tire acts like a ${fx(c.v.finalDrive * c.s.diameter / c.v.diameter, 2)} axle ratio.`];
    default: return null;
  }
}

// ---------- "Your car" bar: stock (amber) → yours (blue) ----------
const bar = document.querySelector('[data-sg-bar]');
let barOpen = false;
function renderBar() {
  if (!bar) return;
  const c = ctx(), list = changes(), mod = list.length > 0, wc = mod ? whatChanged(c) : null;
  const pair = (label, s, m, d = 2, u = 's') => `<div class="sg-pair"><span>${label}</span><b>${mod ? `${stockNum(s, d, '')} <i>→</i> ${modNum(m, d, '')}` : stockNum(s, d, '')}<em>${u}</em></b></div>`;
  bar.innerHTML = `<div class="sg-bar-in"><div class="sg-bar-name"><b>Your ${esc(shortName)}</b><small>${mod ? `<span class="c-mod">${list.length} change${list.length > 1 ? 's' : ''}</span>` : '<span class="c-stock">stock</span>'}</small></div>
    <div class="sg-pairs">${c.rm && c.rs ? pair('0–60 mph', c.rs.magazine.zeroTo60, c.rm.magazine.zeroTo60, 1) + pair('¼ mile', c.rs.magazine.et, c.rm.magazine.et) : ''}${c.rows[0] ? `<div class="sg-pair"><span>Grip in 1st</span><b class="s-${c.rows[0].status}">${fx(c.rows[0].utilization * 100)}<em>%</em></b></div>` : ''}</div>
    <details class="sg-bar-more"${barOpen ? ' open' : ''}><summary>${mod ? 'Your changes' : 'Actions'}</summary><div>
      ${wc ? `<p class="sg-wc">${esc(wc[1])} <a href="#explore" data-sg-q="${wc[0]}">See why</a></p>` : ''}
      ${mod ? `<ul>${list.map((x, i) => `<li><span class="c-mod">${esc(x.text)}</span> <button type="button" class="sg-link" data-undo="${i}" aria-label="Undo ${esc(x.text)}">Undo</button></li>`).join('')}</ul><p><button type="button" class="sg-link" data-reset>Back to stock</button></p>` : '<p>Make a change in any answer; it shows here and goes with you into the Vehicle Lab.</p>'}
      <p class="sg-acts"><a class="btn-small primary sg-a" href="${esc(labHref('build'))}">Continue in the Vehicle Lab</a><a class="btn-small sg-a" href="${esc(labHref('compare-strip'))}">Race it against stock</a>${id ? `<a class="btn-small sg-a" href="${esc(new URL('../replay/?car=' + encodeURIComponent(id) + '#brake', labRoot).href)}">Watch it brake and corner</a><a class="btn-small sg-a" href="${esc(new URL('../simulate/?car=' + encodeURIComponent(id), labRoot).href)}">Numbers and charts</a>` : ''}${mod ? '<button type="button" class="btn-small" data-save>Save to My Garage</button><button type="button" class="btn-small" data-share>Share</button>' : ''}</p>
      <p class="sg-note">ESS model estimate, magazine timing (1-ft rollout). Not a measured result.</p>${roadTestHtml(c)}</div></details></div>`;
  const more = bar.querySelector('details'); more.ontoggle = () => { barOpen = more.open; };
  bar.querySelector('[data-reset]')?.addEventListener('click', () => { state.tune = {}; state.parts = []; state.conditions = null; state.last = null; rebuild(); update('Back to stock.'); });
  for (const x of bar.querySelectorAll('[data-undo]')) x.onclick = () => { list[+x.dataset.undo].undo(); state.last = null; rebuild(); update('Change undone.'); };
  bar.querySelector('[data-save]')?.addEventListener('click', () => say(saveToGarage(setup(), 'after') ? 'Saved in My Garage on this browser.' : 'Could not save on this browser.'));
  bar.querySelector('[data-share]')?.addEventListener('click', async () => { const url = new URL(labHref('build')); url.searchParams.set('via', 'share'); const o = await shareResult(url.href, R.title + ' experiment', changes().map(x => x.text).join(', ')); say({ shared: 'Shared.', copied: 'Link copied.', cancelled: 'Sharing cancelled.' }[o] ?? 'Copy this link: ' + url.href); });
}

// ---------- question index, answer, guided path, hero ----------
let ORDER = [];
const toc = document.querySelector('[data-sg-toc]'), answer = document.querySelector('[data-sg-answer]');
function renderToc() {
  const c = ctx();
  toc.innerHTML = ORDER.map(q => { const x = E[q]; let f = null, t = ''; try { f = x.fig(c); t = x.teaser(c); } catch { /* keep going */ }
    return `<li><a class="sg-q" href="#explore" data-sg-q="${q}" aria-current="${q === state.q}"><span class="sg-q-fig" data-level="${f?.level ?? ''}">${f ? `<b>${esc(f.big)}</b>${f.unit ? `<i>${esc(f.unit)}</i>` : ''}<small>${esc(f.small)}</small>` : ''}</span><span class="sg-q-text"><strong>${esc(x.title(c))}</strong><span>${esc(t)}</span></span></a></li>`; }).join('');
}
function rebuild() {
  const q = ORDER.includes(state.q) ? state.q : ORDER[0], i = ORDER.indexOf(q), next = ORDER[(i + 1) % ORDER.length], c = ctx();
  state.q = q;
  answer.innerHTML = `<div class="section-label">Question ${i + 1} of ${ORDER.length}</div><h3 class="sg-a-title">${esc(E[q].title(c))}</h3><div class="sg-a-body">${E[q].html()}</div>
    <a class="sg-next" href="#explore" data-sg-q="${next}"><span>Next question</span><b>${esc(E[next].title(c))}</b></a>`;
  E[q].bind(answer.querySelector('.sg-a-body'));
}
const refreshAnswer = () => { const b = answer?.querySelector('.sg-a-body'); if (b) E[state.q]?.refresh(b); };
function renderHero() { const el = document.querySelector('[data-sg-hero]'); if (!el) return; const cap = el.querySelector('figcaption'); el.innerHTML = schematic(nowV(), stockV()); if (cap) el.append(cap); }
function update(message) { persist(); renderToc(); renderBar(); refreshAnswer(); renderHero(); if (message) say(message); }
function open(q) {
  if (!E[q]) return; state.q = q; persist(); rebuild(); renderToc();
  document.querySelector(`.sg-q[data-sg-q="${q}"]`)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest', inline: 'center' });
  answer.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }); answer.focus({ preventScroll: true });
}

if (R && runnable) {
  const status = document.createElement('div'); status.className = 'sr-only'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.dataset.sgStatus = ''; document.body.append(status);
  document.addEventListener('click', e => { const a = e.target.closest('[data-sg-q]'); if (!a) return; e.preventDefault(); open(a.dataset.sgQ); });
  loadLibrary().then(() => {
    ORDER = selectExperiences(); if (!ORDER.includes(state.q)) state.q = ORDER[0];
    rebuild(); renderToc(); renderBar(); renderHero();
    document.addEventListener('ess:units-changed', () => { renderStaticUnits(); rebuild(); renderToc(); renderBar(); renderHero(); });
  });
} else if (R) document.querySelector('.sg-explore')?.remove();
export { state as _state, E as _experiences, selectExperiences as _select, ctx as _ctx };
