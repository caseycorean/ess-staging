// ESS Test → Watch it happen: six graphical simulations on one replay framework. Claude, 26 Nov 2026.
// Pick an experiment and two cars (or one car and a change); the shared engine runs each lane, the stage replays the
// calculated traces, and the visitor can share a link that reopens the same comparison or save a picture of it.
// Reads the working setup, with updates limited to explicit adoption.
import { EXPERIMENTS, EXPERIMENT_KEYS, REPLAY_NOTE, NO_CHANGE, MATCHUPS, readiness, nextExperiments, publishedCompare, USUAL_ERROR_PCT, estimatedInputs, quickChanges, runLane, road, summarize, replayDuration, laneTags, laneVehicle, vehicleName, changeLabel, isChanged } from './runs.mjs';
import { encodeState, decodeState, cleanParams, cleanLane, LIMITS, replayInputSuffix } from './share-state.mjs';
import { createStage, laneColor } from './stage.mjs';
import { drawShareCard } from './share-card.mjs';
import { installCatalog } from '../catalog.mjs';
import { adoptWorking, getActive, modified, shareFragment, workingSnapshot } from '../configuration.mjs';
import { newSetup } from '../models.mjs';
import { missingText } from '../readiness.mjs';
import { term } from '../engineering-terms.mjs';
import { vehicles } from '../vehicles.mjs';
import { saveActivity } from '../garage-workspace.mjs';
import { tireGrip } from '../../engine/acceleration.mjs';
import { setupName } from '../matchup.mjs';

