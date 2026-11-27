import { drivetrainPanel } from './drivetrain-view.mjs';
import { lanes, labelLane, modeOf, modified } from './configuration.mjs';
import { resolve, straightLine } from './models.mjs';
import { ovalLap } from './oval.mjs';
import { vehicles } from './vehicles.mjs';
import { tireClasses as tireLabels, surfaces as surfaceLabels } from '../engine/traction.mjs';
import { changeFromOriginal } from './change.mjs';
import { missingFor, estimatedFor } from './readiness.mjs';
import { vehicleSelector, configModes, evidence, explanation, fmt, delta, metricTable, escape } from './ui.mjs';

export const setupName = setup => setup.name || vehicles[setup.id].name;

export function matchupEntries(state) {
  const runModel = state.event === 'oval' ? ovalLap : straightLine;
  return lanes(state).map(key => {
    const setup = state[key];
    const mode = modeOf(state, key);
    const value = resolve(setup, mode === 'after');
    const run = runModel(value);
    const original = mode === 'after' && modified(setup) ? resolve(setup, false) : value;
    const baseline = original === value ? run : runModel(original);
    return {key, setup, mode, value, original, run, baseline};
  });
}

export const resultTime = (run, oval) => oval ? run.lap : run.finish?.t;

const calibration = {camaro: 'Camaro test comparison', corvette: 'Z06 test comparison', gto: 'GTO test comparison'};
const holdout = {miata: 'Miata hold-out, secondary ET source', mustang: 'Earlier Fox model hold-out, different trim'};
function resultEvidence(setup, value, oval) {
  const tool = oval ? 'oval' : 'quarter';
  if (oval) return 'Experimental synthetic course';
  const own = modified(setup) || Object.keys(setup.base).length || setup.id === 'custom';
  const check = own ? '' : calibration[setup.id] ? calibration[setup.id] + ' · calibration' : holdout[setup.id];
  return [check || 'No matched road-test check', estimatedFor(value, tool).length ? 'estimated inputs' : 'modeled result'].join(' · ');
}

export function comparisonResults(entries, oval) {
  // R2 (26 Nov): cards keep the lineup order (A, B, C…) so identities and colours never swap; finishing order is a badge.
  const timed = entries.map(entry => ({...entry, time: resultTime(entry.run, oval)}));
  const order = [...timed].filter(e => Number.isFinite(e.time)).sort((a, b) => a.time - b.time).map(e => e.key);
  const place = key => { const i = order.indexOf(key); return i < 0 ? '' : ['1st', '2nd', '3rd', '4th'][i] ?? `${i + 1}th`; };
  return `<div class="estimate-label">Estimated ${oval ? 'flying lap' : 'quarter mile, timed from a standstill (magazine figures subtract a 1-ft rollout, about 0.3 s quicker)'}</div>
    <div class="performance-results">${timed.map(({key, setup, value, original, run, baseline, time}) => {
      const why = baseline !== run ? changeFromOriginal('', original, value, baseline, run, oval)?.why : '';
      const before = resultTime(baseline, oval);
      const change = Number.isFinite(time) && Number.isFinite(before) && baseline !== run ? time - before : null;
      const missing = missingFor(value, oval ? 'oval' : 'quarter');
      return `<article class="performance-card car-${key}">
        <div class="performance-name"><b>${key.toUpperCase()}</b><strong>${escape(setupName(setup))}</strong>${timed.length > 1 && place(key) ? `<span class="result-place" aria-label="Finished ${place(key)}">${place(key)}</span>` : ''}</div>
        <div class="performance-main">${Number.isFinite(time) ? fmt(time, 2) + ' s' : '—'}
          <small>${oval ? fmt(run.peakSpeed, 0) + ' mph peak' : fmt(run.finish?.trap, 0) + ' mph finish'}</small></div>
        ${Number.isFinite(time) ? `<p class="experiment-evidence">${escape(resultEvidence(setup, value, oval))}</p>` : ''}
        ${change === null ? '' : `<p class="performance-delta">Original ${fmt(before, 2)} s · ${delta(change, 2)} s (${delta(100 * change / before, 1)}%)</p>`}
        ${why ? `<p class="performance-why">${escape(why)}</p>` : ''}
        ${run.issue ? `<p class="warning">${missing.length ? `${missing.length} required input${missing.length === 1 ? '' : 's'} missing.` : escape(run.issue)}</p>
          <button type="button" class="text-button missing-action" data-study-lane="${key}">Review ${labelLane(key)} inputs</button>` : Number.isFinite(time) ? '' : '<p class="warning">No finish within the modeled distance or time limit.</p>'}
      </article>`;
    }).join('')}</div>`;
}

