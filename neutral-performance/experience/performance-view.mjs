// Vehicle Lab · Performance: gearing, tires and traction on one page (isolated integration slice, Claude 25 Nov).
// Every number comes from the shared engine: experience/models.mjs → engine/acceleration.mjs for the run and
// engine/traction.mjs for tractionCheck / byGear / compareTires. Nothing here is a hard-coded outcome.
import { resolve, straightLine, powerIssue, massIssue, MPH, cleanConditions } from './models.mjs';
import { tractionCheck, byGear, compareTires, frictionFor, tireClasses, pickerOrder, surfaces,
  missingFor as tractionMissing } from '../engine/traction.mjs';
import { wheelRpm } from '../engine/acceleration.mjs';
import { presets as launchPresets, runPreset, timeLost } from '../engine/launch.mjs';
import { components } from './components.mjs';
import { missingFor as studyMissing, missingText } from './readiness.mjs';
import { vehicles } from './vehicles.mjs';
import { modified } from './configuration.mjs';
import { setupName } from './matchup.mjs';
import { vehicleSelector, escape, fmt, delta } from './ui.mjs';
import { lights, tree, lamp, useBar, ordinal, secs as slipSecs, gearChart } from './identity.mjs';

/** Public reference cars offered as one-tap choices (all are in the shared vehicle reference). */
export const quickReferences = [
  ['corvette', '2002 Corvette Z06'], ['camaro', '1991 Camaro Z28'], ['gto', '2004 Pontiac GTO'], ['firebird', '1977 Trans Am'],
];
export const axleRatios = [3.08, 3.42, 3.73, 4.10];
const statusWord = Object.fromEntries(Object.entries(lights).map(([k, v]) => [k, v.word]));
const SESSION_KEY = 'ess.performance-page.v1';

export const perfDefaults = () => ({ vehicle: null, tire: null, surface: 'dryAsphalt', customMu: null, gear: 0 });

/** Page settings (tire, surface, selected gear) live in this tab's session so Back from an article restores them. */
export function loadPerf() {
  try {
    const raw = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    return cleanPerf(raw);
  } catch { return perfDefaults(); }
}
export function savePerf(perf) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(perf)); } catch { /* still works without storage */ }
}
export function cleanPerf(raw) {
  const p = perfDefaults();
  if (!raw || typeof raw !== 'object') return p;
  if (typeof raw.vehicle === 'string') p.vehicle = raw.vehicle;
  if (raw.tire === null || ['setup', 'custom'].includes(raw.tire) || Object.hasOwn(tireClasses, raw.tire)) p.tire = raw.tire ?? null;
  if (Object.hasOwn(surfaces, raw.surface)) p.surface = raw.surface;
  if (Number.isFinite(raw.customMu) && raw.customMu >= .1 && raw.customMu <= 3) p.customMu = raw.customMu;
  if (Number.isInteger(raw.gear) && raw.gear >= 0 && raw.gear < 10) p.gear = raw.gear;
  if (p.tire === 'custom' && p.customMu == null) p.tire = null;
  return p;
}

/** Street tire class whose calibrated typical value equals the vehicle's own grip input (so the defaults agree). */
export function matchedClass(v) {
  if (!Number.isFinite(v.grip)) return null;
  return pickerOrder.find(id => tireClasses[id].reference === 'dryAsphalt' &&
    Math.abs(tireClasses[id].longitudinal.typical - v.grip) < .001) ?? null;
}

/**
 * The configuration's own tire/surface conditions win over page settings, so the gearing page, Compare, Build,
 * Garage and shared links all use one setting. Page settings apply only to a configuration without conditions.
 */
export function effectivePerf(setup, perf = perfDefaults()) {
  const c = setup.conditions;
  if (!c) return perf;
  return { ...perf, tire: c.customMu != null ? 'custom' : (c.tire ?? null), surface: c.surface ?? 'dryAsphalt', customMu: c.customMu ?? null };
}

/** Conditions object for a configuration from page settings (empty = defaults). */
export function conditionsFrom(perf) {
  if (perf.tire === 'custom' && perf.customMu != null) return cleanConditions({ customMu: perf.customMu }) ?? {};
  return cleanConditions({ tire: perf.tire && perf.tire !== 'setup' ? perf.tire : null, surface: perf.surface }) ?? {};
}

/** Copy of a setup carrying the given page settings as its conditions. */
export function withConditions(setup, perf) {
  const next = { ...setup, tune: { ...setup.tune }, parts: [...setup.parts] };
  const c = conditionsFrom(perf);
  if (Object.keys(c).length) { next.conditions = c; delete next.tune.grip; } else delete next.conditions;
  return next;
}

/** The car without conditions: its own grip input is what tire classes are matched against. */
export const baseVehicle = setup => resolve(setup.conditions ? { ...setup, conditions: undefined } : setup, true);

/** Friction options for engine/traction.mjs from the page settings. */
export function frictionOptions(v, perf) {
  const tire = perf.tire ?? matchedClass(v) ?? 'setup';
  if (tire === 'setup') return { tire, opts: { customMu: Number.isFinite(v.grip) ? v.grip : null } };
  if (tire === 'custom') return { tire, opts: { customMu: perf.customMu } };
  return { tire, opts: { tire, surface: perf.surface } };
}

const blockedRun = v => powerIssue(v) || massIssue(v);

