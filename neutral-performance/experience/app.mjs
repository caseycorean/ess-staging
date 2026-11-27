import { bindComponentReference } from './component-reference-view.mjs';
import "./lab-measurement.mjs";
import { track } from './measurement.mjs';
import { vehicles, vehicleIds, customEstimates } from './vehicles.mjs';
import { resolve, massIssue, choices, cleanSetup, newSetup, presets, validValue, usableSetup, setComponent, overlappingInstallation } from './models.mjs';
import { example, clone, modified, shareFragment, readFragment, getSaved, saveBuild, getGarage, saveToGarage, removeFromGarage, shareResult, getActive, useConfig, laneKeys, lanes, labelLane, modeOf } from './configuration.mjs';
import { home, build, toolsView, learn, inputGroups, toolResults } from './views.mjs';
import { fmt, delta, numberField } from './ui.mjs';
import { compare, matchupEntries, comparisonResults, liveGrid, resultTime, setupName, quickImpact } from './matchup.mjs';
import { paintReplay, replayFrame } from './replay.mjs';
import { garageView, exampleGarage } from './garage-view.mjs';
import { getWorkspace, saveActivity, removeActivity, workspaceHref, saveProject, forgetProject, localPhoto, updatePreferences } from './garage-workspace.mjs';
import { mountSuspension, suspensionView, cleanRear } from './suspension-view.mjs';
import { suspensionPageHtml, mountSuspensionPage, loadSusp, saveSusp, cleanSusp } from './suspension-lab.mjs';
import { bindUnitControls, format as formatUnits } from './units.mjs';
import { installCatalog } from './catalog.mjs';
import { tractionPanel } from './drivetrain-view.mjs';
import { components, componentOverrides, gearboxDryDifference } from './components.mjs';
import { mountCamber } from './diagrams.mjs';
import { mountFrontGeometry, frontGeometry } from './front-geometry.mjs';
import { studies, missingFor } from './readiness.mjs';
import { labJourneyHtml, experiments as journeyExperiments } from './journey.mjs';
import { performanceView, performanceExplain, loadPerf, savePerf, perfDefaults, cleanPerf, shareSummary, summaryHtml, tractionHtml, tireTableHtml, feedbackHtml, perfModel, snapshot, launchPanelHtml, withConditions, effectivePerf } from './performance-view.mjs';

const app = document.querySelector('#app');
if (app) bindComponentReference(app, reference => {
  if (state[state.focus].id === 'custom') return;
  saveActivity('component', reference.title + ' · component evidence', experimentUrl('build'), true);
});
const raceCapability = event => event === 'oval' ? 'oval' : 'strip';
const query = new URLSearchParams(location.search);
try {
  if (!sessionStorage.getItem('ess.visit.v1')) {
    sessionStorage.setItem('ess.visit.v1', '1');
    if (getGarage().length) track('return_visit', {capability:'garage'});
  }
} catch { /* Storage may be unavailable. */ }
installCatalog();
const notice = document.querySelector('#link-notice');
const status = document.querySelector('#status');
const defaults = { brake: .4, lateral: .9 };
let saved = getSaved();
const draftKey = 'ess.lab-session.v1';
function initialState(useDraft = true) {
  const selected = getActive();
  const newVehicle = new URLSearchParams(location.search).has('start');
  if (useDraft && !newVehicle) {
    try {
      const draft = JSON.parse(sessionStorage.getItem(draftKey));
      const saved = draft?.selection === JSON.stringify(selected) && readFragment(draft.fragment).state;
      if (saved) { delete saved.perf; return saved; } // page conditions persist separately (sessionStorage)
    } catch {
      // The standalone lab also works with browser storage disabled.
    }
  }
  return selected ? {...example(), a: selected.setup, aMode: selected.mode} : {...example(), a: newSetup('camaro')};
}
let state = initialState();
const entryUrl = new URL(location.href);
if (entryUrl.searchParams.has('start')) {
  entryUrl.searchParams.delete('start');
  history.replaceState(null, '', entryUrl);
}

function rememberDraft() {
  try {
    sessionStorage.setItem(draftKey, JSON.stringify({selection: JSON.stringify(getActive()), fragment: shareFragment(withPerf())}));
  } catch {
    // The live experiment still works with browser storage disabled.
  }
}
let view = 'home';
let perf = loadPerf();
let susp = loadSusp();
const perfViews = ['performance', 'performance-why', 'performance-math'];
let replay;
let pendingPreset;
let sharedLinkNotice = '';
let previousBuildResult = null;

const active = () => state[state.focus];
const toolSettings = () => state.tool ?? defaults;
const byId = id => document.getElementById(id);

function speak(message = '') {
  status.textContent = message;
}

const limitsFor = key => ({frontSpring: [40, 2000], rearSpring: [40, 2000], frontMotion: [.25, 1.5], rearMotion: [.25, 1.5]})[key] ?? [0, 0];
const withSusp = () => ({...state, susp: JSON.parse(JSON.stringify(susp))});
const withPerf = () => ({...state, perf: {tire: perf.tire, surface: perf.surface, customMu: perf.customMu, gear: perf.gear}});

function experimentUrl(page = 'compare') {
  const url = new URL('./', location.href);
  url.searchParams.set('via', 'share');
  url.hash = shareFragment(page.startsWith('performance') ? withPerf() : page === 'suspension' ? withSusp() : state, page);
  return url.href;
}

function navigate(next) {
  sharedLinkNotice = '';
  history.pushState(null, '', '#' + next);
  render(next);
  const heading = app.querySelector('h1');
  heading?.setAttribute('tabindex', '-1');
  heading?.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'auto' });
}

