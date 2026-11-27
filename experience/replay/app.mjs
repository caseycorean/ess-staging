// ESS Test → Watch it happen: six graphical simulations on one replay framework. Claude, 26 Nov 2026.
// Pick an experiment and two cars (or one car and a change); the shared engine runs each lane, the stage replays the
// calculated traces, and the visitor can share a link that reopens the same comparison or save a picture of it.
// Reads the visitor's active Garage car; never writes to the Garage.
import { EXPERIMENTS, EXPERIMENT_KEYS, REPLAY_NOTE, NO_CHANGE, MATCHUPS, readyIds, nextExperiments, publishedCompare, USUAL_ERROR_PCT, estimatedInputs, LETTERS, quickChanges, runLane, road, summarize, replayDuration, laneLabel, laneTags, laneVehicle, vehicleName, changeLabel, isChanged } from './runs.mjs';
import { encodeState, decodeState, cleanParams, cleanLane, LIMITS } from './share-state.mjs';
import { createStage, laneColor } from './stage.mjs';
import { drawShareCard } from './share-card.mjs';
import { installCatalog } from '../catalog.mjs';
import { getActive, modified } from '../configuration.mjs';
import { vehicles, browseIds } from '../vehicles.mjs';

const root = document.querySelector('[data-replay]');
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
const MODES = { car: 'Another car', change: 'Same car, one change', technique: 'Braking technique', diff: 'Differentials' };
const modesFor = x => ['car', 'change', ...(x === 'entry' ? ['technique'] : []), ...(x === 'exit' || x === 'sequence' ? ['diff'] : [])];

const S = { x: 'accelerate', params: Object.fromEntries(EXPERIMENT_KEYS.map(k => [k, { ...EXPERIMENTS[k].params }])), mode: 'car',
  a: null, bId: null, change: null, shared: false };

function initialState() {
  const shared = decodeState(location.hash);
  const hashKey = location.hash.slice(1);
  const qs = new URLSearchParams(location.search);
  const asked = qs.get('car');
  const active = getActive();
  if (shared) {
    S.x = shared.x; S.params[shared.x] = shared.p; S.shared = true; S.picked = true;
    const [a, b] = shared.lanes;
    S.a = { id: a.id, setup: a.setup, change: NO_CHANGE };
    if (shared.lanes.length === 3 || (a.diff && b && b.diff && a.id === b.id && !isChanged(b.change))) S.mode = 'diff';
    else if (b && a.id === b.id && (a.technique || b.technique)) S.mode = 'technique';
    else if (b && a.id === b.id) { S.mode = 'change'; S.change = b.change; }
    else { S.mode = 'car'; S.bId = b?.id ?? rival(a.id); S.bSetup = b?.setup; S.bChange = b?.change; }
    S.aChange = a.change;
    S.sharedLanes = shared.lanes;
    return;
  }
  if (EXPERIMENTS[hashKey]) S.x = hashKey;
  if (asked && vehicles[asked]) S.a = { id: asked, change: NO_CHANGE };
  else if (active && vehicles[active.setup.id]) S.a = { id: active.setup.id, setup: active.mode === 'after' && modified(active.setup) ? active.setup : undefined, change: NO_CHANGE };
  else { applyMatchup(S.x, 0); return; }
  S.picked = true;
  S.bId = rival(S.a.id);
  S.mode = qs.get('compare') === 'change' ? 'change' : S.x === 'entry' ? 'technique' : S.x === 'exit' ? 'diff' : 'car';
}

/** Load a demonstration matchup into the state (the visitor's own car choice, once made, is kept instead). */
function applyMatchup(x, i) {
  const m = MATCHUPS[x]?.[i]; if (!m) return;
  const [a, b] = m.lanes;
  S.x = x; S.mode = m.mode; S.matchup = i;
  if (m.params) S.params[x] = { ...S.params[x], ...m.params };
  S.a = { id: a.id, change: NO_CHANGE }; S.aChange = a.change;
  if (m.mode === 'car') { S.bId = b.id; S.bSetup = undefined; S.bChange = b.change; }
  if (m.mode === 'change') S.change = b.change;
}