function laneEditor(entry) {
  const {key, setup, mode} = entry;
  return `<div class="lineup-car car-${key}">
    <div class="pair-grid">${vehicleSelector(labelLane(key), setup.id, {key, name: setup.name})}${configModes(setup, key, mode)}</div>
    <p>${escape(setupName(setup))} · ${fmt(entry.value.weight)} lb · ${fmt(entry.value.hp)} hp</p>
    ${setup.conditions ? `<p class="quiet small" data-lane-conditions>Tires: ${escape(setup.conditions.customMu != null ? 'own friction μ ' + fmt(setup.conditions.customMu, 2) : (tireLabels[setup.conditions.tire]?.label ?? 'stock class'))} · ${escape(surfaceLabels[setup.conditions.surface ?? 'dryAsphalt'].label)} · grip μ ${fmt(entry.value.grip, 2)}</p>` : ''}
    <div class="actions"><button class="button secondary small" data-edit="${key}">Build ${labelLane(key)}</button>
    <button class="button secondary small" data-use-lane="${key}">Use ${labelLane(key)}</button>
    ${['c', 'd'].includes(key) ? `<button class="button plain small" data-drop-lane="${key}">Remove ${labelLane(key)}</button>` : ''}</div>
  </div>`;
}

export function quickImpact(entry, oval) {
  const t = resultTime(entry.run, oval);
  const before = resultTime(entry.baseline, oval);
  if (!Number.isFinite(t)) return entry.run.issue ? 'Review the inputs for this car to see a result.' : 'No finish within the model limit.';
  if (!Number.isFinite(before) || entry.baseline === entry.run) return `${labelLane(entry.key)} estimate · ${fmt(t, 2)} s`;
  const diff = t - before;
  return `${labelLane(entry.key)} · ${fmt(before, 2)} s → ${fmt(t, 2)} s · ${delta(diff, 2)} s (${delta(100 * diff / before, 1)}%)`;
}

function quickTune(state, entries) {
  const entry = entries.find(e => e.key === state.focus);
  const tuned = resolve(entry.setup);
  return `<section class="race-tuning" aria-label="Quick setup">
    <div class="tune-title"><h3>Quick setup</h3>
      <div class="event-switch lane-switch" aria-label="Choose a car to tune">${entries.map(({key}) =>
        `<button type="button" class="button secondary small car-${key}" data-focus-lane="${key}" aria-label="Tune ${labelLane(key)}" aria-pressed="${key === state.focus}">${key.toUpperCase()}</button>`).join('')}</div>
    </div>
    <div class="tool-controls">
      ${[['finalDrive', 'Final drive', 2, 6, .01], ['grip', 'Tire grip (μ)', .35, 1.4, .01]].map(([key, caption, min, max, step]) =>
      `<label class="slider"><span>${caption} <output id="quick-${key}">${fmt(tuned[key], 2)}</output></span>
      <input type="range" data-quick="${key}" min="${min}" max="${max}" step="${step}" value="${tuned[key] ?? (key === 'grip' ? .9 : 3.08)}"></label>`).join('')}
    </div>
    <div class="axle-ratio-picks" role="group" aria-label="Try a final-drive ratio">
      ${[3.08, 3.42, 3.73, 4.10].map(ratio => `<button type="button" class="button secondary small"
      data-axle-ratio="${ratio}" aria-pressed="${tuned.finalDrive === ratio}">${fmt(ratio,2)}</button>`).join('')}
    </div>
    <p class="quick-impact" id="quick-impact">${escape(quickImpact(entry, state.event === 'oval'))}</p>
    <p class="quiet small"> <button class="text-button" data-edit="${entry.key}">Edit the full build</button> · <a href="#performance">Gear-by-gear traction check</a></p>
  </section>`;
}

export function racePanel(state, entries) {
  const oval = state.event === 'oval';
  const playable = entries.some(({run}) => run.trace);
  return `<section class="panel race" aria-labelledby="race-title">
    <div class="race-header"><div><h2 id="race-title">${oval ? 'Test oval' : 'Quarter mile'}</h2></div>
      <div class="clock"><span id="race-time">0.0</span><small> s replay</small></div></div>
    <div class="event-switch" aria-label="Choose a simulation">
      <button class="button secondary small" data-event="strip" aria-pressed="${!oval}">Quarter mile</button>
      <button class="button secondary small" data-event="oval" aria-pressed="${oval}">Test oval</button>
      <button class="button secondary small" data-action="open-lineup">Edit lineup</button>
    </div>
    <div class="actions"><button type="button" class="button primary" data-action="reveal-replay" ${playable ? '' : 'disabled'}>
      Watch the ${oval ? 'test-oval' : 'quarter-mile'} replay</button></div>
    <div id="race-results">${comparisonResults(entries, oval)}</div>
    ${quickTune(state, entries)}
    ${drivetrainPanel(state[state.focus])}
    <details class="explain replay-details" id="replay-details" data-details="replay"><summary>Watch the replay</summary>
    <div class="race-scene"><canvas id="race-scene" width="620" height="${oval ? 246 : entries.length > 2 ? 225 : 166}" role="img"
      aria-label="${entries.length} vehicle model positions on the ${oval ? 'synthetic test oval' : 'quarter-mile drag strip'}"></canvas></div>
    <div class="live-grid" id="race-live">${liveGrid(entries)}</div>
    <div class="actions race-actions">
      <button class="button primary" data-action="play" ${playable ? '' : 'disabled'}>Run comparison</button>
      <button class="button secondary" data-action="restart" ${playable ? '' : 'disabled'}>Reset replay</button>
      <button class="button secondary" data-action="share" ${playable ? '' : 'disabled'}>Share this result</button>
    </div>
    <div class="scrub-grid"><label class="scrubber">Replay position <input id="scrubber" type="range" min="0" max="1000" value="0" ${playable ? '' : 'disabled'}></label>
      <label><span>Speed</span><select id="playback-rate"><option value=".5">½×</option><option value="1" selected>1×</option><option value="2">2×</option></select></label></div>
    <div id="share-feedback" role="status"></div>
    </details>
  </section>`;
}

