// ESS Plan — interactive vehicle development plan (owner direction, 26 Nov 2026 evening).
// One plan per vehicle project holding several objectives. Saved in this browser (ess.plan.v1); vehicle identity
// comes from the shared catalogue, active configuration and My Garage. Opt-in share link reproduces a read-only copy.
import { OBJECTIVES, OBJECTIVE_KEYS, STEPS, EFFECT, relationsFor } from './objectives.mjs';
import { loadStore, saveStore, upsert, remove, newProject, newObjective, cleanProject, cleanObjective, setStep, nextStep, stage, summary, planHref, PLAN_KEY,
  encodePlan, decodePlan, cleanVehicle, LIMITS } from './plan-store.mjs';
import { baseline, crossEffects, resolveChange, replayHref, METRICS, METRIC_KEYS } from './effects.mjs';
import { EXPERIMENTS } from '../replay/runs.mjs';
import { componentExamplesFor } from '../../engine/component-reference.mjs';
import { getActive, getGarage, useConfig, shareResult } from '../configuration.mjs';
import { newSetup, resolve } from '../models.mjs';
import { vehicles } from '../vehicles.mjs';
import { setupName } from '../matchup.mjs';
import { installCatalog } from '../catalog.mjs';
import { escape, fmt } from '../ui.mjs';
import { format as units, unitsControl, bindUnitControls, toDisplay, fromDisplay, unitLabel } from '../units.mjs';
import { LOOP_METRIC, METHODS, MODEL_TIMING, NOT_COMPARED, signature, predictionFrom, predictionCurrent, compareLoop, accomplishments, suggestion, progress } from './outcomes.mjs';

const root = document.querySelector('[data-ess-plan]');
const query = new URLSearchParams(location.search);
const requested = query.get('project');
const garageEntry = getGarage().find(g => g.key === query.get('garage'));
const incoming = garageEntry ? cleanVehicle({
  id: garageEntry.setup.id, setup: garageEntry.setup, mode: garageEntry.mode, garageKey: garageEntry.key,
}) : cleanVehicle({ id: query.get('car') });
const S = { store: loadStore(), open: null, step: null, shared: decodePlan(location.hash),
  status: '', fresh: !!incoming, transient: false,
  // Exploration: an objective's model result before anything is saved. Nothing here writes storage or the active car.
  explore: null, exploreVehicle: null, draft: null,
  guess: sessionGet('ess.plan.guess') === '1', revealed: new Set(), seen: new Set() };