/** All results for the page. Pure: safe to call from tests with the same inputs the browser uses. */
export function perfModel(setup, pagePerf) {
  const perf = effectivePerf(setup, pagePerf);
  const original = resolve(setup, false);
  const v = resolve(setup, true);
  const { tire, opts } = frictionOptions(baseVehicle(setup), perf);
  const frictionReady = opts.customMu !== null;
  const mu = frictionReady ? frictionFor(opts) : null;
  const gears = Array.isArray(v.gears) ? v.gears : [];
  const gear = Math.min(perf.gear, Math.max(0, gears.length - 1));

  // Acceleration: original car on its own grip input vs. this experiment at the chosen tire/surface (low/typical/high).
  const runIssue = blockedRun(v);
  const originalIssue = blockedRun(original);
  const baseRun = originalIssue ? null : straightLine(original);
  const runs = runIssue || !mu ? null : Object.fromEntries(['low', 'typical', 'high'].map(k => [k, straightLine(v, { mu: mu[k] })]));
  const accel = runs ? {
    et: runs.typical.finish?.t, trap: runs.typical.finish?.trap, zeroTo60: runs.typical.zeroTo60,
    etRange: [runs.high.finish?.t, runs.low.finish?.t], sixtyRange: [runs.high.zeroTo60, runs.low.zeroTo60],
    magazineEt: runs.typical.magazine.et, time: runs.typical.time, mu: mu.typical,
  } : null;
  const base = baseRun && !baseRun.issue ? { et: baseRun.finish?.t, trap: baseRun.finish?.trap, zeroTo60: baseRun.zeroTo60, mu: original.grip } : null;

  // Gearing: speed at the shift point in each gear and cruise rpm (needs ratios, final drive, tire, shift rpm).
  const gearingMissing = ['gears', 'finalDrive', 'diameter', 'redline'].filter(k => k === 'gears' ? gears.length < 2 : !Number.isFinite(v[k]));
  const gearing = gearingMissing.length ? null : gears.map((ratio, i) => ({
    gear: i + 1, ratio, overall: ratio * v.finalDrive, shiftMph: v.redline / wheelRpm(v, MPH, i),
  }));
  const cruiseRpm = gearing ? wheelRpm(v, 70 * MPH, gears.length - 1) : null;

  // Traction: selected gear (first gear uses the launch rpm; higher gears the torque peak, matching byGear).
  const tOpts = { ...opts, gear, ...(gear > 0 && Number.isFinite(v.torqueRpm) ? { rpm: v.torqueRpm } : {}) };
  const check = frictionReady ? tractionCheck(v, tOpts) : { status: 'missing', missing: ['tire grip value'] };
  const gearRows = frictionReady ? byGear(v, opts) : [];
  const tireRows = check.status === 'missing' ? [] :
    compareTires(v, { surface: perf.surface, gear, ...(tOpts.rpm ? { rpm: tOpts.rpm } : {}) });

  return { setup, v, original, tire, opts, mu, gear, accel, base, runIssue, originalIssue, gearing, gearingMissing, cruiseRpm,
    check, gearRows, tireRows, quarterMissing: studyMissing(v, 'quarter'), tractionMissing: tractionMissing(v, opts),
    modified: modified(setup) };
}

// ---------- Next experiment: real runs of the shared model for a few one-step changes ----------
/** One-line text for a shared link preview: car, gearing, conditions and the result. */
export function shareSummary(m) {
  const t = m.tire === 'setup' ? 'vehicle grip input' : m.tire === 'custom' ? `μ ${fmt(m.opts.customMu, 2)}` : tireClasses[m.tire].label;
  const where = m.opts.surface ? ', ' + surfaces[m.opts.surface].label.toLowerCase() : '';
  const fd = Number.isFinite(m.v.finalDrive) ? ` · ${fmt(m.v.finalDrive, 2)} final drive` : '';
  const result = m.accel ? ` · estimated quarter mile ${fmt(m.accel.et, 2)} s` : '';
  const g = m.gearRows[0] ? ` · 1st gear uses ${fmt(m.gearRows[0].utilization * 100)}% of grip` : '';
  return `${setupName(m.setup)}${fd} · ${t}${where}${result}${g}`;
}

/** Small before/after snapshot for the feedback line: quarter mile and launch share of grip. */
export function snapshot(setup, pagePerf) {
  const perf = effectivePerf(setup, pagePerf);
  const v = resolve(setup, true);
  const { opts } = frictionOptions(baseVehicle(setup), perf);
  const c = opts.customMu === null || tractionMissing(v, opts).length ? null : tractionCheck(v, { ...opts, gear: 0 });
  return { et: quickEt(setup, perf), launch: c?.utilization ?? null };
}

/** Typical-grip quarter mile for a setup and page settings: same call perfModel uses for its main result. */
export function quickEt(setup, pagePerf) {
  const perf = effectivePerf(setup, pagePerf);
  const v = resolve(setup, true);
  const { opts } = frictionOptions(baseVehicle(setup), perf);
  if (blockedRun(v) || opts.customMu === null) return null;
  return straightLine(v, { mu: frictionFor(opts).typical }).finish?.t ?? null;
}

