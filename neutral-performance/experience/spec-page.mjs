// ESS specification page experiments (Claude, 25 Nov). Hydrates a static, indexable specification page from the
// consolidated knowledge record embedded in it (#ess-spec-data, schema ess.vehicle-knowledge.v1).
//
// Rules this module keeps:
//  - No physics here. Every number comes from the shared engine through experience/models.mjs (the same path the
//    Vehicle Lab uses) or is plain geometry (gear speed, tire diameter) using the same canonical inputs.
//  - One experiment state for the whole page: {tune, parts, conditions} on the page's own configuration id. Every panel
//    edits it, the change bar lists it (each change reversible), and every Lab link carries it.
//  - Published values, road tests, archive figures, ESS estimates and model results are labeled differently.
//  - Results appear next to the control that changed them; actions that open something bring it into view.
import { vehicles } from './vehicles.mjs';
import { newSetup, resolve, straightLine, validValue, limits, ride } from './models.mjs';
import { shareFragment, saveToGarage, shareResult } from './configuration.mjs';
import * as units from './units.mjs';
import { torqueAt, resistanceAt, defaults as engineDefaults } from '../engine/acceleration.mjs';
import { parseTire } from '../engine/tires.mjs';
import { tireClasses, pickerOrder } from '../engine/traction.mjs';