// Every lane passes the same boundary as the share link, so what runs here is exactly what a recipient will run.
function lanes() { return rawLanes().map(l => cleanLane(l) ?? l); }
function rawLanes() {
  if (S.sharedLanes) return S.sharedLanes;   // exactly what the sender saw, until the visitor changes something
  const A = { id: S.a.id, setup: S.a.setup, change: S.aChange ?? NO_CHANGE };
  if (S.mode === 'change') return [A, { ...A, change: S.change ?? quickChanges(S.x, laneVehicle(A))[0][0], ...(S.bDiff ? { diff: S.bDiff } : {}) }];
  if (S.mode === 'technique') return [{ ...A, technique: 'trail' }, { ...A, technique: 'straight' }];
  if (S.mode === 'diff') return [{ ...A, diff: 'open' }, { ...A, diff: 'lsd' }, { ...A, diff: 'locked' }];
  return [A, { id: S.bId, setup: S.bSetup, change: S.bChange ?? NO_CHANGE }];
}
const userChanged = () => { S.sharedLanes = null; S.shared = false; };

// ---------------------------------------------------------------- page skeleton (built once; the stage canvas persists)
root.innerHTML = `<div class="rp">
  <header class="rp-head"><p class="kicker">Test · Simulations</p><h1>Watch it happen.</h1>
    <p class="lede">Two cars, one test. Every move comes from the ESS model.</p></header>
  <div class="rp-exps" role="tablist" aria-label="Simulation">${EXPERIMENT_KEYS.map(k => `<button type="button" role="tab" data-x="${k}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k]}</svg><span>${esc(EXPERIMENTS[k].label)}</span></button>`).join('')}</div>
  <section class="rp-compare" data-compare aria-label="What to compare"></section>
  <div class="rp-presets" data-presets></div>
  <figure class="rp-stage">
    <canvas data-stage role="img" aria-label="Replay"></canvas>
    <div class="rp-transport">
      <button type="button" class="rp-play" data-play aria-label="Play">▶</button>
      <input type="range" min="0" max="1000" value="0" data-scrub aria-label="Replay position">
      <span class="rp-clock" data-clock>0.00 s</span>
      <span class="rp-rate" role="group" aria-label="Replay speed">${[[.25, '¼×'], [1, '1×'], [2, '2×'], [4, '4×']].map(([r, l]) => `<button type="button" data-rate="${r}" aria-pressed="${r === 1}">${l}</button>`).join('')}</span>
    </div>
  </figure>
  <section class="rp-result" data-result aria-live="polite"></section>
  <section class="rp-next" data-next aria-label="Try next"></section>
  <section class="rp-share" aria-label="Share">
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
    const b = $('[data-play]'); b.textContent = playing ? '❚❚' : t >= d && d > 0 ? '↺' : '▶';
    b.setAttribute('aria-label', playing ? 'Pause' : t >= d && d > 0 ? 'Replay' : 'Play');
  },
});
const READY = readyIds(browseIds);   // records that can run at least one test (tool-specific readiness)
installCatalog(document, { allowedIds: READY, label: 'Choose a car', templates: false });