let openedShare = false;
let legacySuspensionShare = false;
function applyLocation() {
  const route = readFragment(location.hash);
  legacySuspensionShare = route.view === 'suspension' && Boolean(route.state?.susp);
  if (route.state) {
    const {perf: sharedPerf, susp: sharedSusp, ...rest} = route.state;
    state = rest;
    if (sharedSusp) { susp = sharedSusp; saveSusp(susp); }
    if (sharedPerf) {
      perf = cleanPerf({...sharedPerf, vehicle: state[state.focus].id}); savePerf(perf);
      if (!state[state.focus].conditions && (perf.tire || perf.surface !== 'dryAsphalt')) {
        state[state.focus] = withConditions(state[state.focus], perf);
        state[state.focus + 'Mode'] = 'after';
      }
    }
    if (!openedShare && query.get('via') === 'share') {
      openedShare = true;
      track('share_open', {capability: route.view === 'compare' ? raceCapability(state.event) : route.view});
    }
    sharedLinkNotice = query.get('via') === 'reference' ? 'Factory reference loaded. Add a measurement or try a change.' : route.view === 'suspension' ? 'Shared suspension experiment: same car, springs and geometry, shown in your units. Move one thing to see what it does.' : perfViews.includes(route.view) ? 'Shared experiment: same car, gearing, tire and surface. Change one thing to see what it does.'
      : 'Shared experiment. Try a change or run the comparison to see it play out.';
  } else if (route.invalid) {
    track('invalid_setup', {outcome:'blocked'});
    state = initialState(false);
    sharedLinkNotice = 'This experiment link could not be restored. The default matchup is ready to try.';
  } else {
    sharedLinkNotice = '';
    if (query.get('custom') === '1' && route.view === 'build') state = {...example(), a:newSetup('custom')};
    if (route.view === 'compare' && query.get('event') === 'oval') state.event = 'oval';
  }
  render(route.view);
  if (route.view === 'build') {
    const query = new URLSearchParams(location.search);
    if (query.get('inspect') === 'components') {
      const evidence = app.querySelector('[data-component-reference]');
      if (evidence) {
        evidence.open = true;
        evidence.scrollIntoView({block:'start'});
        evidence.querySelector('summary').focus({preventScroll:true});
      }
    }
    if (query.get('edit') === 'original') app.querySelector('[data-details="original"]').open = true;
    const study = query.get('study');
    if (Object.hasOwn(studies, study)) {
      app.querySelector('[data-study-select]').value = study;
      app.querySelector('[data-study-select]').dispatchEvent(new Event('change', {bubbles: true}));
      app.querySelector('#data-readiness').scrollIntoView({block: 'start'});
    }
  }
}

function render(next = view, restoreDetails = false) {
  // Navigation uses V2. Only a saved legacy geometry payload opens its original solver.
  if (next === 'suspension' && !legacySuspensionShare) { location.replace(new URL('../suspension-v2/', location.href).href); return; }
  const openSections = new Map(restoreDetails ? [...app.querySelectorAll('details[data-details]')].map(el => [el.dataset.details, el.open]) : []);
  const priorFocus = restoreDetails ? app.querySelector(':focus') : null;
  const focusData = priorFocus && Object.entries(priorFocus.dataset)[0];
  stopReplay();
  pendingPreset = null;
  view = next;
  document.body.dataset.labView = view;
  switch (view) {
    case 'build':
      app.innerHTML = build(state, saved, {previous: previousBuildResult, suggestion: labJourney('lab-build', 'strip', true)});
      previousBuildResult = null;
      break;
    case 'compare': {
      const entries = matchupEntries(state);
      app.innerHTML = compare(state, entries) + labJourney('lab-compare', state.event);
      setReplay(entries);
      break;
    }
    case 'tools': app.innerHTML = toolsView(state, toolSettings(), shareFragment(state, 'tools'), saved); break;
    case 'garage': app.innerHTML = query.get('demo') === 'garage' ? exampleGarage() : garageView(getGarage(), getActive()); break;
    case 'suspension': {
      const setup = active();
      const v = resolve(setup, true), orig = resolve(setup, false);
      const rear = cleanRear(susp.rear);
      app.innerHTML = '<div class="shell"><p class="link-notice">Saved geometry from an earlier experiment. <a href="../suspension-v2/">Open current suspension geometry</a>.</p></div>' + suspensionPageHtml({ name: setupName(setup), v, susp,
        provenance: state[state.focus + 'Mode'] === 'after' ? 'modified configuration' : 'original configuration',
        rearHtml: suspensionView(setupName(setup), v, { embedded: true, initial: rear }) });
      mountSuspensionPage(app, {
        susp, v, orig,
        save: () => saveSusp(susp),
        rerender: () => render('suspension', true),
        announce: speak,
        preview: (key, value) => { const next = {...setup, tune: {...setup.tune, [key]: value}}; return usableSetup(next) ? resolve(next, true) : null; },
        applyTune: (key, value, label) => {
          if (!validValue(key, value)) return `Use ${formatUnits(key.endsWith('Motion') ? 'ratio' : 'rate', limitsFor(key)[0])} to ${formatUnits(key.endsWith('Motion') ? 'ratio' : 'rate', limitsFor(key)[1])}.`;
          const next = {...setup, tune: {...setup.tune, [key]: value}};
          if (!commitExperiment(next, (label ? 'Applied: ' + label + '. ' : '') + 'Saved with this configuration.')) return 'That value could not be applied to this configuration.';
          return true;
        },
        mountRear: (root, onRear) => mountSuspension(root, v, { initial: rear, onChange: onRear }),
      });
      break;
    }
    case 'learn': app.innerHTML = learn(); break;
    case 'performance':
    case 'performance-why':
    case 'performance-math': {
      const setup = active();
      if (perf.vehicle !== setup.id) { perf = {...perfDefaults(), vehicle: setup.id}; savePerf(perf); }
      // The configuration is the source of truth for tire, surface and own friction.
      { const e = effectivePerf(setup, {...perf, tire: null, surface: 'dryAsphalt', customMu: null}); perf = {...perf, tire: e.tire, surface: e.surface, customMu: e.customMu}; }
      // Before/after for the feedback line: compare with what was on screen before this render.
      const sig = JSON.stringify([setup, perf.tire, perf.surface, perf.customMu]);
      if (!perfShown || perfShown.id !== setup.id) perfLast = null;
      else if (perfShown.sig !== sig) perfLast = {label: perfLabel || 'Your change', et: perfShown.et, launch: perfShown.launch};
      perfLabel = null;
      perfShown = {sig, id: setup.id, ...snapshot(setup, perf)};
      app.innerHTML = view === 'performance' ? performanceView(state, perf, perfLinks(), perfLast) :
        performanceExplain(state, perf, view === 'performance-why' ? 'why' : 'math');
      break;
    }
    default: app.innerHTML = home(state, saved);
  }
  mountCamber(app);
  mountFrontGeometry(app);
  bindUnitControls(app);
  watchPerfSticky();
  fillLaunchPanel();
  rememberDraft();
  notice.textContent = sharedLinkNotice;
  notice.classList.toggle('link-notice', Boolean(sharedLinkNotice));
  for (const nav of document.querySelectorAll('nav a[data-view]')) {
    if (nav.dataset.view === view) nav.setAttribute('aria-current', 'page');
    else nav.removeAttribute('aria-current');
  }
  for (const detail of app.querySelectorAll('[data-details]')) {
    if (openSections.has(detail.dataset.details)) detail.open = openSections.get(detail.dataset.details);
  }
  if (focusData) {
    const [key, value] = focusData;
    [...app.querySelectorAll('button,select,input')].find(el => el.dataset[key] === value && !el.disabled && (priorFocus.dataset.range === undefined) === (el.dataset.range === undefined))?.focus({ preventScroll: true });
  }
}