const streetOrder = ['allSeason', 'maxSummer', 'extremeSummer', 'track200'];
/** Up to three one-step experiments ranked by modeled quarter-mile change. Every number is a model run. */
export function nextSteps(m, perf) {
  if (!m.accel || !Number.isFinite(m.accel.et)) return [];
  const now = m.accel.et;
  const out = [];
  const typical = id => tireClasses[id].longitudinal.typical;
  const currentMu = m.mu?.typical ?? 0;
  perf = effectivePerf(m.setup, perf);
  // Tires: the next street class with more grip on the same surface, and drag radials at a prepped strip.
  const nextTire = streetOrder.find(id => typical(id) * (surfaces[perf.surface]?.factor.typical ?? 1) > currentMu + .005);
  if (nextTire) out.push({ kind: 'tire', tire: nextTire, surface: perf.surface, title: tireClasses[nextTire].label,
    detail: 'Same gearing, ' + surfaces[perf.surface].label.toLowerCase() });
  if (m.check.status !== 'green' && !(m.tire === 'dragRadial' && perf.surface === 'preppedStrip'))
    out.push({ kind: 'tire', tire: 'dragRadial', surface: 'preppedStrip', title: 'Drag radials at a prepped strip', detail: 'Same gearing, launch-focused tire and surface' });
  // Gearing: the neighbouring common axle ratios.
  const fd = m.v.finalDrive;
  const shorter = axleRatios.find(r => r > fd + .005), taller = [...axleRatios].reverse().find(r => r < fd - .005);
  for (const r of [shorter, taller].filter(Boolean))
    out.push({ kind: 'axle', ratio: r, title: `${fmt(r, 2)} final drive`, detail: r > fd ? 'Shorter gear: more force, earlier shifts' : 'Taller gear: less force, fewer shifts' });
  for (const step of out) {
    const setup = { ...m.setup, tune: { ...m.setup.tune }, parts: [...m.setup.parts] };
    let trial = setup;
    if (step.kind === 'axle') setup.tune.finalDrive = step.ratio;
    else trial = withConditions(setup, { ...effectivePerf(m.setup, perf), tire: step.tire, surface: step.surface, customMu: null });
    step.et = quickEt(trial, perf);
    step.change = Number.isFinite(step.et) ? step.et - now : null;
  }
  return out.filter(s => s.change !== null).sort((a, b) => a.change - b.change).slice(0, 3);
}

// ---------- HTML ----------
const secs = (n, p = 2) => Number.isFinite(n) ? fmt(n, p) + ' s' : '—';
const pct = n => fmt(n * 100) + '%';
const condition = m => `${m.tire === 'setup' ? 'Vehicle grip input' : m.tire === 'custom' ? 'Your friction value' : tireClasses[m.tire].label}${m.opts.surface ? ' · ' + surfaces[m.opts.surface].label : ''}`;

/** Standing-start launch check (always 1st gear at the model's launch rpm), independent of the gear being inspected. */
export function launchCheck(m) {
  if (m.check.status === 'missing') return m.check;
  return m.gear === 0 ? m.check : tractionCheck(m.v, { ...m.opts, gear: 0 });
}

function missingBlock(text, laneKey) {
  return `<p class="warning">${escape(text)}</p>
    <button type="button" class="text-button missing-action" data-study-lane="${laneKey}">Add the missing values in Build</button>`;
}

function stickyBar(m) {
  const launch = launchCheck(m);
  return `<div class="perf-sticky" aria-hidden="true"><span>Quarter mile</span><strong>${m.accel ? secs(m.accel.et) : '—'}</strong>${tree(launch.status, { label: false })}</div>`;
}

/** The one drag-strip result on the journey: a compact timeslip. */
export function summaryHtml(m, laneKey) {
  const launch = launchCheck(m);
  const head = `<div class="ig-slip-head"><span>${escape(setupName(m.setup))}</span>
    <span class="ig-slip-launch" data-level="${launch.status}">${tree(launch.status, { label: false })} Launch: ${escape(statusWord[launch.status].toLowerCase())}</span></div>`;
  if (!m.accel) {
    const keys = m.quarterMissing;
    return `<div class="perf-summary" id="perf-summary">${stickyBar(m)}
      <div class="ig-slip ig-slip-wide">${head}<div class="ig-slip-grid"><div class="big"><span>Quarter mile</span><b>—</b></div></div></div>
      ${missingBlock(keys.length ? 'The acceleration run needs: ' + missingText(keys) + '. Results that do not depend on these still show below.' : (m.runIssue || 'Choose a tire grip value to run.'), laneKey)}
    </div>`;
  }
  const a = m.accel, b = m.base;
  const d = b && Number.isFinite(a.et) && Number.isFinite(b.et) ? a.et - b.et : null;
  const changed = d !== null && Math.abs(d) >= .005;
  const gripSecs = a.time.traction;
  return `<div class="perf-summary" id="perf-summary">${stickyBar(m)}
    <div class="ig-slip ig-slip-wide" aria-live="polite">${head}
      <div class="ig-slip-grid">
        <div class="big"><span>Quarter mile</span><b>${slipSecs(a.et)}</b><small>Grip range ${fmt(a.etRange[0], 2)}–${fmt(a.etRange[1], 2)} s</small></div>
        <div><span>0–60 mph</span><b>${slipSecs(a.zeroTo60, 1)}</b></div>
        <div><span>Finish</span><b>${fmt(a.trap)}<small> mph</small></b></div>
        <div><span>vs original</span><b>${b ? (changed ? `${delta(d, 2)}<small> s</small>` : 'same') : '—'}</b></div>
      </div>
      <div class="ig-slip-foot">${escape(condition(m))} · ${gripSecs < .05 ? 'never grip-limited' : `grip-limited ${fmt(gripSecs, 1)} s`}</div>
    </div>
    <p class="perf-run-note">${gripSecs < .05 ? '<b>Engine-limited:</b> stickier tires will not change this time.'
      : `<b>Grip-limited for ${fmt(gripSecs, 1)} s</b>, so only that part of the run responds to tire grip.`}
      ${b ? `Original ${secs(b.et)} (μ ${fmt(b.mu, 2)}, dry).` : ''}</p>
  </div>`;
}