const root = document.querySelector('[data-replay]');
const query = new URLSearchParams(location.search);
const returnProject = query.get('plan');
if (returnProject && /^[a-zA-Z0-9-]{1,80}$/.test(returnProject)) {
  const nav = document.createElement('p');
  nav.className = 'rp-plan-return';
  const link = document.createElement('a');
  link.href = '../plan/?project=' + encodeURIComponent(returnProject);
  link.textContent = 'Return to your development plan';
  nav.append(link);
  root?.before(nav);
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const ICONS = {
  accelerate: '<path d="M3 16h18M3 8h18" opacity=".45"/><path d="M6 12h9m0 0-3-3m3 3-3 3"/>',
  brake: '<path d="M3 16h18M3 8h18" opacity=".45"/><path d="M5 12h7"/><path d="M15 9v6M18 9v6"/>',
  corner: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="4.5" r="1.6" fill="currentColor" stroke="none"/>',
  entry: '<path d="M4 20V10a6 6 0 0 1 6-6h10"/><path d="M4 16h3" stroke-width="3"/>',
  exit: '<path d="M4 4a8 8 0 0 0 8 8h8"/><path d="M15 9l3 3-3 3"/>',
  sequence: '<path d="M3 18c4 0 4-12 9-12s5 12 9 12"/>',
};

// ---------------------------------------------------------------- state
// A rival for a car the visitor brings: its own later counterpart where the catalogue has one, so the comparison shows
// development rather than two near-identical cars (owner review 26 Nov).
const DEFAULT_RIVAL = { camaro: 'chevrolet-camaro-4th-gen--2002-ss-ls1-m6-coupe', firebird: 'sx-2002-pontiac-slp-firebird-firehawk',
  'sx-1977-pontiac-firebird-formula': 'sx-2002-pontiac-slp-firebird-firehawk', mustang: 'ford-mustang-s550--2018-gt-pp2-5.0-m6-fastback',
  miata: 'mazda-mx5-nd--2024-club-2.0-m6-soft-top', fiero: 'toyota-gr86-zn8--2022-premium-2.4-m6-coupe', gto: 'chevrolet-camaro-5th-gen--2015-z28-ls7-m6-coupe' };
const rival = id => DEFAULT_RIVAL[id] ?? (id === 'corvette' ? 'camaro' : 'corvette');
const MODES = { single: 'One car', car: 'Two cars', change: 'Before and after', technique: 'Braking technique', diff: 'Differentials' };
const modesFor = x => ['single', 'car', 'change', ...(x === 'entry' ? ['technique'] : []), ...(x === 'exit' || x === 'sequence' ? ['diff'] : [])];

const S = { x: 'accelerate', params: Object.fromEntries(EXPERIMENT_KEYS.map(k => [k, { ...EXPERIMENTS[k].params }])), mode: 'car',
  a: null, bId: null, change: null, shared: false, target: 0 };

function initialState() {
  const shared = decodeState(location.hash);
  const hashKey = location.hash.slice(1);
  const active = getActive();
  const asked = query.get('car') || (!active && query.get('example'));
  const single = query.get('mode') === 'single';
  if (shared) {
    S.x = shared.x; S.params[shared.x] = shared.p; S.shared = true; S.picked = true;
    S.context = query.get('from') === 'build' ? 'Loaded from Build' : 'Shared or saved experiment';
    const [a, b] = shared.lanes;
    S.a = { id: a.id, setup: a.setup };
    S.aDiff = a.diff;
    S.bId = b?.id === a.id ? rival(a.id) : b?.id ?? rival(a.id);
    if (!b) S.mode = 'single';
    else if (shared.lanes.length === 3 || (a.diff && b.diff && a.id === b.id && !isChanged(b.change) && !isChanged(a.change))) S.mode = 'diff';
    else if (b && a.id === b.id && (a.technique || b.technique)) S.mode = 'technique';
    else if (a.id === b.id) { S.mode = 'change'; S.change = b.change; S.variantSetup = b.setup ?? null; S.variantDiff = b.diff ?? null; }
    else { S.mode = 'car'; S.bSetup = b.setup; S.bChange = b.change; S.bDiff = b.diff; }
    S.aChange = a.change;
    S.sharedLanes = shared.lanes;
    return;
  }
  if (EXPERIMENTS[hashKey]) S.x = hashKey;
  if (asked && Object.hasOwn(vehicles, asked)) {
    S.a = { id: asked, change: NO_CHANGE };
    S.context = 'Example matchup';
  } else if (active) {
    const setup = workingSnapshot(active);
    S.a = { id: setup.id, setup: setup.id === 'custom' || setup.name || Object.keys(setup.base).length || modified(setup) ? setup : undefined, change: NO_CHANGE };
    S.context = `Working vehicle · ${active.mode === 'after' ? 'Modified' : 'Stock settings'}`;
  }
  else if (single) {
    S.a = { id: 'camaro' };
    S.context = 'Example car';
  } else { applyMatchup(S.x, 0); return; }
  S.picked = true;
  S.bId = rival(S.a.id);
  S.mode = single ? 'single' : query.get('compare') === 'change' ? 'change' : S.x === 'entry' ? 'technique' : S.x === 'exit' ? 'diff' : 'car';
  if (S.mode === 'change' && asked) S.change = quickChanges(S.x, laneVehicle(S.a))[0]?.[0];
}

/** Load a demonstration matchup into the state (the visitor's own car choice, once made, is kept instead). */
function applyMatchup(x, i) {
  const m = MATCHUPS[x]?.[i]; if (!m) return;
  const [a, b] = m.lanes;
  S.x = x; S.mode = m.mode; S.matchup = i; S.context = 'Example matchup';
  if (m.params) S.params[x] = { ...S.params[x], ...m.params };
  S.a = { id: a.id }; S.aChange = a.change; S.aDiff = a.diff;
  S.bId = m.mode === 'car' ? b.id : rival(a.id);
  S.bSetup = S.variantSetup = S.bDiff = S.variantDiff = S.singleLane = undefined;
  S.bChange = m.mode === 'car' ? b.change : undefined;
  S.change = m.mode === 'change' ? b.change : undefined;
  S.target = 0;
}

// Every lane passes the same boundary as the share link, so what runs here is exactly what a recipient will run.
function lanes() { return rawLanes().map(l => cleanLane(l) ?? l); }
function rawLanes() {
  if (S.sharedLanes) return S.sharedLanes;   // exactly what the sender saw, until the visitor changes something
  const A = { ...S.a, change: S.aChange ?? NO_CHANGE, diff: S.aDiff };
  if (S.mode === 'single') return [S.singleLane ?? A];
  if (S.mode === 'change') return [A, { ...A, setup: S.variantSetup === undefined ? A.setup : S.variantSetup,
    change: S.change ?? A.change, diff: S.variantDiff === undefined ? A.diff : S.variantDiff }];
  if (S.mode === 'technique') return [{ ...A, technique: 'trail' }, { ...A, technique: 'straight' }];
  if (S.mode === 'diff') return [{ ...A, diff: 'open' }, { ...A, diff: 'lsd' }, { ...A, diff: 'locked' }];
  return [A, { id: S.bId, setup: S.bSetup, change: S.bChange ?? NO_CHANGE, diff: S.bDiff }];
}
const userChanged = () => { S.sharedLanes = null; S.shared = false; };

// ---------------------------------------------------------------- page skeleton (built once; the stage canvas persists)
root.innerHTML = `<div class="rp">
  <nav class="ess-crumbs" aria-label="Breadcrumb"><a href="../">Home</a> / <a href="../improve/">Test</a> / <span aria-current="page" data-rp-crumb>Replay</span></nav>
  <header class="rp-head">
    <div><p class="kicker">ESS simulation <span data-rp-context></span></p><h1 data-rp-title>Simulation Replay</h1></div>
    <div class="rp-head-actions"><button type="button" class="button secondary small" data-pick-single data-open-catalog data-lane="a" aria-haspopup="dialog" hidden>Choose car</button>
      <button type="button" class="button secondary small" data-open-settings aria-controls="rp-settings">Change test</button>
      <button type="button" class="button primary small" data-edit-current aria-controls="rp-settings" hidden>Modify setup</button></div>
  </header>
  ${query.get('from') === 'build' ? '<p class="rp-plan-return"><a href="../experience/#build">Back to your build</a></p>' : ''}
  <div class="rp-feature">
  <figure class="rp-stage">
    <figcaption class="rp-stage-labels" data-stage-labels></figcaption>
    <canvas data-stage role="img" aria-label="Replay"></canvas>
    <div class="rp-transport">
      <button type="button" class="rp-play" data-play aria-label="Play">▶</button>
      <input type="range" min="0" max="1000" value="0" data-scrub aria-label="Replay position">
      <span class="rp-clock" data-clock>0.00 s</span>
      <span class="rp-rate" role="group" aria-label="Replay speed">${[[.25, '¼×'], [1, '1×'], [2, '2×'], [4, '4×']].map(([r, l]) => `<button type="button" data-rate="${r}" aria-pressed="${r === 1}">${l}</button>`).join('')}</span>
    </div>
  </figure>
  <section class="rp-result" data-result aria-live="polite"></section>
  </div>
  <details class="rp-settings" id="rp-settings">
    <summary>Vehicle, test and setup options</summary>
  <div class="rp-exps" role="tablist" aria-label="Simulation">${EXPERIMENT_KEYS.map(k => `<button type="button" role="tab" data-x="${k}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k]}</svg><span>${esc(EXPERIMENTS[k].label)}</span></button>`).join('')}</div>
  <section class="rp-compare" data-compare aria-label="Vehicle setups"></section>
  <div class="rp-presets" data-presets></div>
    <button type="button" class="button secondary small" data-back-playback>Back to playback</button>
  </details>
  <section class="rp-next" data-next aria-label="Try next"></section>
  <section class="rp-share" aria-label="Save and share">
    <button type="button" class="button secondary small" data-save-activity>Save experiment</button>
    <button type="button" class="button primary small" data-share>Share this comparison</button>
    <button type="button" class="button secondary small" data-copy>Copy link</button>
    <button type="button" class="button secondary small" data-save>Save image</button>
    <span class="rp-msg" data-msg aria-live="polite"></span>
    <div class="rp-out" data-out hidden></div>
  </section>
  <section class="rp-about" data-about></section>
</div>`;

const $ = sel => root.querySelector(sel);
const canvas = $('[data-stage]');
let lastRuns = null, lastLanes = null, lastSummary = null, lastScene = null;
const stage = createStage(canvas, {
  onTick(t, d, playing) {
    $('[data-clock]').textContent = `${t.toFixed(2)} s`;
    $('[data-scrub]').value = d ? Math.round(t / d * 1000) : 0;
    const b = $('[data-play]'); b.textContent = playing ? 'Pause' : t >= d && d > 0 ? 'Replay' : 'Play';
    b.setAttribute('aria-label', playing ? 'Pause' : t >= d && d > 0 ? 'Replay' : 'Play');
  },
});
installCatalog(document, { label: 'Choose a car', templates: false,
  readinessLabel: id => {
    const missing = readiness(S.x, laneVehicle({id}));
    return missing.length ? 'To run this test, add ' + missingText(missing) : 'Inputs available for this test';
  },
});

// ---------------------------------------------------------------- render
const presetValue = x => ({ accelerate: 'ft', brake: 'from', corner: 'radius', entry: 'mph', exit: 'radius', sequence: 'key' })[x];
function renderPresets() {
  const e = EXPERIMENTS[S.x], key = presetValue(S.x), cur = S.params[S.x][key];
  $('[data-presets]').innerHTML = `<div class="rp-chips" role="group" aria-label="${esc(e.label)} settings">${e.presets.map(([v, l]) => `<button type="button" data-preset="${esc(v)}" aria-pressed="${v === cur}">${esc(l)}</button>`).join('')}</div>`;
  for (const b of root.querySelectorAll('[data-x]')) { b.setAttribute('aria-selected', String(b.dataset.x === S.x)); b.tabIndex = b.dataset.x === S.x ? 0 : -1; }
}
const shortName = lane => (lane.setup?.name || vehicleName(lane.id)).split(' · ')[0];
function carButton(which, lane, label) {
  return `<button type="button" class="rp-car" data-open-catalog data-lane="${which}" aria-haspopup="dialog">
    <i style="background:${laneColor(which === 'a' ? 0 : 1)}" aria-hidden="true"></i>
    <span><small>${label}</small>${esc(lane.setup ? setupName(lane.setup) : vehicleName(lane.id))}</span><b aria-hidden="true">▾</b></button>`;
}
function renderCompare(ls) {
  const modes = modesFor(S.x);
  const [first, second] = ls;
  const openNumbers = $('[data-numbers]')?.open;
  let body = '';
  if (S.mode === 'car') body = `<div class="rp-lanes">${carButton('a', first, 'Change Car A')}<span class="rp-vs">vs</span>${carButton('b', second, 'Change Car B')}</div>`;
  else {
    body = `<div class="rp-lanes">${carButton('a', first, 'Choose vehicle')}</div>`;
    if (S.mode === 'technique' || S.mode === 'diff') body += `<p class="rp-note">${S.mode === 'technique' ? 'Trail braking (easing off the brakes while turning in) against braking only in a straight line, on the same car.' : 'Open, limited-slip and locked differentials on the same car.'}</p>`;
  }
  if (canEdit()) {
    const lane = ls[editIndex()];
    const cur = lane.change;
    const baseline = laneVehicle({id: lane.id, setup: lane.setup});
    const applied = changeLabel(cur);
    body += `<section class="rp-edit" aria-labelledby="rp-edit-heading">
      <h3 id="rp-edit-heading" tabindex="-1">Modify ${esc(editName(ls))}</h3>
      ${S.mode === 'car' ? `<div class="rp-chips" role="group" aria-label="Choose which car to modify">${ls.map((item, i) =>
        `<button type="button" data-edit-target="${i}" aria-pressed="${S.target === i}">Car ${i === 0 ? 'A' : 'B'} · ${esc(shortName(item))}</button>`).join('')}</div>` : ''}
      <p class="rp-applied"><strong>Replay changes</strong> · ${esc(applied || 'None')}.</p>
      ${S.mode === 'change' ? '<p class="rp-note">Changes apply to the after setup. The before setup stays as loaded.</p>' : ''}
      <div class="rp-chips" role="group" aria-label="Quick changes">${quickChanges(S.x, baseline).map(([c, label]) => {
        const patch = Object.fromEntries(Object.entries(c).filter(([, value]) => value));
        return `<button type="button" data-change='${esc(JSON.stringify(patch))}' aria-pressed="${Object.entries(patch).every(([k, value]) => cur[k] === value)}">${esc(label)}</button>`;
      }).join('')}</div>
      <label class="rp-tire"><span>Replay tire override</span><select data-replay-tire>
        <option value="">Use the loaded setup’s tires</option>
        ${Object.entries(tireGrip).filter(([key]) => key !== 'dragRadial' || S.x === 'accelerate' || key === cur.tire)
          .map(([key, tire]) => `<option value="${key}"${key === cur.tire ? ' selected' : ''}>${esc(tire.label)}</option>`).join('')}
      </select></label>
      <details class="rp-custom" data-numbers ${openNumbers ? 'open' : ''}><summary>Enter exact weight, power or CG changes</summary>${customFields(cur, baseline.weight)}</details>
      <button class="button secondary small" type="button" data-clear-changes>Reset Replay changes</button></section>`;
  }
  const mu = MATCHUPS[S.x] ?? [];
  const muHtml = mu.length ? `<details class="rp-matchups" data-rp-matchups ${S.matchup != null || $('[data-rp-matchups]')?.open ? 'open' : ''}><summary>Example matchups</summary><div class="rp-chips" role="group" aria-label="Matchups">${mu.map((m, i) => `<button type="button" data-matchup="${i}" aria-pressed="${S.matchup === i}" title="${esc(m.note)}">${esc(m.label)}</button>`).join('')}</div>${S.matchup != null && mu[S.matchup] ? `<p class="rp-note">${esc(mu[S.matchup].note)}</p>` : ''}</details>` : '';
  $('[data-compare]').innerHTML = `<div class="rp-modes" role="group" aria-label="Test format">${modes.map(m => `<button type="button" data-mode="${m}" aria-pressed="${m === S.mode}">${MODES[m]}</button>`).join('')}</div>${body}
    <div class="rp-adopt">${ls.flatMap((lane, i) => !isChanged(lane.change) && (i === 0 || S.mode === 'car') ?
      [`<button type="button" class="button secondary small" data-adopt-lane="${i}">Use ${esc(shortName(lane))} as working setup</button>`] : []).join('')}</div>${muHtml}`;
  $('[data-edit-current]').hidden = !canEdit();
  $('[data-pick-single]').hidden = S.mode !== 'single';
  $('[data-share]').textContent = S.mode === 'single' ? 'Share this test' : 'Share this comparison';
}
function customFields(c, weight) {
  const base = Number(weight) || 3000;
  const f = (k, label, unit) => `<label><span>${label} (${unit})</span><input type="number" step="any"
    min="${typeof LIMITS[k].min === 'function' ? LIMITS[k].min(base) : LIMITS[k].min}" max="${LIMITS[k].max}"
    value="${c[k] || ''}" placeholder="0" name="${k}" data-custom="${k}"></label>`;
  return `<form class="rp-custom-grid" data-replay-numbers>${f('weight', 'Weight', 'lb')}${f('power', 'Power', '%')}${f('cg', 'CG height', 'in')}
    <button class="button secondary small" type="submit">Apply numeric changes</button></form>`;
}
const canEdit = () => ['single', 'car', 'change'].includes(S.mode);
const editIndex = () => S.mode === 'change' ? 1 : S.mode === 'car' ? S.target : 0;
const editName = ls => S.mode === 'change' ? 'the after setup' :
  S.mode === 'car' ? `Car ${S.target === 0 ? 'A' : 'B'} · ${shortName(ls[S.target])}` : shortName(ls[0]);

function setEdit(lane) {
  if (S.mode === 'single') S.singleLane = lane;
  else if (S.mode === 'change') { S.change = lane.change; S.variantDiff = lane.diff ?? null; }
  else if (S.mode === 'car' && S.target === 1) { S.bChange = lane.change; S.bDiff = lane.diff; }
  else { S.aChange = lane.change; S.aDiff = lane.diff; }
  S.matchup = null;
  S.picked = true;
  userChanged();
}

function setFormat(mode) {
  if (mode === 'single') {
    S.singleFromChange = S.mode === 'change';
    S.singleLane = lastLanes[S.singleFromChange ? 1 : 0];
  } else if (S.mode === 'single') {
    const current = lastLanes[0];
    if (mode === 'change') {
      if (!S.singleFromChange) {
        S.a = {id: current.id, setup: current.setup};
        S.aChange = S.aDiff = undefined;
      }
      S.change = current.change;
      S.variantSetup = current.setup ?? null;
      S.variantDiff = current.diff ?? null;
    } else {
      S.a = {id: current.id, setup: current.setup};
      S.aChange = current.change;
      S.aDiff = current.diff;
      if (S.bId === current.id) { S.bId = rival(current.id); S.bSetup = S.bChange = S.bDiff = undefined; }
    }
  }
  S.mode = mode;
  S.picked = true;
  S.matchup = null;
  userChanged();
}

function applyPatch(patch) {
  const current = lastLanes[editIndex()];
  setEdit({...current, change: {...current.change, ...patch}});
  run();
}
function renderResult(summary, runs) {
  const e = EXPERIMENTS[S.x];
  const incomplete = runs.some(run => !run.ok);
  const ranked = !incomplete && summary.order?.length === runs.length;
  const indices = ranked ? summary.order : runs.map((_, i) => i);
  const headline = !incomplete && runs.length === 1 ? `${shortName(lastLanes[0])}: ${summary.lanes[0].figures.join(' · ')}` : summary.headline;
  const part = S.x === 'accelerate' && S.params.accelerate.ft === 1320;
  const timing = part ? `Elapsed time from 1-ft rollout ${term('one-foot rollout')}` :
    esc(summary.what);
  const measuredMetrics = (l) => part ? `${esc(l.figures[0])} · ${esc(l.figures[1])} ${term('trap speed')}` :
    esc(l.figures.join(' · '));
  const place = i => summary.order?.length ? ['1st', '2nd', '3rd'][summary.order.indexOf(i)] : '';
  const laneExtra = i => {
    const lane = lastLanes[i], run = runs[i], out = [];
    const cmp = run.ok && !lane.setup && !isChanged(lane.change) ? publishedCompare(S.x, S.params[S.x], run, S.published?.[lane.id]) : null;
    if (cmp) {
      const big = Math.abs(cmp.pct) > 2 * (USUAL_ERROR_PCT[S.x] ?? 5);
      out.push(`<small class="rp-pub">${esc(cmp.text)} (${cmp.pct >= 0 ? '+' : '−'}${Math.abs(cmp.pct).toFixed(1)}%) · <a href="${esc(cmp.url)}" rel="noreferrer" target="_blank">${esc(cmp.source ?? 'source')}</a>${big ? ` · <span class="rp-big">larger than the model’s usual error: test conditions, tires and press cars varied, especially in period tests</span>` : ''}</small>`);
    }
    const est = run.ok ? estimatedInputs(S.x, lane) : '';
    if (est) out.push(`<small class="rp-est">Estimated inputs: ${esc(est)}</small>`);
    return out.join('');
  };
  $('[data-result]').innerHTML = `<p class="rp-what">Simulated result</p><h2 class="rp-headline">${esc(headline)}</h2>
    <div class="rp-timing">${timing}</div>
    ${summary.caveat ? `<p class="rp-caveat">${esc(summary.caveat)}</p>` : ''}
    <ul class="rp-lanes-out">${indices.map(i => {
      const l = summary.lanes[i], lane = lastLanes[i];
      const editable = lane.setup ?? newSetup(lane.id);
      const modify = '../experience/?via=replay&edit=original' + shareFragment({a: editable, aMode: lane.setup && modified(editable) ? 'after' : 'before', b: newSetup(rival(lane.id)), bMode: 'before', focus: 'a'}, 'build')
        + replayInputSuffix({x: S.x, p: S.params[S.x], lanes: lastLanes}, i, returnProject ?? '');
      const basis = S.mode === 'change' ? (i === 0 ? 'Before · ' : 'After · ') : S.mode === 'car' ? `Car ${i === 0 ? 'A' : 'B'} · ` : '';
      return `<li style="--rp-lane:${laneColor(i)}"><div><b>${basis}${esc(l.name)}${ranked && place(i) ? ` <em class="rp-place">${place(i)}</em>` : ''}</b>
        <div class="rp-fig">${l.ok && !incomplete ? measuredMetrics(l) : l.ok ? 'Inputs available' : 'No run'}</div><small>${esc(l.why)}</small>
        ${!l.ok ? `<a href="${esc(modify)}">Review and add vehicle inputs</a>` : ''}</div></li>`;
    }).join('')}</ul>`;
  renderNext(runs);
  canvas.setAttribute('aria-label', `${summary.what}. ${headline}. ${summary.lanes.map(l => `${l.name}: ${!incomplete && l.ok ? l.figures.join(', ') : l.why}`).join('. ')}`);
  const pub = !incomplete && S.x === 'accelerate' && S.params.accelerate.ft === 1320 ? runs.map((r, i) => r.ok && r.quarter?.et ? `${vehicleName(lastLanes[i].id)}: ${r.quarter.et.toFixed(2)} s @ ${r.quarter.trap.toFixed(1)} mph` : null).filter(Boolean) : [];
  $('[data-about]').innerHTML = `<details><summary>Engineering details and model assumptions</summary>
    <p><b>${e.evidence === 'checked' ? 'Checked:' : 'Estimate:'}</b> ${esc(e.check)}</p>
    ${pub.length ? `<p>Replay times run from a dead stop. On the drag-strip clock (after the 1 ft rollout road tests use) the model gives ${esc(pub.join('; '))}.</p>` : ''}
    ${S.x === 'corner' ? '<p>Which axle reaches its limit first (understeer or oversteer) is not shown yet: the per-car roll-stiffness split is still awaiting engineering acceptance.</p>' : ''}
    ${['entry', 'exit', 'sequence'].includes(S.x) ? '<p>Quasi-steady path model: the driver uses exactly the available grip on a fixed line; quick changes of direction (yaw response), tire temperature and an optimised racing line are not modelled. Original ESS layouts, not real circuits.</p>' : ''}
    ${summary.lanes.map((l, i) => laneExtra(i) ? `<p><b>${esc(l.name)}</b> ${laneExtra(i)}</p>` : '').join('')}
    <p>${esc(REPLAY_NOTE)}</p>
    <p><a href="../simulate/?car=${encodeURIComponent(lastLanes[0].id)}#${S.x}">Explore numerical simulations →</a> · <a href="../learn/">How ESS models and tests</a></p></details>`;
}

let nextList = [];
function renderNext(runs) {
  const index = editIndex();
  const base = lastLanes[index];
  nextList = canEdit() && runs[index]?.ok ? nextExperiments(S.x, S.params[S.x], base, runs[index])
    .filter(({lane}) => JSON.stringify(cleanLane(lane)?.change) === JSON.stringify(lane.change)) : [];
  const unit = u => u === 's' ? 's quicker' : u === 'ft' ? 'ft shorter' : 'mph faster';
  const fmtGain = x => `${x.unit === 's' ? x.gain.toFixed(2) : x.unit === 'ft' ? Math.round(x.gain) : x.gain.toFixed(1)} ${unit(x.unit)}`;
  $('[data-next]').innerHTML = !canEdit() || !runs[index]?.ok ? '' : nextList.length
    ? `<h3>Try next on ${esc(editName(lastLanes))}</h3><div class="rp-next-list">${nextList.map((x, i) => `<button type="button" data-next-i="${i}"><b>${esc(x.label)}</b><span>${esc(fmtGain(x))} in the model</span></button>`).join('')}</div>`
    : `<p class="rp-note">No suggested change improves this setup beyond the model’s resolution in this test.</p>`;
}
async function loadPublished() {
  try { S.published = await (await fetch(new URL('../../simulate/published.json', import.meta.url))).json(); } catch { S.published = null; }
}

function run({ remember = true } = {}) {
  renderPresets();
  const ls = lanes();
  renderCompare(ls);
  const p = S.params[S.x];
  const runs = ls.map(l => runLane(S.x, p, l));
  const raw = summarize(S.x, p, ls, runs);
  const summary = runs.every(r => r.ok) ? raw : {
    ...raw, headline: ls.length === 1 ? 'Test needs vehicle inputs' : 'Comparison needs vehicle inputs', order: [],
    lanes: raw.lanes.map(l => ({...l, figures: l.ok ? ['Inputs available'] : []})),
  };
  $('[data-rp-title]').textContent = EXPERIMENTS[S.x].label;
  $('[data-rp-crumb]').textContent = EXPERIMENTS[S.x].label;
  $('[data-rp-context]').textContent = S.context ? ' · ' + S.context : '';
  $('[data-stage-labels]').innerHTML = summary.lanes.map((lane, i) =>
    `<span><i aria-hidden="true" style="background:${laneColor(i)}"></i>${esc(lane.name)}</span>`).join('');
  $('[data-play]').disabled = !runs.some(r => r.ok);
  $('[data-scrub]').disabled = !runs.some(r => r.ok);
  lastRuns = runs; lastLanes = ls; lastSummary = summary;
  const labels = laneTags(ls);
  lastScene = { key: S.x, road: road(S.x, p), runs, labels, order: summary.order, duration: replayDuration(runs) };
  stage.set(lastScene);
  if (S.x === 'accelerate' && p.ft >= 2640) setRate(2); else if (S.x === 'corner' && lastScene.duration > 14) setRate(2); else setRate(1);
  renderResult(summary, runs);
  if (remember) syncUrl();
}
function setRate(r) { stage.speed(r); for (const b of root.querySelectorAll('[data-rate]')) b.setAttribute('aria-pressed', String(+b.dataset.rate === r)); }
function shareUrl() {
  const frag = encodeState({ x: S.x, p: S.params[S.x], lanes: lastLanes });
  return location.href.split('#')[0].replace(/\?.*$/, '') + '#' + frag;
}
function syncUrl() { try { history.replaceState(null, '', '#' + encodeState({ x: S.x, p: S.params[S.x], lanes: lastLanes })); } catch { /* sandboxed host */ } }

// ---------------------------------------------------------------- events
root.addEventListener('click', async e => {
  const t = e.target.closest('button'); if (!t || t.hasAttribute('data-open-catalog')) return;
  const d = t.dataset;
  if ('backPlayback' in d) {
    $('.rp-stage').scrollIntoView({block: 'nearest'});
    $('[data-play]').focus({preventScroll: true});
    return;
  }
  if ('openSettings' in d || 'editCurrent' in d) {
    const settings = $('#rp-settings');
    settings.open = true;
    const destination = 'editCurrent' in d ? $('#rp-edit-heading') : settings.querySelector('summary');
    destination.focus();
    return;
  }
  if (d.adoptLane !== undefined) {
    const lane = lastLanes[Number(d.adoptLane)];
    if (!lane) return;
    const setup = lane.setup ?? newSetup(lane.id);
    const ok = adoptWorking(setup, lane.setup && modified(setup) ? 'after' : 'before',
      () => window.confirm('Replace your current working setup? Cancel to keep it and save it in My Garage first.'));
    $('[data-msg]').textContent = ok ? 'Working vehicle selected.' : 'Your working vehicle was kept.';
    if (ok) { S.context = 'Working vehicle selected'; $('[data-rp-context]').textContent = ' · ' + S.context; }
    return;
  }
  if (d.x) { S.x = d.x; userChanged(); S.matchup = null;
    if (!S.picked) { applyMatchup(S.x, 0); return run(); }
    if (!modesFor(S.x).includes(S.mode) || ['technique', 'diff'].includes(S.mode)) S.mode = S.x === 'entry' ? 'technique' : S.x === 'exit' ? 'diff' : 'car'; return run(); }
  if (d.matchup != null) { userChanged(); applyMatchup(S.x, +d.matchup); return run(); }
  if (d.preset != null) { S.matchup = null; const k = presetValue(S.x); S.params[S.x] = cleanParams(S.x, { ...S.params[S.x], [k]: k === 'key' ? d.preset : +d.preset }); userChanged(); return run(); }
  if (d.mode && S.mode !== d.mode) {
    setFormat(d.mode); run();
    root.querySelector(`[data-mode="${S.mode}"]`)?.focus({preventScroll:true}); return;
  }
  if (d.editTarget != null) {
    S.target = Number(d.editTarget);
    renderCompare(lastLanes); renderNext(lastRuns);
    root.querySelector(`[data-edit-target="${S.target}"]`)?.focus({preventScroll:true}); return;
  }
  if (d.change) {
    applyPatch(JSON.parse(d.change));
    [...root.querySelectorAll('[data-change]')].find(button => button.dataset.change === d.change)?.focus({preventScroll:true});
    return;
  }
  if ('clearChanges' in d) {
    const current = lastLanes[editIndex()];
    const before = lastLanes[0];
    const baseline = S.mode === 'change' && JSON.stringify(current.setup) === JSON.stringify(before.setup) ? before : null;
    setEdit({...current, change: baseline?.change ?? NO_CHANGE, diff: baseline?.diff});
    run();
    $('[data-clear-changes]').focus({preventScroll:true});
    return;
  }
  if (d.nextI != null) {
    const x = nextList[+d.nextI]; if (!x) return;
    S.picked = true;
    setEdit(x.lane);
    run();
    $('[data-play]').focus({preventScroll:true});
    $('[data-stage]').scrollIntoView?.({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' }); return;
  }
  if ('play' in d) return stage.toggle();
  if (d.rate) return setRate(+d.rate);
  if ('saveActivity' in d && lastSummary && lastLanes) {
    const url = shareUrl();
    const sameCar = lastLanes.every(lane => lane.id === lastLanes[0].id);
    const setups = sameCar ? shortName(lastLanes[0]) + ' · ' + laneTags(lastLanes).join(' vs ') : laneTags(lastLanes).join(' vs ');
    const saved = saveActivity('replay', EXPERIMENTS[S.x].label + ' · ' + setups, url);
    $('[data-msg]').textContent = saved.ok ? 'Experiment saved in My Garage.' : saved.issue;
    return;
  }
  if ('copy' in d) return copyLink();
  if ('save' in d) return saveImage();
  if ('share' in d) return share();
});
root.addEventListener('keydown', e => {   // arrow keys move between experiment tabs
  const t = e.target.closest('[data-x]'); if (!t || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  const i = EXPERIMENT_KEYS.indexOf(t.dataset.x), n = EXPERIMENT_KEYS[(i + (e.key === 'ArrowRight' ? 1 : EXPERIMENT_KEYS.length - 1)) % EXPERIMENT_KEYS.length];
  root.querySelector(`[data-x="${n}"]`).click(); root.querySelector(`[data-x="${n}"]`).focus();
});
root.addEventListener('input', e => {
  if (e.target.matches('[data-scrub]')) { const f = +e.target.value / 1000; stage.pause(); stage.seek(f * stage.duration); }   // read before pause redraws the slider
});
root.addEventListener('change', e => {
  if (e.target.matches('[data-replay-tire]')) {
    applyPatch({tire: e.target.value});
    $('[data-replay-tire]').focus({preventScroll:true});
  }
});
root.addEventListener('submit', e => {
  if (!e.target.matches('[data-replay-numbers]')) return;
  e.preventDefault();
  const f = new FormData(e.target);
  applyPatch({weight: Math.round(Number(f.get('weight'))), power: Math.round(Number(f.get('power'))), cg: Number(f.get('cg'))});
  $('[data-replay-numbers] button').focus({preventScroll:true});
});
root.addEventListener('ess:vehicle-selected', e => {
  const lane = e.target?.dataset?.lane;
  const id = e.detail?.id; if (!lane || !Object.hasOwn(vehicles, id)) return;
  const current = lastLanes[lane === 'b' ? 1 : 0];
  if (id === current?.id) return;
  if (lane === 'b') { S.bId = id; S.bSetup = S.bChange = S.bDiff = undefined; }
  else {
    S.a = {id}; S.aChange = S.aDiff = S.change = S.variantSetup = S.variantDiff = undefined;
    S.singleLane = undefined; S.singleFromChange = false;
    if (S.bId === id) { S.bId = rival(id); S.bSetup = S.bChange = S.bDiff = undefined; }
  }
  S.picked = true; S.matchup = null; S.context = 'Selected vehicle'; userChanged(); run();
  const opener = e.target.matches('[data-pick-single]') ? $('[data-pick-single]') : root.querySelector(`.rp-car[data-lane="${lane}"]`);
  opener?.focus({preventScroll:true});
});

const msg = t => { const m = $('[data-msg]'); m.textContent = t; clearTimeout(msg.timer); msg.timer = setTimeout(() => { m.textContent = ''; }, 4000); };
async function copyLink() {
  const url = shareUrl();
  try { await navigator.clipboard.writeText(url); msg('Link copied. It opens this comparison and replay.'); }
  catch { showLink(url); }
}
function cardBlob() {
  return new Promise(res => drawShareCard(document.createElement('canvas'), lastScene, lastSummary, { checked: EXPERIMENTS[S.x].evidence === 'checked' }).toBlob(res, 'image/png'));
}
const fileName = () => `ess-${S.x}-${lastLanes.map(l => l.id).filter((v, i, a) => a.indexOf(v) === i).join('-vs-')}.png`.replace(/[^a-z0-9.-]+/gi, '-').slice(0, 90);
// Clipboard refused (some embedded viewers): show the link to copy by hand instead of a blocked prompt().
function showLink(url) {
  const out = $('[data-out]'); out.hidden = false;
  out.innerHTML = '<label>Copy this link<input type="text" readonly data-link-out></label>';
  const input = out.querySelector('input'); input.value = url; input.focus(); input.select();
}
async function saveImage() {
  const blob = await cardBlob(); if (!blob) return msg('Could not make the image in this browser.');
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = href; a.download = fileName();
  document.body.append(a); a.click(); a.remove();
  // Also show the picture: where downloads are blocked (embedded viewers) it can be saved by long-press or right-click.
  const out = $('[data-out]'); out.hidden = false;
  out.innerHTML = `<figure><img src="${href}" alt="${esc(lastSummary.what)}: ${esc(lastSummary.headline)}" width="1200" height="630"><figcaption>Saved as ${esc(fileName())}. If your browser did not download it, press and hold (or right-click) the picture to save it.</figcaption></figure>`;
  msg('Image ready.');
}
async function share() {
  const url = shareUrl(), title = `${lastSummary.what}: ${lastSummary.headline}`;
  try {
    const blob = await cardBlob();
    const file = blob && new File([blob], fileName(), { type: 'image/png' });
    if (file && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title, text: `${title} ${url}` }); return; }
    if (navigator.share) { await navigator.share({ title, text: title, url }); return; }
  } catch (err) { if (err?.name === 'AbortError') return; }
  copyLink();
}

// a plain #brake / #corner link opened on top of this page switches the test (shared #r= links reload state)
addEventListener('hashchange', () => {
  const k = location.hash.slice(1);
  if (EXPERIMENTS[k] && k !== S.x) root.querySelector(`[data-x="${k}"]`)?.click();
  else { const st = decodeState(location.hash); if (st && encodeState(st) !== encodeState({ x: S.x, p: S.params[S.x], lanes: lastLanes })) location.reload(); }
});

initialState();
run({ remember: false });
loadPublished().then(() => { if (lastSummary) renderResult(lastSummary, lastRuns); });