function changeFocused(next) {
  state[state.focus] = next;
  state[state.focus + 'Mode'] = modified(next) ? 'after' : 'before';
}

function commitExperiment(next, message) {
  track('experiment_start', {capability:view});
  if (!usableSetup(next)) {
    track('missing_inputs', {capability:view, outcome:'blocked'});
    return false;
  }
  if (view === 'build') previousBuildResult = resolve(active());
  changeFocused(next);
  render(view, true);
  const feedback = view === 'build' ? app.querySelector('.build-feedback')?.textContent : '';
  speak(feedback ? `${message} ${feedback}` : message);
  if (!massIssue(resolve(next))) track('experiment_result', {capability:view, outcome:'ready'});
  return true;
}

function addPreset(setup, key) {
  const preset = presets[key];
  const part = {
    label: preset.label, preset: key,
    oldWeight: preset.oldWeight, newWeight: preset.newWeight,
    oldX: preset.oldX, newX: preset.newX,
  };
  if (key === 'remove') part.oldX = part.newX = +(resolve(setup, false).wheelbase * .7).toFixed(2);
  setup.parts.push(part);
  return part;
}

function choosePreset(key) {
  const preset = presets[key];
  const next = clone(active());
  if (!preset || next.parts.some(p => p.preset === key)) return;
  if (next.parts.length >= 8) {
    speak('The experiment can hold eight component changes. Undo one to add another.');
    return;
  }
  if (preset.requiresOld) {
    if (overlappingInstallation(next.parts, 'powertrain')) {
      speak('Undo the existing installation package before adding another.');
      return;
    }
    pendingPreset = key;
    byId('preset-form').innerHTML = `<form data-form="measured" class="edit-form">
      <p>${preset.note}</p><div class="input-grid">
      ${numberField('oldWeight', 'Removed package (lb)', '', { min: 1, max: 1800, required: true })}
      ${numberField('oldX', 'Removed package position (in)', preset.oldX, { min: -75, max: 220, required: true })}
      ${numberField('newX', 'Installed package position (in)', preset.newX, { min: -75, max: 220, required: true })}
      </div><label class="checkbox-line"><input type="checkbox" name="donor">
      <span>Use the donor GTO’s published 350 hp and 365 lb-ft engine ratings in simulation.</span></label>
      <button class="button secondary">Add LS1/T5 swap</button><p class="form-issue" role="alert"></p></form>`;
    byId('preset-form').querySelector('input').focus();
    return;
  }
  addPreset(next, key);
  if (!commitExperiment(next, preset.label + ' applied to the experiment.'))
    speak('This change puts the mass or axle loading outside the model limits.');
}

function numericValue(key, text) {
  if (choices[key]) return text;
  if (key === 'gears') {
    const values = text.split(',').map(s => s.trim());
    return values.every(s => /^\d*\.?\d+$/.test(s)) ? values.map(Number) : null;
  }
  if (!/^-?\d*\.?\d+$/.test(text)) return null;
  return key === 'front' ? Number(text) / 100 : Number(text);
}

app.addEventListener('submit', event => {
  const form = event.target;
  const group = form.dataset.form;
  if (!group) return;
  event.preventDefault();
  const issue = form.querySelector('.form-issue');
  const next = clone(active());
  const values = new FormData(form);
  if (group === 'part' || group === 'measured') {
    if (next.parts.length >= 8) { issue.textContent = 'The experiment can hold eight component changes.'; return; }
    if (group === 'part') {
      const role = values.get('role');
      const part = {
        label: values.get('label').trim(), oldWeight: +values.get('oldWeight'), newWeight: +values.get('newWeight'),
        oldX: +values.get('oldX'), newX: +values.get('newX'), ...(role ? {role} : {}),
      };
      const unchanged = part.oldWeight === part.newWeight && (part.oldWeight === 0 || part.oldX === part.newX);
      if (unchanged) { issue.textContent = 'Enter a change in weight or position.'; return; }
      if (role && (!values.has('sameBasis') || !part.oldWeight || !part.newWeight)) {
        issue.textContent = 'Enter both installed weights and confirm the measurement basis.'; return;
      }
      if (role && overlappingInstallation(next.parts, role)) {
        issue.textContent = 'Undo the existing installation entry before applying a replacement for the same hardware.'; return;
      }
      next.parts.push(part);
    } else if (pendingPreset) {
      const part = addPreset(next, pendingPreset);
      Object.assign(part, { oldWeight: +values.get('oldWeight'), oldX: +values.get('oldX'), newX: +values.get('newX') });
      if (values.has('donor')) {
        const donor = stock('gto');
        for (const field of ['hp', 'hpRpm', 'torque', 'torqueRpm']) next.tune[field] = donor[field];
        next.tune.redline = donor.redline; // Illustrative shift ceiling, not a measured installed limit.
      }
    }
    if (!cleanSetup(next) || !commitExperiment(next, 'Component change applied to the experiment.'))
      issue.textContent = 'Check the part name and values. The result must stay within the mass and axle-balance limits.';
    return;
  }
  const section = group === 'original' ? 'base' : 'tune';
  if (section === 'base') {
    const name = values.get('setupName').trim();
    if (name) next.name = name;
    else delete next.name;
  }
  const benchmark = section === 'base' ? resolve({...next, base: {}}, false) : {...resolve(next, false), ...componentOverrides(next)};
  for (const key of inputGroups[group]) {
    const entered = values.get(key).trim();
    if (!entered) {
      delete next[section][key];
      continue;
    }
    const value = numericValue(key, entered);
    if (!validValue(key, value)) {
      issue.textContent = 'Check the highlighted specifications. Use positive numbers and decreasing comma-separated gear ratios.';
      form.elements.namedItem(key).focus();
      return;
    }
    const same = key === 'gears' ? value.length === benchmark[key]?.length && value.every((n, i) => n === benchmark[key][i]) :
      choices[key] ? value === benchmark[key] : Number.isFinite(benchmark[key]) && Math.abs(value - benchmark[key]) < .000051;
    if (same) delete next[section][key];
    else next[section][key] = value;
  }
  if (!commitExperiment(next, 'Specifications updated.'))
    issue.textContent = 'The resulting mass or axle balance is outside the model limits.';
});