function forceRows(row) {
  const a = row.availableLb;
  const top = Math.max(row.demandLb, a.high) * 1.08;
  const at = x => (100 * x / top).toFixed(1) + '%';
  return `<div class="ig-force" role="img" aria-label="Drivetrain sends ${fmt(row.demandLb)} pounds; tires can take ${fmt(a.low)} to ${fmt(a.high)} pounds, typical ${fmt(a.typical)}.">
    <div class="ig-force-row" data-level="${row.status}"><span>Drivetrain sends</span><span class="ig-force-track"><span class="ig-force-fill" style="width:${at(row.demandLb)}"></span></span><b>${fmt(row.demandLb)} lb</b></div>
    <div class="ig-force-row" data-level="green"><span>Tires can take</span><span class="ig-force-track"><span class="ig-force-band" style="left:${at(a.low)};width:calc(${at(a.high)} - ${at(a.low)})"></span><span class="ig-force-tick" style="left:${at(a.typical)}"></span></span><b>${fmt(a.low)}–${fmt(a.high)} lb</b></div>
  </div>`;
}

/** Gear chart + one selected-gear readout + expandable engineering details. Replaces the separate traction panel and gear table. */
export function tractionHtml(m, laneKey) {
  const rows = m.gearRows;
  if (!rows.length) {
    const speeds = m.gearing ? `<p class="quiet small">Gear speeds still work: ${m.gearing.map(g => `${ordinal(g.gear)} ${fmt(g.shiftMph)} mph`).join(' · ')} at ${fmt(m.v.redline)} rpm (gearing only).</p>` : '';
    return `<section class="panel content-panel perf-traction" id="perf-traction" data-level="missing" aria-labelledby="perf-traction-title">
      <h2 id="perf-traction-title">Grip used, gear by gear</h2>
      ${missingBlock('This check needs: ' + (m.check.missing ?? m.tractionMissing).join(', ') + '.', laneKey)}${speeds}</section>`;
  }
  const i = Math.min(m.gear, rows.length - 1);
  const row = rows[i];
  const g = m.gearing?.[i];
  const launch = launchCheck(m);
  const showLaunch = i === 0 && Math.abs(launch.utilization - row.utilization) > .015;
  const check = m.check; // tractionCheck for the selected gear (peak-torque rpm above 1st), for its assumptions
  return `<section class="panel content-panel perf-traction" id="perf-traction" data-level="${row.status}" aria-labelledby="perf-traction-title">
    <h2 id="perf-traction-title">Grip used, gear by gear</h2>
    ${gearChart(rows, { selected: i })}
    <div class="gc-readout" aria-live="polite">
      <div class="gc-big"><b>${pct(row.utilization)}</b><span>${tree(row.status, { label: false })}<strong>${escape(statusWord[row.status])}</strong></span></div>
      <p>In ${ordinal(row.gear)} at peak torque the drivetrain sends <b>${fmt(row.demandLb)} lb</b>; the tires can take ${fmt(row.availableLb.low)}–${fmt(row.availableLb.high)} lb.
      ${showLaunch ? `From a standing start (${fmt(launch.inputs.rpm)} rpm${launch.inputs.converterRatio > 1 ? `, converter ×${launch.inputs.converterRatio}` : ''}) it is <b>${pct(launch.utilization)}</b>: ${escape(statusWord[launch.status].toLowerCase())}.` : ''}</p>
    </div>
    ${forceRows(row)}
      <dl class="gc-facts" aria-label="Engineering details, ${ordinal(row.gear)} gear">
        <div><dt>Gear ratio</dt><dd>${fmt(row.ratio, 2)} × ${fmt(m.v.finalDrive, 2)} final = ${fmt(row.ratio * m.v.finalDrive, 2)}:1</dd></div>
        <div><dt>Drive force</dt><dd>${fmt(row.demandLb)} lb at ${fmt(m.v.torqueRpm)} rpm</dd></div>
        <div><dt>Grip (low / typical / high)</dt><dd>${fmt(row.availableLb.low)} / ${fmt(row.availableLb.typical)} / ${fmt(row.availableLb.high)} lb</dd></div>
        ${g ? `<div><dt>Speed at ${fmt(m.v.redline)} rpm</dt><dd>${fmt(g.shiftMph)} mph <small>theoretical, gearing only</small></dd></div>` : ''}
      </dl>
      <p class="quiet small">The speed is what the gearing allows at the shift point. It is not the achievable top speed: drag and power stop the car earlier in the tall gears. ${fmt(m.cruiseRpm)} rpm at 70 mph in top gear.</p>
    <details class="explain" data-details="perf-gear-detail"><summary>How this ${ordinal(row.gear)}-gear check is calculated</summary>
      ${check.text ? `<p class="small">${escape(check.text)}</p>` : ''}
      <ul class="small">${(check.assumptions ?? []).map(n => `<li>${escape(n)}</li>`).join('')}</ul>
      <p class="small"><a href="#performance-math">See the two equations with this car's numbers</a></p>
    </details>
  </section>`;
}