// ---------------------------------------------------------------- render
const presetValue = x => ({ accelerate: 'ft', brake: 'from', corner: 'radius', entry: 'mph', exit: 'radius', sequence: 'key' })[x];
function renderPresets() {
  const e = EXPERIMENTS[S.x], key = presetValue(S.x), cur = S.params[S.x][key];
  $('[data-presets]').innerHTML = `<div class="rp-chips" role="group" aria-label="${esc(e.label)} settings">${e.presets.map(([v, l]) => `<button type="button" data-preset="${esc(v)}" aria-pressed="${v === cur}">${esc(l)}</button>`).join('')}</div>`;
  for (const b of root.querySelectorAll('[data-x]')) { b.setAttribute('aria-selected', String(b.dataset.x === S.x)); b.tabIndex = b.dataset.x === S.x ? 0 : -1; }
}
function carButton(which, id, extra = '') {
  return `<button type="button" class="rp-car" data-open-catalog data-lane="${which}" aria-haspopup="dialog"><i style="background:${laneColor(which === 'a' ? 0 : 1)}"></i><span>${esc(vehicleName(id))}${extra}</span><b aria-hidden="true">▾</b></button>`;
}
function renderCompare(ls) {
  const modes = modesFor(S.x);
  if (!modes.includes(S.mode)) S.mode = 'car';
  const A = S.a, vA = laneVehicle({ id: A.id, setup: A.setup });
  let body = '';
  if (S.mode === 'car') body = `<div class="rp-lanes">${carButton('a', A.id, A.setup ? ' · your build' : '')}<span class="rp-vs">vs</span>${carButton('b', S.bId, S.bSetup ? ' · their build' : '')}</div>`;
  else if (S.mode === 'change') {
    const cur = ls[1]?.change;
    body = `<div class="rp-lanes">${carButton('a', A.id, A.setup ? ' · your build' : '')}</div>
      <div class="rp-chips" role="group" aria-label="Change to try">${quickChanges(S.x, vA).map(([c, l]) => `<button type="button" data-change='${esc(JSON.stringify(c))}' aria-pressed="${JSON.stringify(c) === JSON.stringify(cur)}">${esc(l)}</button>`).join('')}</div>
      <details class="rp-custom"><summary>Your own change</summary>${customFields(cur)}</details>`;
  } else body = `<div class="rp-lanes">${carButton('a', A.id, A.setup ? ' · your build' : '')}</div><p class="rp-note">${S.mode === 'technique' ? 'Trail braking (easing off the brakes while turning in) against braking only in a straight line, on the same car.' : 'Open, limited-slip and locked differentials on the same car.'}</p>`;
  const mu = MATCHUPS[S.x] ?? [];
  const muHtml = mu.length ? `<div class="rp-matchups"><span>Try a matchup</span><div class="rp-chips" role="group" aria-label="Matchups">${mu.map((m, i) => `<button type="button" data-matchup="${i}" aria-pressed="${S.matchup === i}" title="${esc(m.note)}">${esc(m.label)}</button>`).join('')}</div>${S.matchup != null && mu[S.matchup] ? `<p class="rp-note">${esc(mu[S.matchup].note)}</p>` : ''}</div>` : '';
  $('[data-compare]').innerHTML = muHtml + `<div class="rp-modes" role="group" aria-label="Compare with">${modes.map(m => `<button type="button" data-mode="${m}" aria-pressed="${m === S.mode}">${MODES[m]}</button>`).join('')}</div>${body}`;
}
function customFields(c = NO_CHANGE) {
  const base = Number(laneVehicle({ id: S.a.id })?.weight) || 3000;
  const f = (k, label, unit, step) => `<label><span>${label}</span><input type="number" step="${step}" min="${LIMITS[k].min instanceof Function ? LIMITS[k].min(base) : LIMITS[k].min}" max="${LIMITS[k].max}" value="${c[k] || 0}" data-custom="${k}" aria-label="${label} (${unit}), ${LIMITS[k].text(base)}"><small>${unit}</small></label>`;
  return `<div class="rp-custom-grid">${f('weight', 'Weight', 'lb', 10)}${f('power', 'Power', '%', 5)}${f('cg', 'CG height', 'in', .5)}</div>`;
}
function renderResult(summary, runs) {
  const e = EXPERIMENTS[S.x];
  const badge = e.evidence === 'checked' ? `<span class="rp-badge ok" title="${esc(e.check)}">✓ Model checked against published tests</span>` : `<span class="rp-badge est" title="${esc(e.check)}">◐ Model estimate</span>`;
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
  $('[data-result]').innerHTML = `<p class="rp-what">${esc(summary.what)} ${badge}</p><h2 class="rp-headline">${esc(summary.headline)}</h2>
    <p class="rp-evidence">${esc(e.check)} <a href="../learn/">How ESS checks its models</a></p>
    ${summary.caveat ? `<p class="rp-caveat">${esc(summary.caveat)}</p>` : ''}
    <ul class="rp-lanes-out">${summary.lanes.map((l, i) => `<li><span class="rp-letter" style="background:${laneColor(i)}" aria-hidden="true">${LETTERS[i]}</span><div><b><span class="rp-sr">Car ${LETTERS[i]}: </span>${esc(l.name)}${place(i) ? ` <em class="rp-place">${place(i)}</em>` : ''}</b><span class="rp-fig">${l.ok ? esc(l.figures.join(' · ')) : 'no run'}</span><small>${esc(l.why)}</small>${laneExtra(i)}</div></li>`).join('')}</ul>`;
  renderNext(runs);
  canvas.setAttribute('aria-label', `${summary.what}. ${summary.headline} ${summary.lanes.map(l => `${l.name}: ${l.figures.join(', ')}`).join('. ')}`);
  const pub = S.x === 'accelerate' && S.params.accelerate.ft === 1320 ? runs.map((r, i) => r.ok && r.quarter?.et ? `${vehicleName(lastLanes[i].id)}: ${r.quarter.et.toFixed(2)} s @ ${r.quarter.trap.toFixed(1)} mph` : null).filter(Boolean) : [];
  $('[data-about]').innerHTML = `<details><summary>What this shows and how sure it is</summary>
    <p><b>${e.evidence === 'checked' ? 'Checked:' : 'Estimate:'}</b> ${esc(e.check)}</p>
    ${pub.length ? `<p>Replay times run from a dead stop. On the drag-strip clock (after the 1 ft rollout road tests use) the model gives ${esc(pub.join('; '))}.</p>` : ''}
    ${S.x === 'corner' ? '<p>Which axle reaches its limit first (understeer or oversteer) is not shown yet: the per-car roll-stiffness split is still awaiting engineering acceptance.</p>' : ''}
    ${['entry', 'exit', 'sequence'].includes(S.x) ? '<p>Quasi-steady path model: the driver uses exactly the available grip on a fixed line; quick changes of direction (yaw response), tire temperature and an optimised racing line are not modelled. Original ESS layouts, not real circuits.</p>' : ''}
    <p>${esc(REPLAY_NOTE)}</p>
    <p><a href="../simulate/?car=${encodeURIComponent(S.a.id)}#${S.x}">Numbers and charts for this test →</a> · <a href="../learn/">How ESS models and tests</a></p></details>`;
}