app.addEventListener('ess:vehicle-selected', event => {
  const target = event.target.dataset.vehicleKey;
  if (!target) return;
  const key = target === 'focus' || target === 'garage' ? state.focus : target;
  const {id, template} = event.detail;
  const previous = state[key];
  if (id === previous.id && !template && target !== 'garage') return;
  if ((modified(previous) || previous.name || Object.keys(previous.base).length) && target !== 'garage' &&
      !window.confirm('Replace the current experiment in this lane? Your saved builds stay available.')) return;
  state[key] = newSetup(id);
  state[key + 'Mode'] = 'before';
  if (target === 'garage') carryLane(key, 'before');
  if (template) {
    state.focus = key;
    navigate('build');
    app.querySelector('[data-details="original"]').open = true;
  } else render(view, true);
  speak('Selected ' + vehicles[id].name + '.');
});

app.addEventListener('input', event => {
  const input = event.target;
  if (!input.dataset.componentSearch) return;
  const normalize = text => text.toLowerCase().replace(/[^a-z0-9]/g, '');
  const words = input.value.trim().split(/\s+/).map(normalize).filter(Boolean);
  const select = app.querySelector(`[data-component="${input.dataset.componentSearch}"]`);
  for (const option of select.options) {
    const search = normalize(option.textContent + option.value);
    option.hidden = !!option.value && !option.selected && !words.every(word => search.includes(word));
  }
});

app.addEventListener('change', event => {
  const el = event.target;
  if (el.hasAttribute('data-study-select')) {
    for (const row of app.querySelectorAll('[data-study]')) row.hidden = row.dataset.study !== el.value;
  } else if (el.name === 'role' && el.closest('[data-form="part"]')) {
    const confirmation = el.form.querySelector('[data-install-basis]');
    confirmation.hidden = !el.value;
    confirmation.querySelector('input').checked = false;
  } else if (el.dataset.gearboxWeight) {
    const [from, to] = ['from', 'to'].map(side => app.querySelector(`[data-gearbox-weight="${side}"]`).value);
    const difference = gearboxDryDifference(from, to);
    app.querySelector('[data-gearbox-difference]').textContent = difference === null ? '' :
      `${delta(difference, 1)} lb dry gearbox difference. This comparison does not modify the vehicle.`;
  } else if (el.dataset.component) {
    const kind = el.dataset.component;
    const next = clone(active());
    const before = next.components?.[kind];
    if (before === el.value) return;
    const specs = components[kind][el.value] ?? components[kind][before];
    if (perfViews.includes(view)) perfLabel = (specs?.name ?? 'Transmission') + (el.value ? '' : ' removed');
    setComponent(next, kind, el.value);
    commitExperiment(next, specs ? specs.name + (el.value ? ' applied.' : ' removed.') : '');
  } else if (el.hasAttribute('data-perf-tire')) {
    perf = {...perf, tire: el.value};
    perfLabel = 'Tire: ' + el.selectedOptions[0].textContent.trim();
    perfCommit(perfLabel + '.');
  } else if (el.hasAttribute('data-perf-surface')) {
    perf = {...perf, surface: el.value};
    perfLabel = 'Surface: ' + el.selectedOptions[0].textContent.trim();
    perfCommit(perfLabel + '.');
  } else if (el.hasAttribute('data-perf-fd')) {
    perfFinalDrive(Number(el.value), true);
  } else if (el.dataset.mode) {
    state[el.dataset.mode + 'Mode'] = el.value;
    render(view, true);
  }
});

function stopReplay() {
  recordReplayExit();
  if (replay?.frame) cancelAnimationFrame(replay.frame);
  replay = null;
}

function setReplay(entries) {
  stopReplay();
  const playable = entries.filter(e => e.run.trace);
  if (playable.length < entries.length) track('missing_inputs', {capability:raceCapability(state.event), outcome:'blocked'});
  replay = {entries, playable, event: state.event ?? 'strip', elapsed: 0,
    duration: Math.max(0, ...playable.map(e => e.run.trace.at(-1).t))};
  updateReplay(0);
}

function updateReplay(t) {
  if (!replay) return;
  replay.elapsed = t;
  byId('race-time').textContent = t.toFixed(1);
  byId('scrubber').value = replay.duration ? Math.round(t / replay.duration * 1000) : 0;
  const samples = replayFrame(replay.playable, t);
  paintReplay(byId('race-scene'), replay.event, replay.entries, samples, t);
  for (const sample of samples) {
    const {key, mph, gear, limited, gap, finished} = sample;
    byId('speed-' + key).textContent = fmt(mph);
    byId('gear-' + key).textContent = finished ? 'Finished' : gear === 0 ?
      (replay.event === 'oval' ? 'Braking' : 'Shifting') : (limited ? 'Grip limited' : 'Gear ' + gear);
    byId('gap-' + key).textContent = t && !finished ? (gap < 1 ? 'Lead' : '−' + fmt(gap) + ' ft') : '';
  }
}

function play(button) {
  if (!replay?.duration) return;
  byId('replay-details').open = true;
  if (replay.frame) {
    cancelAnimationFrame(replay.frame);
    replay.frame = null;
    button.textContent = 'Resume comparison';
    return;
  }
  if (replay.elapsed === 0 || replay.elapsed >= replay.duration) {
    track('simulator_start', {capability:raceCapability(replay.event)});
    updateReplay(0);
  }
  replay.attempted = true;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    updateReplay(replay.duration);
    button.textContent = 'Show final result';
    recordReplayResult();
    return;
  }
  let lastFrame = performance.now();
  button.textContent = 'Pause replay';
  const tick = now => {
    const rate = Number(byId('playback-rate').value);
    const t = Math.min(replay.duration, replay.elapsed + (now - lastFrame) / 1000 * rate);
    lastFrame = now;
    updateReplay(t);
    if (t < replay.duration) replay.frame = requestAnimationFrame(tick);
    else { replay.frame = null; button.textContent = 'Replay comparison'; recordReplayResult(); }
  };
  replay.frame = requestAnimationFrame(tick);
}

function recordReplayResult() {
  track('simulator_result', {capability:raceCapability(replay.event), outcome:'ready'});
  replay.attempted = false;
}
function recordReplayExit() {
  if (!replay?.attempted) return;
  track('experiment_exit', {capability:raceCapability(replay.event), outcome:'no_result'});
  replay.attempted = false;
}
window.addEventListener('pagehide', recordReplayExit);
function resetProgress() {
  if (!replay) return;
  recordReplayExit();
  if (replay.frame) cancelAnimationFrame(replay.frame);
  replay.frame = null;
  updateReplay(0);
  app.querySelector('[data-action="play"]').textContent = 'Run comparison';
}