const dataEl = document.getElementById('ess-spec-data');
const R = dataEl ? JSON.parse(dataEl.textContent) : null;
const labRoot = new URL('../../experience/', location.href);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fx = (n, d = 0) => Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
const sign = (n, d = 0) => !Number.isFinite(n) ? '—' : Math.abs(n) < .5 * 10 ** -d ? fx(0, d) : (n > 0 ? '+' : '−') + fx(Math.abs(n), d);
const U = (q, v, o) => units.format(q, v, o);
const MPH_FT = 5280 / 3600;
const statusEl = document.querySelector('[data-sp-status]');
const say = text => { if (statusEl) { statusEl.textContent = ''; requestAnimationFrame(() => { statusEl.textContent = text; }); } };
const bringIntoView = el => { el?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' }); };

// ---------- units on the static facts ----------
function renderStaticUnits() {
  const system = units.getUnits();
  for (const el of document.querySelectorAll('[data-q][data-v]')) {
    const q = el.dataset.q, v = Number(el.dataset.v);
    if (q === 'ppw') { el.textContent = system === 'metric' ? `${fx(v * 0.45359237 / 0.745699872, 2)} kg/kW` : system === 'dual' ? `${fx(v, 1)} lb/hp (${fx(v * 0.45359237 / 0.745699872, 2)} kg/kW)` : `${fx(v, 1)} lb/hp`; continue; }
    if (!units.quantities[q]) continue;
    const digits = q === 'length' ? (v < 40 ? 1 : 1) : 0;
    el.textContent = U(q, v, { digits, metricDigits: q === 'length' ? 0 : 0 });
  }
}
const unitSlot = document.querySelector('[data-sp-units]');
if (unitSlot) { unitSlot.innerHTML = units.unitsControl('sp-units'); units.bindUnitControls(unitSlot); }
units.bindUnitControls(document);
renderStaticUnits();

// ---------- experiment state ----------
const id = R?.model?.labId && vehicles[R.model.labId] ? R.model.labId : null;
const runnable = !!(id && R.links?.lab && !R.model.competition);
const state = { tune: {}, parts: [], conditions: null, compare: [] };
const STORE = 'ess.spec-experiment.v1';
try { const s = JSON.parse(sessionStorage.getItem(STORE)); if (s?.id === id && s.state) Object.assign(state, s.state); } catch { /* fresh page */ }
const persist = () => { try { sessionStorage.setItem(STORE, JSON.stringify({ id, state })); } catch { /* fine */ } };
const setup = () => ({ ...newSetup(id), tune: { ...state.tune }, parts: state.parts.map(p => ({ ...p })), ...(state.conditions ? { conditions: { ...state.conditions } } : {}) });
const isModified = () => Object.keys(state.tune).length || state.parts.length || state.conditions;
const stockV = () => resolve(newSetup(id), false);
const nowV = () => resolve(setup(), true);
const runCache = new Map();
function run(v) {
  const key = JSON.stringify(['weight', 'front', 'wheelbase', 'cg', 'hp', 'hpRpm', 'torque', 'torqueRpm', 'redline', 'gears', 'finalDrive', 'diameter', 'grip', 'cda', 'drivetrain', 'transmission'].map(k => v[k]));
  if (!runCache.has(key)) { const r = straightLine(v); runCache.set(key, r.issue ? null : r); }
  return runCache.get(key);
}

const CHANGE_TEXT = {
  hp: (v, s) => `Power ${sign((v / s.hp - 1) * 100)}%`, torque: () => null, finalDrive: v => `Final drive ${fx(v, 2)}`,
  diameter: v => `Driven tire ${U('length', v, { digits: 2 })}`, frontSpring: v => `Front spring ${U('rate', v)}`, rearSpring: v => `Rear spring ${U('rate', v)}`,
  cda: (v, s) => `Drag area ${sign((v / s.cda - 1) * 100)}%`,
};
function changes() {
  const s = stockV(), list = [];
  for (const [k, v] of Object.entries(state.tune)) { const t = CHANGE_TEXT[k]?.(v, s); if (t) list.push({ text: t, undo: () => { delete state.tune[k]; if (k === 'hp') delete state.tune.torque; } }); }
  state.parts.forEach((p, i) => list.push({ text: p.label, undo: () => state.parts.splice(i, 1) }));
  if (state.conditions) list.push({ text: `Tires: ${tireClasses[state.conditions.tire]?.label ?? 'custom'}`, undo: () => { state.conditions = null; } });
  return list;
}

// Lab handoff: the same configuration with every change; the comparison lane is the stock car (or a compared car).
function labHref(view = 'build') {
  const a = setup(), mod = isModified();
  const otherSlug = state.compare[0];
  const other = otherSlug && library?.find(x => x.slug === otherSlug)?.labId;
  const b = other && vehicles[other] ? newSetup(other) : newSetup(id);
  const st = { a, b, aMode: mod ? 'after' : 'before', bMode: 'before', focus: 'a' };
  if (view === 'compare-strip') return new URL('?via=reference' + shareFragment({ ...st, event: 'strip' }, 'compare'), labRoot).href;
  return new URL('?via=reference' + shareFragment(st, view), labRoot).href;
}

const opponentName = () => { const o = state.compare[0] && library?.find(x => x.slug === state.compare[0]); return o?.labId && vehicles[o.labId] ? o.title : 'stock car'; };
// ---------- change bar ----------
const bar = document.querySelector('[data-sp-changes]');
function renderBar() {
  if (!bar) return;
  const list = changes();
  bar.hidden = !list.length;
  if (!list.length) { bar.innerHTML = ''; return; }
  const s = run(stockV()), m = run(nowV());
  const res = s && m ? `<p class="sp-bar-result"><span>ESS model, 0–60 mph</span> <strong>${fx(s.magazine.zeroTo60, 2)} → ${fx(m.magazine.zeroTo60, 2)} s</strong>
    <span>quarter mile</span> <strong>${fx(s.magazine.et, 2)} → ${fx(m.magazine.et, 2)} s</strong> <small>(${sign(m.magazine.et - s.magazine.et, 2)} s)</small></p>` : '';
  bar.innerHTML = `<div class="sp-bar-head"><h2>Your experiment</h2><button type="button" class="sp-link" data-reset>Reset all</button></div>
    <ul>${list.map((c, i) => `<li>${esc(c.text)} <button type="button" class="sp-undo" data-undo="${i}" aria-label="Undo ${esc(c.text)}">Undo</button></li>`).join('')}</ul>${res}
    <p class="sp-bar-actions"><a class="sp-button primary" href="${esc(labHref('build'))}">Continue in the Vehicle Lab</a>
    <a class="sp-button" href="${esc(labHref('compare-strip'))}">Race it against the ${esc(opponentName())}</a>
    <button type="button" class="sp-button" data-save>Save to My Garage</button><button type="button" class="sp-button" data-share>Share this experiment</button></p>`;
  bar.querySelector('[data-reset]').onclick = () => { state.tune = {}; state.parts = []; state.conditions = null; update('All changes removed. Back to the stock configuration.'); };
  for (const b of bar.querySelectorAll('[data-undo]')) b.onclick = () => { list[+b.dataset.undo].undo(); update('Change undone.'); };
  bar.querySelector('[data-save]').onclick = () => say(saveToGarage(setup(), 'after') ? 'Saved in My Garage on this browser.' : 'Could not save. Check browser storage or My Garage space.');
  bar.querySelector('[data-share]').onclick = async () => {
    const url = new URL(labHref('build')); url.searchParams.set('via', 'share');
    const outcome = await shareResult(url.href, R.title + ' experiment', changes().map(c => c.text).join(', '));
    say({ shared: 'Shared.', copied: 'Experiment link copied.', cancelled: 'Sharing cancelled.' }[outcome] ?? 'Copy this link: ' + url.href);
  };
}

// ---------- panels ----------
const panels = {};
function mountPanel(el) {
  const pid = el.dataset.spPanel, btn = el.querySelector('.sp-try-open'), body = el.querySelector('.sp-try-body');
  if (!runnable || !panels[pid]) { el.hidden = true; return; }
  btn.onclick = () => {
    const open = btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', String(open)); body.hidden = !open;
    if (open) { body.innerHTML = panels[pid].html(); panels[pid].bind?.(body); bringIntoView(body); body.querySelector('input,select,button')?.focus({ preventScroll: true }); }
  };
}
function refreshPanels() {
  for (const el of document.querySelectorAll('[data-sp-panel]')) {
    const body = el.querySelector('.sp-try-body'); const p = panels[el.dataset.spPanel];
    if (!body.hidden && p?.refresh) p.refresh(body);
  }
}
function update(message) {
  persist(); renderBar(); refreshPanels(); if (message) say(message);
}
const modelNote = '<p class="sp-model-note">ESS model result: the shared acceleration model with this car’s labeled inputs, timed like a magazine test (clock starts after 1 ft of rollout; the Lab replay times from a standstill, about 0.3 s longer). A comparison tool, not a measured or guaranteed time.</p>';
const deltaRow = (label, s, m, d, unit = 's') => `<tr><th scope="row">${label}</th><td>${fx(s, d)} ${unit}</td><td>${fx(m, d)} ${unit}</td><td>${sign(m - s, d)} ${unit}</td></tr>`;
function modelDelta() {
  const s = run(stockV()), m = run(nowV());
  if (!s || !m) return `<p class="sp-empty">The acceleration model cannot run this configuration yet: ${esc(straightLine(s ? nowV() : v0()).issue ?? 'inputs incomplete')} Geometry results above still apply.</p>`;
  return `<div class="sp-table-wrap"><table class="sp-delta"><caption>ESS model</caption><thead><tr><th></th><th scope="col">Stock</th><th scope="col">Your change</th><th scope="col">Difference</th></tr></thead><tbody>
    ${deltaRow('0–60 mph', s.magazine.zeroTo60, m.magazine.zeroTo60, 2)}${deltaRow('Quarter mile', s.magazine.et, m.magazine.et, 2)}
    <tr><th scope="row">Trap speed</th><td>${U('speed', s.magazine.trap)}</td><td>${U('speed', m.magazine.trap)}</td><td>${sign(units.toDisplay('speed', m.magazine.trap - s.magazine.trap), 1)} ${units.unitLabel('speed')}</td></tr></tbody></table></div>${modelNote}`;
}
const v0 = () => stockV();

// Engine: output change, weight per power, estimated curve shape.
panels.engine = {
  html() {
    const pct = state.tune.hp ? Math.round((state.tune.hp / v0().hp - 1) * 100) : 0;
    return `<label class="sp-field">Engine output change <output data-o="pct">${sign(pct)}%</output>
      <input type="range" min="-30" max="50" step="5" value="${pct}" data-in="pct" aria-describedby="sp-engine-out"></label>
      <div id="sp-engine-out" data-out></div>`;
  },
  bind(body) {
    body.querySelector('[data-in="pct"]').oninput = e => {
      const p = +e.target.value, s = v0();
      if (p === 0) { delete state.tune.hp; delete state.tune.torque; }
      else { const hp = Math.round(s.hp * (1 + p / 100)), tq = Math.round(s.torque * (1 + p / 100));
        if (validValue('hp', hp) && validValue('torque', tq)) { state.tune.hp = hp; state.tune.torque = tq; } }
      body.querySelector('[data-o="pct"]').textContent = sign(p) + '%';
      update();
    };
    this.refresh(body);
  },
  refresh(body) {
    const s = v0(), v = nowV();
    const lbhp = v.weight / v.hp;
    const pts = [], top = v.redline;
    for (let rpm = 1000; rpm <= top; rpm += 250) pts.push([rpm, torqueAt(v, rpm), torqueAt(v, rpm) * rpm / 5252]);
    const maxY = Math.max(...pts.map(p => Math.max(p[1], p[2]))) * 1.08, W = 320, H = 150;
    const X = r => 28 + (r - 1000) / (top - 1000) * (W - 36), Y = y => H - 18 - y / maxY * (H - 30);
    const line = i => pts.map((p, j) => `${j ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[i]).toFixed(1)}`).join('');
    body.querySelector('[data-out]').innerHTML = `<div class="sp-readout">
      <div><span>Power</span><strong>${U('power', v.hp)}</strong>${v.hp !== s.hp ? `<small>stock ${U('power', s.hp)}</small>` : ''}</div>
      <div><span>Torque</span><strong>${U('torque', v.torque)}</strong></div>
      <div><span>Weight per hp</span><strong>${units.getUnits() === 'metric' ? fx(v.weight * .45359237 / (v.hp * .745699872), 2) + ' kg/kW' : fx(lbhp, 2) + ' lb/hp'}</strong><small>model weight ${U('weight', v.weight)}</small></div></div>
      <figure class="sp-figure"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Estimated torque and power curve shape from ${fx(1000)} to ${fx(top)} rpm">
        <path d="${line(1)}" class="sp-curve-tq"/><path d="${line(2)}" class="sp-curve-hp"/>
        <line x1="28" x2="${W - 8}" y1="${H - 18}" y2="${H - 18}" class="sp-axis"/></svg>
        <figcaption><span class="sp-key-tq">Torque</span> · <span class="sp-key-hp">Power</span> · 1,000–${fx(top)} rpm. Peak ${U('power', v.hp)} at ${fx(v.hpRpm)} rpm, ${U('torque', v.torque)} at ${fx(v.torqueRpm)} rpm.
        <strong>Curve shape is an ESS estimate</strong> drawn through the published peaks; it is not a dyno chart.</figcaption></figure>
      ${modelDelta()}<p><a href="${esc(labHref('performance'))}">See how this power meets the tires, gear by gear →</a></p>`;
  },
};

// Gearing: speed in each gear at the shift point, alternative final drive.
const gearSpeed = (v, ratio) => v.redline / (ratio * v.finalDrive) * (Math.PI * v.diameter) / 12 / 5280 * 60;
panels.gearing = {
  html() {
    const s = v0(), fd = state.tune.finalDrive ?? s.finalDrive;
    const opts = [...new Set([-.15, -.1, -.05, 0, .05, .1, .15, .2].map(k => +(s.finalDrive * (1 + k)).toFixed(2)))].filter(x => validValue('finalDrive', x));
    return `<label class="sp-field">Final drive ratio <input type="number" step="0.01" min="${limits.finalDrive[0]}" max="${limits.finalDrive[1]}" value="${fd}" data-in="fd" inputmode="decimal"></label>
      <div class="sp-chips" role="group" aria-label="Try a final drive ratio">${opts.map(o => `<button type="button" data-fd="${o}" aria-pressed="${o === fd}">${fx(o, 2)}${o === s.finalDrive ? ' stock' : ''}</button>`).join('')}</div>
      <div data-out aria-live="polite"></div>`;
  },
  bind(body) {
    const set = x => { const s = v0(); if (Math.abs(x - s.finalDrive) < .005) delete state.tune.finalDrive; else if (validValue('finalDrive', x)) state.tune.finalDrive = +x.toFixed(2); else { say(`Use a ratio between ${limits.finalDrive[0]} and ${limits.finalDrive[1]}.`); return; }
      for (const b of body.querySelectorAll('[data-fd]')) b.setAttribute('aria-pressed', String(+b.dataset.fd === (state.tune.finalDrive ?? s.finalDrive)));
      body.querySelector('[data-in="fd"]').value = state.tune.finalDrive ?? s.finalDrive; update(); };
    body.querySelector('[data-in="fd"]').onchange = e => set(+e.target.value);
    for (const b of body.querySelectorAll('[data-fd]')) b.onclick = () => set(+b.dataset.fd);
    this.refresh(body);
  },
  refresh(body) {
    const s = v0(), v = nowV(), top = v.gears.length - 1;
    const rpm70 = x => 70 * 5280 / 60 / (Math.PI * x.diameter / 12) * x.gears[top] * x.finalDrive;
    body.querySelector('[data-out]').innerHTML = `<div class="sp-table-wrap"><table><caption>Road speed at ${fx(v.redline)} rpm (${esc(R.model.inputs.redline?.evidence === 'estimate' ? 'shift rpm is an ESS estimate' : 'published shift / redline')})</caption>
      <thead><tr><th scope="col">Gear</th><th scope="col">Ratio</th><th scope="col">Overall</th><th scope="col">Stock</th>${v.finalDrive !== s.finalDrive || v.diameter !== s.diameter ? '<th scope="col">Your change</th>' : ''}</tr></thead><tbody>
      ${v.gears.map((g, i) => `<tr><th scope="row">${i + 1}</th><td>${fx(g, 2)}</td><td>${fx(g * v.finalDrive, 2)}</td><td>${U('speed', gearSpeed(s, s.gears[i]))}</td>${v.finalDrive !== s.finalDrive || v.diameter !== s.diameter ? `<td>${U('speed', gearSpeed(v, g))}</td>` : ''}</tr>`).join('')}
      </tbody></table></div><p>Top gear at ${U('speed', 70)}: <strong>${fx(rpm70(v))} rpm</strong>${rpm70(v) !== rpm70(s) ? ` (stock ${fx(rpm70(s))} rpm)` : ''}. A numerically higher ratio shortens every gear: quicker acceleration, lower speed per gear, more rpm on the highway.</p>
      <p class="sp-source-line">Inputs: gears and final drive ${esc(R.model.inputs.gears?.evidence ?? '')}, tire diameter ${U('length', v.diameter, { digits: 2 })} (${esc(R.model.inputs.diameter?.evidence ?? '')}, nominal unloaded).</p>
      ${modelDelta()}<p><a href="${esc(labHref('performance'))}">See where wheel torque exceeds tire grip in each gear →</a></p>`;
  },
};

// Tires: diameter geometry, alternative size, tire type (grip class) as a separate model input.
const tireRows = () => Object.entries(R.tires ?? {}).map(([k, t]) => ({ axle: k === 'tireFront' ? 'Front' : 'Rear', ...t }));
panels.tires = {
  html() {
    const rear = R.tires?.tireRear?.size ?? '';
    const cls = state.conditions?.tire ?? '';
    return `<div data-geo></div>
      <label class="sp-field">Try another driven-tire size <input type="text" value="${esc(state.altTire ?? '')}" placeholder="${esc(rear || 'e.g. 285/35R18')}" data-in="size" autocomplete="off" spellcheck="false"></label>
      <div data-alt aria-live="polite"></div>
      <label class="sp-field">Tire type (grip) <select data-in="class"><option value="">Model default for this car</option>${pickerOrder.map(k => `<option value="${k}" ${k === cls ? 'selected' : ''}>${esc(tireClasses[k].label)}</option>`).join('')}</select></label>
      <p class="sp-model-note">Size changes are geometry: diameter, gearing and speedometer. They do not predict fitment, clearance, load rating or grip. Tire type sets the model’s grip coefficient to the typical value for that class.</p>
      <div data-out></div>`;
  },
  bind(body) {
    const size = body.querySelector('[data-in="size"]');
    size.oninput = () => { state.altTire = size.value; this.alt(body); };
    body.querySelector('[data-in="class"]').onchange = e => { state.conditions = e.target.value ? { tire: e.target.value } : null; update(e.target.value ? 'Tire type applied to the experiment.' : 'Tire type back to the model default.'); };
    this.refresh(body);
  },
  alt(body) {
    const s = v0(), t = parseTire(state.altTire), el = body.querySelector('[data-alt]');
    if (!state.altTire) { el.innerHTML = ''; return; }
    if (!t) { el.innerHTML = '<p class="sp-empty">Enter a size like 285/35R18, 275/40ZR17 or 31x10.50R15.</p>'; return; }
    const ratio = t.diameter / s.diameter, eff = s.finalDrive / ratio;
    el.innerHTML = `<div class="sp-readout"><div><span>New diameter</span><strong>${U('length', t.diameter, { digits: 2 })}</strong><small>${sign((ratio - 1) * 100, 1)}% vs model ${U('length', s.diameter, { digits: 2 })}</small></div>
      <div><span>Effective final drive</span><strong>${fx(eff, 2)}</strong><small>same as changing ${fx(s.finalDrive, 2)} → ${fx(eff, 2)}</small></div>
      <div><span>Speedometer at true ${U('speed', 60)}</span><strong>${U('speed', 60 / ratio, { digits: 1 })} shown</strong><small>if calibrated for the original size</small></div></div>
      <p><button type="button" class="sp-button" data-apply>Apply this diameter to the experiment</button></p>`;
    el.querySelector('[data-apply]').onclick = () => {
      if (!validValue('diameter', t.diameter)) { say('That diameter is outside the model range.'); return; }
      state.tune.diameter = t.diameter; update(`Driven tire diameter ${U('length', t.diameter, { digits: 2 })} applied.`); bringIntoView(body.querySelector('[data-out]'));
    };
  },
  refresh(body) {
    const rows = tireRows();
    body.querySelector('[data-geo]').innerHTML = rows.length ? `<div class="sp-table-wrap"><table><caption>Published sizes (nominal geometry)</caption><thead><tr><th scope="col">Axle</th><th scope="col">Size</th><th scope="col">Section width</th><th scope="col">Wheel</th><th scope="col">Diameter</th><th scope="col">Revs per mile</th></tr></thead><tbody>
      ${rows.map(t => `<tr><th scope="row">${t.axle}</th><td>${esc(t.size)}</td><td>${t.width ? t.width + ' mm' : '—'}</td><td>${t.rim ? fx(t.rim) + ' in' : '—'}</td><td>${t.diameter ? U('length', t.diameter, { digits: 2 }) : '—'}</td><td>${t.diameter ? fx(63360 / (Math.PI * t.diameter)) : '—'}</td></tr>`).join('')}
      </tbody></table></div>${rows.length === 2 && rows[0].diameter && rows[1].diameter ? `<p>Rear is ${U('length', Math.abs(rows[1].diameter - rows[0].diameter), { digits: 2 })} ${rows[1].diameter >= rows[0].diameter ? 'taller' : 'shorter'} than the front (${sign((rows[1].diameter / rows[0].diameter - 1) * 100, 1)}%).</p>` : ''}`
      : '<p class="sp-empty">No published tire size for this configuration; the model uses a labeled estimate.</p>';
    const sel = body.querySelector('[data-in="class"]'); if (sel) sel.value = state.conditions?.tire ?? '';
    this.alt(body);
    body.querySelector('[data-out]').innerHTML = modelDelta() + `<p><a href="${esc(labHref('performance'))}">Check drive force against grip for this tire in every gear →</a></p>`;
  },
};

// Weight: add, remove or move mass along the car (shared loads model through resolve()).
panels.weight = {
  html() {
    const wb = v0().wheelbase;
    const spots = [['Front bumper', -Math.round(wb * .3)], ['Front axle', 0], ['Driver seat', Math.round(wb * .45)], ['Rear axle', Math.round(wb)], ['Rear bumper / trunk', Math.round(wb * 1.25)]];
    return `<fieldset class="sp-field"><legend>Change</legend>
      <label><input type="radio" name="op" value="add" checked> Add</label> <label><input type="radio" name="op" value="remove"> Remove</label> <label><input type="radio" name="op" value="move"> Move</label></fieldset>
      <label class="sp-field">Amount <input type="text" value="${units.inputValue('weight', 100)}" data-in="amt" inputmode="decimal"> <span>${units.unitLabel('weight')}</span></label>
      <label class="sp-field">Location <select data-in="at">${spots.map(([n, x]) => `<option value="${x}">${n}</option>`).join('')}</select></label>
      <label class="sp-field" data-to hidden>Move to <select data-in="to">${spots.map(([n, x], i) => `<option value="${x}" ${i === 4 ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <p><button type="button" class="sp-button" data-apply>Apply to the experiment</button></p>
      <p class="sp-model-note">Locations are typical positions measured from the front axle on this wheelbase (${U('length', wb, { digits: 1 })}). Enter exact positions in the Lab.</p><div data-out aria-live="polite"></div>`;
  },
  bind(body) {
    const op = () => body.querySelector('[name="op"]:checked').value;
    for (const r of body.querySelectorAll('[name="op"]')) r.onchange = () => { body.querySelector('[data-to]').hidden = op() !== 'move'; };
    body.querySelector('[data-apply]').onclick = () => {
      const lb = units.parse('weight', body.querySelector('[data-in="amt"]').value);
      if (!Number.isFinite(lb) || lb <= 0 || lb > 1800) { say(`Enter an amount up to ${U('weight', 1800)}.`); return; }
      const at = +body.querySelector('[data-in="at"]').value, to = +body.querySelector('[data-in="to"]').value;
      const name = s => body.querySelector(`[data-in="${s}"]`).selectedOptions[0].textContent;
      const w = Math.round(lb), o = op();
      const part = o === 'add' ? { label: `Add ${w} lb at ${name('at').toLowerCase()}`, oldWeight: 0, oldX: at, newWeight: w, newX: at }
        : o === 'remove' ? { label: `Remove ${w} lb at ${name('at').toLowerCase()}`, oldWeight: w, oldX: at, newWeight: 0, newX: at }
        : { label: `Move ${w} lb from ${name('at').toLowerCase()} to ${name('to').toLowerCase()}`, oldWeight: w, oldX: at, newWeight: w, newX: to };
      if (state.parts.length >= 8) { say('Up to eight weight changes per experiment.'); return; }
      state.parts.push(part); update(part.label + '.'); bringIntoView(body.querySelector('[data-out]'));
    };
    this.refresh(body);
  },
  refresh(body) {
    const s = v0(), v = nowV();
    body.querySelector('[data-out]').innerHTML = `<div class="sp-table-wrap"><table><thead><tr><th></th><th scope="col">Stock (model)</th><th scope="col">Your change</th></tr></thead><tbody>
      <tr><th scope="row">Weight</th><td>${U('weight', s.weight)}</td><td>${U('weight', v.weight)}</td></tr>
      <tr><th scope="row">Front share</th><td>${fx(s.frontLb / s.weight * 100, 1)}%</td><td>${fx(v.frontLb / v.weight * 100, 1)}%</td></tr>
      <tr><th scope="row">Front axle</th><td>${U('weight', s.frontLb)}</td><td>${U('weight', v.frontLb)}</td></tr>
      <tr><th scope="row">Rear axle</th><td>${U('weight', s.rearLb)}</td><td>${U('weight', v.rearLb)}</td></tr>
      <tr><th scope="row">Weight per hp</th><td>${fx(s.weight / s.hp, 2)} lb/hp</td><td>${fx(v.weight / v.hp, 2)} lb/hp</td></tr></tbody></table></div>
      <p class="sp-source-line">Model weight ${U('weight', s.weight)} (${esc(R.model.inputs.weight?.evidence ?? '')}), front share ${esc(R.model.inputs.front?.evidence ?? '')}.</p>
      ${modelDelta()}<p><a href="${esc(labHref('build'))}">Build it in the Lab with exact positions →</a> · <a href="${esc(new URL('../../articles/weight-distribution-50-50/', location.href).href)}">Why balance matters</a></p>`;
  },
};

// Suspension: spring → wheel rate → ride frequency (shared loads.ride); estimates labeled.
panels.suspension = {
  html() {
    const s = v0();
    const f = state.tune.frontSpring ?? s.frontSpring, r = state.tune.rearSpring ?? s.rearSpring;
    return `<label class="sp-field">Front spring <input type="range" min="${Math.round(s.frontSpring * .5)}" max="${Math.round(s.frontSpring * 2)}" step="5" value="${f}" data-in="frontSpring"> <output data-o="frontSpring">${U('rate', f)}</output></label>
      <label class="sp-field">Rear spring <input type="range" min="${Math.round(s.rearSpring * .5)}" max="${Math.round(s.rearSpring * 2)}" step="5" value="${r}" data-in="rearSpring"> <output data-o="rearSpring">${U('rate', r)}</output></label><div data-out></div>`;
  },
  bind(body) {
    for (const k of ['frontSpring', 'rearSpring']) body.querySelector(`[data-in="${k}"]`).oninput = e => {
      const x = +e.target.value; if (x === v0()[k]) delete state.tune[k]; else if (validValue(k, x)) state.tune[k] = x;
      body.querySelector(`[data-o="${k}"]`).textContent = U('rate', x); update();
    };
    this.refresh(body);
  },
  refresh(body) {
    const s = v0(), v = nowV(), rs = { f: ride(s, 'front'), r: ride(s, 'rear') }, rv = { f: ride(v, 'front'), r: ride(v, 'rear') };
    const ev = k => R.model.inputs[k]?.evidence ?? '';
    const anyEst = ['frontSpring', 'rearSpring', 'frontMotion', 'rearMotion'].some(k => ev(k) === 'estimate');
    body.querySelector('[data-out]').innerHTML = `<div class="sp-table-wrap"><table><thead><tr><th></th><th scope="col">Front</th><th scope="col">Rear</th></tr></thead><tbody>
      <tr><th scope="row">Spring</th><td>${U('rate', v.frontSpring)}</td><td>${U('rate', v.rearSpring)}</td></tr>
      <tr><th scope="row">Motion ratio</th><td>${fx(v.frontMotion, 2)}</td><td>${fx(v.rearMotion, 2)}</td></tr>
      <tr><th scope="row">Wheel rate</th><td>${U('rate', rv.f.wheel)}</td><td>${U('rate', rv.r.wheel)}</td></tr>
      <tr><th scope="row">Ride frequency</th><td>${fx(rv.f.hz, 2)} Hz${rv.f.hz !== rs.f.hz ? ` <small>was ${fx(rs.f.hz, 2)}</small>` : ''}</td><td>${fx(rv.r.hz, 2)} Hz${rv.r.hz !== rs.r.hz ? ` <small>was ${fx(rs.r.hz, 2)}</small>` : ''}</td></tr></tbody></table></div>
      <p>Wheel rate = spring rate × motion ratio². Rear-to-front frequency ratio ${fx(rv.r.hz / rv.f.hz, 2)}.</p>
      ${anyEst ? '<p class="sp-model-note"><strong>Springs and motion ratios here are ESS estimates</strong> (typical ride frequency for this type of car), not this car’s published rates. Enter real rates in the Lab.</p>' : ''}
      <p><a href="${esc(labHref('suspension'))}">Move the suspension geometry in the Lab →</a></p>`;
  },
};

// Aero: drag force and power at speed; power-limited top speed (estimate).
panels.aero = {
  html() {
    const s = v0(), pct = state.tune.cda ? Math.round((state.tune.cda / s.cda - 1) * 100) : 0;
    return `<label class="sp-field">Drag area change <input type="range" min="-30" max="30" step="5" value="${pct}" data-in="cda"> <output data-o="cda">${sign(pct)}%</output></label><div data-out></div>`;
  },
  bind(body) {
    body.querySelector('[data-in="cda"]').oninput = e => {
      const p = +e.target.value, s = v0(); if (!p) delete state.tune.cda; else { const x = +(s.cda * (1 + p / 100)).toFixed(2); if (validValue('cda', x)) state.tune.cda = x; }
      body.querySelector('[data-o="cda"]').textContent = sign(p) + '%'; update();
    };
    this.refresh(body);
  },
  refresh(body) {
    const v = nowV(), ev = R.model.inputs.cda?.evidence;
    const hpAt = mph => resistanceAt(v, mph * MPH_FT) * mph * MPH_FT / 550;
    let top = null; for (let mph = 40; mph < 300; mph += .5) if (hpAt(mph) >= v.hp * engineDefaults.driveline) { top = mph; break; }
    body.querySelector('[data-out]').innerHTML = `<div class="sp-table-wrap"><table><caption>Road-load power (drag + rolling resistance), drag area ${fx(v.cda, 2)} ft²</caption><thead><tr><th scope="col">Speed</th><th scope="col">Power needed</th><th scope="col">Share of rated power</th></tr></thead><tbody>
      ${[60, 100, 150, 200].map(m => `<tr><th scope="row">${U('speed', m)}</th><td>${U('power', hpAt(m))}</td><td>${fx(hpAt(m) / v.hp * 100)}%</td></tr>`).join('')}</tbody></table></div>
      <p>Power needed rises with the cube of speed: doubling speed takes about eight times the power to overcome drag.</p>
      ${top ? `<p>Power-limited top speed (ESS estimate): about <strong>${U('speed', top)}</strong> with ${fx(engineDefaults.driveline * 100)}% driveline efficiency. Gearing, rev limit and lift are not included.</p>` : ''}
      ${ev === 'estimate' ? '<p class="sp-model-note"><strong>Drag area is an ESS estimate</strong> for this type of car, not a published or measured value.</p>' : ''}`;
  },
};

// Performance: road tests vs ESS model, time split, quick factor experiments.
panels.performance = {
  html() {
    return `<div data-out></div><div class="sp-chips" role="group" aria-label="Quick experiments">
      <button type="button" data-q="power">+10% power</button><button type="button" data-q="weight">Remove ${U('weight', 200)}</button>
      <button type="button" data-q="tire">Stickier tires</button><button type="button" data-q="fd">Shorter final drive (+10%)</button></div>`;
  },
  bind(body) {
    const s = v0();
    const act = {
      power: () => { state.tune.hp = Math.round(s.hp * 1.1); state.tune.torque = Math.round(s.torque * 1.1); return '+10% power applied.'; },
      weight: () => { state.parts.push({ label: `Remove 200 lb at driver seat`, oldWeight: 200, oldX: Math.round(s.wheelbase * .45), newWeight: 0, newX: Math.round(s.wheelbase * .45) }); return '200 lb removed.'; },
      tire: () => { state.conditions = { tire: 'extremeSummer' }; return 'Extreme summer tires applied.'; },
      fd: () => { const x = +(s.finalDrive * 1.1).toFixed(2); if (validValue('finalDrive', x)) state.tune.finalDrive = x; return `Final drive ${fx(x, 2)} applied.`; },
    };
    for (const b of body.querySelectorAll('[data-q]')) b.onclick = () => { const msg = act[b.dataset.q](); update(msg); bringIntoView(bar); };
    this.refresh(body);
  },
  refresh(body) {
    const s = run(v0()), m = isModified() ? run(nowV()) : null, k = R.key;
    if (!s) { body.querySelector('[data-out]').innerHTML = `<p class="sp-empty">The acceleration model cannot run this configuration yet: ${esc(straightLine(v0()).issue)} The published figures above still stand; see “What the ESS model assumes”.</p>`; return; }
    const test = (key, sim, d = 2, unit = 's', q) => {
      const t = k[key]; const model = sim;
      const shown = x => q ? U(q, x) : fx(x, d) + ' ' + unit;
      return `<tr><th scope="row">${{ t60: '0–60 mph', et: 'Quarter mile', trap: 'Trap speed' }[key]}</th><td>${t ? shown(t.value) + ` <small class="sp-ev sp-ev-${t.evidence.replace(' ', '-')}">${esc({ archive: 'Supercar X archive', 'road test': 'Road test' }[t.evidence] ?? t.evidence)}</small>` : '—'}</td>
        <td>${shown(model.s)}</td><td>${t ? (q ? sign(units.toDisplay(q, model.s - t.value), 1) + ' ' + units.unitLabel(q) : sign(model.s - t.value, 2) + ' s') : '—'}</td>${m ? `<td>${shown(model.m)}</td>` : ''}</tr>`;
    };
    const total = Object.values(s.time).reduce((a, b) => a + b, 0);
    body.querySelector('[data-out]').innerHTML = `<div class="sp-table-wrap"><table><thead><tr><th></th><th scope="col">Published test</th><th scope="col">ESS model</th><th scope="col">Model − test</th>${m ? '<th scope="col">Your change</th>' : ''}</tr></thead><tbody>
      ${test('t60', { s: s.magazine.zeroTo60, m: m?.magazine.zeroTo60 })}${test('et', { s: s.magazine.et, m: m?.magazine.et })}${test('trap', { s: s.magazine.trap, m: m?.magazine.trap }, 0, '', 'speed')}</tbody></table></div>
      <p class="sp-model-note">Test conditions (surface, weather, driver, rollout) are not modeled. Agreement with one test does not validate an estimated input; a miss usually points to an input or test condition, not a reason to tune the model to this car.</p>
      <h3 class="sp-mini">What limits the modeled quarter mile</h3><ul class="sp-split">${Object.entries({ traction: 'Tire grip', engine: 'Engine power', clutch: 'Launch / clutch', shifting: 'Shifts' }).map(([key, label]) => `<li><span>${label}</span><strong>${fx(s.time[key], 2)} s</strong><span class="sp-bar" style="--w:${(s.time[key] / total * 100).toFixed(1)}%" aria-hidden="true"></span></li>`).join('')}</ul>
      <p><a href="${esc(labHref('compare-strip'))}">Watch the run in the quarter-mile replay →</a></p>`;
  },
};

// ---------- compare ----------
let library = null;
async function loadLibrary() {
  if (library) return library;
  try { library = (await (await fetch(new URL('../data/index.json', location.href))).json()).vehicles; } catch { library = []; }
  return library;
}
const ROWS = [
  ['Power', x => x.key.power, (o) => U('power', o.value), 'power'], ['Torque', x => x.key.torque, o => U('torque', o.value), 'torque'],
  ['Weight', x => x.key.weight, o => U('weight', o.value) + (o.basis ? ` <small>${esc(o.basis)}</small>` : ''), 'weight'],
  ['Weight per hp', x => x.key.weightPerHp, o => fx(o.value, 2) + ' lb/hp', 'ppw', true], ['Front share', x => x.key.front, o => fx(o.value * 100, 1) + '%', 'front'],
  ['Wheelbase', x => x.key.wheelbase, o => U('length', o.value, { digits: 1 }), 'length'], ['Rear tire', x => x.key.tireRear, o => esc(o.value), null],
  ['Transmission', x => x.key.transmission, o => esc(o.value), null], ['Final drive', x => x.key.finalDrive, o => fx(o.value, 2), 'ratio'],
  ['0–60 mph (test)', x => x.key.t60, o => fx(o.value, 1) + ' s', 't', true], ['Quarter mile (test)', x => x.key.et, o => fx(o.value, 2) + ' s', 't', true],
];
async function renderCompare() {
  const root = document.querySelector('[data-sp-compare]'); if (!root || !R) return;
  const lib = await loadLibrary(); if (!lib.length) return;
  const self = lib.find(x => x.slug === R.slug);
  if (!state.compare.length && !compareTouched && R.compareWith?.length) state.compare = R.compareWith.slice(0, 2);
  const cars = [self, ...state.compare.map(s => lib.find(x => x.slug === s)).filter(Boolean)];
  const modelRow = cars.map(c => { const lab = c.labId && vehicles[c.labId] && c.runs ? run(resolve(newSetup(c.labId), false)) : null; return lab?.magazine ?? null; });
  const cell = (c, [, get, show, kind, lower]) => {
    const o = get(c); if (!o || o.value == null) return '<td>—</td>';
    const nums = cars.map(x => get(x)?.value).filter(Number.isFinite), max = Math.max(...nums);
    const bar = Number.isFinite(o.value) && nums.length > 1 && kind && kind !== 'ratio' ? `<span class="sp-bar" style="--w:${(o.value / max * 100).toFixed(1)}%" aria-hidden="true"></span>` : '';
    const ev = o.evidence ? ` <small class="sp-ev sp-ev-${esc(o.evidence.replace(' ', '-'))}">${esc({ archive: 'archive', 'road test': 'road test', manufacturer: 'factory' }[o.evidence] ?? o.evidence)}</small>` : '';
    return `<td><span class="sp-cv">${show(o)}</span>${ev}${bar}</td>`;
  };
  const suggestions = (R.compareWith ?? []).filter(s => !state.compare.includes(s)).map(s => lib.find(x => x.slug === s)).filter(Boolean);
  root.innerHTML = `<div class="sp-compare-pick"><label class="sp-field">Add a vehicle <input list="sp-lib" data-cmp-in placeholder="Search the library" ${state.compare.length >= 2 ? 'disabled' : ''}></label>
    <datalist id="sp-lib">${lib.filter(x => x.slug !== R.slug).map(x => `<option value="${esc(x.title)}"></option>`).join('')}</datalist>
    ${suggestions.length && state.compare.length < 2 ? `<div class="sp-chips" role="group" aria-label="Suggested comparisons">${suggestions.map(x => `<button type="button" data-cmp-add="${esc(x.slug)}">+ ${esc(x.title)}</button>`).join('')}</div>` : ''}</div>
    <div class="sp-table-wrap"><table class="sp-cmp"><caption>Specifications as published, with their sources’ definitions</caption><thead><tr><th></th>${cars.map((c, i) => `<th scope="col">${i ? `<a href="../${esc(c.slug)}/">${esc(c.title)}</a> <button type="button" class="sp-undo" data-cmp-rm="${esc(c.slug)}" aria-label="Remove ${esc(c.title)}">Remove</button>` : esc(c.title)}</th>`).join('')}</tr></thead><tbody>
    ${ROWS.filter(r => cars.some(c => r[1](c))).map(r => `<tr><th scope="row">${r[0]}</th>${cars.map(c => cell(c, r)).join('')}</tr>`).join('')}
    <tr class="sp-model-row"><th scope="row">ESS model 0–60 / quarter</th>${modelRow.map(m => `<td>${m ? `${fx(m.zeroTo60, 2)} s / ${fx(m.et, 2)} s` : '<small>not modeled: inputs incomplete or inconsistent</small>'}</td>`).join('')}</tr></tbody></table></div>
    <p class="sp-model-note">Bars are relative to the largest value in each row and only illustrate the printed numbers. Weights can differ in definition (curb, as tested); check the label before comparing.</p>
    ${cars.length > 1 && modelRow.every(Boolean) ? `<p><a class="sp-button" href="${esc(compareLab(cars))}">Race these in the Vehicle Lab</a></p>` : ''}`;
  const inp = root.querySelector('[data-cmp-in]');
  if (inp) inp.onchange = () => { const hit = lib.find(x => x.title === inp.value); if (hit) addCompare(hit.slug); };
  for (const b of root.querySelectorAll('[data-cmp-add]')) b.onclick = () => addCompare(b.dataset.cmpAdd);
  for (const b of root.querySelectorAll('[data-cmp-rm]')) b.onclick = () => { compareTouched = true; state.compare = state.compare.filter(s => s !== b.dataset.cmpRm); persist(); syncQuery(); renderCompare(); say('Vehicle removed from the comparison.'); };
}
let compareTouched = false;
function addCompare(slug) {
  compareTouched = true;
  if (slug === R.slug || state.compare.includes(slug) || state.compare.length >= 2) return;
  state.compare.push(slug); persist(); syncQuery(); renderCompare().then(() => { bringIntoView(document.getElementById('compare')); say('Vehicle added to the comparison.'); });
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
{ // Reproducible comparison link: ?compare=slug,slug (the page's canonical URL stays the specification page)
  const q = new URLSearchParams(location.search).get('compare');
  if (q) { state.compare = q.split(',').filter(s => /^[a-z0-9-]{3,120}$/.test(s)).slice(0, 2); compareTouched = true; }
}

// ---------- start ----------
if (R) {
  for (const el of document.querySelectorAll('[data-sp-panel]')) mountPanel(el);
  for (const a of document.querySelectorAll('[data-sp-lab]')) a.addEventListener('click', () => { a.href = labHref(a.dataset.spLab); });
  renderBar(); renderCompare();
  document.addEventListener('ess:units-changed', () => { renderStaticUnits(); renderBar(); refreshPanels(); renderCompare();
    for (const el of document.querySelectorAll('[data-sp-panel]')) { const body = el.querySelector('.sp-try-body'); if (!body.hidden) { body.innerHTML = panels[el.dataset.spPanel].html(); panels[el.dataset.spPanel].bind(body); } } });
}
export { state as _state, setup as _setup, labHref as _labHref };