let nextList = [];
function renderNext(runs) {
  const base = lastLanes[0];
  nextList = runs[0]?.ok && S.mode !== 'diff' && S.mode !== 'technique' ? nextExperiments(S.x, S.params[S.x], base, runs[0]) : [];
  const unit = u => u === 's' ? 's quicker' : u === 'ft' ? 'ft shorter' : 'mph faster';
  const fmtGain = x => `${x.unit === 's' ? x.gain.toFixed(2) : x.unit === 'ft' ? Math.round(x.gain) : x.gain.toFixed(1)} ${unit(x.unit)}`;
  $('[data-next]').innerHTML = !runs[0]?.ok ? '' : nextList.length
    ? `<h3>Try next on car A <small>(${esc(vehicleName(base.id).split(' · ')[0])})</small></h3><div class="rp-next-list">${nextList.map((x, i) => `<button type="button" data-next-i="${i}"><b>${esc(x.label)}</b><span>${esc(fmtGain(x))} in the model</span></button>`).join('')}</div>`
    : (S.mode === 'diff' || S.mode === 'technique' ? '' : `<p class="rp-note">No single quick change moves car A’s result beyond the model’s noise in this test.</p>`);
}
async function loadPublished() {
  try { S.published = await (await fetch(new URL('../../simulate/published.json', import.meta.url))).json(); } catch { S.published = null; }
}