function tuneComparison(key, value) {
  const current = active();
  if (key === 'grip') delete current.conditions; // a typed grip value replaces the tire/surface setting
  if (value === resolve(current, false)[key] && !Object.hasOwn(componentOverrides(current), key)) delete current.tune[key];
  else current.tune[key] = value;
  state[state.focus + 'Mode'] = modified(current) ? 'after' : 'before';
  byId('quick-' + key).value = fmt(value, 2);
  const mode = app.querySelector(`[data-mode="${state.focus}"]`);
  mode.options[1].disabled = !modified(current);
  mode.value = modeOf(state, state.focus);
  if (key === 'finalDrive') for (const chip of app.querySelectorAll('[data-axle-ratio]'))
    chip.setAttribute('aria-pressed', String(Number(chip.dataset.axleRatio) === value));
  refreshComparison();
}

function refreshComparison() {
  const entries = matchupEntries(state);
  byId('race-live').innerHTML = liveGrid(entries);
  const oval = state.event === 'oval';
  byId('race-results').innerHTML = comparisonResults(entries, oval);
  const selected = entries.find(entry => entry.key === state.focus);
  byId('quick-impact').textContent = quickImpact(selected, oval);
  const traction = app.querySelector('[data-traction-result]');
  if (traction) traction.outerHTML = tractionPanel(resolve(selected.setup));
  byId('share-feedback').replaceChildren();
  setReplay(entries);
  const playable = Boolean(replay.duration);
  for (const action of ['play', 'share', 'restart', 'save-comparison']) app.querySelector(`[data-action="${action}"]`).disabled = !playable;
  app.querySelector('[data-action="play"]').textContent = 'Run comparison';
  app.querySelector('[data-action="reveal-replay"]').disabled = !playable;
  byId('scrubber').disabled = !playable;
  rememberDraft();
}

async function perfShare() {
  const url = experimentUrl('performance');
  const target = byId('perf-share-feedback');
  track('share_attempt', {capability:'performance'});
  const result = await shareResult(url, 'ESS gearing and traction experiment', shareSummary(perfModel(active(), perf)));
  track('share_outcome', {capability:'performance', outcome:result});
  if (!target?.isConnected || result === 'cancelled') return;
  target.replaceChildren();
  if (result === 'copied') target.append('Link copied. ');
  if (result === 'shared') target.append('Experiment shared. ');
  const anchor = document.createElement('a');
  anchor.href = url; anchor.textContent = 'Open the shared link'; anchor.target = '_blank'; anchor.rel = 'noopener';
  target.append(anchor);
  if (result === 'manual') {
    const input = document.createElement('input');
    input.readOnly = true; input.value = url; input.setAttribute('aria-label', 'Experiment link');
    target.append(input); input.focus(); input.select();
  }
}

async function suspShare() {
  const url = experimentUrl('suspension');
  const target = byId('susp-share-feedback');
  const v = resolve(active(), true);
  const summary = `${setupName(active())} suspension: springs ${formatUnits('rate', v.frontSpring)} front / ${formatUnits('rate', v.rearSpring)} rear`;
  const result = await shareResult(url, 'ESS suspension experiment', summary);
  if (!target?.isConnected || result === 'cancelled') return;
  target.replaceChildren(result === 'copied' ? 'Link copied. ' : result === 'shared' ? 'Experiment shared. ' : '');
  const anchor = document.createElement('a');
  anchor.href = url; anchor.textContent = 'Open the shared link'; anchor.target = '_blank'; anchor.rel = 'noopener';
  target.append(anchor);
  if (result === 'manual') {
    const input = document.createElement('input');
    input.readOnly = true; input.value = url; input.setAttribute('aria-label', 'Experiment link');
    target.append(input); input.focus(); input.select();
  }
}

async function share() {
  const url = experimentUrl();
  const title = 'ESS Vehicle Lab comparison';
  const oval = replay.event === 'oval';
  const currentEvent = oval ? 'test oval lap' : 'quarter mile';
  const results = replay.entries.map(({setup, run}) => {
    const time = resultTime(run, oval);
    return setupName(setup) + ' ' + (time ? fmt(time, 1) + ' s' : 'no finish');
  });
  const summary = 'Estimated ' + currentEvent + ' · ' + results.join(' vs. ');
  const target = byId('share-feedback');
  const capability = raceCapability(replay.event);
  track('share_attempt', {capability});
  const result = await shareResult(url, title, summary);
  track('share_outcome', {capability, outcome:result});
  if (!target.isConnected || result === 'cancelled') return;
  target.replaceChildren();
  if (result === 'copied') target.append('Link copied. ');
  if (result === 'shared') target.append('Matchup shared. ');
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.textContent = 'Open shared link';
  anchor.target = '_blank';
  anchor.rel = 'noopener';
  target.append(anchor);
  if (result === 'manual') {
    const label = document.createElement('label');
    label.textContent = 'Copy the experiment link';
    const input = document.createElement('input');
    input.readOnly = true;
    input.value = url;
    label.append(input);
    target.append(label);
    input.focus();
    input.select();
  }
}

function sameChange() {
  const keys = lanes(state);
  if (keys.some(key => massIssue(resolve(state[key])))) {
    speak('Add weight and balance data for each car before applying the same part change.');
    return;
  }
  const drafts = keys.map(key => {
    const draft = clone(state[key]);
    if (!draft.parts.some(p => p.preset === 'remove')) addPreset(draft, 'remove');
    return draft;
  });
  if (drafts.some(s => !cleanSetup(s) || !usableSetup(s))) {
    speak('At least one car would exceed the model limits or eight component changes.');
    return;
  }
  keys.forEach((key, index) => {
    state[key] = drafts[index];
    state[key + 'Mode'] = 'after';
  });
  render(view, true);
  speak('Applied the same 50 lb cabin removal to all cars.');
}

function addLane(setup, mode = 'before') {
  const key = laneKeys.find(k => !state[k]);
  if (!key) return false;
  state[key] = clone(setup);
  state[key + 'Mode'] = mode;
  return true;
}

function carryLane(key, selection = modeOf(state, key)) {
  if (!useConfig(state[key], selection)) {
    speak('The browser could not save an active configuration. Use the experiment link to carry it to another page.');
    return false;
  }
  const message = setupName(state[key]) + ' is the active configuration across ESS.';
  if (byId('active-feedback')) byId('active-feedback').textContent = message;
  else speak(message);
  return true;
}