function gearChoices(m) {
  const original = m.original.finalDrive;
  const values = [...new Set([...(Number.isFinite(original) ? [original] : []), ...axleRatios])].sort((a, b) => a - b);
  return values.map(r => `<button type="button" class="button secondary small" data-axle-ratio="${r}" aria-pressed="${m.v.finalDrive === r}">${fmt(r, 2)}${r === original ? '<small> orig.</small>' : ''}</button>`).join('');
}

function transmissionSelect(setup) {
  const list = components.transmission;
  return `<label><span>Transmission</span><select data-component="transmission"><option value="">Original gearbox</option>
    ${Object.entries(list).filter(([id, item]) => !item.hidden || setup.components?.transmission === id)
      .map(([id, item]) => `<option value="${id}" ${setup.components?.transmission === id ? 'selected' : ''}>${escape(item.name)}</option>`).join('')}</select></label>`;
}

const shortTire = { allSeason: 'All-season', maxSummer: 'Max summer', extremeSummer: 'Extreme summer', track200: '200TW track', dragRadial: 'Drag radial',
  slick: 'Drag slick', perf80s: '1980s–90s radial', radial70s: '1970s radial', bias: 'Bias-ply' };
const shortSurface = { dryAsphalt: 'Dry asphalt', dryConcrete: 'Dry concrete', preppedStrip: 'Prepped strip', wetAsphalt: 'Wet asphalt', gravel: 'Gravel' };

function tireSelect(m) {
  const auto = matchedClass(m.v);
  const opt = (id, label) => `<option value="${id}" ${m.tire === id ? 'selected' : ''}>${escape(label)}</option>`;
  return `<label><span>Tire</span><select data-perf-tire aria-label="Tire class">
    ${!auto && Number.isFinite(m.v.grip) ? opt('setup', `Setup μ ${fmt(m.v.grip, 2)}`) : ''}
    ${pickerOrder.map(id => opt(id, shortTire[id] + (id === auto ? ' (stock)' : ''))).join('')}
    ${m.tire === 'custom' ? opt('custom', `My μ ${fmt(m.opts.customMu, 2)}`) : ''}
  </select></label>`;
}

/** Feedback beside the controls: what the last change did, from model runs before and after it. */
export function feedbackHtml(m, last) {
  const launch = launchCheck(m);
  const now = m.accel ? secs(m.accel.et) : '—';
  if (last && last.label) {
    const dEt = Number.isFinite(last.et) && m.accel ? m.accel.et - last.et : null;
    const lu = launch.utilization;
    return `<p class="ig-feedback" id="perf-feedback" role="status">${tree(launch.status, { label: false })}<span><b>${escape(last.label)}</b>: quarter mile ${Number.isFinite(last.et) ? secs(last.et) + ' → ' : ''}${now}${dEt !== null ? ` (${Math.abs(dEt) < .005 ? 'no change' : delta(dEt, 2) + ' s'})` : ''}${Number.isFinite(last.launch) && Number.isFinite(lu) ? `; launch ${fmt(last.launch * 100)}% → ${pct(lu)} of grip` : ''}.</span></p>`;
  }
  return `<p class="ig-feedback" id="perf-feedback" role="status">${tree(launch.status, { label: false })}<span>${m.accel ? `Now <b>${now}</b>, launch ${escape(statusWord[launch.status].toLowerCase())}${launch.utilization ? ` (${pct(launch.utilization)} of grip)` : ''}. Change one thing and see what it does.` : `No quarter-mile run yet: ${escape(missingText(m.quarterMissing) || 'grip value needed')}.`}</span></p>`;
}

export function controlsHtml(m, perf, last) {
  const ownMu = m.tire === 'setup' || m.tire === 'custom';
  return `<section class="panel content-panel perf-controls" id="perf-controls" aria-labelledby="perf-controls-title" tabindex="-1">
    <h2 id="perf-controls-title">Change the gear or the tire</h2>
    ${feedbackHtml(m, last)}
    <div class="ig-ctl-row"><span class="ig-ctl-label">Final drive <output id="perf-fd">${Number.isFinite(m.v.finalDrive) ? fmt(m.v.finalDrive, 2) : 'missing'}</output></span>
      <div class="axle-ratio-picks" role="group" aria-label="Final-drive ratio">${gearChoices(m)}</div></div>
    <div class="ig-ctl-pair">${tireSelect(m)}
      <label><span>Surface</span><select data-perf-surface aria-label="Surface" ${ownMu ? 'disabled' : ''}>${Object.keys(surfaces).map(id =>
        `<option value="${id}" ${perf.surface === id ? 'selected' : ''}>${escape(shortSurface[id])}</option>`).join('')}</select></label></div>
    ${ownMu ? '<p class="quiet small">A single friction value is used as entered; surface factors and ranges do not apply to it.</p>' : ''}
    <details class="explain" data-details="perf-more"><summary>More gearing and grip options</summary>
      <label class="slider"><span>Fine-tune final drive <output>${Number.isFinite(m.v.finalDrive) ? fmt(m.v.finalDrive, 2) : 'missing'}</output></span>
        <input type="range" data-perf-fd min="2" max="6" step=".01" value="${Number.isFinite(m.v.finalDrive) ? m.v.finalDrive : 3.42}" aria-label="Final drive ratio"></label>
      ${transmissionSelect(m.setup)}
      <p class="quiet small">Gears ${Array.isArray(m.v.gears) && m.v.gears.length ? m.v.gears.map(x => fmt(x, 2)).join(' · ') : 'missing'} · ${escape(m.v.transmission ?? 'transmission type missing')} · tire: ${escape(condition(m))}</p>
      <form data-perf-mu class="edit-form"><label class="number-field"><span>My own peak friction (μ)</span>
      <input type="number" name="mu" min="0.1" max="3" step="0.01" inputmode="decimal" value="${perf.customMu ?? ''}" required></label>
      <button class="button secondary small">Use this value</button>${m.tire === 'custom' ? ' <button type="button" class="button plain small" data-perf-tire-reset>Back to tire classes</button>' : ''}</form>
      <div class="actions"><button type="button" class="button plain small" data-perf-reset ${m.modified || perf.tire || perf.surface !== 'dryAsphalt' ? '' : 'disabled'}>Reset gearing and tires</button></div>
    </details>
  </section>`;
}