function run({ autoplay = true } = {}) {
  renderPresets();
  const ls = lanes();
  renderCompare(ls);
  const p = S.params[S.x];
  const runs = ls.map(l => runLane(S.x, p, l));
  const summary = summarize(S.x, p, ls, runs);
  lastRuns = runs; lastLanes = ls; lastSummary = summary;
  const labels = laneTags(ls);
  lastScene = { key: S.x, road: road(S.x, p), runs, labels, order: summary.order, duration: replayDuration(runs) };
  stage.set(lastScene);
  if (S.x === 'accelerate' && p.ft >= 2640) setRate(2); else if (S.x === 'corner' && lastScene.duration > 14) setRate(2); else setRate(1);
  renderResult(summary, runs);
  syncUrl();
  if (reduced) stage.end(); else if (autoplay) stage.play();
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
  if (d.x) { S.x = d.x; userChanged(); S.matchup = null;
    if (!S.picked) { applyMatchup(S.x, 0); return run(); }
    if (!modesFor(S.x).includes(S.mode) || ['technique', 'diff'].includes(S.mode)) S.mode = S.x === 'entry' ? 'technique' : S.x === 'exit' ? 'diff' : 'car'; return run(); }
  if (d.matchup != null) { userChanged(); applyMatchup(S.x, +d.matchup); return run(); }
  if (d.preset != null) { S.matchup = null; const k = presetValue(S.x); S.params[S.x] = cleanParams(S.x, { ...S.params[S.x], [k]: k === 'key' ? d.preset : +d.preset }); userChanged(); return run(); }
  if (d.mode) { S.mode = d.mode; S.bDiff = undefined; S.matchup = null; userChanged(); return run(); }
  if (d.change) { S.change = JSON.parse(d.change); S.bDiff = undefined; S.matchup = null; userChanged(); return run(); }
  if (d.nextI != null) {
    const x = nextList[+d.nextI]; if (!x) return;
    const base = lastLanes[0];
    userChanged(); S.matchup = null; S.mode = 'change'; S.picked = true;
    S.a = { id: base.id, setup: base.setup, change: NO_CHANGE }; S.aChange = base.change;
    S.change = x.lane.change; S.bDiff = x.lane.diff && x.lane.diff !== (base.diff ?? 'open') ? x.lane.diff : undefined;
    run(); $('[data-stage]').scrollIntoView?.({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' }); return;
  }
  if ('play' in d) return stage.toggle();
  if (d.rate) return setRate(+d.rate);
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
  const t = e.target;
  if (t.matches('[data-custom]')) {
    const cur = { ...(lastLanes?.[1]?.change ?? NO_CHANGE) }, k = t.dataset.custom, asked = +t.value || 0;
    cur[k] = asked; cur.tire = cur.tire ?? '';
    const clean = cleanLane({ id: lastLanes[0].id, change: cur })?.change ?? NO_CHANGE;
    S.change = clean; userChanged(); run();
    if (clean[k] !== asked) {   // say so, visibly, instead of running a value the share link would change
      const base = Number(laneVehicle({ id: lastLanes[0].id })?.weight) || 3000;
      msg(`${k === 'cg' ? 'CG height' : k[0].toUpperCase() + k.slice(1)} change must be ${LIMITS[k].text(base)}: using ${clean[k] > 0 ? '+' : clean[k] < 0 ? '−' : ''}${Math.abs(clean[k]).toLocaleString('en-US')}${LIMITS[k].unit === '%' ? '%' : ' ' + LIMITS[k].unit}.`);
      const box = root.querySelector(`[data-custom="${k}"]`); if (box) box.value = clean[k];
    }
  }
});
root.addEventListener('ess:vehicle-selected', e => {
  const lane = e.target?.dataset?.lane ?? S.pickLane;
  const id = e.detail?.id; if (!vehicles[id]) return;
  if (lane === 'b') { S.bId = id; S.bSetup = undefined; S.bChange = undefined; }
  else { S.a = { id, change: NO_CHANGE }; S.aChange = undefined; if (S.bId === id) S.bId = rival(id); }
  S.picked = true; S.matchup = null; userChanged(); run();
});
root.addEventListener('pointerdown', e => { const b = e.target.closest('[data-lane]'); if (b) S.pickLane = b.dataset.lane; });

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
run({ autoplay: true });
loadPublished().then(() => { if (lastSummary) renderResult(lastSummary, lastRuns); });