// ---- In-Lab next experiments (Build, Compare) ----
function labJourney(key, event = 'strip', compact = false) {
  try {
    const band = labJourneyHtml(key, active(), labelLane(state.focus) + ' · ' + setupName(active()), {event, compact});
    return compact ? band : `<div class="shell">${band}</div>`;
  }
  catch { return ''; }
}
function applyLabExperiment(el) {
  const x = journeyExperiments(el.dataset.labPlan, active(), undefined, {event: el.dataset.labEvent === 'oval' ? 'oval' : 'strip'}).list.find(item => item.gen === el.dataset.labTry);
  if (!x || !usableSetup(x.setup)) { speak('That experiment no longer applies to this car.'); return; }
  commitExperiment(x.setup, x.title + ' applied to ' + setupName(x.setup) + '.');
  if (view === 'compare') byId('race-results')?.scrollIntoView({block: 'start'});
}

// ---- Performance page (gearing and traction) ----
let perfObserver, launchTimer = 0;
function fillLaunchPanel() {
  clearTimeout(launchTimer);
  if (view !== 'performance' || !byId('perf-launch')?.hasAttribute('aria-busy')) return;
  launchTimer = setTimeout(() => {
    const target = byId('perf-launch');
    if (!target) return;
    try { target.outerHTML = launchPanelHtml(perfModel(active(), perf)) || '<span id="perf-launch"></span>'; }
    catch { target.removeAttribute('aria-busy'); target.querySelector('.ig-sum-note').textContent = 'The launch model could not run for this car.'; }
  }, 60);
}
function watchPerfSticky() {
  perfObserver?.disconnect();
  const slip = app.querySelector('#perf-summary .ig-slip'), bar = app.querySelector('.perf-sticky');
  if (!slip || !bar || !('IntersectionObserver' in window)) return;
  perfObserver = new IntersectionObserver(([entry]) => bar.classList.toggle('show', !entry.isIntersecting && entry.boundingClientRect.top < 0));
  perfObserver.observe(slip);
}
function perfLinks() {
  return {loadTransfer: '../tools/load-transfer/' + shareFragment(state, 'tools')};
}

/** The configuration carries tire/surface/own friction, so Use, Garage, Compare and Build keep them. */
function syncConditions() {
  const next = withConditions(active(), perf);
  state[state.focus] = next;
  state[state.focus + 'Mode'] = modified(next) ? 'after' : 'before';
}

function perfCommit(message) {
  syncConditions();
  savePerf(perf);
  render(view, true);
  if (message) speak(message);
}

let perfFrame = 0;
let perfShown = null, perfLast = null, perfLabel = null;
let perfPendingRef = null;
function perfFinalDrive(value, final) {
  const current = active();
  if (!Number.isFinite(value) || value < 2 || value > 6) return;
  const original = resolve(current, false).finalDrive;
  const before = resolve(current, true).finalDrive;
  if (value === original && !Object.hasOwn(componentOverrides(current), 'finalDrive')) delete current.tune.finalDrive;
  else current.tune.finalDrive = value;
  state[state.focus + 'Mode'] = modified(current) ? 'after' : 'before';
  const label = 'Final drive ' + (Number.isFinite(perfShown?.fd ?? before) ? fmt(perfShown?.fd ?? before, 2) + ' → ' : '') + fmt(value, 2);
  if (final) { perfLabel = label; if (perfShown) delete perfShown.fd; perfCommit(label + '.'); return; }
  if (perfShown && perfShown.fd === undefined) perfShown.fd = before;
  for (const out of app.querySelectorAll('#perf-controls output')) out.textContent = fmt(value, 2);
  cancelAnimationFrame(perfFrame);
  perfFrame = requestAnimationFrame(() => {
    // Live update while dragging: recompute only the result regions so the slider keeps focus.
    const m = perfModel(active(), perf);
    byId('perf-summary').outerHTML = summaryHtml(m, state.focus);
    watchPerfSticky();
    byId('perf-traction').outerHTML = tractionHtml(m, state.focus);
    const tiresOpen = byId('perf-tires')?.open;
    byId('perf-tires').outerHTML = tireTableHtml(m);
    if (tiresOpen) byId('perf-tires').open = true;
    byId('perf-feedback').outerHTML = feedbackHtml(m, perfShown && {label, et: perfShown.et, launch: perfShown.launch});
    const next = byId('perf-next');
    if (next) next.setAttribute('aria-busy', 'true'); // suggestions refresh when the slider is released
    for (const chip of app.querySelectorAll('#perf-controls [data-axle-ratio]'))
      chip.setAttribute('aria-pressed', String(Number(chip.dataset.axleRatio) === value));
    rememberDraft();
  });
}

function perfClick(el) {
  const d = el.dataset;
  if (d.perfRef) {
    const current = active();
    if (d.perfRef === current.id) return true;
    // In-page confirmation (embedded previews refuse window.confirm): a second tap replaces a modified car.
    if ((modified(current) || current.name || Object.keys(current.base).length) && perfPendingRef !== d.perfRef) {
      perfPendingRef = d.perfRef;
      speak('This replaces your changed ' + setupName(current) + '. Tap ' + el.textContent.trim() + ' again to switch, or Save to My Garage first.');
      return true;
    }
    perfPendingRef = null;
    state[state.focus] = newSetup(d.perfRef);
    state[state.focus + 'Mode'] = 'before';
    render(view, true);
    speak('Selected ' + vehicles[d.perfRef].name + '.');
    return true;
  }
  perfPendingRef = null;
  if (d.axleRatio) { perfFinalDrive(Number(d.axleRatio), true); return true; }
  if (d.perfGear !== undefined) { perf = {...perf, gear: Number(d.perfGear)}; perfCommit('Traction check in gear ' + (perf.gear + 1) + '.'); return true; }
  if (d.perfApplyTire) {
    perf = {...perf, tire: d.perfApplyTire, surface: d.perfApplySurface || perf.surface};
    perfLabel = 'Tried ' + el.querySelector('strong').textContent;
    perfCommit(perfLabel + '.');
    byId('perf-feedback')?.scrollIntoView({block: 'center'});
    return true;
  }
  if (d.perfPickTire) { perf = {...perf, tire: d.perfPickTire}; perfLabel = 'Tire: ' + el.querySelector('span').textContent.trim(); perfCommit(perfLabel + '.'); return true; }
  if (el.hasAttribute('data-perf-tire-reset')) { perf = {...perf, tire: null}; perfCommit('Back to tire classes.'); return true; }
  if (el.hasAttribute('data-perf-reset')) {
    const current = active();
    delete current.tune.finalDrive;
    delete current.tune.gears;
    if (current.components) { delete current.components.transmission; if (!Object.keys(current.components).length) delete current.components; }
    state[state.focus + 'Mode'] = modified(current) ? 'after' : 'before';
    perf = {...perfDefaults(), vehicle: current.id};
    perfCommit('Gearing and tires reset to the original car.');
    return true;
  }
  if (el.hasAttribute('data-perf-share')) { perfShare(); return true; }
  if (el.hasAttribute('data-perf-use')) { carryLane(state.focus, modified(active()) ? 'after' : 'before'); return true; }
  return false;
}

