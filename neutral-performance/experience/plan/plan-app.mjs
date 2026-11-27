// ESS Plan — interactive vehicle development plan (owner direction, 26 Nov 2026 evening).
// One plan per vehicle project holding several objectives. Saved in this browser (ess.plan.v1); vehicle identity
// comes from the shared catalogue, active configuration and My Garage. Opt-in share link reproduces a read-only copy.
import { OBJECTIVES, OBJECTIVE_KEYS, STEPS, EFFECT, relationsFor } from './objectives.mjs';
import { loadStore, saveStore, upsert, remove, newProject, newObjective, cleanProject, setStep, nextStep, stage, summary, planHref, PLAN_KEY,
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
import { format as units, unitsControl, bindUnitControls } from '../units.mjs';

const root = document.querySelector('[data-ess-plan]');
const query = new URLSearchParams(location.search);
const requested = query.get('project');
const garageEntry = getGarage().find(g => g.key === query.get('garage'));
const incoming = garageEntry ? cleanVehicle({
  id: garageEntry.setup.id, setup: garageEntry.setup, mode: garageEntry.mode, garageKey: garageEntry.key,
}) : cleanVehicle({ id: query.get('car') });
const S = { store: loadStore(), open: null, step: null, shared: decodePlan(location.hash),
  status: '', fresh: !!incoming, transient: false };

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

function objectiveTitle(o) {
  const n = nextStep(o);
  return o.done.verify || o.done.decision ? stage(o) : n?.label ?? stage(o);
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

function experimentBody(p, o) {
  const def = OBJECTIVES[o.key];
  if (!def.experiment) return `<p>${escape(def.experimentNote)}</p>`;
  if (!p.vehicle) return `<p>Choose a car above and this step runs the experiment on it. Until then, <a href="../replay/#${def.experiment.replay}">watch the replay on an example car</a>.</p>`;
  if (p.vehicle.id === 'custom') return '<p>You can investigate this change on a reference car or verify it with your own measurements. The Plan replay comparisons currently require a catalogue vehicle.</p>';
  const change = resolveChange(def.experiment.change, p.vehicle);
  const fx = change && crossEffects(p.vehicle, change);
  if (!fx) return `<p>This car already has the stickiest tire class ESS models, so try a different change in the replays.</p><p><a href="../replay/?car=${encodeURIComponent(p.vehicle.id)}#${def.experiment.replay}">Open the replays on this car</a></p>`;
  const row = r => r.ok ? `<tr><th scope="row">${metricLabel(r)}</th><td>${metricValue(r, r.before)}</td>
    <td>${metricValue(r, r.after)}</td><td class="plan-v-${r.verdict}">${r.verdict === 'same' ? 'About the same' :
      metricValue(r, r.delta, true) + (r.verdict === 'better' ? ' better' : ' worse')}</td></tr>`
    : `<tr><th scope="row">${metricLabel(r)}</th><td colspan="3">${escape(r.text)}</td></tr>`;
  const insight = change.weight ? 'In this model, taking weight out can change acceleration more than it changes the distance of a single cold stop. Repeated stops, damping and transient response call for separate tests.'
    : change.power ? 'Power changes the acceleration model. Braking and skidpad tests use their own fixed conditions.' : '';
  const label = change.weight ? `${units('weight', Math.abs(change.weight))} ${change.weight < 0 ? 'lighter' : 'heavier'}`
    : def.experiment.label === 'Stickier tires' ? 'Stickier tires (' + fx.label + ')' : def.experiment.label;
  const href = replayHref(p.vehicle, change, def.experiment.replay);
  const returnTo = readOnly() ? '' : `&amp;plan=${encodeURIComponent(p.id)}`;
  const withReturn = link => escape(link).replace('#', returnTo + '#');
  return `<p class="plan-label">ESS model comparison · ${escape(label)}</p>
    <div class="plan-table"><table class="plan-fx"><thead><tr><th scope="col">Test</th><th scope="col">Current</th><th scope="col">Changed</th><th scope="col">Effect</th></tr></thead>
    <tbody>${fx.rows.map(row).join('')}</tbody></table></div>
    <p class="plan-note">Use the differences to choose what to investigate. Actual results depend on the car and test conditions. Quarter-mile times start from rest.</p>
    ${insight ? `<p class="plan-note">${insight}</p>` : ''}
    <p class="plan-links"><a href="${withReturn(href)}">Try it in the ${escape(EXPERIMENTS[def.experiment.replay].label.toLowerCase())} replay</a>
      ${(def.experiment.also ?? []).map(([t, k]) => ` · <a href="${withReturn(replayHref(p.vehicle, change, k))}">${escape(t)}</a>`).join('')}</p>`;
}

function componentsBody(o) {
  const c = OBJECTIVES[o.key].components;
  if (!c) return '<p>ESS has no sourced component examples for this objective yet. Compare approaches on cost, fabrication and reversibility, and weigh what you install.</p>';
  const items = [...componentExamplesFor(c.category), ...(c.also ? componentExamplesFor(c.also) : [])].slice(0, 4);
  if (!items.length) return '<p>No sourced examples in this category yet.</p>';
  return `<p>Use these sourced examples to compare specifications, what is included and how the parts mount. Each example applies to the vehicle listed below. Confirm fitment with the manufacturer before buying.</p>
    <ul class="plan-components">${items.map(x => `<li><b>${escape(x.name)}</b><span><strong>Listed application</strong> · ${escape(x.application)}</span>
      ${x.facts?.length ? `<small>${x.facts.slice(0, 2).map(([k, v]) => `${escape(k)}: ${escape(v)}`).join(' · ')}</small>` : ''}
      ${x.source?.url ? `<a href="${escape(x.source.url)}" rel="noopener" target="_blank">Source: ${escape(x.source.locator ?? 'maker')}</a>` : ''}</li>`).join('')}</ul>`;
}

function stepBody(p, o, s) {
  const def = OBJECTIVES[o.key], done = !!o.done[s.key], dis = readOnly() ? ' disabled' : '';
  const check = label => `<label class="plan-check"><input type="checkbox" data-plan-step="${s.key}"${done ? ' checked' : ''}${dis}> ${label}</label>`;
  let body = '';
  if (s.key === 'question') body = `<p class="plan-question">${escape(def.question)}</p>${check('This is my question for this car')}`;
  if (s.key === 'learn') body = `<p>Read the explanation that answers your question, then try the model comparison.</p><ul class="plan-learn">${def.learn.map(([t, h, why]) => `<li><a href="${h}">${escape(t)}</a> — ${escape(why)}</li>`).join('')}</ul>${check('I understand the mechanism well enough to compare approaches')}`;
  if (s.key === 'experiment') body = experimentBody(p, o) + (def.experiment && p.vehicle && p.vehicle.id !== 'custom' && resolveChange(def.experiment.change, p.vehicle) ? check('I’ve reviewed the model comparison') : check('I’ve reviewed what I can test'));
  if (s.key === 'approaches') body = `<div class="plan-approaches" role="radiogroup" aria-label="Engineering approaches for ${escape(def.short)}">${def.approaches.map(a => `
    <label class="plan-approach${o.approach === a.key ? ' chosen' : ''}"><input type="radio" name="approach-${o.key}" value="${a.key}" data-plan-approach${o.approach === a.key ? ' checked' : ''}${dis}>
      <span class="plan-approach-name">${escape(a.name)}</span><span>${escape(a.what)}</span>
      <span class="plan-bands"><span>Cost: ${a.cost}</span><span>Fabrication: ${a.fab}</span><span>Reversible: ${a.reversible}</span></span></label>`).join('')}</div>
    <p class="plan-note">Cost, fabrication and reversibility are ESS estimates for typical installations. Check your car and budget before committing.${o.key === 'handling' ? ' For a 1970–81 Camaro or Firebird, the guide below compares four front-suspension approaches in detail.' : ''}</p>`;
  if (s.key === 'components') body = '<p class="plan-label">Research examples · verify exact fitment</p>' + componentsBody(o) + check('I’ve evaluated components for my approach');
  if (s.key === 'decision') body = o.approach ? `<p>Approach: <b>${escape(def.approaches.find(a => a.key === o.approach).name)}</b></p>
      <label class="plan-block"><span>What I’ve decided (parts, order, budget)</span><textarea rows="2" maxlength="${LIMITS.note}" data-plan-obj-field="decisionNote"${dis}>${escape(o.decisionNote)}</textarea></label>${check('Decision made')}`
    : '<p>Choose an approach before recording a decision.</p><button type="button" class="button secondary" data-plan-stage="approaches">Compare approaches</button>';
  if (s.key === 'verify') body = `<p>${escape(def.verify)}</p><p class="plan-links">${def.verifyTools.map(([t, h]) => `<a href="${h}">${escape(t)}</a>`).join(' · ')}</p>
    ${o.measured && !o.done.verify ? '<p class="plan-note">Previously recorded measurement. Check that it still applies to this setup.</p>' : ''}
    <div class="plan-measure"><label class="plan-block"><span>What I measured</span><input data-plan-measured maxlength="${LIMITS.measured}" value="${escape(o.measured)}" placeholder="e.g. 0.86 g on a 200 ft circle, same tires, 32 psi"${dis}></label>
    <label class="plan-block plan-date"><span>Date</span><input type="date" data-plan-measured-on value="${escape(o.measuredOn)}"${dis}></label></div>
    ${readOnly() ? '' : '<button type="button" class="button secondary" data-plan-save-measure>Save result</button>'}`;
  const pos = STEPS.indexOf(s);
  const next = s.key === 'approaches' ? STEPS[pos + 1] : null;
  return `<section class="plan-step-body" aria-labelledby="plan-step-title">
    <h3 id="plan-step-title" tabindex="-1">${escape(s.title)}</h3>${body}
    ${next ? `<button type="button" class="button secondary plan-continue" data-plan-stage="${next.key}">Go to ${escape(next.label.toLowerCase())}</button>` : ''}
    </section>`;
}

function objectiveDetail(p, o) {
  const dis = readOnly() ? ' disabled' : '';
  const step = STEPS.find(s => s.key === S.step) ?? nextStep(o) ?? STEPS.at(-1);
  const related = connections(p, o);
  return `<article class="plan-objective" data-objective="${o.key}">
    <header class="plan-obj-head">
      <h2>${escape(OBJECTIVES[o.key].name)}</h2>
      <p class="plan-stage">${escape(stage(o))}${o.blockers.length ? ` · ${o.blockers.length} open question${o.blockers.length > 1 ? 's' : ''}` : ''}</p>
    </header>
    <nav class="plan-stages" aria-label="Objective steps">${STEPS.map(s =>
      `<button type="button" data-plan-stage="${s.key}" ${s === step ? 'aria-current="step"' : ''}>${o.done[s.key] ? '<span aria-label="Completed">✓ </span>' : ''}${escape(s.label)}</button>`).join('')}</nav>
    ${stepBody(p, o, step)}
    ${related ? `<details class="plan-notes"><summary>Related objectives</summary>${related}</details>` : ''}
    <details class="plan-notes" data-plan-notes><summary>Notes and open questions${o.blockers.length ? ` (${o.blockers.length})` : ''}</summary>
      <div class="plan-side">
      <label class="plan-block"><span>What I already know about this</span><textarea rows="2" maxlength="${LIMITS.note}" data-plan-obj-field="notes" placeholder="Measurements, quotes, what you’ve tried"${dis}>${escape(o.notes)}</textarea></label>
      <div class="plan-blockers"><span class="plan-label">What’s stopping me</span>
        ${o.blockers.length ? `<ul>${o.blockers.map((b, i) => `<li>${escape(b)}${readOnly() ? '' : ` <button type="button" class="plan-x" data-plan-unblock="${i}" aria-label="Resolve: ${escape(b)}">Resolved</button>`}</li>`).join('')}</ul>` : '<p class="quiet">What do you need to learn, measure or decide?</p>'}
        ${readOnly() || o.blockers.length >= LIMITS.blockers ? '' : `<form data-plan-block-form class="plan-inline"><input name="b" maxlength="${LIMITS.blocker}" placeholder="e.g. Don’t know my current camber gain" aria-label="Add something that is stopping you"><button class="button plain" type="submit">Add</button></form>`}
      </div>
      ${readOnly() ? '' : `<button type="button" class="button plain plan-remove" data-plan-remove-objective>Remove this objective</button>`}
    </div></details>
  </article>`;
}

function objectiveButtons(present = []) {
  return OBJECTIVE_KEYS.filter(key => !present.includes(key)).map(key =>
    `<button type="button" class="plan-chip" data-plan-add="${key}">${escape(OBJECTIVES[key].name)}</button>`).join('');
}

function projectPicker() {
  const plans = S.store.projects;
  return plans.length ? `<label class="plan-switch"><span class="plan-label">Saved plans</span>
    <select data-plan-switch><option value="">Choose a plan</option>${plans.map(p =>
      `<option value="${escape(p.id)}"${project()?.id === p.id ? ' selected' : ''}>${escape(pname(p))}</option>`).join('')}</select></label>` : '';
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
      <p>${vehicle ? `Start with <strong>${escape(vname(vehicle))}</strong>. You can change the car in Project details.` :
        'Pick one objective. Choose a car now or add one after you start.'}</p>
      <div class="plan-add">${objectiveButtons()}</div>
      <p class="plan-note">Plans save in this browser and reopen from My Garage.</p>${status}
    </section>`;
    return;
  }
  const sum = summary(p);
  const selected = activeObjective(p);
  const present = p.objectives.map(o => o.key);
  root.innerHTML = `
    ${readOnly() ? `<div class="plan-shared"><strong>Shared plan · Read-only</strong>
      <p>Explore this plan or save your own editable copy.</p>
      <div class="plan-actions"><button type="button" class="button primary" data-plan-keep>Save a copy to my plans</button>
      <button type="button" class="button plain" data-plan-dismiss>Close shared plan</button></div></div>` : ''}
    <section class="plan-project" aria-label="Project">
      <div class="plan-project-head">
        <div><h2 data-plan-name>${escape(pname(p))}</h2>
          <p class="plan-summary">${escape((p.name || !p.vehicle ? vname(p.vehicle) || 'Vehicle to be chosen' : p.vehicle.mode === 'after' ? 'Modified setup' : 'Vehicle baseline'))} · ${sum.objectives} objective${sum.objectives !== 1 ? 's' : ''}
            ${sum.decisions ? ` · ${sum.decisions} decided` : ''}${sum.measured ? ` · ${sum.measured} measured` : ''}</p>
        </div>
        ${readOnly() ? '' : `<div class="plan-actions"><button type="button" class="button secondary" data-plan-share>Share plan</button>
          <a class="button secondary" href="../experience/#garage">My Garage</a></div>`}
      </div>
      ${status}
      <details class="plan-notes" data-plan-details><summary>Project details</summary>
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
        ${selected ? `<ul class="plan-objective-list">${p.objectives.map(o =>
          `<li><button type="button" data-plan-toggle="${o.key}" aria-pressed="${o === selected}"><strong>${escape(OBJECTIVES[o.key].short)}</strong>
            <span>${o === selected ? 'Current · ' : ''}${escape(objectiveTitle(o))}</span></button></li>`).join('')}</ul>` : ''}
        ${readOnly() || present.length === OBJECTIVE_KEYS.length ? '' : selected ?
          `<details class="plan-notes plan-add-more"><summary>Add an objective</summary><div class="plan-add">${objectiveButtons(present)}</div></details>` :
          `<div class="plan-add">${objectiveButtons()}</div>`}
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
  const objectives = changed ? p.objectives.map(o => {
    const done = { ...o.done };
    delete done.experiment; delete done.decision; delete done.verify;
    return { ...o, done };
  }) : p.objectives;
  if (!commit({ ...p, vehicle: veh, objectives }, `Plan vehicle set to ${vname(veh)}. Saved in this browser.`)) return;
  if (activate && !getActive()) useConfig(veh.setup ?? newSetup(veh.id), veh.mode ?? 'before');
  render();
  root.querySelector('[data-plan-details]').open = true;
  root.querySelector('[data-open-catalog]')?.focus({ preventScroll: true });
}

function showStep(key = null) {
  S.step = key;
  render();
  const title = root.querySelector('#plan-step-title');
  title?.focus({ preventScroll: true });
  title?.scrollIntoView({ block: 'nearest' });
}

// In-page confirmation (browser dialogs are unreliable on phones and in embedded previews): first tap arms the button.
function armed(button, prompt) {
  if (button.dataset.armed === '1') return true;
  button.dataset.armed = '1'; const label = button.textContent; button.textContent = prompt;
  setTimeout(() => { if (button.isConnected) { button.dataset.armed = ''; button.textContent = label; } }, 5000);
  return false;
}

root?.addEventListener('click', e => {
  const t = e.target.closest('button, a');
  if (!t || !root.contains(t)) return;
  const card = t.closest('[data-objective]'), key = card?.dataset.objective;
  if (t.dataset.planAdd) {
    const beginningWithVehicle = S.fresh && incoming;
    const p = project() ?? newProject(starterVehicle());
    const objective = t.dataset.planAdd;
    if (p.objectives.some(o => o.key === objective)) return;
    if (!commit({ ...p, focus: objective, objectives: [...p.objectives, newObjective(objective)] })) return;
    if (beginningWithVehicle && !getActive()) {
      useConfig(incoming.setup ?? newSetup(incoming.id), incoming.mode ?? 'before');
    }
    S.open = objective;
    showStep();
  } else if (t.dataset.planToggle) {
    S.open = t.dataset.planToggle;
    if (!readOnly()) commit({ ...project(), focus: S.open });
    showStep();
  } else if (t.dataset.planStage) {
    showStep(t.dataset.planStage);
  } else if (t.hasAttribute('data-plan-use-active')) {
    const active = getActive();
    if (!active) return;
    const base = fromConfiguration(active);
    const match = getGarage().find(entry => sameConfiguration(base, entry));
    chooseVehicle(match ? fromConfiguration(active, match.key) : base);
  }
  else if (t.hasAttribute('data-plan-remove-objective') && key) {
    if (!armed(t, `Tap again to remove ${OBJECTIVES[key].short.toLowerCase()} and its notes`)) return;
    const p = project(); commit({ ...p, objectives: p.objectives.filter(o => o.key !== key) }, 'Objective removed. Saved.'); S.open = null; S.step = null; render();
  } else if (t.dataset.planUnblock !== undefined && key) {
    const i = +t.dataset.planUnblock; const p = project();
    commit(updateObjective(p, key, o => ({ ...o, blockers: o.blockers.filter((_, j) => j !== i) })), 'Marked resolved. Saved.'); render();
    root.querySelector('[data-plan-notes]').open = true;
  } else if (t.hasAttribute('data-plan-save-measure') && key) {
    const m = card.querySelector('[data-plan-measured]').value, d = card.querySelector('[data-plan-measured-on]').value;
    const p = project();
    commit(updateObjective(p, key, o => setStep(o, 'verify', !!m.trim(), { measured: m, measuredOn: d })), m.trim() ? 'Result recorded. Saved.' : 'Result cleared. Saved.'); render();
  } else if (t.hasAttribute('data-plan-share')) {
    const fragment = encodePlan(project());
    if (!fragment) { setStatus('This plan is too large for a share link. Reduce the length of its notes to share it.'); return; }
    const url = location.origin + location.pathname + '#' + fragment;
    shareResult(url, 'My vehicle development plan', project().name || 'ESS vehicle development plan').then(r =>
      setStatus(r === 'copied' ? 'Link copied. Anyone with it sees a copy of this plan.' : r === 'shared' ? 'Shared.' : r === 'cancelled' ? '' : 'Copy the link below.'));
    const oldLink = root.querySelector('[data-plan-copy-url]');
    oldLink?.remove();
    const field = document.createElement('input');
    field.type = 'url';
    field.readOnly = true;
    field.value = url;
    field.setAttribute('data-plan-copy-url', '');
    field.setAttribute('aria-label', 'Plan share link');
    field.addEventListener('focus', () => field.select());
    const consent = document.createElement('p');
    consent.dataset.planShareDetails = '';
    consent.className = 'plan-note';
    consent.textContent = 'Anyone with this link can read the plan, including its notes and vehicle setup.';
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
    if (!commit(newProject(starterVehicle()), 'New plan started. Saved in this browser.')) return;
    S.open = null; S.step = null; render();
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
  if (readOnly()) return;
  if (t.matches('[data-plan-switch]')) {
    if (selectProject(t.value)) { S.status = 'Saved in this browser.'; render(); }
    return;
  }
  if (!p) return;
  if (t.matches('[data-plan-step]') && key) {
    if (!commit(updateObjective(p, key, o => setStep(o, t.dataset.planStep, t.checked)))) return;
    const next = t.checked ? STEPS[STEPS.findIndex(s => s.key === t.dataset.planStep) + 1] : null;
    showStep(next?.key ?? t.dataset.planStep);
  } else if (t.matches('[data-plan-approach]') && key) {
    const o = p.objectives.find(o => o.key === key);
    if (!commit(updateObjective(p, key, x => setStep(
      o.approach !== t.value ? setStep(x, 'decision', false) : x, 'approaches', true, { approach: t.value }
    )), 'Approach selected. Saved in this browser.')) return;
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
  const f = e.target.closest('[data-plan-block-form]'); if (!f) return;
  e.preventDefault();
  const key = f.closest('[data-objective]').dataset.objective, val = f.elements.b.value.trim();
  if (!val) return;
  commit(updateObjective(project(), key, o => ({ ...o, blockers: [...o.blockers, val] })), 'Open question added. Saved.'); render();
  root.querySelector('[data-plan-notes]').open = true;
  root.querySelector(`[data-objective="${key}"] [data-plan-block-form] input`)?.focus();
});

document.addEventListener('ess:vehicle-selected', e => {
  if (e.target?.dataset?.vehicleKey !== 'plan' || readOnly()) return;
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

installCatalog(document, { label: 'Choose the car for this plan', templates: false });
if (location.hash.startsWith('#p=') && !S.shared) S.status = 'This shared plan link could not be opened.';
render();