export function nextStepsHtml(m, perf) {
  const steps = nextSteps(m, perf);
  if (!steps.length) return '<span id="perf-next"></span>';
  const launch = launchCheck(m);
  const why = launch.status === 'red' ? 'The tires are the limit at launch, so grip pays off first.'
    : launch.status === 'green' ? 'The tires have grip to spare, so gearing is where time is.'
    : 'The launch is on the edge: small changes tip it either way.';
  return `<section class="panel content-panel" id="perf-next" aria-labelledby="perf-next-title"><h2 id="perf-next-title">Next experiment</h2>
    <p class="ig-step-why">${why} Each is a model run of this car; tap to try it.</p>
    <div class="ig-steps">${steps.map(s => `<button type="button" class="ig-step" ${s.kind === 'axle' ? `data-axle-ratio="${s.ratio}"` : `data-perf-apply-tire="${s.tire}" data-perf-apply-surface="${s.surface}"`}>
      <strong>${escape(s.title)}</strong><b class="${s.change > .004 ? 'worse' : ''}">${Math.abs(s.change) < .005 ? '±0.00' : delta(s.change, 2)} s</b><span>${escape(s.detail)}</span></button>`).join('')}</div></section>`;
}

/** Launch technique panel shell; filled after render because the best-rpm sweep takes tens of milliseconds. */
export function launchShellHtml(m) {
  if (!m.accel || m.runIssue) return '<span id="perf-launch"></span>';
  return `<section class="panel content-panel perf-launch" id="perf-launch" aria-labelledby="perf-launch-title" aria-busy="true">
    <h2 id="perf-launch-title">The driver's part: launch technique</h2>
    <p class="ig-sum-note">Same car, gearing and ${escape(condition(m).toLowerCase())}. Running the launch model…</p></section>`;
}

const launchOrder = ['typical', 'performance', 'maximum', 'dump'];
/** Launch presets and time lost by factor from engine/launch.mjs (preview model), at the page's tire and surface. */
export function launchPanelHtml(m) {
  if (!m.accel || !m.mu) return '';
  const mu = m.mu.typical;
  const runs = launchOrder.map(id => ({ id, r: runPreset(m.v, id, { mu }) }));
  const ref = runs.find(x => x.id === 'performance').r.magazine.et;
  const slowest = Math.max(...runs.map(x => x.r.magazine.et ?? 0));
  const lost = timeLost(m.v, { mu, ...Object.fromEntries(Object.entries(launchPresets.performance).filter(([k]) => !['label', 'note'].includes(k))), launchRpm: runs.find(x => x.id === 'performance').r.launchRpm });
  const bars = [['Wheelspin and grip', lost.lost.traction.et], ['Gear changes', lost.lost.shifts.et], ['Launch rpm choice', lost.lost.launchRpm.et]].filter(([, x]) => Number.isFinite(x));
  const top = Math.max(.01, ...bars.map(([, x]) => Math.abs(x)));
  const o = m.original;
  const stock = !m.modified && m.tire === matchedClass(m.v) && (m.opts.surface ?? 'dryAsphalt') === 'dryAsphalt';
  return `<section class="panel content-panel perf-launch" id="perf-launch" aria-labelledby="perf-launch-title">
    <h2 id="perf-launch-title">The driver's part: launch technique</h2>
    <p class="ig-sum-note">Same car, gearing and ${escape(condition(m).toLowerCase())}. Magazine timing (1 ft rollout), so these read lower than the standstill time above.</p>
    <ol class="ig-launch-list">${runs.map(({ id, r }) => `<li data-launch="${id}"><span><b>${escape(launchPresets[id].label)}</b><small>${fmt(r.launchRpm)} rpm launch · ${escape(launchPresets[id].note.split('.')[0])}.</small></span>
      <span class="ig-launch-time"><b>${fmt(r.magazine.et, 2)} s</b><small>${id === 'performance' ? 'reference' : delta(r.magazine.et - ref, 2) + ' s'} · 0–60 ${fmt(r.magazine.zeroTo60, 2)} s</small></span>
      <span class="ig-launch-bar" style="--w:${(100 * (r.magazine.et ?? 0) / slowest).toFixed(1)}%"></span></li>`).join('')}</ol>
    <h3 class="ig-h3">Where the time goes (performance launch)</h3>
    <ul class="ig-lost">${bars.map(([k, x]) => `<li><span>${k}</span><span class="ig-lost-bar"><i style="width:${(100 * Math.max(0, x) / top).toFixed(1)}%"></i></span><b>${x <= .005 ? 'none' : fmt(x, 2) + ' s'}</b></li>`).join('')}</ul>
    <p class="quiet small">${escape(lost.note)}${stock && (o.testEt || o.test60) ? ` Published road test of the stock car: ${o.test60 ? '0–60 ' + fmt(o.test60, 2) + ' s' : ''}${o.testEt ? ' · quarter mile ' + fmt(o.testEt, 2) + ' s' : ''} (a best run, so compare with maximum effort).` : ''}</p>
    <p class="ig-preview-note">Preview model (engine/launch.mjs, Claude 25 Nov, branch engineering/launch-validation 6fe64f7): checked on 59 archive road tests, quarter-mile mean error 0.26 s; not yet independently QA'd. Closed-course comparison, not driving advice.</p>
  </section>`;
}