app.addEventListener('submit', event => {
  const form = event.target;
  if (!form.hasAttribute('data-perf-mu')) return;
  event.preventDefault();
  const mu = Number(form.elements.mu.value);
  if (!Number.isFinite(mu) || mu < .1 || mu > 3) return;
  perf = {...perf, tire: 'custom', customMu: mu};
  perfCommit('Using your friction value μ ' + fmt(mu, 2) + '.');
});

app.addEventListener('submit', async event => {
  const form = event.target;
  if (!form.matches('[data-garage-name],[data-garage-project]')) return;
  event.preventDefault();
  if (form.hasAttribute('data-garage-project')) {
    const id = form.dataset.garageProject;
    if (!getGarage().some(item => item.key === id)) return;
    const result = saveProject(id,Object.fromEntries(new FormData(form)));
    if (result.ok) {
      render('garage', true);
      app.querySelector(`[data-details="project-${id}"] summary`)?.focus({preventScroll:true});
      app.querySelector(`[data-garage-project="${id}"] [data-garage-project-status]`).textContent = 'Project details saved.';
    } else form.querySelector('[data-garage-project-status]').textContent = result.issue;
    return;
  }

  const button = form.querySelector('button[type="submit"]');
  if (button.disabled) return;
  const message = form.querySelector('[data-garage-settings-status]');
  const values = form.elements;
  const settings = {name:values.name.value, palette:values.palette.value, showRecent:values.recent.checked};
  const file = values.photo.files[0];
  button.disabled = true;
  try {
    if (values.removePhoto?.checked) settings.photo = '';
    else if (file) {
      message.textContent = 'Resizing the photo…';
      settings.photo = await localPhoto(file);
    }
    if (!form.isConnected) return;
    const result = updatePreferences(settings);
    if (!result.ok) { message.textContent = result.issue; return; }
    render('garage', true);
    const panel = app.querySelector('.ess-garage-custom');
    panel.open = true;
    panel.querySelector('summary').focus({preventScroll:true});
    panel.querySelector('[data-garage-settings-status]').textContent = 'Garage settings saved.';
  } catch (error) {
    message.textContent = error.message || 'The photo could not be saved.';
  } finally {
    button.disabled = false;
  }
});