// The labeled reference example for a cold visit. Never saved as the visitor's car.
const EXAMPLE = { id: 'pontiac-firebird-2nd-gen--1977-trans-am-w72-400-m4-coupe' };  // the W72 record its spec page uses
function sessionGet(k) { try { return sessionStorage.getItem(k); } catch { return null; } }
function sessionSet(k, v) { try { v === null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch { /* private mode */ } }
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const project = () => S.shared ?? (S.fresh ? null : S.store.projects.find(p => p.id === S.store.active) ?? null);
const vname = veh => veh ? (veh.setup ? setupName(veh.setup) : vehicles[veh.id]?.name ?? veh.id) : '';
const pname = p => p.name || vname(p.vehicle) || 'Untitled plan';
const readOnly = () => !!S.shared;
const sameConfiguration = (p, g) => p?.id === g.setup.id && (p?.mode ?? 'before') === g.mode &&
  JSON.stringify(p?.setup ?? newSetup(p.id)) === JSON.stringify(g.setup);
const fromConfiguration = (config, garageKey = null) => cleanVehicle({
  id: config.setup.id, garageKey, setup: config.setup, mode: config.mode,
});

function updateUrl(p) {
  history.replaceState(null, '', planHref(p?.id, location.pathname) + (location.hash.startsWith('#p=') ? '' : location.hash));
}

function commit(p, message = 'Saved in this browser.') {
  if (readOnly()) return false;
  const next = upsert(S.transient ? S.store : loadStore(), p);
  if (!next) { setStatus(`You can keep up to ${LIMITS.projects} plans in this browser. Delete one to make room.`); return false; }
  S.store = next;
  S.fresh = false;
  S.transient = !saveStore(next);
  S.status = S.transient ? 'This browser could not save the plan. Keep this tab open and use Share to retain a copy.' : message;
  updateUrl(p);
  return true;
}

function selectProject(id) {
  const p = S.store.projects.find(x => x.id === id);
  if (!p) return false;
  S.store = { ...S.store, active: id };
  S.fresh = false;
  S.open = p.focus ?? p.objectives[0]?.key ?? null;
  S.step = null;
  if (!S.transient) saveStore(S.store);
  updateUrl(p);
  return true;
}

if (!readOnly() && requested && !selectProject(requested)) {
  S.status = 'That plan is unavailable in this browser. Open a saved plan or start a new one.';
}

function starterVehicle() {
  if (incoming && S.fresh) return incoming;
  const active = getActive();
  if (!active) return null;
  const base = fromConfiguration(active);
  const match = getGarage().find(entry => sameConfiguration(base, entry));
  return match ? fromConfiguration(active, match.key) : base;
}

const updateObjective = (p, key, fn) => ({ ...p, objectives: p.objectives.map(o => o.key === key ? fn(o) : o) });

// ------------------------------------------------------------------ rendering
function vehicleBlock(p) {
  const active = getActive(), garage = getGarage();
  const offerActive = active && !sameConfiguration(p.vehicle, active);
  const garageOptions = garage.map(g => `<option value="${escape(g.key)}"${p.vehicle?.garageKey === g.key ? ' selected' : ''}>${escape(setupName(g.setup))} · ${g.mode === 'after' ? 'Modified' : 'Original'}</option>`).join('');
  return `<div class="plan-vehicle">
    <p class="plan-label">Vehicle</p>
    ${p.vehicle ? `<p class="plan-car"><strong>${escape(vname(p.vehicle))}</strong>${p.vehicle.mode === 'after' ? ' <span class="plan-tag">Modified</span>' : p.vehicle.id === 'custom' ? ' <span class="plan-tag">Custom</span>' : ' <span class="plan-tag">Reference</span>'}</p>`
      : `<p class="plan-car quiet">No car chosen yet. You can start with your objectives and choose the car later.</p>`}
    ${!readOnly() && p.vehicle && p.objectives.some(o => o.done.experiment || o.done.verify || o.done.decision) ?
      '<p class="plan-note">A new baseline reopens your tests and decisions. Your notes and measurements stay with the project.</p>' : ''}
    ${readOnly() ? '' : `<div class="plan-actions">
      <button type="button" class="button secondary" data-open-catalog data-vehicle-key="plan">${p.vehicle ? 'Change car' : 'Choose a car'}</button>
      ${offerActive ? `<button type="button" class="button plain" data-plan-use-active>Use ${escape(setupName(active.setup))}${active.mode === 'after' ? ' (your build)' : ''}</button>` : ''}
      ${garage.length ? `<label class="plan-garage-pick"><span>From My Garage</span><select data-plan-garage><option value="">Choose a saved car…</option>${garageOptions}</select></label>` : ''}
      ${p.vehicle ? '' : '<a class="button plain" href="../vehicles/">Find a car by what you want to do</a>'}
    </div>`}
  </div>`;
}

function identityBlock(p) {
  const dis = readOnly() ? ' disabled' : '';
  return `<div class="plan-identity">
    <label><span class="plan-label">Project name</span><input data-plan-field="name" maxlength="${LIMITS.name}" value="${escape(p.name)}" placeholder="e.g. The Formula project"${dis}></label>
    <label><span class="plan-label">Your vision for the car</span><textarea data-plan-field="vision" rows="2" maxlength="${LIMITS.vision}" placeholder="What should this car become? e.g. A '77 that drives like a modern sports car, keeps its looks, and is comfortable on a long trip."${dis}>${escape(p.vision)}</textarea></label>
  </div>`;
}

function knownBlock(p) {
  if (!p.vehicle) return '';
  const b = p.vehicle.id === 'custom' ? null : baseline(p.vehicle);
  const v = b?.v ?? resolve(p.vehicle.setup, p.vehicle.mode === 'after');
  const evidenceLabel = { manufacturer: 'Manufacturer', independent_test: 'Road test', 'road test': 'Road test',
    published: 'Published', measured: 'Measured', estimated: 'Estimate', estimate: 'Estimate', calculated: 'Calculated',
    user: 'Your setup' };
  const evidence = key => evidenceLabel[v.evidence?.[key]] ?? '';
  const cell = (label, value, unit, note = '') => `<div class="plan-fact"><span>${label}</span><strong>${value}${unit ? ` <small>${unit}</small>` : ''}</strong>${note ? `<em>${note}</em>` : ''}</div>`;
  const modeled = b ? METRIC_KEYS.map(k => {
    const r = b.runs[k];
    return r.ok ? cell(metricLabel(METRICS[k]), metricValue(METRICS[k], r.value), '') :
      cell(metricLabel(METRICS[k]), '—', '', 'Needs model inputs');
  }).join('') : '';
  return `<details class="plan-known">
    <summary>Vehicle baseline and model estimates</summary>
    <h3>Setup inputs</h3>
    <div class="plan-facts">${cell('Weight', units('weight', v.weight), '', evidence('weight'))}
      ${cell('Front share', Number.isFinite(v.front) ? fmt(v.front * 100, 1) : '—', Number.isFinite(v.front) ? '%' : '', evidence('front'))}${cell('Power', units('power', v.hp), '', evidence('hp'))}</div>
    ${modeled ? `<h3>Modeled results</h3><div class="plan-facts">${modeled}</div>
      <p class="plan-note">The setup combines available records with editable assumptions. Use the models to compare changes under the same conditions.</p>` :
      '<p class="plan-note">Use your custom setup as a planning reference. The Plan replay comparisons currently require a catalogue vehicle.</p>'}
  </details>`;
}

function metricLabel(metric) {
  if (metric.unit === 'ft') return `Stop from ${units('speed', 60, {metricDigits:1})}`;
  if (metric.unit === 'g') return `${units('distance', 200)} skidpad`;
  return metric.label;
}

function metricValue(metric, value, signed = false) {
  if (metric.unit === 'ft') return units('distance', value, { signed, digits: 1, metricDigits: 1 });
  return (signed && value > 0 ? '+' : '') + fmt(value, metric.digits) + ' ' + metric.unit;
}

function activeObjective(p) {
  return p.objectives.find(o => o.key === (S.open ?? p.focus)) ?? p.objectives[0];
}


function connections(p, o) {
  const present = p.objectives.map(x => x.key);
  const rel = relationsFor(o.key, present);
  const approach = OBJECTIVES[o.key].approaches.find(a => a.key === o.approach);
  const fx = approach ? Object.entries(approach.effects).filter(([k]) => present.includes(k) && k !== o.key) : [];
  if (!rel.length && !fx.length) {
    const others = OBJECTIVE_KEYS.filter(k => k !== o.key && !present.includes(k));
    const linked = relationsFor(o.key, others);
    return linked.length ? `<p class="plan-note">This objective also connects to ${linked.map(r => OBJECTIVES[r.other].short.toLowerCase()).join(', ')} — add those objectives to see how.</p>` : '';
  }
  const li = (k, sign, text) => `<li><span class="plan-sign" data-sign="${sign}" aria-label="${EFFECT[sign]}">${sign}</span> <b>${escape(OBJECTIVES[k].short)}</b> — ${escape(text)}</li>`;
  return `<div class="plan-connect"><h4>Trade-offs to investigate</h4><p class="plan-note">ESS engineering judgment. Check these relationships on your own setup.</p><ul>
    ${rel.map(r => li(r.other, r.sign, r.text)).join('')}
    ${fx.map(([k, [sign, text]]) => li(k, sign, `${approach.name}: ${text}`)).join('')}
  </ul></div>`;
}

// ------------------------------------------------------------------ model results (shared engines, same numbers as /replay/)
const VIEWS = [['experiment', 'Result'], ['question', 'Question'], ['learn', 'Learn'], ['approaches', 'Approaches'],
  ['components', 'Parts research'], ['decision', 'Decision'], ['verify', 'Measure']];

const fmtMetric = (metric, v, signed = false) => metric === 'brake'
  ? units('distance', v, { signed, digits: 0, metricDigits: 1 })
  : (signed && v > 0 ? '+' : '') + fmt(v, METRICS[metric].digits) + ' ' + METRICS[metric].unit;
const deltaWords = (metric, d) => {
  const a = Math.abs(d);
  if (a < 0.5 * 10 ** -(metric === 'brake' ? 0 : METRICS[metric].digits)) return 'about the same';
  const size = metric === 'brake' ? units('distance', a, { digits: 0, metricDigits: 1 }) : fmt(a, METRICS[metric].digits) + ' ' + METRICS[metric].unit;
  const good = d * METRICS[metric].better > 0;
  return `${size} ${{ accelerate: good ? 'quicker' : 'slower', brake: good ? 'shorter' : 'longer', corner: good ? 'more grip' : 'less grip' }[metric]}`;
};
const toInput = (metric, v) => metric === 'brake' ? toDisplay('distance', v) : v;
const fromInput = (metric, v) => metric === 'brake' ? fromDisplay('distance', v) : v;
const inputUnit = metric => metric === 'brake' ? unitLabel('distance') : METRICS[metric].unit;
const GAIN_WORD = { accelerate: 'quicker', brake: 'shorter', corner: 'more grip' };
const LOSS_WORD = { accelerate: 'slower', brake: 'longer', corner: 'less grip' };
/** An improvement (positive = better) in plain words, e.g. "0.18 s quicker". */
const gainWords = (metric, g) => {
  const a = Math.abs(g);
  if (a < 0.5 * 10 ** -(metric === 'brake' ? 0 : METRICS[metric].digits)) return 'no change';
  const size = metric === 'brake' ? units('distance', a, { digits: 0, metricDigits: 1 }) : fmt(a, METRICS[metric].digits) + ' ' + METRICS[metric].unit;
  return `${size} ${g > 0 ? GAIN_WORD[metric] : LOSS_WORD[metric]}`;
};

/** The objective's experiment on a vehicle: change, effects and labels, or a reason it can't run. */
function modelRun(vehicle, key) {
  const def = OBJECTIVES[key];
  if (!def.experiment) return { reason: def.experimentNote };
  if (!vehicle) return { reason: 'needs-car' };
  if (vehicle.id === 'custom') return { reason: 'Your custom setup can be measured and planned here, but the Plan model comparisons need a catalogue vehicle. Choose the closest reference car to explore the change.' };
  const change = resolveChange(def.experiment.change, vehicle);
  const fx = change && crossEffects(vehicle, change);
  if (!fx) return { reason: 'This car already has the stickiest tire class ESS models. Try a different change in the replays.' };
  if (!fx.rows.some(r => r.ok)) return { reason: 'This setup is missing an input the models need (weight, power or tires). Add it in My Garage or choose a reference car.' };
  const label = change.weight ? `${units('weight', Math.abs(change.weight))} ${change.weight < 0 ? 'lighter' : 'heavier'}`
    : def.experiment.label === 'Stickier tires' ? 'Stickier tires (' + fx.label + ')' : def.experiment.label;
  return { change, fx, label };
}

function headline(run, key) {
  const metric = LOOP_METRIC[key];
  const row = run.fx.rows.find(r => r.key === metric);
  if (!row?.ok) return '';
  const others = run.fx.rows.filter(r => r.key !== metric && r.ok);
  const short = { accelerate: 'quarter mile', brake: 'stop', corner: 'skidpad' };
  const same = others.filter(r => r.verdict === 'same').map(r => short[r.key]);
  return `<p class="plan-headline"><span>${escape(run.label)}:</span> <strong>${metricLabel(row)} ${fmtMetric(metric, row.before)} → ${fmtMetric(metric, row.after)}</strong>
    <em>${deltaWords(metric, row.after - row.before)}</em>${same.length ? `<small>${escape(same.join(' and '))} about the same</small>` : ''}</p>`;
}

function resultTable(vehicle, key, run, { planId = null } = {}) {
  const def = OBJECTIVES[key];
  const row = r => r.ok ? `<tr><th scope="row">${metricLabel(r)}</th><td>${metricValue(r, r.before)}</td>
    <td>${metricValue(r, r.after)}</td><td class="plan-v-${r.verdict}">${r.verdict === 'same' ? 'About the same' :
      metricValue(r, r.delta, true) + (r.verdict === 'better' ? ' better' : ' worse')}</td></tr>`
    : `<tr><th scope="row">${metricLabel(r)}</th><td colspan="3">${escape(r.text)}</td></tr>`;
  const insight = run.change.weight ? 'In this model, taking weight out changes acceleration more than the distance of a single cold stop: a lighter car’s tires also carry less load, so their grip falls nearly in step. Repeated stops, damping and transient response need separate tests.'
    : run.change.power ? 'More power changes acceleration only. The braking and skidpad tests run at fixed speeds, so they stay the same, though you arrive at each corner faster.' : '';
  const returnTo = planId && !readOnly() ? `&amp;plan=${encodeURIComponent(planId)}` : '';
  const withReturn = link => escape(link).replace('#', returnTo + '#');
  return `<p class="plan-label">ESS model prediction · ${escape(run.label)}</p><div class="plan-table"><table class="plan-fx" aria-label="ESS model prediction, ${escape(run.label)}">
    <thead><tr><th scope="col">Test</th><th scope="col">Now</th><th scope="col">Changed</th><th scope="col">Effect</th></tr></thead>
    <tbody>${run.fx.rows.map(row).join('')}</tbody></table></div>
    <p class="plan-note"><span class="plan-ev" data-ev="model">Model</span> Same car, same test conditions, one change. Quarter mile on the drag-strip clock (1-ft rollout, as road tests and timeslips are timed), stop from 60 mph, steady 200 ft circle. Real results depend on the car, surface and driver.${insight ? ' ' + insight : ''}</p>
    <p class="plan-links"><a href="${withReturn(replayHref(vehicle, run.change, def.experiment.replay))}">Watch it and adjust the change in the ${escape(EXPERIMENTS[def.experiment.replay].label.toLowerCase())} replay</a>
      ${(def.experiment.also ?? []).map(([t, k]) => ` · <a href="${withReturn(replayHref(vehicle, run.change, k))}">${escape(t)}</a>`).join('')}</p>`;
}

function firstStepHint(key) {
  const a = OBJECTIVES[key].approaches[0];
  return `<div class="plan-hint"><p class="plan-label">A common first step <span class="plan-ev" data-ev="judgment">ESS judgment</span></p>
    <p><strong>${escape(a.name)}.</strong> ${escape(a.what)} <span class="quiet">Cost ${escape(a.cost.toLowerCase())} · reversible: ${escape(a.reversible.toLowerCase())}.</span></p></div>`;
}

// ------------------------------------------------------------------ expectation → prediction → measurement
function expectationForm(key, metric, { guessing = false } = {}) {
  return `<form class="plan-inline plan-expect-form" data-plan-expect-form>
    <label><span>${guessing ? 'Your guess' : 'What you expect'}: how much ${escape(GAIN_WORD[metric])}? <small>(negative if worse)</small></span>
      <span class="plan-unit-input"><input name="v" inputmode="decimal" required aria-label="Expected improvement in ${escape(metricLabel(METRICS[metric]))}"><span>${escape(inputUnit(metric))} ${escape(GAIN_WORD[metric])}</span></span></label>
    <button class="button secondary" type="submit">${guessing ? 'Save my guess and reveal' : 'Save expectation'}</button></form>`;
}

function loopCard(p, o, run, { compact = false } = {}) {
  const metric = LOOP_METRIC[o.key];
  if (!metric) return '';
  const ro = readOnly();
  const cmp = compareLoop(o, signature(p.vehicle));
  const e = o.expectation, pr = o.prediction, m = o.measurement;
  const label = escape(metricLabel(METRICS[metric]));
  const clear = what => ro ? '' : ` <button type="button" class="plan-x" data-plan-clear="${what}">Clear</button>`;
  const expected = e ? `<p class="plan-loop-value">${Number.isFinite(e.gain) ? escape(gainWords(metric, e.gain)) : fmtMetric(metric, e.value)}</p>
      <p class="plan-note">${e.on ? escape(e.on) + ' · ' : ''}${e.afterReveal ? 'Entered after seeing the model prediction.' : 'Entered before seeing the model prediction.'}${Number.isFinite(e.gain) ? '' : ' An earlier absolute entry: not compared.'}${clear('expectation')}</p>
      ${cmp.expected ? `<p class="plan-note">Model: ${escape(gainWords(metric, cmp.expected.predicted))}. ${Math.abs(cmp.expected.expected - cmp.expected.predicted) < 0.5 * 10 ** -(metric === 'brake' ? 0 : METRICS[metric].digits) ? 'Your expectation matches it.' : cmp.expected.expected > cmp.expected.predicted ? 'You expect more than the model predicts.' : 'You expect less than the model predicts.'}</p>` : ''}`
    : ro ? '<p class="quiet">Not recorded.</p>' : expectationForm(o.key, metric);
  const live = run?.fx;
  const predicted = pr ? `<p class="plan-loop-value">${fmtMetric(metric, pr.before)} → ${fmtMetric(metric, pr.after)}</p>
      <p class="plan-note">${escape(pr.label)} on ${escape(pr.vname || vname(pr.vehicle))}${pr.on ? ' · saved ' + escape(pr.on) : ''}. ${deltaWords(metric, pr.after - pr.before)}.${clear('prediction')}</p>
      ${cmp.configChanged ? '<p class="plan-note plan-warn">Saved for an earlier configuration of this car. It is kept as it was.</p>'
        : live && !predictionCurrent(pr, live) ? `<p class="plan-note plan-warn">The model now gives ${escape(fmtMetric(metric, live.rows.find(r => r.key === metric)?.after ?? pr.after))}. Your saved prediction is unchanged.</p>` : ''}`
    : ro ? '<p class="quiet">Not saved.</p>' : live ? `<p class="quiet">The result above is live. Save it to keep it with this plan, unchanged, for later comparison.</p>
      <button type="button" class="button secondary" data-plan-save-prediction>Save this prediction</button>`
      : `<p class="quiet">${p.vehicle ? 'The model can’t run this change on this setup.' : 'Choose your car to run the model on it.'}</p>`;
  const methodOpts = `<option value="" selected>Choose how it was timed or measured…</option>` +
    Object.entries(METHODS[metric]).map(([k, v]) => `<option value="${k}">${escape(v)}</option>`).join('');
  const yes = (n, t) => `<label class="plan-check plan-confirm"><input type="checkbox" name="${n}"> ${t}</label>`;
  const measured = m ? `<p class="plan-loop-value">${Number.isFinite(m.before) ? fmtMetric(metric, m.before) + ' → ' : ''}${fmtMetric(metric, m.after)}</p>
      <p class="plan-note">${escape(METHODS[metric][m.method])}${m.conditions ? ' · ' + escape(m.conditions) : ''}${m.on ? ' · ' + escape(m.on) : ''}${clear('measurement')}</p>`
    : ro ? '<p class="quiet">Not measured.</p>' : compact ? `<p class="quiet">After you make the change and test it.</p>
      <button type="button" class="button secondary" data-plan-stage="verify">Record a measurement</button>` : `<form class="plan-measure-form" data-plan-measure-form>
      <div class="plan-measure"><label class="plan-block"><span>Before the change, same session</span><span class="plan-unit-input"><input name="before" inputmode="decimal"><span>${escape(inputUnit(metric))}</span></span></label>
      <label class="plan-block"><span>After the change</span><span class="plan-unit-input"><input name="after" inputmode="decimal" required><span>${escape(inputUnit(metric))}</span></span></label></div>
      <label class="plan-block"><span>How it was timed or measured</span><select name="method">${methodOpts}</select></label>
      <label class="plan-block"><span>Conditions</span><input name="conditions" maxlength="200" placeholder="e.g. same tires at 32 psi, dry, 55 °F, same driver"></label>
      <fieldset class="plan-confirms"><legend>For a numeric comparison with the model, confirm all three</legend>
        ${yes('sameConditions', 'Before and after used the same tires, pressures, surface, weather and driver')}
        ${yes('sameChange', `The only change between them is the one predicted: ${escape(pr?.label ?? 'the planned change')}`)}
        ${yes('sameConfig', `The car was otherwise in the configuration the prediction was made for${pr ? ' (' + escape(pr.vname || vname(pr.vehicle)) + ')' : ''}`)}
      </fieldset>
      <div class="plan-measure"><label class="plan-block plan-date"><span>Date</span><input type="date" name="on" value="${today()}"></label>
      <button class="button secondary" type="submit">Save measurement</button></div></form>`;
  let finding = '';
  if (cmp.measured?.kind === 'compare') {
    const d = cmp.measured.measured - cmp.measured.predicted;
    const close = Math.abs(d) < 0.5 * 10 ** -(metric === 'brake' ? 0 : METRICS[metric].digits);
    finding = `Measured improvement ${escape(gainWords(metric, cmp.measured.measured))}; predicted ${escape(gainWords(metric, cmp.measured.predicted))}. ` +
      (close ? 'They agree to the precision shown.' : `The measured change was ${escape(fmtMetric(metric, Math.abs(d)))} ${d > 0 ? 'larger' : 'smaller'} than predicted.`) +
      ' Same timing method, conditions, change and configuration confirmed. Single runs vary, so repeat runs before drawing conclusions.';
  } else if (cmp.measured?.kind === 'shown') {
    finding = `Shown side by side, not compared: ${cmp.measured.reasons.map(r => escape(NOT_COMPARED[r])).join('; ')}.` +
      (cmp.measured.reasons.includes('timing') ? ` This prediction uses the ${pr?.clock === 'standstill' ? 'from-first-motion clock' : 'drag-strip clock (1-ft rollout)'}; the two clocks differ by a few tenths of a second.` : '');
  }
  return `<section class="plan-loop${compact ? '' : ' plan-loop-stack'}" aria-label="Expected, predicted and measured ${label}">
    <h3>${label}: expected, predicted, measured</h3>
    <div class="plan-loop-grid">
      <div><p class="plan-label"><span class="plan-ev" data-ev="owner">You</span> Expected</p>${expected}</div>
      <div><p class="plan-label"><span class="plan-ev" data-ev="model">Model</span> Predicted</p>${predicted}</div>
      <div><p class="plan-label"><span class="plan-ev" data-ev="measured">Measured</span> Measured</p>${measured}</div>
    </div>${finding ? `<p class="plan-finding">${finding}</p>` : ''}
  </section>`;
}

// ------------------------------------------------------------------ objective views
function componentsBody(o) {
  const def = OBJECTIVES[o.key], c = def.components;
  const items = c ? [...componentExamplesFor(c.category), ...(c.also ? componentExamplesFor(c.also) : [])].slice(0, 4) : [];
  return `<p>What to compare before you buy, whatever the brand <span class="plan-ev" data-ev="judgment">ESS judgment</span></p>
    <ul class="plan-checklist">${def.checklist.map(t => `<li>${escape(t)}</li>`).join('')}</ul>
    ${items.length ? `<details class="plan-notes"><summary>Sourced examples (other cars)</summary>
      <p class="plan-note">ESS doesn’t have sourced parts for every car yet. These show which facts to look for; they are not recommendations for your car.</p>
      <ul class="plan-components">${items.map(x => `<li><b>${escape(x.name)}</b><span><strong>Listed application</strong> · ${escape(x.application)}</span>
      ${x.facts?.length ? `<small>${x.facts.slice(0, 2).map(([k, v]) => `${escape(k)}: ${escape(v)}`).join(' · ')}</small>` : ''}
      ${x.source?.url ? `<a href="${escape(x.source.url)}" rel="noopener" target="_blank">Source: ${escape(x.source.locator ?? 'maker')}</a>` : ''}</li>`).join('')}</ul></details>` : ''}`;
}

function resultView(p, o) {
  const def = OBJECTIVES[o.key];
  const run = modelRun(p.vehicle, o.key);
  if (run.reason && run.reason !== 'needs-car') return `<p>${escape(run.reason)}</p>${def.experiment ? '' : firstStepHint(o.key)}${loopCard(p, o, null, { compact: true })}`;
  if (run.reason === 'needs-car') {
    const ex = modelRun(EXAMPLE, o.key);
    return `<p class="plan-car-line"><span class="plan-tag">Example car</span> <strong>${escape(vname(EXAMPLE))}</strong>, documented reference record. Not your car.
      ${readOnly() ? '' : '<button type="button" class="button primary" data-open-catalog data-vehicle-key="plan">Run it on my car</button>'}</p>
      ${ex.fx ? headline(ex, o.key) + resultTable(EXAMPLE, o.key, ex) : ''}${loopCard(p, o, null, { compact: true })}`;
  }
  const sig = signature(p.vehicle);
  const hide = S.guess && !readOnly() && !o.expectation && !o.prediction && !S.revealed.has(o.key);
  if (hide) return `<div class="plan-guess"><p><strong>Guess first.</strong> How much will ${escape(run.label.toLowerCase())} change the ${escape(metricLabel(METRICS[LOOP_METRIC[o.key]]).toLowerCase())}?</p>
    ${expectationForm(o.key, LOOP_METRIC[o.key], { guessing: true })}
    <button type="button" class="button plain" data-plan-reveal>Skip and show the model</button></div>`;
  S.seen.add(o.key + '|' + sig);
  return headline(run, o.key) + resultTable(p.vehicle, o.key, run, { planId: p.id }) + loopCard(p, o, run, { compact: true });
}

function viewBody(p, o, view) {
  const def = OBJECTIVES[o.key], dis = readOnly() ? ' disabled' : '';
  if (view === 'experiment') return resultView(p, o);
  if (view === 'question') return `<p class="plan-question">${escape(def.question)}</p><p class="plan-note">Your own version of the question belongs in Notes below.</p>`;
  if (view === 'learn') return `<ul class="plan-learn">${def.learn.map(([t, h, why]) => `<li><a href="${h}">${escape(t)}</a> — ${escape(why)}</li>`).join('')}</ul>`;
  if (view === 'approaches') return `<div class="plan-approaches" role="radiogroup" aria-label="Engineering approaches for ${escape(def.short)}">${def.approaches.map(a => `
    <label class="plan-approach${o.approach === a.key ? ' chosen' : ''}"><input type="radio" name="approach-${o.key}" value="${a.key}" data-plan-approach${o.approach === a.key ? ' checked' : ''}${dis}>
      <span class="plan-approach-name">${escape(a.name)}</span><span>${escape(a.what)}</span>
      <span class="plan-bands"><span>Cost: ${a.cost}</span><span>Fabrication: ${a.fab}</span><span>Reversible: ${a.reversible}</span></span></label>`).join('')}</div>
    <p class="plan-note"><span class="plan-ev" data-ev="judgment">ESS judgment</span> Cost, fabrication and reversibility are typical bands, not ratings. Choosing an approach buys nothing and can change later.${o.key === 'handling' ? ' For a 1970–81 Camaro or Firebird, the guide below compares four front-suspension approaches in detail.' : ''}</p>`;
  if (view === 'components') return componentsBody(o);
  if (view === 'decision') return o.approach ? `<p>Approach: <b>${escape(def.approaches.find(a => a.key === o.approach).name)}</b></p>
      <label class="plan-block"><span>What you decided: parts, order, budget</span><textarea rows="3" maxlength="${LIMITS.note}" data-plan-obj-field="decisionNote"${dis}>${escape(o.decisionNote)}</textarea></label>
      ${readOnly() ? '' : o.done.decision ? '<p class="plan-note">Decision recorded. Edit the text any time; it saves as you go.</p><button type="button" class="button plain" data-plan-undecide>Reopen the decision</button>'
        : '<button type="button" class="button secondary" data-plan-decide>Record decision</button>'}`
    : `<p>Choose an approach first, so the decision has something to commit to.</p>${readOnly() ? '' : '<button type="button" class="button secondary" data-plan-stage="approaches">Compare approaches</button>'}`;
  if (view === 'verify') {
    const run = LOOP_METRIC[o.key] && p.vehicle ? modelRun(p.vehicle, o.key) : null;
    return `<p>${escape(def.verify)}</p><p class="plan-links">${def.verifyTools.map(([t, h]) => `<a href="${h}">${escape(t)}</a>`).join(' · ')}</p>
      ${loopCard(p, o, run?.fx ? run : null)}
      <details class="plan-notes"${o.measured ? ' open' : ''}><summary>Other observations</summary>
      <div class="plan-measure"><label class="plan-block"><span>What you noticed or measured</span><input data-plan-measured maxlength="${LIMITS.measured}" value="${escape(o.measured)}" placeholder="e.g. turns in sooner, less roll, 0.86 g on a 200 ft circle"${dis}></label>
      <label class="plan-block plan-date"><span>Date</span><input type="date" data-plan-measured-on value="${escape(o.measuredOn)}"${dis}></label></div>
      ${readOnly() ? '' : '<button type="button" class="button plain" data-plan-save-measure>Save observation</button>'}</details>
      ${readOnly() || !(o.measurement || o.measured) ? '' : '<p class="plan-note">Built and measured? Update the car’s setup in <a href="../experience/#garage">My Garage</a> so future plans start from it. Plan never changes your Garage on its own.</p>'}`;
  }
  return '';
}

function viewDone(o, view) {
  return { experiment: !!o.prediction, approaches: !!o.approach, decision: !!o.done.decision, verify: !!(o.measurement || o.measured) }[view] ?? false;
}

function objectiveDetail(p, o) {
  const dis = readOnly() ? ' disabled' : '';
  const view = VIEWS.some(([k]) => k === S.step) ? S.step : 'experiment';
  const related = connections(p, o);
  const acc = accomplishments(o);
  const modeled = !!OBJECTIVES[o.key].experiment;
  const next = readOnly() ? null : suggestion(o, { hasCar: !!p.vehicle && p.vehicle.id !== 'custom', modeled: modeled && p.vehicle?.id !== 'custom' });
  return `<article class="plan-objective" data-objective="${o.key}">
    <header class="plan-obj-head">
      <h2>${escape(OBJECTIVES[o.key].name)}</h2>
      ${acc.length || o.blockers.length ? `<ul class="plan-acc">${acc.map(a => `<li>${escape(a.text)}</li>`).join('')}${o.blockers.length ? `<li class="plan-open">${o.blockers.length} open question${o.blockers.length > 1 ? 's' : ''}</li>` : ''}</ul>` : ''}
      ${next && next.view !== view ? `<p class="plan-next">Suggested next: ${next.view === 'car'
        ? `<button type="button" class="plan-link" data-open-catalog data-vehicle-key="plan">${escape(next.text)}</button>`
        : `<button type="button" class="plan-link" data-plan-stage="${next.view}">${escape(next.text)}</button>`}</p>` : ''}
    </header>
    <nav class="plan-stages" aria-label="${escape(OBJECTIVES[o.key].short)} views">${VIEWS.map(([k, label]) =>
      `<button type="button" data-plan-stage="${k}" ${k === view ? 'aria-current="true"' : ''}>${viewDone(o, k) ? '<span aria-label="Done">✓ </span>' : ''}${escape(label)}</button>`).join('')}</nav>
    <section class="plan-step-body" aria-labelledby="plan-step-title">
      <h3 id="plan-step-title" tabindex="-1" class="plan-sr">${escape(VIEWS.find(([k]) => k === view)[1])}</h3>${viewBody(p, o, view)}
    </section>
    ${related ? `<details class="plan-notes"><summary>Trade-offs with your other objectives</summary>${related}</details>` : ''}
    <details class="plan-notes" data-plan-notes><summary>Notes and open questions${o.blockers.length ? ` (${o.blockers.length})` : ''}</summary>
      <div class="plan-side">
      <label class="plan-block"><span>What you already know about this</span><textarea rows="2" maxlength="${LIMITS.note}" data-plan-obj-field="notes" placeholder="Measurements, quotes, what you’ve tried, your own question"${dis}>${escape(o.notes)}</textarea></label>
      <div class="plan-blockers"><span class="plan-label">What’s stopping you</span>
        ${o.blockers.length ? `<ul>${o.blockers.map((b, i) => `<li>${escape(b)}${readOnly() ? '' : ` <button type="button" class="plan-x" data-plan-unblock="${i}" aria-label="Resolve: ${escape(b)}">Resolved</button>`}</li>`).join('')}</ul>` : '<p class="quiet">Something to learn, measure or decide?</p>'}
        ${readOnly() || o.blockers.length >= LIMITS.blockers ? '' : `<form data-plan-block-form class="plan-inline"><input name="b" maxlength="${LIMITS.blocker}" placeholder="e.g. Don’t know my current camber gain" aria-label="Add something that is stopping you"><button class="button plain" type="submit">Add</button></form>`}
      </div>
      ${readOnly() ? '' : `<button type="button" class="button plain plan-remove" data-plan-remove-objective>Remove this objective</button>`}
    </div></details>
  </article>`;
}

/** One scannable board card: the objective's most meaningful outcome so far. */
function boardCard(p, o, selected) {
  const metric = LOOP_METRIC[o.key];
  const def = OBJECTIVES[o.key];
  let line = '';
  if (o.measurement) line = `Measured ${fmtMetric(metric, o.measurement.after)}`;
  else if (o.measured) line = 'Result measured';
  else if (o.done.decision) line = 'Decision recorded';
  else if (o.prediction) line = `Predicted ${fmtMetric(metric, o.prediction.before)} → ${fmtMetric(metric, o.prediction.after)}`;
  else if (o.approach) line = `Approach: ${def.approaches.find(a => a.key === o.approach)?.name}`;
  else line = def.experiment ? (p.vehicle ? 'Model result ready' : 'Choose a car for the model') : 'Not modeled yet: approaches and notes';
  const extra = [o.approach && (o.prediction || o.done.decision || o.measurement) ? def.approaches.find(a => a.key === o.approach)?.name : '',
    o.blockers.length ? `${o.blockers.length} open` : ''].filter(Boolean).join(' · ');
  return `<li><button type="button" data-plan-toggle="${o.key}" aria-pressed="${o === selected}"><strong>${escape(def.short)}</strong>
    <span>${escape(line)}</span>${extra ? `<small>${escape(extra)}</small>` : ''}</button></li>`;
}

function objectiveButtons(present = [], current = null) {
  return OBJECTIVE_KEYS.filter(key => !present.includes(key)).map(key =>
    `<button type="button" class="plan-chip" data-plan-add="${key}"${key === current ? ' aria-pressed="true"' : ''}>${escape(OBJECTIVES[key].name)}</button>`).join('');
}

function projectPicker() {
  const plans = S.store.projects;
  return plans.length ? `<label class="plan-switch"><span class="plan-label">Saved plans</span>
    <select data-plan-switch><option value="">Choose a plan</option>${plans.map(p =>
      `<option value="${escape(p.id)}"${project()?.id === p.id ? ' selected' : ''}>${escape(pname(p))}</option>`).join('')}</select></label>` : '';
}

function guessToggle() {
  return `<label class="plan-check plan-guess-toggle"><input type="checkbox" data-plan-guess${S.guess ? ' checked' : ''}> Guess first: hide the model result until I’ve written what I expect</label>`;
}

// ------------------------------------------------------------------ exploration: value before saving anything
function exploreCar() {
  const own = S.exploreVehicle ?? starterVehicle();
  return own ? { vehicle: own, example: false } : { vehicle: EXAMPLE, example: true };
}

function explorePanel(key) {
  const def = OBJECTIVES[key];
  const { vehicle, example } = exploreCar();
  const garage = getGarage();
  const run = modelRun(vehicle, key);
  const carLine = example
    ? `<p class="plan-car-line"><span class="plan-tag">Example car</span> <strong>${escape(vname(vehicle))}</strong>, documented reference record. Not your car.</p>`
    : `<p class="plan-car-line">On <strong>${escape(vname(vehicle))}</strong>${vehicle.mode === 'after' ? ' <span class="plan-tag">Your build</span>' : ''}</p>`;
  const carActions = `<div class="plan-actions"><button type="button" class="button ${example ? 'primary' : 'secondary'}" data-open-catalog data-vehicle-key="explore">${example ? 'Use my car' : 'Change car'}</button>
    ${garage.length ? `<label class="plan-garage-pick"><span>From My Garage</span><select data-plan-explore-garage><option value="">Choose a saved car…</option>${garage.map(g => `<option value="${escape(g.key)}">${escape(setupName(g.setup))} · ${g.mode === 'after' ? 'Modified' : 'Original'}</option>`).join('')}</select></label>` : ''}</div>`;
  let body;
  const sig = signature(vehicle);
  if (run.reason) body = `<p>${escape(run.reason === 'needs-car' ? 'Choose a car to run this comparison.' : run.reason)}</p>`;
  else if (S.guess && !S.revealed.has(key)) {
    const metric = LOOP_METRIC[key];
    body = `<div class="plan-guess"><p><strong>Guess first.</strong> How much will ${escape(run.label.toLowerCase())} change the ${escape(metricLabel(METRICS[metric]).toLowerCase())}?</p>
      ${expectationForm(key, metric, { guessing: true })}<button type="button" class="button plain" data-plan-reveal>Skip and show the model</button></div>`;
  } else {
    S.seen.add(key + '|' + sig);
    const d = S.draft?.key === key && S.draft.sig === sig ? S.draft : null;
    body = headline(run, key) + resultTable(vehicle, key, run) +
      (d ? `<p class="plan-note"><span class="plan-ev" data-ev="owner">You</span> Your guess: ${escape(gainWords(LOOP_METRIC[key], d.gain))}${d.afterReveal ? '' : ' (before seeing the model)'}. ${example ? 'It applies to the example car, so it is not saved with a plan.' : 'It is saved with the plan.'}</p>` : '');
  }
  return `<section class="plan-explore" aria-labelledby="plan-explore-h" data-explore="${key}">
    <p class="plan-label">Exploring · nothing saved yet</p>
    <h2 id="plan-explore-h" tabindex="-1">${escape(def.name)}</h2>
    ${carLine}${carActions}
    ${body}
    ${firstStepHint(key)}
    <div class="plan-actions plan-explore-actions">
      <button type="button" class="button primary" data-plan-save-explore>${S.store.projects.length ? 'Save as a new plan' : 'Save to a plan'}</button>
      <a class="button plain" href="${def.learn[0][1]}">Why? ${escape(def.learn[0][0])}</a>
    </div>
    <p class="plan-note">Saving keeps this ${example ? 'objective' : 'objective, car and model prediction'} in this browser, to continue from My Garage later.${example ? ' Choose your car first to keep the prediction too.' : ''}</p>
  </section>`;
}

function render() {
  if (!root) return;
  const p = project();
  const status = `<p class="plan-status" role="status" data-plan-status>${escape(S.status)}</p>`;
  if (!p) {
    const vehicle = starterVehicle();
    root.innerHTML = `<section class="plan-start">
      ${projectPicker()}
      <h2>What do you want to improve?</h2>
      <p>${vehicle ? `Pick one and see what the ESS models predict for <strong>${escape(vname(vehicle))}</strong>.` :
        'Pick one and see what the ESS models predict, right away. Nothing is saved until you choose.'}</p>
      <div class="plan-add">${objectiveButtons([], S.explore)}</div>
      ${guessToggle()}${status}
    </section>${S.explore ? explorePanel(S.explore) : ''}`;
    bindUnitControls(root);
    return;
  }
  const prog = progress(p);
  const selected = activeObjective(p);
  const present = p.objectives.map(o => o.key);
  const baseLabel = p.vehicle ? (p.vehicle.mode === 'after' ? 'Modified setup' : p.vehicle.id === 'custom' ? 'Custom setup' : 'Reference baseline') : '';
  const carLabel = p.vehicle ? (p.name ? `${vname(p.vehicle)} · ${baseLabel.toLowerCase()}` : baseLabel) : '';
  root.innerHTML = `
    ${readOnly() ? `<div class="plan-shared"><strong>Shared plan · Read-only</strong>
      <p>Explore this plan or save your own editable copy.</p>
      <div class="plan-actions"><button type="button" class="button primary" data-plan-keep>Save a copy to my plans</button>
      <button type="button" class="button plain" data-plan-dismiss>Close shared plan</button></div></div>` : ''}
    <section class="plan-project" aria-label="Project">
      <div class="plan-project-head">
        <div><h2 data-plan-name>${escape(pname(p))}</h2>
          <p class="plan-summary">${p.vehicle ? escape(carLabel) : readOnly() ? 'No car chosen' : 'No car yet · <button type="button" class="plan-link" data-open-catalog data-vehicle-key="plan">Choose your car</button>'}</p>
          <p class="plan-summary quiet">${prog.objectives} objective${prog.objectives !== 1 ? 's' : ''}${prog.predictions ? ` · ${prog.predictions} predicted` : ''}${prog.decisions ? ` · ${prog.decisions} decided` : ''}${prog.measured ? ` · ${prog.measured} measured` : ''}${prog.blockers ? ` · ${prog.blockers} open question${prog.blockers > 1 ? 's' : ''}` : ''}</p>
        </div>
        ${readOnly() ? '' : `<div class="plan-actions"><button type="button" class="button secondary" data-plan-share>Share plan</button>
          <a class="button secondary" href="../experience/#garage">My Garage</a></div>`}
      </div>
      ${status}
      <details class="plan-notes" data-plan-details><summary>Project details: car, name, vision and saved plans</summary>
        <div class="plan-project-grid">${vehicleBlock(p)}${identityBlock(p)}</div>
        ${knownBlock(p)}
        ${readOnly() ? '' : `${projectPicker()}<div class="plan-actions">
          <button type="button" class="button secondary" data-plan-new>Start another plan</button>
          <button type="button" class="button plain" data-plan-delete>Delete this plan</button></div>`}
      </details>
    </section>
    <div class="plan-workspace">
      <section class="plan-objectives" aria-labelledby="plan-obj-h">
        <h2 id="plan-obj-h">Objectives</h2>
        ${selected ? `<ul class="plan-objective-list">${p.objectives.map(o => boardCard(p, o, selected)).join('')}</ul>` : ''}
        ${readOnly() || present.length === OBJECTIVE_KEYS.length ? '' : selected ?
          `<details class="plan-notes plan-add-more"><summary>Add an objective</summary><div class="plan-add">${objectiveButtons(present)}</div>${guessToggle()}</details>` :
          `<div class="plan-add">${objectiveButtons()}</div>${guessToggle()}`}
      </section>
      ${selected ? objectiveDetail(p, selected) : ''}
    </div>
    <div class="plan-tail"><a href="#method">Build planning guide</a><div>${unitsControl('plan-units')}</div></div>`;
  bindUnitControls(root);
}
// ------------------------------------------------------------------ events
function setStatus(text) { S.status = text; const el = root.querySelector('[data-plan-status]'); if (el) el.textContent = text; }

function chooseVehicle(veh, { activate = false } = {}) {
  const p = project();
  if (!p || !veh) return;
  const changed = p.vehicle && (p.vehicle.id !== veh.id ||
    !sameConfiguration(p.vehicle, { setup:veh.setup ?? newSetup(veh.id), mode:veh.mode ?? 'before' }));
  // A new baseline reopens tests, decisions and verification. Saved expectations, predictions and measurements stay as
  // they were, attributable to the configuration they were made for.
  const objectives = changed ? p.objectives.map(o => {
    const done = { ...o.done };
    delete done.experiment; delete done.decision; delete done.verify;
    return { ...o, done };
  }) : p.objectives;
  if (!commit({ ...p, vehicle: veh, objectives }, `Plan car set to ${vname(veh)}. Saved in this browser.`)) return;
  if (activate && !getActive()) useConfig(veh.setup ?? newSetup(veh.id), veh.mode ?? 'before');
  S.step = 'experiment';
  render();
  root.querySelector('#plan-step-title')?.focus({ preventScroll: true });
}

function showStep(key = null) {
  S.step = key;
  render();
  (root.querySelector('.plan-stages [aria-current]') ?? root.querySelector('#plan-step-title'))?.focus({ preventScroll: true });
  root.querySelector('.plan-objective')?.scrollIntoView({ block: 'nearest' });
}

function showExplore(key) {
  S.explore = key;
  render();
  const h = root.querySelector('#plan-explore-h');
  h?.focus({ preventScroll: true });
  h?.closest('.plan-explore')?.scrollIntoView({ block: 'start', behavior: 'instant' });
}

// In-page confirmation (browser dialogs are unreliable on phones and in embedded previews): first tap arms the button.
function armed(button, prompt) {
  if (button.dataset.armed === '1') return true;
  button.dataset.armed = '1'; const label = button.textContent; button.textContent = prompt;
  setTimeout(() => { if (button.isConnected) { button.dataset.armed = ''; button.textContent = label; } }, 5000);
  return false;
}

function saveExplore() {
  const key = S.explore;
  if (!key) return;
  const { vehicle, example } = exploreCar();
  const owned = example ? null : vehicle;
  let objective = newObjective(key);
  const run = owned ? modelRun(owned, key) : null;
  if (run?.fx) {
    const prediction = predictionFrom(key, owned, run.change, run.fx, { vname: vname(owned), label: run.label, on: today() });
    if (prediction) objective = { ...objective, prediction, done: { ...objective.done, experiment: true } };
  }
  const d = S.draft?.key === key && owned && S.draft.sig === signature(owned) ? S.draft : null;
  if (d) objective = { ...objective, expectation: { metric: LOOP_METRIC[key], gain: d.gain, on: today(), afterReveal: d.afterReveal } };
  const p = { ...newProject(owned), focus: key, objectives: [objective] };
  S.fresh = false;
  if (!commit(p, owned ? `Saved with ${vname(owned)} and its model prediction. Continue any time from My Garage.` :
    'Saved. Choose your car in the plan to run and keep model predictions for it.')) return;
  if (owned && !getActive()) useConfig(owned.setup ?? newSetup(owned.id), owned.mode ?? 'before');
  S.explore = null; S.exploreVehicle = null; S.draft = null;
  S.open = key; S.step = 'experiment';
  render();
  root.querySelector('.plan-project')?.scrollIntoView({ block: 'nearest' });
}

function currentRun(p, key) {
  return p?.vehicle ? modelRun(p.vehicle, key) : null;
}

const cleanExpectationFor = (key, raw) => cleanObjective({ key, expectation: { metric: LOOP_METRIC[key], ...raw } })?.expectation ?? null;
const parseNum = v => { const n = Number.parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };

root?.addEventListener('click', e => {
  const t = e.target.closest('button, a');
  if (!t || !root.contains(t)) return;
  const card = t.closest('[data-objective]'), key = card?.dataset.objective;
  if (t.dataset.planAdd) {
    const objective = t.dataset.planAdd;
    const p = project();
    if (!p) { showExplore(objective); return; }
    if (p.objectives.some(o => o.key === objective)) return;
    if (!commit({ ...p, focus: objective, objectives: [...p.objectives, newObjective(objective)] }, `${OBJECTIVES[objective].short} added. Saved in this browser.`)) return;
    S.open = objective;
    showStep('experiment');
  } else if (t.hasAttribute('data-plan-save-explore')) {
    saveExplore();
  } else if (t.hasAttribute('data-plan-reveal')) {
    const k = key ?? t.closest('[data-explore]')?.dataset.explore;
    if (k) { S.revealed.add(k); render(); }
  } else if (t.dataset.planToggle) {
    S.open = t.dataset.planToggle;
    if (!readOnly()) commit({ ...project(), focus: S.open }, S.status);
    showStep('experiment');
  } else if (t.dataset.planStage) {
    showStep(t.dataset.planStage);
  } else if (t.hasAttribute('data-plan-use-active')) {
    const active = getActive();
    if (!active) return;
    const base = fromConfiguration(active);
    const match = getGarage().find(entry => sameConfiguration(base, entry));
    chooseVehicle(match ? fromConfiguration(active, match.key) : base);
  } else if (t.hasAttribute('data-plan-save-prediction') && key) {
    const p = project(), run = currentRun(p, key);
    const prediction = run?.fx && predictionFrom(key, p.vehicle, run.change, run.fx, { vname: vname(p.vehicle), label: run.label, on: today() });
    if (!prediction) { setStatus('The model could not run this change on this car.'); return; }
    commit(updateObjective(p, key, o => ({ ...o, prediction, done: { ...o.done, experiment: true } })), 'Prediction saved with this plan. It stays as it is now.');
    render();
  } else if (t.dataset.planClear && key) {
    const what = t.dataset.planClear;
    if (!armed(t, 'Tap again to clear')) return;
    const p = project();
    commit(updateObjective(p, key, o => {
      const next = { ...o, done: { ...o.done } };
      delete next[what];
      if (what === 'prediction') delete next.done.experiment;
      if (what === 'measurement' && !o.measured) delete next.done.verify;
      return next;
    }), 'Cleared. Saved.');
    render();
  } else if (t.hasAttribute('data-plan-decide') && key) {
    const p = project(), o = p.objectives.find(x => x.key === key);
    const field = card.querySelector('[data-plan-obj-field="decisionNote"]');
    const note = field?.value ?? o.decisionNote;
    if (!note.trim()) { setStatus('Write what you decided first: parts, order or budget.'); field?.focus(); return; }
    commit(updateObjective(p, key, x => setStep({ ...x, decisionNote: note }, 'decision', true)), 'Decision recorded. Saved.');
    render();
  } else if (t.hasAttribute('data-plan-undecide') && key) {
    commit(updateObjective(project(), key, x => setStep(x, 'decision', false)), 'Decision reopened. Your note is kept.');
    render();
  } else if (t.hasAttribute('data-plan-remove-objective') && key) {
    if (!armed(t, `Tap again to remove ${OBJECTIVES[key].short.toLowerCase()} and its notes`)) return;
    const p = project(); commit({ ...p, objectives: p.objectives.filter(o => o.key !== key) }, 'Objective removed. Saved.'); S.open = null; S.step = null; render();
  } else if (t.dataset.planUnblock !== undefined && key) {
    const i = +t.dataset.planUnblock; const p = project();
    commit(updateObjective(p, key, o => ({ ...o, blockers: o.blockers.filter((_, j) => j !== i) })), 'Marked resolved. Saved.'); render();
    root.querySelector('[data-plan-notes]').open = true;
  } else if (t.hasAttribute('data-plan-save-measure') && key) {
    const m = card.querySelector('[data-plan-measured]').value, d = card.querySelector('[data-plan-measured-on]').value;
    const p = project();
    commit(updateObjective(p, key, o => {
      const next = { ...o, measured: m, measuredOn: d, done: { ...o.done } };
      if (m.trim() || o.measurement) next.done.verify = true; else delete next.done.verify;
      return next;
    }), m.trim() ? 'Observation saved.' : 'Observation cleared. Saved.'); render();
  } else if (t.hasAttribute('data-plan-share')) {
    const fragment = encodePlan(project());
    if (!fragment) { setStatus('This plan is too large for a share link. Reduce the length of its notes to share it.'); return; }
    const url = location.origin + location.pathname + '#' + fragment;
    shareResult(url, 'My vehicle development plan', project().name || 'ESS vehicle development plan').then(r =>
      setStatus(r === 'copied' ? 'Link copied. Anyone with it sees a copy of this plan.' : r === 'shared' ? 'Shared.' : r === 'cancelled' ? '' : 'Copy the link below.'));
    root.querySelector('[data-plan-copy-url]')?.remove();
    const field = document.createElement('input');
    field.type = 'url'; field.readOnly = true; field.value = url;
    field.setAttribute('data-plan-copy-url', ''); field.setAttribute('aria-label', 'Plan share link');
    field.addEventListener('focus', () => field.select());
    const consent = document.createElement('p');
    consent.dataset.planShareDetails = ''; consent.className = 'plan-note';
    consent.textContent = 'Anyone with this link can read the plan, including its notes, expectations, measurements and vehicle setup.';
    root.querySelector('[data-plan-share-details]')?.remove();
    root.querySelector('[data-plan-status]').after(consent, field);
  } else if (t.hasAttribute('data-plan-keep')) {
    if (loadStore().projects.length >= LIMITS.projects) {
      setStatus(`You already have ${LIMITS.projects} plans. Remove one from your saved plans to save this copy.`);
      return;
    }
    const copy = { ...S.shared, id: undefined, name: S.shared.name ? S.shared.name.slice(0, LIMITS.name - 7) + ' (copy)' : '' };
    S.shared = null;
    commit(cleanProject(copy), 'Copy saved to your plans.');
    S.open = null; S.step = null; render();
  } else if (t.hasAttribute('data-plan-dismiss')) {
    S.shared = null;
    history.replaceState(null, '', location.pathname + location.search);
    S.open = null; S.step = null; S.status = ''; render();
  } else if (t.hasAttribute('data-plan-new')) {
    // Another plan starts from exploration again: nothing is saved until the visitor chooses.
    S.store = { ...S.store, active: null }; S.fresh = true; S.explore = null; S.open = null; S.step = null;
    S.status = 'Pick an objective to start another plan.';
    history.replaceState(null, '', location.pathname); render();
    root.querySelector('.plan-add button')?.focus();
  } else if (t.hasAttribute('data-plan-delete')) {
    if (!armed(t, 'Confirm plan deletion')) return;
    const next = remove(S.transient ? S.store : loadStore(), project().id);
    if (!saveStore(next)) { setStatus('This browser could not delete the plan.'); return; }
    S.store = next; S.open = null; S.step = null; S.status = 'Plan deleted.'; updateUrl(project()); render();
  }
});

root?.addEventListener('change', e => {
  const t = e.target, card = t.closest('[data-objective]'), key = card?.dataset.objective, p = project();
  if (t.matches('[data-plan-guess]')) {
    const inAddMore = !!t.closest('.plan-add-more');
    S.guess = t.checked; sessionSet('ess.plan.guess', t.checked ? '1' : null); render();
    if (inAddMore) root.querySelector('.plan-add-more')?.setAttribute('open', '');
    root.querySelector('[data-plan-guess]')?.focus({ preventScroll: true });
    return;
  }
  if (t.matches('[data-plan-explore-garage]') && t.value) {
    const entry = getGarage().find(x => x.key === t.value);
    if (entry) { S.exploreVehicle = fromConfiguration(entry, entry.key); S.draft = null; render(); root.querySelector('#plan-explore-h')?.focus({ preventScroll: true }); }
    return;
  }
  if (readOnly()) return;
  if (t.matches('[data-plan-switch]')) {
    if (selectProject(t.value)) { S.status = 'Saved in this browser.'; S.explore = null; render(); }
    return;
  }
  if (!p) return;
  if (t.matches('[data-plan-approach]') && key) {
    const o = p.objectives.find(o => o.key === key);
    if (!commit(updateObjective(p, key, x => setStep(
      o.approach !== t.value ? setStep(x, 'decision', false) : x, 'approaches', true, { approach: t.value }
    )), 'Approach chosen. Saved in this browser.')) return;
    for (const input of card.querySelectorAll('[data-plan-approach]')) {
      input.closest('.plan-approach').classList.toggle('chosen', input.checked);
    }
    setStatus(S.status);
  } else if (t.matches('[data-plan-garage]') && t.value) {
    const entry = getGarage().find(x => x.key === t.value);
    if (entry) chooseVehicle(fromConfiguration(entry, entry.key), { activate: true });
  } else if (t.matches('[data-plan-field]')) {
    if (commit({ ...p, [t.dataset.planField]: t.value })) {
      root.querySelector('[data-plan-name]').textContent = pname(project());
      const current = root.querySelector('[data-plan-switch] option:checked');
      if (current) current.textContent = pname(project());
      setStatus(S.status);
    }
  } else if (t.matches('[data-plan-obj-field]') && key) {
    commit(updateObjective(p, key, o => ({ ...o, [t.dataset.planObjField]: t.value })));
    setStatus(S.status);
  }
});

root?.addEventListener('submit', e => {
  const expectForm = e.target.closest('[data-plan-expect-form]');
  if (expectForm) {
    e.preventDefault();
    const card = expectForm.closest('[data-objective]'), exploreKey = expectForm.closest('[data-explore]')?.dataset.explore;
    const key = card?.dataset.objective ?? exploreKey, metric = LOOP_METRIC[key];
    const raw = parseNum(expectForm.elements.v.value);
    const gain = raw === null ? null : fromInput(metric, raw);
    const bad = `That doesn’t look like a ${metricLabel(METRICS[metric]).toLowerCase()} value.`;
    if (gain === null) { setStatus('Enter a number.'); return; }
    if (exploreKey) {
      const { vehicle } = exploreCar(), sig = signature(vehicle);
      const draft = { key, sig, gain, afterReveal: S.seen.has(key + '|' + sig) };
      if (!cleanExpectationFor(key, draft)) { setStatus(bad); return; }
      S.draft = draft; S.revealed.add(key); render();
      return;
    }
    if (readOnly()) return;
    const p = project(), sig = signature(p.vehicle), o = p.objectives.find(x => x.key === key);
    const expectation = { metric, gain, on: today(), afterReveal: S.seen.has(key + '|' + sig) || !!o.prediction };
    if (!cleanExpectationFor(key, expectation)) { setStatus(bad); return; }
    commit(updateObjective(p, key, x => ({ ...x, expectation })), 'Expectation saved.');
    S.revealed.add(key); render();
    return;
  }
  const measureForm = e.target.closest('[data-plan-measure-form]');
  if (measureForm) {
    e.preventDefault();
    if (readOnly()) return;
    const key = measureForm.closest('[data-objective]').dataset.objective, metric = LOOP_METRIC[key], f = measureForm.elements;
    const after = parseNum(f.after.value), before = parseNum(f.before.value);
    const p = project();
    const measurement = { metric, after: after === null ? null : fromInput(metric, after), before: before === null ? null : fromInput(metric, before),
      method: f.method.value || 'other', sameConditions: f.sameConditions.checked, sameChange: f.sameChange.checked, sameConfig: f.sameConfig.checked,
      conditions: f.conditions.value, on: f.on.value, sig: signature(p.vehicle) };
    const next = updateObjective(p, key, o => ({ ...o, measurement, done: { ...o.done, verify: true } }));
    if (!cleanObjective(next.objectives.find(o => o.key === key))?.measurement) { setStatus(`That doesn’t look like a ${metricLabel(METRICS[metric]).toLowerCase()} value.`); return; }
    commit(next, 'Measurement saved.');
    render();
    return;
  }
  const f = e.target.closest('[data-plan-block-form]'); if (!f) return;
  e.preventDefault();
  const key = f.closest('[data-objective]').dataset.objective, val = f.elements.b.value.trim();
  if (!val) return;
  commit(updateObjective(project(), key, o => ({ ...o, blockers: [...o.blockers, val] })), 'Open question added. Saved.'); render();
  root.querySelector('[data-plan-notes]').open = true;
  root.querySelector(`[data-objective="${key}"] [data-plan-block-form] input`)?.focus();
});

document.addEventListener('ess:vehicle-selected', e => {
  const k = e.target?.dataset?.vehicleKey;
  if (k === 'explore') {
    const veh = cleanVehicle({ id: e.detail?.id });
    if (veh) { S.exploreVehicle = veh; S.draft = null; render(); root.querySelector('#plan-explore-h')?.focus({ preventScroll: true }); }
    return;
  }
  if (k !== 'plan' || readOnly()) return;
  const veh = cleanVehicle({ id: e.detail?.id });
  if (veh) chooseVehicle(veh, { activate: true });
});

window.addEventListener('hashchange', () => {
  const shared = decodePlan(location.hash);
  if (S.shared || shared || location.hash.startsWith('#p=')) {
    S.shared = shared;
    S.open = null; S.step = null;
    S.status = !shared && location.hash.startsWith('#p=') ? 'This shared plan link could not be opened.' : '';
    render();
  }
});
window.addEventListener('storage', e => {
  if (e.key !== PLAN_KEY || S.transient || readOnly()) return;
  const id = project()?.id;
  const fresh = loadStore();
  S.store = fresh.projects.some(p => p.id === id) ? { ...fresh, active: id } : fresh;
  if (id && !S.store.projects.some(p => p.id === id)) {
    S.status = 'That plan was removed in another tab.';
    S.open = null; S.step = null; updateUrl(project()); render();
  }
});
document.addEventListener('ess:units-changed', () => {
  const open = root.querySelector('[data-plan-details]')?.open;
  render();
  if (open) root.querySelector('[data-plan-details]').open = true;
  root.querySelector('[data-units-pref]')?.focus({ preventScroll: true });
});

installCatalog(document, { label: 'Choose your car', templates: false });
if (location.hash.startsWith('#p=') && !S.shared) S.status = 'This shared plan link could not be opened.';
render();