/** Kept for the live-update path; the gear list now lives inside the chart. */
export const gearTableHtml = () => '';

export function tireTableHtml(m) {
  if (!m.tireRows.length) return '<span id="perf-tires"></span>';
  const grips = m.tireRows.filter(r => r.status === 'green').length;
  return `<section class="panel content-panel perf-tires-panel" id="perf-tires" aria-labelledby="perf-tires-title"><h2 id="perf-tires-title">Every tire, same car</h2>
    <p class="ig-sum-note">${ordinal(m.gear + 1)} gear, ${escape(shortSurface[m.opts.surface ?? 'dryAsphalt'].toLowerCase())}: ${grips} of ${m.tireRows.length} classes have grip to spare.</p>
    <ul class="ig-tire-list perf-tire-list">${m.tireRows.map(r => `<li><button type="button" data-perf-pick-tire="${r.id}" aria-pressed="${r.id === m.tire}" data-level="${r.status}">
      <span>${lamp(r.status)}${escape(shortTire[r.id])}</span>${useBar(r.utilization, r.status)}
      <span class="ig-pct">${pct(r.utilization)}</span></button></li>`).join('')}</ul>
    <p class="quiet small">Tap one to use it. Bars: share of grip in the selected gear; the line is 100%.</p></section>`;
}

function assumptionsHtml(m) {
  const notes = m.mu?.notes ?? [];
  const surface = m.opts.surface && m.opts.surface !== 'dryAsphalt' ? ' Road-test calibration covers dry pavement; this surface uses the same physics with an estimated grip and has not been checked against tests.' : '';
  return `<details class="explain" data-details="perf-assumptions"><summary>Assumptions and uncertainty</summary>
    <p>The run uses the shared acceleration model (clutch-slip launch, rotating inertia, load transfer, 85% driveline, standard air). Tire grip enters it only as the cap on drive force at the driven tires; it does not change gearing, tire size, rolling resistance or drag.${surface}</p>
    <p>Friction ${m.mu ? `${fmt(m.mu.low, 2)} / ${fmt(m.mu.typical, 2)} / ${fmt(m.mu.high, 2)} (low / typical / high), evidence: ${escape(m.mu.evidence)}` : 'unavailable'}. Treadwear grade is never used as grip.</p>
    <ul>${notes.map(n => `<li>${escape(n)}</li>`).join('')}</ul>
    <p>Times start from standstill, as in Compare. ${m.accel?.magazineEt ? `With the 1 ft rollout that drag strips and magazines use: ${secs(m.accel.magazineEt)}.` : ''}
    ${m.original.testEt || m.original.test60 ? `Published road test of the stock car: ${m.original.test60 ? '0–60 ' + fmt(m.original.test60, 1) + ' s' : ''}${m.original.testEt ? ' · quarter ' + fmt(m.original.testEt, 2) + ' s' : ''}${m.original.testTrap ? ' at ' + fmt(m.original.testTrap) + ' mph' : ''}.` : ''}</p>
  </details>`;
}

export function performanceView(state, perf, links, last) {
  const setup = state[state.focus];
  const m = perfModel(setup, perf);
  const laneKey = state.focus;
  return `<section class="shell workspace perf-workspace">
    <div class="page-title"><p class="eyebrow">Gearing and traction</p><h1>Where does the grip run out?</h1>
      <p class="lede">Your car. Your experiment. Tap a gear, change the final drive or the tire.</p></div>
    <div class="ig-car">${vehicleSelector('Vehicle', setup.id, { key: 'focus', name: setup.name })}
      <details class="perf-reference-picks" data-details="perf-references"><summary>Try a reference car</summary>
      <div class="perf-refs" role="group" aria-label="Reference vehicles">${quickReferences.map(([id, label]) =>
        `<button type="button" class="button secondary small" data-vehicle-key="focus" data-perf-ref="${id}" aria-pressed="${setup.id === id}">${label.replace(/^\d{4} (Pontiac |Chevrolet )?/, "'" + label.slice(2, 4) + ' ')}</button>`).join('')}</div></details></div>
    <div class="perf-grid">
      ${controlsHtml(m, perf, last)}
      ${summaryHtml(m, laneKey)}
      ${tractionHtml(m, laneKey)}
      ${nextStepsHtml(m, perf)}
      ${tireTableHtml(m)}
      ${launchShellHtml(m)}
      <section class="panel content-panel perf-learn">
        <a class="route-card" href="#performance-why"><strong>Why does a shorter gear stop helping?</strong><span>Plain-language answer, then the numbers behind this result.</span></a>
        ${assumptionsHtml(m)}
        <p class="ig-links"><a href="../articles/traction-circle/">The traction circle</a><a id="perf-load-link" href="${escape(links.loadTransfer)}">Load transfer calculator</a><a href="#compare">Race it in Compare</a></p>
        <div class="actions"><button type="button" class="button primary" data-perf-use>Use this configuration</button>
          <button type="button" class="button secondary" data-perf-share>Share this experiment</button>
          <button type="button" class="button secondary" data-action="save">Save to My Garage</button></div>
        <p class="quiet small" id="active-feedback" role="status"></p><div class="quiet small" id="perf-share-feedback" role="status"></div>
      </section>
    </div>
  </section>`;
}

