// ESS Plan — interactive vehicle development plan (owner direction, 26 Nov 2026 evening).
// One plan per vehicle project holding several objectives. Saved in this browser (ess.plan.v1); vehicle identity
// comes from the shared catalogue, active configuration and My Garage. Opt-in share link reproduces a read-only copy.
import { OBJECTIVES, OBJECTIVE_KEYS, STEPS, EFFECT, relationsFor } from './objectives.mjs';
import { loadStore, saveStore, upsert, remove, newProject, newObjective, setStep, completed, nextStep, stage, summary,
  encodePlan, decodePlan, cleanVehicle, LIMITS } from './plan-store.mjs';
import { baseline, crossEffects, resolveChange, replayHref, METRICS, METRIC_KEYS } from './effects.mjs';
import { EXPERIMENTS } from '../replay/runs.mjs';
import { componentExamplesFor } from '../../engine/component-reference.mjs';
import { getActive, getGarage, useConfig, shareResult } from '../configuration.mjs';
import { newSetup } from '../models.mjs';
import { vehicles } from '../vehicles.mjs';
import { setupName } from '../matchup.mjs';
import { installCatalog } from '../catalog.mjs';
import { escape, fmt } from '../ui.mjs';

const root = document.querySelector('[data-ess-plan]');
const S = { store: loadStore(), open: null, shared: decodePlan(location.hash), status: '' };

const project = () => S.shared ?? S.store.projects.find(p => p.id === S.store.active) ?? null;
const vname = veh => veh ? (veh.setup ? setupName(veh.setup) : vehicles[veh.id]?.name ?? veh.id) : '';
const readOnly = () => !!S.shared;

function commit(p, message = 'Saved in this browser.') {
  if (readOnly()) return;
  const next = upsert(S.store, p);
  if (!next) { S.status = `You can keep up to ${LIMITS.projects} plans in this browser. Remove one to start another.`; render(); return; }
  S.store = next;
  S.status = saveStore(S.store) ? message : 'This browser is not saving (private mode or storage blocked). Your plan lasts until you leave the page.';
}

function ensureProject() {
  let p = project();
  if (!p) {
    const active = getActive();
    p = newProject(active ? cleanVehicle({ id: active.setup.id, setup: active.setup, mode: active.mode }) : null);
    commit(p, 'Plan started. Saved in this browser.');
    p = project();
  }
  return p;
}

const updateObjective = (p, key, fn) => ({ ...p, objectives: p.objectives.map(o => o.key === key ? fn(o) : o) });