document.addEventListener('click', event => {
  const el = event.target.closest('a,button');
  if (!el) return;
  const href = el.getAttribute('href');
  if (href && ['#home', '#build', '#compare', '#tools', '#learn', '#garage', '#suspension', '#performance', '#performance-why', '#performance-math'].includes(href) &&
      !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
    event.preventDefault();
    speak();
    navigate(href.slice(1));
    return;
  }
  if (perfViews.includes(view) && perfClick(el)) return;
  if (el.dataset.labTry) { applyLabExperiment(el); return; }
  if (el.matches('[data-susp-share]')) { suspShare(); return; }
  if (el.dataset.preset) { choosePreset(el.dataset.preset); return; }
  if (el.dataset.undoComponent) {
    const next = clone(active());
    const name = components[el.dataset.undoComponent][next.components[el.dataset.undoComponent]].name;
    setComponent(next, el.dataset.undoComponent, '');
    commitExperiment(next, name + ' undone.');
    return;
  }
  if (el.dataset.remove !== undefined) {
    const next = clone(active());
    next.parts.splice(+el.dataset.remove, 1);
    if (!commitExperiment(next, 'Component change undone.')) speak('Undoing this change would exceed the model limits.');
    return;
  }
  if (el.dataset.axleRatio) {
    const ratio = Number(el.dataset.axleRatio);
    app.querySelector('[data-quick="finalDrive"]').value = ratio;
    tuneComparison('finalDrive', ratio);
    return;
  }
  if (el.dataset.studyLane) {
    state.focus = el.dataset.studyLane;
    const study = state.event === 'oval' ? 'oval' : 'quarter';
    navigate('build');
    const filter = app.querySelector('[data-study-select]');
    filter.value = study;
    filter.dispatchEvent(new Event('change', {bubbles: true}));
    app.querySelector('#data-readiness').scrollIntoView({block: 'start'});
    app.querySelector('[data-details="original"]').open = true;
    return;
  }
  if (el.dataset.acceptEstimates) {
    const next = clone(active());
    const tool = el.dataset.acceptEstimates;
    if (next.id !== 'custom' || !Object.hasOwn(studies, tool)) return;
    const value = resolve(next);
    const missing = [...missingFor(value, tool), ...(studies[tool].optional ?? []).filter(key => value[key] == null)];
    next.estimates = [...new Set([...(next.estimates ?? []), ...missing.filter(key => Object.hasOwn(customEstimates, key))])];
    state[state.focus] = next;
    render(view, true);
    const filter = app.querySelector('[data-study-select]');
    filter.value = tool;
    filter.dispatchEvent(new Event('change', {bubbles: true}));
    speak('The listed model estimates have been applied to this setup.');
    return;
  }
  if (el.dataset.event) { state.event = el.dataset.event; track('simulator_discovery', {capability:raceCapability(state.event)}); render(view, true); return; }
  if (el.dataset.focusLane) { state.focus = el.dataset.focusLane; render(view, true); return; }
  if (el.dataset.useLane) { carryLane(el.dataset.useLane); return; }
  if (el.dataset.dropLane) {
    const key = el.dataset.dropLane;
    delete state[key];
    delete state[key + 'Mode'];
    if (state.focus === key) state.focus = 'a';
    render(view, true);
    speak(labelLane(key) + ' removed.');
    return;
  }
  if (el.dataset.edit) { state.focus = el.dataset.edit; navigate('build'); return; }
  const garageKey = el.dataset.garageOpen || el.dataset.garageUse || el.dataset.garageRemove;
  if (garageKey) {
    const item = getGarage().find(entry => entry.key === garageKey);
    if (!item) return;
    if (el.dataset.garageRemove) {
      if (window.confirm('Remove this saved variant from My Garage?')) {
        if (removeFromGarage(garageKey)) { forgetProject(garageKey); render(view, true); }
      }
      return;
    }
    state[state.focus] = item.setup;
    state[state.focus + 'Mode'] = item.mode;
    if (el.dataset.garageUse) { carryLane(state.focus, item.mode); render(view, true); }
    else navigate('build');
    return;
  }
  const activityId = el.dataset.removeActivity || el.dataset.shareActivity;
  if (activityId) {
    const item = getWorkspace().saved.find(record => record.id === activityId);
    if (!item) return;
    if (el.dataset.removeActivity) {
      const result = removeActivity(activityId);
      if (result.ok) {
        render('garage', true);
        const heading = app.querySelector('#garage-saved');
        heading?.focus({preventScroll:true});
      }
      speak(result.ok ? 'Activity removed from My Garage.' : result.issue);
    } else {
      const url = workspaceHref(item.path);
      shareResult(url, 'ESS saved experiment', 'Open this ESS experiment.').then(result => {
        speak(result === 'copied' ? 'Experiment link copied.' : result === 'shared' ? 'Experiment shared.' :
          result === 'cancelled' ? 'Share cancelled.' : 'Use the Resume link to open the experiment and copy its address.');
      });
    }
    return;
  }
  const action = el.dataset.action;
  if (!action) return;
  switch (action) {
    case 'compare-build': state[state.focus + 'Mode'] = modified(active()) ? 'after' : 'before'; navigate('compare'); break;
    case 'compare-original': {
      const draft = clone(active());
      draft.tune = {};
      delete draft.components;
      draft.parts = [];
      if (!addLane(draft)) {
        speak('Four cars are already in the comparison. Remove an added lane to include the original.');
        break;
      }
      state[state.focus + 'Mode'] = 'after';
      navigate('compare');
      break;
    }
    case 'use':
      carryLane(state.focus, modified(active()) ? 'after' : 'before');
      navigate('tools');
      break;
    case 'watch-run':
      state.event = 'strip';
      navigate('compare');
      play(app.querySelector('[data-action="play"]'));
      byId('replay-details').scrollIntoView({block: 'start'});
      break;
    case 'add-car': {
      const available = vehicleIds.find(id => lanes(state).every(k => state[k].id !== id)) || vehicleIds[0];
      if (addLane(newSetup(available))) render(view, true);
      break;
    }
    case 'duplicate':
      if (addLane(active(), modeOf(state, state.focus))) render(view, true);
      break;
    case 'open-lineup': {
      const lineup = byId('lineup-panel');
      lineup.open = true;
      lineup.scrollIntoView({block: 'start'});
      lineup.querySelector('summary').focus({preventScroll: true});
      break;
    }
    case 'restart': resetProgress(); break;
    case 'save':
      if (saveToGarage(active(), modified(active()) ? 'after' : 'before')) {
        saveBuild(active());
        saved = clone(active());
        render(view, true);
        speak('Variant saved to My Garage.');
        track('configuration_save', {capability:'garage', outcome:'saved'});
      }
      else speak('This browser could not save the build. The temporary experiment is still open.');
      break;
    case 'load-saved':
      if (saved) { changeFocused(clone(saved)); navigate(view === 'tools' ? 'tools' : 'build'); speak('Opened a temporary copy of my saved build.'); }
      break;
    case 'reset': {
      const next = {...active(), tune: {}, parts: []};
      delete next.components;
      delete next.conditions;
      commitExperiment(next, 'Modifications reset. Original specifications kept.');
      break;
    }
    case 'same-change': sameChange(); break;
    case 'reveal-replay': {
      const details = byId('replay-details');
      details.open = true;
      const button = details.querySelector('[data-action="play"]');
      button.focus({preventScroll:true});
      details.scrollIntoView({block:'start'});
      track('simulator_discovery', {capability:raceCapability(replay.event)});
      play(button);
      break;
    }
    case 'play': play(el); break;
    case 'share': share(); break;
    case 'save-active-garage': {
      const current = getActive();
      const saved = current && saveToGarage(current.setup,current.mode);
      if (saved) {
        render('garage',true);
        app.querySelector('.garage-card [data-garage-use]')?.focus({preventScroll:true});
      }
      speak(saved ? 'Active vehicle saved in My Garage.' : 'This browser could not save the active vehicle.');
      break;
    }
    case 'save-comparison': {
      const title = (state.event === 'oval' ? 'Test oval' : 'Quarter mile') + ' · ' +
        lanes(state).map(key => setupName(state[key])).join(' vs ');
      const result = saveActivity('comparison',title,experimentUrl('compare'));
      app.querySelector('[data-comparison-saved]').textContent = result.ok ? 'Comparison saved in My Garage.' : result.issue;
      break;
    }
    case 'save-investigation': {
      const title = setupName(active()) + ' · component evidence';
      const result = saveActivity('component',title,experimentUrl('build'));
      app.querySelector('[data-investigation-saved]').textContent = result.ok ? 'Investigation saved in My Garage.' : result.issue;
      break;
    }
  }
});

app.addEventListener('input', event => {
  const target = event.target;
  if (target.id === 'scrubber' && replay) {
    if (replay.frame) {
      cancelAnimationFrame(replay.frame);
      replay.frame = null;
      app.querySelector('[data-action="play"]').textContent = 'Resume comparison';
    }
    updateReplay(replay.duration * +target.value / 1000);
    return;
  }
  if (target.hasAttribute('data-perf-fd')) { perfFinalDrive(Number(target.value), false); return; }
  const quick = target.dataset.quick;
  if (quick) {
    tuneComparison(quick, Number(target.value));
    return;
  }
  const key = target.dataset.slider;
  if (!key) return;
  const value = +target.value;
  const unit = key === 'lever' || key === 'radius' ? 'ft' : key.endsWith('Spring') ? 'lb/in' : 'g';
  byId('out-' + key).value = value + ' ' + unit;
  if (key === 'radius') {
    byId('inertia-demo').textContent = 'A 40 lbm mass contributes ' + fmt(40 * value ** 2, 1) + ' lbm·ft² about this axis.';
    return;
  }
  if (key === 'lever') {
    byId('torque-demo').textContent = '50 lb of force makes ' + fmt(50 * value, 1) + ' lb-ft of torque.';
    return;
  }
  if (key === 'brake' || key === 'lateral') state.tool = { ...toolSettings(), [key]: value };
  else {
    if (value === resolve(active(), false)[key]) delete active().tune[key];
    else active().tune[key] = value;
    state[state.focus + 'Mode'] = modified(active()) ? 'after' : 'before';
  }
  const result = toolResults(resolve(active(), false), resolve(active()), toolSettings());
  byId('load-result').innerHTML = result.loads;
  byId('ride-result').innerHTML = result.ride;
  const hash = shareFragment(state, 'tools');
  byId('spring-link').hash = hash;
  byId('load-link').hash = hash;
  rememberDraft();
});

document.addEventListener('ess:units-changed', () => { if (view === 'suspension') render(view, true); });

window.addEventListener('hashchange', () => {
  if (location.hash !== '#content') applyLocation();
});
applyLocation();