/** Progressive explanation: step 1 plain language, step 2 the calculation with this car's numbers. */
export function performanceExplain(state, perf, step) {
  const m = perfModel(state[state.focus], perf);
  const c = m.check;
  const back = `<div class="actions"><a class="button primary" href="#performance" data-perf-return>Return to my experiment</a></div>`;
  const head = (title) => `<div class="page-title"><p class="eyebrow">${escape(setupName(m.setup))}</p><h1>${title}</h1></div>`;
  if (step === 'why') {
    return `<section class="shell workspace perf-explain">${head('Why traction matters')}
      <div class="panel content-panel">
      <p>A shorter (numerically higher) gear multiplies the engine’s torque, so the tires are asked to push harder. That only helps while the tires can grip. Past that point the extra force turns into wheelspin, and the gear just reaches its shift point sooner.</p>
      <p>Grip depends on the tire, the surface and how much weight is on the driven tires. Accelerating moves weight toward the rear, which helps a rear-drive car and hurts a front-drive one.</p>
      ${c.status === 'missing' ? `<p class="warning">This car still needs ${escape(c.missing.join(', '))} for its own numbers.</p>` :
        `<p><strong>For this setup in gear ${c.inputs.gear}:</strong> the drivetrain can deliver ${fmt(c.demandLb)} lb and the tires can likely take ${fmt(c.availableLb.low)}–${fmt(c.availableLb.high)} lb. ${escape(statusWord[c.status])}.</p>`}
      <a class="route-card" href="#performance-math"><strong>Behind the calculation</strong><span>The two equations with this car’s values.</span></a>
      </div>${back}</section>`;
  }
  if (c.status === 'missing') return `<section class="shell workspace perf-explain">${head('Behind the calculation')}<div class="panel content-panel"><p class="warning">Needs ${escape(c.missing.join(', '))}.</p></div>${back}</section>`;
  const i = c.inputs, v = m.v;
  const rear = v.weight * (1 - v.front), frontW = v.weight * v.front, lever = v.cg / v.wheelbase;
  const formula = { rear: `F = μ × W<sub>rear</sub> ÷ (1 − μ × h ÷ L) = ${fmt(c.friction.typical, 2)} × ${fmt(rear)} ÷ (1 − ${fmt(c.friction.typical, 2)} × ${fmt(lever, 3)})`,
    front: `F = μ × W<sub>front</sub> ÷ (1 + μ × h ÷ L) = ${fmt(c.friction.typical, 2)} × ${fmt(frontW)} ÷ (1 + ${fmt(c.friction.typical, 2)} × ${fmt(lever, 3)})`,
    all: `F = μ × W = ${fmt(c.friction.typical, 2)} × ${fmt(v.weight)}` }[i.drive];
  return `<section class="shell workspace perf-explain">${head('Behind the calculation')}
    <div class="panel content-panel">
    <h2>1 · Force the drivetrain can send</h2>
    <p class="perf-formula">F = torque × gear × final drive${i.converterRatio > 1 ? ' × converter' : ''} × efficiency ÷ tire radius</p>
    <p>${fmt(i.torqueLbFt)} lb-ft × ${fmt(v.gears[i.gear - 1], 2)} × ${fmt(v.finalDrive, 2)}${i.converterRatio > 1 ? ' × ' + i.converterRatio : ''} × ${fmt(i.efficiency, 2)} ÷ ${fmt(i.tireRadiusIn / 12, 3)} ft = <b>${fmt(c.demandLb)} lb</b></p>
    <h2>2 · Force the tires can take</h2>
    <p class="perf-formula">${formula}</p>
    <p>= <b>${fmt(c.availableLb.typical)} lb</b> at typical grip (range ${fmt(c.availableLb.low)}–${fmt(c.availableLb.high)} lb from μ ${fmt(c.friction.low, 2)}–${fmt(c.friction.high, 2)}).
      W ${fmt(v.weight)} lb, ${fmt(v.front * 100, 1)}% front, CG height h ${fmt(v.cg)} in, wheelbase L ${fmt(v.wheelbase, 1)} in. ${i.drive === 'rear' ? `The front lifts at ${fmt(frontW * v.wheelbase / v.cg)} lb, which caps the result.` : ''}</p>
    <p>Steady state: no wheel hop, suspension squat or air drag; both driven tires share the load equally. Values with an estimate label in Build are estimates.</p>
    </div>${back}</section>`;
}