// ------------------------------------------------------------------ rendering
function vehicleBlock(p) {
  const active = getActive(), garage = getGarage();
  const offerActive = active && (!p.vehicle || p.vehicle.id !== active.setup.id || JSON.stringify(p.vehicle.setup ?? null) !== JSON.stringify(active.mode === 'after' ? active.setup : null) && active.mode === 'after');
  const garageOptions = garage.map(g => `<option value="${escape(g.key)}"${p.vehicle?.garageKey === g.key ? ' selected' : ''}>${escape(setupName(g.setup))} · ${g.mode === 'after' ? 'Modified' : 'Original'}</option>`).join('');
  return `<div class="plan-vehicle">
    <p class="plan-label">Vehicle</p>
    ${p.vehicle ? `<p class="plan-car"><strong>${escape(vname(p.vehicle))}</strong>${p.vehicle.mode === 'after' ? ' <span class="plan-tag">your build</span>' : ' <span class="plan-tag">documented record</span>'}</p>`
      : `<p class="plan-car quiet">No car chosen yet. You can start with your objectives and choose the car later.</p>`}
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
  const b = baseline(p.vehicle);
  if (!b) return '';
  const v = b.v;
  const cell = (label, value, unit, note = '') => `<div class="plan-fact"><span>${label}</span><strong>${value}${unit ? ` <small>${unit}</small>` : ''}</strong>${note ? `<em>${note}</em>` : ''}</div>`;
  const runCell = k => { const r = b.runs[k], m = METRICS[k]; return r.ok ? cell(m.label, fmt(r.value, m.digits), m.unit, k === 'corner' ? `${fmt(r.raw.mph, 1)} mph` : '') : cell(m.label, '—', '', 'needs data'); };
  return `<section class="plan-known" aria-labelledby="plan-known-h">
    <h3 id="plan-known-h">What you already know</h3>
    <div class="plan-facts">
      ${cell('Weight', fmt(v.weight), 'lb')}${cell('Front share', Number.isFinite(v.front) ? fmt(v.front * 100, 1) : '—', '%')}${cell('Power', fmt(v.hp), 'hp')}
      ${METRIC_KEYS.map(runCell).join('')}
    </div>
    <p class="plan-note">${p.vehicle.mode === 'after' ? 'Your saved build' : 'Documented record'}, run through the ESS models. On average the models are within about 2% (¼ mile), 2.5% (braking) and 2.5% (skidpad) of published tests. Your own measurements are better than any model: record them in each objective.</p>
  </section>`;
}

function stepMarks(o) {
  return `<ol class="plan-marks" aria-label="Progress">${STEPS.map(s => `<li class="${o.done[s.key] ? 'done' : ''}${nextStep(o)?.key === s.key ? ' next' : ''}" title="${s.title}"><span>${s.label}</span><b class="vr-sr">${o.done[s.key] ? ' (done)' : ''}</b></li>`).join('')}</ol>`;
}

function objectiveCard(p, o) {
  const def = OBJECTIVES[o.key], open = S.open === o.key, n = nextStep(o), done = completed(o);
  return `<article class="plan-objective${open ? ' open' : ''}" data-objective="${o.key}">
    <header class="plan-obj-head">
      <div><h3>${escape(def.name)}</h3><p class="plan-stage">${stage(o)}${o.blockers.length ? ` · <span class="plan-blocked">${o.blockers.length} open question${o.blockers.length > 1 ? 's' : ''}</span>` : ''}</p></div>
      <button type="button" class="button ${open ? 'plain' : 'secondary'}" data-plan-toggle="${o.key}" aria-expanded="${open}">${open ? 'Close' : 'Open'}</button>
    </header>
    ${stepMarks(o)}
    <p class="plan-next">${n ? `<b>Next:</b> ${escape(n.title)}` : '<b>Done:</b> decision made and result measured.'}</p>
    ${done.length ? `<p class="plan-done quiet">${done.map(escape).join(' · ')}</p>` : ''}
    ${open ? objectiveDetail(p, o) : ''}
  </article>`;
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
  return `<div class="plan-connect"><h4>How this affects your other objectives</h4><ul>
    ${rel.map(r => li(r.other, r.sign, r.text)).join('')}
    ${fx.map(([k, [sign, text]]) => li(k, sign, `${approach.name}: ${text}`)).join('')}
  </ul></div>`;
}

function experimentBody(p, o) {
  const def = OBJECTIVES[o.key];
  if (!def.experiment) return `<p>${escape(def.experimentNote)}</p>`;
  if (!p.vehicle) return `<p>Choose a car above and this step runs the experiment on it. Until then, <a href="../replay/#${def.experiment.replay}">watch the replay on an example car</a>.</p>`;
  const change = resolveChange(def.experiment.change, p.vehicle);
  const fx = change && crossEffects(p.vehicle, change);
  if (!fx) return `<p>This car already has the stickiest tire class ESS models, so try a different change in the replays.</p><p><a href="../replay/?car=${encodeURIComponent(p.vehicle.id)}#${def.experiment.replay}">Open the replays on this car</a></p>`;
  const row = r => r.ok ? `<tr><th scope="row">${r.label}</th><td>${fmt(r.before, r.digits)} ${r.unit}</td><td>${fmt(r.after, r.digits)} ${r.unit}</td>
      <td class="plan-v-${r.verdict}">${r.verdict === 'same' ? 'about the same' : (r.delta > 0 ? '+' : '−') + fmt(Math.abs(r.delta), r.digits) + ' ' + r.unit + (r.verdict === 'better' ? ' better' : ' worse')}</td></tr>`
    : `<tr><th scope="row">${r.label}</th><td colspan="3">${escape(r.text)}</td></tr>`;
  const sames = fx.rows.filter(r => r.ok && r.verdict === 'same').map(r => r.label.toLowerCase());
  const insight = change.weight && sames.length ? ` A heavier or lighter car stops and corners at almost the same distance and grip in one steady run, because tire grip rises with load; the difference shows up in acceleration, in heat over repeated stops and in transitions.`
    : change.power && sames.length ? ' More power changes acceleration only; steady stops and cornering grip stay the same, though you arrive at each corner faster.' : '';
  return `<p>One change on your car — <b>${escape(def.experiment.label === 'Stickier tires' ? 'stickier tires (' + fx.label + ')' : def.experiment.label)}</b> — run through all three ESS tests, so you can see what it does for every objective, not just this one.</p>
    <div class="table-wrap"><table class="plan-fx"><thead><tr><th scope="col">Test</th><th scope="col">Now</th><th scope="col">With the change</th><th scope="col">Effect</th></tr></thead>
    <tbody>${fx.rows.map(row).join('')}</tbody></table></div>
    ${insight ? `<p class="plan-note">${insight}</p>` : ''}
    <p class="plan-links"><a href="${escape(replayHref(p.vehicle, change, def.experiment.replay))}">Watch it: ${escape(EXPERIMENTS[def.experiment.replay].label.toLowerCase())}, before and after</a>
      ${(def.experiment.also ?? []).map(([t, k]) => ` · <a href="${escape(replayHref(p.vehicle, change, k))}">${escape(t)}</a>`).join('')}</p>`;
}

function componentsBody(p, o) {
  const c = OBJECTIVES[o.key].components;
  if (!c) return '<p>ESS has no sourced component examples for this objective yet. Compare approaches on cost, fabrication and reversibility, and weigh what you install.</p>';
  const items = [...componentExamplesFor(c.category), ...(c.also ? componentExamplesFor(c.also) : [])].slice(0, 4);
  if (!items.length) return '<p>No sourced examples in this category yet.</p>';
  return `<p>What to look for when you compare parts: sourced examples from the ESS component reference. Most are for other cars — they show which facts matter (what’s included, weights, fitment notes), not what to buy. Always verify the exact application for your car. ESS ranks engineering suitability independently of any commercial relationship.</p>
    <ul class="plan-components">${items.map(x => `<li><b>${escape(x.name)}</b><span>${escape(x.application)}</span>
      ${x.facts?.length ? `<small>${x.facts.slice(0, 2).map(([k, v]) => `${escape(k)}: ${escape(v)}`).join(' · ')}</small>` : ''}
      ${x.source?.url ? `<a href="${escape(x.source.url)}" rel="noopener" target="_blank">Source: ${escape(x.source.locator ?? 'maker')}</a>` : ''}</li>`).join('')}</ul>`;
}

function stepItem(p, o, s) {
  const def = OBJECTIVES[o.key], done = !!o.done[s.key], dis = readOnly() ? ' disabled' : '';
  const check = label => `<label class="plan-check"><input type="checkbox" data-plan-step="${s.key}"${done ? ' checked' : ''}${dis}> ${label}</label>`;
  let body = '';
  if (s.key === 'question') body = `<p class="plan-question">${escape(def.question)}</p>${check('This is my question for this car')}`;
  if (s.key === 'learn') body = `<ul class="plan-learn">${def.learn.map(([t, h, why]) => `<li><a href="${h}">${escape(t)}</a> — ${escape(why)}</li>`).join('')}</ul>${check('I understand the mechanism well enough to compare approaches')}`;
  if (s.key === 'experiment') body = experimentBody(p, o) + check('I’ve tried it in the models');
  if (s.key === 'approaches') body = `<div class="plan-approaches" role="radiogroup" aria-label="Engineering approaches for ${escape(def.short)}">${def.approaches.map(a => `
    <label class="plan-approach${o.approach === a.key ? ' chosen' : ''}"><input type="radio" name="approach-${o.key}" value="${a.key}" data-plan-approach${o.approach === a.key ? ' checked' : ''}${dis}>
      <span class="plan-approach-name">${escape(a.name)}</span><span>${escape(a.what)}</span>
      <span class="plan-bands"><span>Cost: ${a.cost}</span><span>Fabrication: ${a.fab}</span><span>Reversible: ${a.reversible}</span></span></label>`).join('')}</div>
    <p class="plan-note">Typical bands, ESS judgment, not ratings. Choosing an approach is not buying anything; you can change it later.${o.key === 'handling' ? ' For a 1970–81 Camaro or Firebird, the guide below compares four front-suspension approaches in detail.' : ''}</p>`;
  if (s.key === 'components') body = componentsBody(p, o) + check('I’ve evaluated components for my approach');
  if (s.key === 'decision') body = o.approach ? `<p>Approach: <b>${escape(def.approaches.find(a => a.key === o.approach).name)}</b></p>
      <label class="plan-block"><span>What I’ve decided (parts, order, budget)</span><textarea rows="2" maxlength="${LIMITS.note}" data-plan-obj-field="decisionNote"${dis}>${escape(o.decisionNote)}</textarea></label>${check('Decision made')}`
    : '<p class="quiet">Choose an approach first. If you can’t decide yet, add what is stopping you below — that becomes your next thing to learn or test.</p>';
  if (s.key === 'verify') body = `<p>${escape(def.verify)}</p><p class="plan-links">${def.verifyTools.map(([t, h]) => `<a href="${h}">${escape(t)}</a>`).join(' · ')}</p>
    <div class="plan-measure"><label class="plan-block"><span>What I measured</span><input data-plan-measured maxlength="${LIMITS.measured}" value="${escape(o.measured)}" placeholder="e.g. 0.86 g on a 200 ft circle, same tires, 32 psi"${dis}></label>
    <label class="plan-block plan-date"><span>Date</span><input type="date" data-plan-measured-on value="${escape(o.measuredOn)}"${dis}></label></div>
    ${readOnly() ? '' : '<button type="button" class="button secondary" data-plan-save-measure>Save result</button>'}`;
  return `<li class="plan-step${done ? ' done' : ''}${nextStep(o)?.key === s.key ? ' next' : ''}" id="plan-${o.key}-${s.key}">
    <details${nextStep(o)?.key === s.key || (s.key === 'experiment' && !done && nextStep(o)?.key === 'learn') ? ' open' : ''}><summary><span class="plan-step-n">${s.label}</span> ${escape(s.title)}${done ? ' <span class="plan-tick" aria-label="done">✓</span>' : ''}</summary>
    <div class="plan-step-body">${body}</div></details></li>`;
}

function objectiveDetail(p, o) {
  const dis = readOnly() ? ' disabled' : '';
  return `<div class="plan-detail">
    ${connections(p, o)}
    <ol class="plan-steps">${STEPS.map(s => stepItem(p, o, s)).join('')}</ol>
    <div class="plan-side">
      <label class="plan-block"><span>What I already know about this</span><textarea rows="2" maxlength="${LIMITS.note}" data-plan-obj-field="notes" placeholder="Measurements, quotes, what you’ve tried"${dis}>${escape(o.notes)}</textarea></label>
      <div class="plan-blockers"><span class="plan-label">What’s stopping me</span>
        ${o.blockers.length ? `<ul>${o.blockers.map((b, i) => `<li>${escape(b)}${readOnly() ? '' : ` <button type="button" class="plan-x" data-plan-unblock="${i}" aria-label="Resolve: ${escape(b)}">Resolved</button>`}</li>`).join('')}</ul>` : '<p class="quiet">Nothing recorded. An open question — something you need to learn, measure or decide — keeps the objective moving.</p>'}
        ${readOnly() || o.blockers.length >= LIMITS.blockers ? '' : `<form data-plan-block-form class="plan-inline"><input name="b" maxlength="${LIMITS.blocker}" placeholder="e.g. Don’t know my current camber gain" aria-label="Add something that is stopping you"><button class="button plain" type="submit">Add</button></form>`}
      </div>
      ${readOnly() ? '' : `<button type="button" class="button plain plan-remove" data-plan-remove-objective>Remove this objective</button>`}
    </div>
  </div>`;
}

function render() {
  if (!root) return;
  const p = project();
  if (!p) {
    root.innerHTML = `<section class="plan-start">
      <h2>Start your development plan</h2>
      <p>One plan for your car, with as many objectives as you like — handling, weight, power, braking, comfort. Each one moves from a question to a measured result. Start with one; add the rest when you’re ready.</p>
      <div class="plan-add">${OBJECTIVE_KEYS.map(k => `<button type="button" class="plan-chip" data-plan-add="${k}">+ ${escape(OBJECTIVES[k].name)}</button>`).join('')}</div>
      <p class="plan-note">${getActive() ? `Your plan starts with ${escape(setupName(getActive().setup))}. You can change the car.` : 'No car yet? Pick an objective first; you can choose or find the car afterwards.'} Plans are saved in this browser only.</p>
    </section>`;
    return;
  }
  const sum = summary(p), present = p.objectives.map(o => o.key);
  const projects = S.store.projects;
  root.innerHTML = `
    ${S.shared ? `<div class="plan-shared" role="status"><p><b>Shared plan.</b> You’re viewing a copy someone shared. Your own plans are unchanged.</p>
      <div class="plan-actions"><button type="button" class="button primary" data-plan-keep>Save a copy to my plans</button><button type="button" class="button plain" data-plan-dismiss>Close</button></div></div>` : ''}
    <section class="plan-project" aria-label="Project">
      ${!S.shared && projects.length > 1 ? `<label class="plan-switch"><span class="plan-label">Plan</span><select data-plan-switch>${projects.map(x => `<option value="${x.id}"${x.id === p.id ? ' selected' : ''}>${escape(x.name || vname(x.vehicle) || 'Untitled plan')}</option>`).join('')}</select></label>` : ''}
      <div class="plan-project-grid">${vehicleBlock(p)}${identityBlock(p)}</div>
      <p class="plan-summary">${sum.objectives ? `${sum.objectives} objective${sum.objectives > 1 ? 's' : ''} · ${sum.activities} step${sum.activities === 1 ? '' : 's'} completed · ${sum.decisions} decision${sum.decisions === 1 ? '' : 's'} · ${sum.measured} measured${sum.blockers ? ` · ${sum.blockers} open question${sum.blockers > 1 ? 's' : ''}` : ''}` : 'No objectives yet.'}</p>
    </section>
    ${knownBlock(p)}
    <section class="plan-objectives" aria-labelledby="plan-obj-h">
      <h2 id="plan-obj-h">Objectives</h2>
      ${p.objectives.map(o => objectiveCard(p, o)).join('') || '<p>Add your first objective. You don’t need to set them all now.</p>'}
      ${readOnly() || present.length === OBJECTIVE_KEYS.length ? '' : `<div class="plan-add"><span class="plan-label">Add an objective</span>${OBJECTIVE_KEYS.filter(k => !present.includes(k)).map(k => `<button type="button" class="plan-chip" data-plan-add="${k}">+ ${escape(OBJECTIVES[k].name)}</button>`).join('')}</div>`}
    </section>
    <section class="plan-footer" aria-label="Save and share">
      <p class="plan-status" role="status" data-plan-status>${escape(S.status || (S.shared ? '' : 'Saved in this browser.'))}</p>
      ${S.shared ? '' : `<div class="plan-actions">
        <button type="button" class="button secondary" data-plan-share>Share this plan</button>
        <a class="button plain" href="../experience/#garage">My Garage</a>
        <button type="button" class="button plain" data-plan-new>New plan</button>
        <button type="button" class="button plain" data-plan-delete>Delete this plan</button></div>
        <p class="plan-note">Sharing creates a link that contains this plan’s name, vision, car and objectives (including your notes). Nothing is uploaded; the person you send it to sees a copy and their own plans are unchanged.</p>`}
    </section>`;
}

// ------------------------------------------------------------------ events
function setStatus(text) { S.status = text; const el = root.querySelector('[data-plan-status]'); if (el) el.textContent = text; }

function chooseVehicle(veh, { activate = false } = {}) {
  const p = ensureProject();
  commit({ ...p, vehicle: veh }, `Car set to ${vname(veh)}. Saved.`);
  if (activate && !getActive()) useConfig(newSetup(veh.id), 'before');
  render();
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
    const p = ensureProject();
    if (!p.objectives.some(o => o.key === t.dataset.planAdd)) {
      commit({ ...p, objectives: [...p.objectives, newObjective(t.dataset.planAdd)] }, `${OBJECTIVES[t.dataset.planAdd].name} added. Saved.`);
      S.open = t.dataset.planAdd;
    }
    render();
    root.querySelector(`[data-objective="${S.open}"]`)?.scrollIntoView({ block: 'nearest' });
  } else if (t.dataset.planToggle) { S.open = S.open === t.dataset.planToggle ? null : t.dataset.planToggle; render(); root.querySelector(`[data-objective="${t.dataset.planToggle}"] [data-plan-toggle]`)?.focus(); }
  else if (t.hasAttribute('data-plan-use-active')) { const a = getActive(); if (a) chooseVehicle(cleanVehicle({ id: a.setup.id, setup: a.setup, mode: a.mode })); }
  else if (t.hasAttribute('data-plan-remove-objective') && key) {
    if (!armed(t, `Tap again to remove ${OBJECTIVES[key].short.toLowerCase()} and its notes`)) return;
    const p = project(); commit({ ...p, objectives: p.objectives.filter(o => o.key !== key) }, 'Objective removed. Saved.'); S.open = null; render();
  } else if (t.dataset.planUnblock !== undefined && key) {
    const i = +t.dataset.planUnblock; const p = project();
    commit(updateObjective(p, key, o => ({ ...o, blockers: o.blockers.filter((_, j) => j !== i) })), 'Marked resolved. Saved.'); render();
  } else if (t.hasAttribute('data-plan-save-measure') && key) {
    const m = card.querySelector('[data-plan-measured]').value, d = card.querySelector('[data-plan-measured-on]').value;
    const p = project();
    commit(updateObjective(p, key, o => setStep(o, 'verify', !!m.trim(), { measured: m, measuredOn: d })), m.trim() ? 'Result recorded. Saved.' : 'Result cleared. Saved.'); render();
  } else if (t.hasAttribute('data-plan-share')) {
    const url = location.origin + location.pathname + '#' + encodePlan(project());
    shareResult(url, 'My vehicle development plan', project().name || 'ESS vehicle development plan').then(r =>
      setStatus(r === 'copied' ? 'Link copied. Anyone with it sees a copy of this plan.' : r === 'shared' ? 'Shared.' : r === 'cancelled' ? '' : 'Copy this link: ' + url));
  } else if (t.hasAttribute('data-plan-keep')) {
    const copy = { ...S.shared, id: undefined, name: S.shared.name ? S.shared.name + ' (copy)' : '' };
    S.shared = null; history.replaceState(null, '', location.pathname + location.search);
    commit(copy, 'Copy saved to your plans.'); render();
  } else if (t.hasAttribute('data-plan-dismiss')) { S.shared = null; history.replaceState(null, '', location.pathname + location.search); S.status = ''; render(); }
  else if (t.hasAttribute('data-plan-new')) { const p = newProject(); commit(p, 'New plan started. Saved.'); S.open = null; render(); }
  else if (t.hasAttribute('data-plan-delete')) {
    if (!armed(t, 'Tap again to delete this plan (cannot be undone)')) return;
    S.store = remove(S.store, project().id); saveStore(S.store); S.open = null; S.status = 'Plan deleted.'; render();
  }
});

root?.addEventListener('change', e => {
  const t = e.target, card = t.closest('[data-objective]'), key = card?.dataset.objective, p = project();
  if (!p || readOnly()) return;
  if (t.matches('[data-plan-step]') && key) {
    commit(updateObjective(p, key, o => setStep(o, t.dataset.planStep, t.checked)), t.checked ? 'Step completed. Saved.' : 'Step reopened. Saved.'); render();
    if (t.checked) root.querySelector(`[data-objective="${key}"] .plan-step.next summary`)?.focus();
  } else if (t.matches('[data-plan-approach]') && key) {
    commit(updateObjective(p, key, o => setStep({ ...o, approach: t.value }, 'approaches', true)), 'Approach chosen. Saved.'); render();
  } else if (t.matches('[data-plan-switch]')) { S.store = { ...S.store, active: t.value }; saveStore(S.store); S.open = null; S.status = ''; render(); }
  else if (t.matches('[data-plan-garage]') && t.value) {
    const g = getGarage().find(x => x.key === t.value);
    if (g) chooseVehicle(cleanVehicle({ id: g.setup.id, garageKey: g.key, setup: g.setup, mode: g.mode }));
  } else if (t.matches('[data-plan-field]')) { commit({ ...p, [t.dataset.planField]: t.value }); setStatus(S.status); }
  else if (t.matches('[data-plan-obj-field]') && key) { commit(updateObjective(p, key, o => ({ ...o, [t.dataset.planObjField]: t.value }))); setStatus(S.status); }
});

root?.addEventListener('submit', e => {
  const f = e.target.closest('[data-plan-block-form]'); if (!f) return;
  e.preventDefault();
  const key = f.closest('[data-objective]').dataset.objective, val = f.elements.b.value.trim();
  if (!val) return;
  commit(updateObjective(project(), key, o => ({ ...o, blockers: [...o.blockers, val] })), 'Open question added. Saved.'); render();
  root.querySelector(`[data-objective="${key}"] [data-plan-block-form] input`)?.focus();
});

document.addEventListener('ess:vehicle-selected', e => {
  if (e.target?.dataset?.vehicleKey !== 'plan' || readOnly()) return;
  const veh = cleanVehicle({ id: e.detail?.id });
  if (veh) chooseVehicle(veh, { activate: true });
});

window.addEventListener('hashchange', () => { const s = decodePlan(location.hash); if (s) { S.shared = s; S.open = null; render(); } });

installCatalog(document, { label: 'Choose the car for this plan', templates: false });
render();