export function liveGrid(entries) {
  return entries.map(({key, setup, mode}) => `<div class="car-${key}"><strong>${key.toUpperCase()} · ${escape(setupName(setup))}</strong>
    <span><b id="speed-${key}">—</b> mph <small id="gear-${key}">${mode === 'after' ? 'Modified' : 'Original'}</small></span>
    <small id="gap-${key}"></small></div>`).join('');
}

export function compare(state, entries) {
  const oval = state.event === 'oval';
  const [a, b] = entries.map(e => e.value);
  const noSlot = entries.length === 4;
  return `<section class="shell workspace compare-workspace">
    <div class="page-title"><h1>Compare cars</h1></div>
    <div class="phase2-compare-grid">
      ${racePanel(state, entries)}
      <div class="stack lineup-stack">
        <details open class="panel content-panel" id="lineup-panel" data-details="lineup"><summary><strong>Lineup · ${entries.length} cars</strong></summary>
          <div class="lineup-grid">${entries.map(laneEditor).join('')}</div>
          ${noSlot ? '<p class="quiet small">Four cars in this comparison.</p>' : '<div class="actions"><button class="button secondary" data-action="add-car">Add competitor</button><button class="button secondary" data-action="duplicate">Duplicate selected setup</button></div>'}
          <p class="quiet small" id="active-feedback" role="status"></p>
        </details>
        <section class="panel content-panel">
          <h2>Try the same change</h2><p>Remove an illustrative 50 lb from the rear cabin of each car at 70% of its wheelbase.</p>
          <button class="button secondary" data-action="same-change" ${entries.every(e => e.setup.parts.some(p => p.preset === 'remove')) ? 'disabled' : ''}>Apply to all cars</button>
        </section>
        <section class="panel content-panel">
          <h2>How to read the results</h2>
          ${explanation('What the simulation assumes',
            oval ? 'The synthetic oval has two 520 ft straights and two 200 ft radius turns. The flying lap starts at speed. The solver limits corner speed by grip and brakes for the next turn. Gears are idealized. Suspension and transient handling are outside this model. Turn speed depends only on the grip coefficient here, so weight changes show up only through acceleration out of the turns, not corner speed or braking.' :
            'The replay and main results start from standstill. The model estimates launch grip by tire class for selected references, accounts for clutch slip and rotating inertia, and uses a generic converter and shift time for automatics. The estimates are best used to compare changes. Test surface, exact tires and launch technique affect real results.')}
          ${oval ? '' : `<details class="explain"><summary>Published test checkpoints and timing</summary>
            ${metricTable([['0–60 mph', a.test60, b.test60, 's', 1], ['Quarter mile', a.testEt, b.testEt, 's', 1],
              ['Reported trap', a.testTrap, b.testTrap, 'mph', 1]], ['Car A stock', 'Car B stock'], true)}
            <p>Road-test times apply to the recorded stock car and conditions. For reference, the current model with one foot of rollout estimates ${entries.slice(0, 2).map(({key,run}) => `${labelLane(key)} ${fmt(run.magazine?.et, 2)} s`).join(' · ')}. Modeled finish speed is instantaneous.</p></details>`}
          ${explanation('Why gearing changes acceleration', 'A shorter gear multiplies torque more, but reaches shift RPM sooner. A shift can use up the time gained from shorter gearing. Tire diameter changes both leverage and speed at each RPM.')}
          <details class="explain" data-details="lineup-inputs"><summary>Inputs and evidence for each car</summary>
            ${entries.map(({key, setup, mode}) => `<h3>${labelLane(key)} · ${escape(setupName(setup))}</h3>${evidence(setup, mode === 'after')}`).join('')}</details>
        </section>
      </div>
    </div>
  </section>`;
}
