import { components } from './components.mjs';
import { vehicles, fields, customEstimates } from './vehicles.mjs';
import { presets, limits, choices, resolve, massIssue, powerIssue, tireLoads, ride } from './models.mjs';
import { modified } from './configuration.mjs';
import { setupName } from './matchup.mjs';
import { drivetrainPanel } from './drivetrain-view.mjs';
import { missingFor, missingText, estimatedFor, studies } from './readiness.mjs';
import { vehicleSelector, evidence, explanation, fmt, delta, metricTable, numberField, escape } from './ui.mjs';

export const concepts = {
  moments: ['Mass moments and center of gravity', 'Move 40 lb by 72 in and the total weight stays the same. Rear axle load rises by 40 × 72 ÷ wheelbase. Removing a part ahead of the front axle can increase rear axle load even as total weight falls.'],
  torque: ['Force moments and torque', 'Torque equals force × perpendicular lever arm. The same 50 lb on a 1 ft wrench makes 50 lb-ft. A 2 ft wrench makes 100 lb-ft. At the tire, wheel torque divided by rolling radius gives drive force.'],
  inertia: ['Mass moment of inertia', 'Moving weight toward the center can make a car change direction more readily even when its total and axle weights match. A point mass contributes m × r² about the chosen axis. Acceleration replay does not model yaw inertia.'],
  transfer: ['Weight transfer', 'Braking adds front tire load and takes the same total away from the rear. On a level surface the amount is weight × braking in g × CG height ÷ wheelbase. Lowering the CG changes this amount, even when the parked weight split stays the same.'],
  grip: ['Combined acceleration and tire grip', 'A tire has a finite grip budget. Braking and turning at the same time use that budget together. In a simple friction circle, the required grip is √(braking g² + cornering g²). Real tires vary with vertical load, slip, temperature and the road.'],
  ride: ['Spring rates and ride frequency', 'Wheel rate equals spring rate × motion ratio squared. Tire stiffness and wheel stiffness work in series, and only sprung weight enters the simple bounce frequency. A higher frequency usually feels firmer. Geometry, dampers and travel still matter.'],
};

const concept = (key, more) => explanation(...concepts[key], more);

function pageTitle(eyebrow, title, copy) {
  return `<div class="page-title"><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p class="lede">${copy}</p></div>`;
}

export function home(selection, saved) {
  return `<section class="shell workspace lab-entry">
    ${pageTitle('Vehicle Lab', 'Build, compare, test.', 'Carry one car from a part change to a comparison or a calculator.')}
    ${vehicleSelector(selection ? 'Active vehicle' : 'Starting vehicle', selection?.setup.id ?? 'custom',
      {key: 'start', name: selection ? setupName(selection.setup) : 'Choose a vehicle'})}
    <div class="actions"><a class="button primary" href="../replay/">Watch a graphical replay</a> <a class="button secondary" href="#performance">Test gearing and traction</a>
    <a class="button secondary" href="#tools">Explore tire loads and ride</a>
    <a class="button secondary" href="../suspension-v2/">Explore suspension geometry</a>
    ${saved ? '<button class="button secondary" data-action="load-saved">Open my saved build</button>' : ''}</div>
  </section>`;
}

function fieldInput(key, value) {
  if (choices[key]) return `<label><span>${fields[key]}</span><select name="${key}"><option value="">Choose a type</option>
    ${choices[key].map(type => `<option value="${type}" ${type === value ? 'selected' : ''}>${type}</option>`).join('')}</select></label>`;
  const [lo, hi] = limits[key] ?? [];
  if (key === 'gears') return `<label><span>Gear ratios, highest to lowest</span><input name="gears" value="${escape(value?.join(', ') ?? '')}" placeholder="e.g. 2.87, 1.89, 1.28, 1, 0.68"></label>`;
  const shown = Number.isFinite(value) ? (key === 'front' ? +(value * 100).toFixed(4) : +value.toFixed(4)) : '';
  return numberField(key, fields[key], shown, {
    min: key === 'front' ? lo * 100 : lo, max: key === 'front' ? hi * 100 : hi,
  });
}

const powerKeys = ['drivetrain','transmission','hp', 'hpRpm', 'torque', 'torqueRpm', 'redline', 'gears', 'finalDrive', 'diameter', 'grip', 'cda'];
const geometryKeys = ['weight', 'front', 'wheelbase', 'cg', 'frontTrack', 'rearTrack'];
const rideKeys = ['frontSpring', 'rearSpring', 'frontMotion', 'rearMotion', 'frontUnsprung', 'rearUnsprung', 'tireRate'];
export const inputGroups = { original: [...geometryKeys, ...powerKeys, ...rideKeys], power: powerKeys, ride: rideKeys, geometry: ['cg'] };

function overrideForm(group, values, title, copy, keys, name = '') {
  return `<details class="explain" data-details="${group}" ${group === 'original' && [values.weight,values.front,values.wheelbase].some(v => !Number.isFinite(v)) ? 'open' : ''}><summary>${title}</summary><p>${copy}</p>
    <form data-form="${group}" class="edit-form">
      ${group === 'original' ? `<label><span>Custom configuration name (optional)</span><input name="setupName" value="${escape(name)}" maxlength="36" placeholder="e.g. My autocross Camaro"></label>` : ''}
      <div class="input-grid">${keys.map(key => fieldInput(key, values[key])).join('')}</div>
      <button class="button secondary">Update ${group === 'original' ? 'original' : 'experiment'}</button>
      <p class="form-issue" role="alert"></p>
    </form></details>`;
}

function setupPicker(setup, label) {
  return `<div class="configuration-bar">
    ${vehicleSelector(label, setup.id, { key: 'focus', name: setup.name })}
    <span>${escape(setup.name ? setupName(setup) : vehicles[setup.id].trim)}</span>
  </div>`;
}

export function massMetrics(before, after, isCompare = false) {
  return metricTable([
    ['Total', before.weight, after.weight, 'lb'],
    ['Front axle', before.frontLb, after.frontLb, 'lb'],
    ['Rear axle', before.rearLb, after.rearLb, 'lb'],
    ['Front share', before.front === null ? null : 100 * before.front, after.front === null ? null : 100 * after.front, '%', 1, 'pp'],
    ['CG behind front axle', before.cgX, after.cgX, 'in', 1],
  ], isCompare ? ['Car A', 'Car B'] : undefined, isCompare);
}

function partForm() {
  return `<details class="explain" data-details="part"><summary>Enter a custom part or installed package</summary>
    <p>For a removal or addition enter 0 lb on the absent side. Use positions behind the front axle (negative ahead of it). For a powertrain installation include the same kinds of hardware and fluid on both sides or account for the difference.</p>
    <form data-form="part" class="edit-form">
      <label><span>Part or package</span><input name="label" maxlength="60" placeholder="e.g. T56 with clutch and mount" required></label>
      <label><span>Type of change</span><select name="role">
        <option value="">Addition, removal, relocation or other part</option>
        <option value="engine">Installed engine swap</option>
        <option value="transmission">Installed transmission swap</option>
        <option value="powertrain">Combined engine and transmission package</option>
      </select></label>
      <div class="input-grid">
      ${numberField('oldWeight', 'Old weight (lb)', '', { min: 0, max: 1800, required: true })}
      ${numberField('oldX', 'Old position (in)', '', { min: -75, max: 220, required: true })}
      ${numberField('newWeight', 'New weight (lb)', '', { min: 0, max: 1800, required: true })}
      ${numberField('newX', 'New position (in)', '', { min: -75, max: 220, required: true })}
      </div>
      <label class="checkbox-line" data-install-basis hidden><input type="checkbox" name="sameBasis"><span>I have comparable before/after weights and defensible positions for this installation.</span></label>
      <button class="button secondary">Apply component change</button><p class="form-issue" role="alert"></p>
    </form>
  </details>`;
}

function resultFeedback(previous, after) {
  if (!previous) return '';
  const figures = [
    ['Weight', 'weight', 'lb', 1], ['Front axle', 'frontLb', 'lb', 1],
    ['Power', 'hp', 'hp', 0], ['Torque', 'torque', 'lb-ft', 0], ['Grip assumption μ', 'grip', '', 2],
  ].flatMap(([label, key, unit, places]) => {
    const original = previous[key], value = after[key];
    return Number.isFinite(value) && (!Number.isFinite(original) || Math.abs(value - original) >= 10 ** -places / 2)
      ? [`${label}: ${fmt(original, places)} → ${fmt(value, places)} ${unit}`.trim()] : [];
  });
  if (JSON.stringify(previous.gears) !== JSON.stringify(after.gears) && after.gears?.length) {
    figures.push(`Gear ratios: ${after.gears.length} speeds, first ${fmt(after.gears[0], 2)}`);
  }
  return figures.join(' · ');
}

function axleGraphic(before, after) {
  return `<div class="balance-diagram" role="img" aria-label="Center of gravity moves from ${fmt(before.cgX, 1)} to ${fmt(after.cgX, 1)} inches behind the front axle.">
    <div class="chassis"><div class="axle"></div><div class="rail"><i class="marker before" style="left:${(1 - before.front) * 100}%"></i>
      <i class="marker after" style="left:${(1 - after.front) * 100}%"></i></div><div class="axle"></div></div>
    <div class="axle-labels"><span>Front axle</span><span>Rear axle</span></div>
    <p><i class="legend-dot original"></i> Original CG <i class="legend-dot"></i> Modified CG</p></div>`;
}

function dataReadiness(setup, current) {
  return `<section class="data-readiness" id="data-readiness">
    <h3>Inputs by experiment</h3>
    <label><span>Check the inputs for</span><select data-study-select>
      ${Object.entries(studies).map(([id, study]) => `<option value="${id}">${study.name}</option>`).join('')}
    </select></label>
    ${Object.entries(studies).map(([id], index) => {
      const missing = missingFor(current, id);
      const assumed = estimatedFor(current, id);
      const optional = (studies[id].optional ?? []).filter(key => current[key] == null);
      const suggested = [...missing, ...optional].filter(key => setup.id === 'custom' && Object.hasOwn(customEstimates, key));
      const other = missing.filter(key => !suggested.includes(key));
      const format = key => {
        const value = current[key] ?? customEstimates[key]?.[0];
        return `${fields[key]} ${key === 'front' ? fmt(value * 100, 1) + '%' : value}`;
      };
      const issue = !missing.length && ['quarter', 'oval'].includes(id) ? powerIssue(current, id) : '';
      return `<div class="study-readiness" data-study="${id}" ${index ? 'hidden' : ''}>
        ${other.length ? `<p>Enter ${escape(missingText(other))}.</p>` : ''}
        ${issue ? `<p>${escape(issue)}</p>` : ''}
        ${!missing.length && !issue ? '<p>Required inputs are present.</p>' : ''}
        ${assumed.length ? `<p><strong>Estimates in use:</strong> ${escape(assumed.map(format).join(' · '))}.</p>` : ''}
        ${optional.includes('tireRate') ? '<p>Tire stiffness is optional. Without it, the model treats the tires as rigid.</p>' : ''}
        ${suggested.length ? `<p><strong>Optional starting estimates:</strong> ${escape(suggested.map(format).join(' · '))}.</p>
          <button type="button" class="button secondary" data-accept-estimates="${id}">Use these estimates</button>` : ''}
      </div>`;
    }).join('')}
  </section>`;
}

export function build(state, saved, { previous = null, suggestion = '', testHref = '' } = {}) {
  const setup = state[state.focus];
  const before = resolve(setup, false);
  const after = resolve(setup);
  const estimateBalance = setup.base.front === undefined && vehicles[setup.id].data.front[1] === 'estimated';
  const changed = modified(setup);
  const feedback = resultFeedback(previous, after);
  const frontMove = after.frontLb - before.frontLb;
  const rearMove = after.rearLb - before.rearLb;
  const massMessage = massIssue(after) || (modified(setup) ?
    `Front axle ${delta(frontMove, 1)} lb. Rear axle ${delta(rearMove, 1)} lb. ${estimateBalance && 'Original front share is estimated.' || ''}` :
    `Add a part change to see its effect. ${estimateBalance && 'Original front share is estimated.' || ''}`);
  return `<section class="shell workspace">
    ${pageTitle('Build', 'Modify your car', 'Choose a vehicle, make a change, then test this setup.')}
    ${setupPicker(setup, 'Choose or change vehicle')}
    <div class="actions build-test-actions">
      ${testHref ? `<a class="button primary" href="${escape(testHref)}">Test this setup</a>` : ''}
      <a class="button secondary" href="../suspension-v2/?from=build#vehicle=${encodeURIComponent(setup.id)}">Open suspension geometry</a>
      <a class="button secondary" href="#tools">Test weight and ride</a>
    </div>
    <div class="workspace-grid ${massIssue(after) ? 'awaiting-specs' : ''}">
      <aside class="panel sticky-result">
        <div class="result-caption ${feedback ? 'result-changed' : ''}"><span>${changed ? 'Setup weight' : 'Original weight'}</span><strong>${fmt(after.weight)} <small>lb</small></strong>
        <span>${Number.isFinite(after.front) && Number.isFinite(before.weight) ? delta(after.weight - before.weight) + ' lb vs original · ' + fmt(after.front * 100, 1) + '% front' : 'Weight or balance data missing'}</span>
        ${feedback ? `<p class="build-feedback">${escape(feedback)}</p>` : ''}</div>
        <div class="result-body">
        ${massMetrics(before, after)}
        <p class="takeaway">${massMessage}</p>
        ${Number.isFinite(after.cgX) ? axleGraphic(before, after) : ''}
        ${concept('moments')}
        </div>
      </aside>
      <section class="panel content-panel mod-controls">
          <h2>Choose a modification</h2>
          ${drivetrainPanel(setup)}
          <details class="explain" data-component-reference="${escape(vehicles[setup.id]?.ref ?? (setup.id === 'custom' ? '' : setup.id))}">
            <summary>Component evidence for this vehicle</summary>
            <div data-component-reference-output role="status"></div>
            <div class="actions" data-component-save-actions hidden><button type="button" class="button secondary small" data-action="save-investigation">Save investigation</button><span data-investigation-saved role="status"></span></div>
          </details>
          ${partForm()}
          ${suggestion}
          <details class="explain" data-details="presets"><summary>Try a weight or balance experiment</summary>
          <div class="quick-grid">${Object.entries(presets).filter(([, p]) => !p.firebird || setup.id === 'firebird').map(([key, p]) =>
            `<button class="preset" data-preset="${key}" ${massIssue(after) || setup.parts.some(x => x.preset === key) ? 'disabled' : ''}>
              <strong>${p.label}</strong><span>${p.note}</span></button>`).join('')}</div>
          <div id="preset-form"></div></details>
          <div class="parts">${Object.entries(setup.components ?? {}).map(([kind, id]) =>
            `<div><span><strong>${escape(components[kind][id].name)}</strong></span>
            <button type="button" class="button secondary small" data-undo-component="${kind}" aria-label="Undo ${escape(components[kind][id].name)}">Undo</button></div>`).join('')}
          ${setup.parts.map((p, i) => `<div><span><strong>${escape(p.label)}</strong>
            <small>${fmt(p.oldWeight, 1)} lb at ${fmt(p.oldX, 1)} in → ${fmt(p.newWeight, 1)} lb at ${fmt(p.newX, 1)} in</small>
            ${p.preset ? `<small>${presets[p.preset].note}</small>` : ''}</span>
            <button class="button secondary small" data-remove="${i}" aria-label="Undo ${escape(p.label)}">Undo</button></div>`).join('')}</div>
          <div class="actions"><button class="button secondary" data-action="compare-build">Compare performance</button>
            <button class="button secondary" data-action="use">Set as working setup</button>
            ${modified(setup) ? '<button class="button secondary" data-action="compare-original">Compare with original</button>' : ''}</div>
          <div class="actions save-row"><button class="button secondary" data-action="save">Save to My Garage</button>
            ${saved ? '<button class="button secondary" data-action="load-saved">Open my saved build</button>' : ''}
            ${modified(setup) ? '<button class="button plain" data-action="reset">Reset modifications</button>' : ''}</div>
          <p class="quiet small">Save separate variants in My Garage. Set a working setup to carry it across ESS.</p>
        </section>
        <section class="panel content-panel build-specs">
          <h2>Change the specifications</h2>
          ${dataReadiness(setup, after)}
          ${overrideForm('original', before, 'Original specifications', 'Enter your real readings to replace the reference inputs used for both original and modified.', inputGroups.original, setup.name)}
          ${overrideForm('power', after, 'Manual power, gearing and tire inputs', 'Override individual model inputs for your own component.', powerKeys)}
          ${overrideForm('ride', after, 'Springs and tire stiffness', 'These settings affect ride frequency.', rideKeys)}
          ${overrideForm('geometry', after, 'Center of gravity height', 'Enter a different CG height to explore load transfer. Part movements above compute only longitudinal CG.', inputGroups.geometry)}
          ${evidence(setup)}
        </section>
    </div>
  </section>`;
}

function slider(name, label, value, unit, min, max, step) {
  return `<label class="slider"><span>${label} <output id="out-${name}">${value ?? '—'} ${unit}</output></span>
    <input type="range" data-slider="${name}" id="slider-${name}" min="${min}" max="${max}" step="${step}" value="${value ?? min}"></label>`;
}

export function toolResults(before, after, settings) {
  const prior = tireLoads(before, settings.brake, settings.lateral);
  const now = tireLoads(after, settings.brake, settings.lateral);
  const parked = tireLoads(after, 0, 0);
  const invalid = now.invalid;
  const overGrip = Number.isFinite(after.grip) && Math.hypot(settings.brake, settings.lateral) > after.grip;
  const tires = ['Left front', 'Right front', 'Left rear', 'Right rear'];
  const rideBefore = ['front', 'rear'].map(axle => ride(before, axle));
  const rideNow = ['front', 'rear'].map(axle => ride(after, axle));
  const rideMissing = missingFor(after, 'spring-rate');
  const lightest = now.tires.indexOf(Math.min(...now.tires));
  const first = now.missing?.length ? 'Add ' + missingText(now.missing) + ' to calculate tire loads.' : invalid ? 'The simplified model reaches a wheel-lift or roll-axis limit.' :
    `${tires[lightest]} carries ${fmt(now.tires[lightest])} lb in this turn.${prior.invalid ?
      ' The original setup reaches a model limit at these settings.' : ''}`;
  return {
    loads: `<div class="tire-diagram" role="img" aria-label="${invalid ? first : tires.map((t, i) => t + ' ' + fmt(now.tires[i]) + ' lb').join(', ')}">
      <div class="tire-nose">Front</div>
      ${now.tires.map((v, i) => `<div class="tire-cell ${i === lightest ? 'light-tire' : ''}" style="--tire-load:${Math.min(100, Math.max(0, (v ?? 0) / (after.weight || 1) * 245)).toFixed(0)}%">
        <span>${tires[i]} <b>${invalid ? '—' : fmt(v) + ' lb'}</b></span>
        <small>${invalid ? '' : delta(v - parked.tires[i], 0) + ' lb vs parked'}</small></div>`).join('')}</div>
      <p class="${invalid || overGrip ? 'warning' : 'takeaway'}">${first}
        ${overGrip ? ' Combined demand exceeds the selected grip in the simple friction circle.' : !invalid && !Number.isFinite(after.grip) ? ' Enter a grip estimate to compare combined demand with traction.' : ''}</p>
      <details class="explain"><summary>Original, modified and percentage changes</summary>
      ${metricTable(tires.map((t, i) => [t, prior.invalid ? null : prior.tires[i], now.invalid ? null : now.tires[i], 'lb']))}</details>`,
    ride: `${metricTable(['Front', 'Rear'].flatMap((name, i) => [
      [name + ' frequency', rideBefore[i].hz, rideNow[i].hz, 'Hz', 2],
      [name + ' wheel rate', rideBefore[i].wheel, rideNow[i].wheel, 'lb/in'],
    ]))}
    <p class="${rideNow.some(r => r.hz === null) || rideBefore.some(r => r.hz === null) ? 'warning' : 'takeaway'}">${rideNow.some(r => r.hz === null) || rideBefore.some(r => r.hz === null) ?
      rideMissing.length ? 'Add ' + escape(missingText(rideMissing)) + ' to calculate ride frequency.' : 'Check the original and modified sprung weight and spring inputs.' :
      `The modified front rides at ${fmt(rideNow[0].hz, 2)} Hz. A higher value means quicker body bounce in this simplified model.${after.tireRate == null ? ' The tires are treated as rigid.' : ''}`}</p>`,
  };
}

const calculatorLink = (state, target) => `../tools/${target}/${escape(state)}`;

export function toolsView(state, settings, bridgeHash, saved) {
  const setup = state[state.focus];
  const before = resolve(setup, false);
  const after = resolve(setup);
  const result = toolResults(before, after, settings);
  return `<section class="shell workspace">
    ${pageTitle('Engineering tools', 'Test your setup', 'Compare tire loads and ride frequency with your changes.')}
    ${setupPicker(setup, `Car ${state.focus.toUpperCase()}`)}
    <div class="actions tool-actions"><button class="button secondary" data-edit="${state.focus}">Edit vehicle setup</button>
      <a class="button secondary" href="../suspension-v2/?from=tools#vehicle=${encodeURIComponent(setup.id)}">Open suspension geometry</a>
      ${saved ? '<button class="button secondary" data-action="load-saved">Use my saved build</button>' : ''}</div>
    <div class="tool-grid">
      <section class="panel content-panel">
        <h2>Load transfer</h2>
        <p class="quiet small">Turning right. Example roll stiffness and roll-center inputs match the ESS Grip Lab.</p>
        <div class="tool-controls">${slider('brake','Braking', settings.brake, 'g', 0, 1.2, .01)}
        ${slider('lateral','Cornering', settings.lateral, 'g', 0, 1.2, .01)}</div>
        <div id="load-result">${result.loads}</div>
        ${concept('transfer')}${concept('grip')}
        <p><a href="../articles/traction-circle/">Read about combined braking and cornering</a></p>
        <p><a id="load-link" href="${calculatorLink(bridgeHash, 'load-transfer')}">Open full load transfer calculator</a></p>
      </section>
      <section class="panel content-panel">
        <h2>Spring rate &amp; ride frequency</h2>
        <p class="quiet small">Move the spring rate to test a change. See input values and their sources below.</p>
        <div class="tool-controls">${slider('frontSpring', 'Front spring', after.frontSpring, 'lb/in', 40, 2000, 1)}
        ${slider('rearSpring', 'Rear spring', after.rearSpring, 'lb/in', 40, 2000, 1)}</div>
        <div id="ride-result">${result.ride}</div>
        ${concept('ride')}
        <p><a id="spring-link" href="${calculatorLink(bridgeHash, 'spring-rate')}">Open full spring rate calculator</a></p>
      </section>
    </div>
    ${evidence(setup)}
  </section>`;
}

export function learn() {
  return `<section class="shell workspace">
    ${pageTitle('Engineering notes', 'Try the physics', 'Explore how weight, force and grip affect a car. Your experiment stays open in the Lab.')}
    <div class="actions"><a class="button secondary" href="../articles/">Browse all articles</a>
    <a class="button secondary" href="#tools">Try tire loads</a>
    <a class="button secondary" href="../suspension-v2/">Explore suspension geometry</a></div>
    <div class="tool-grid">
      <section class="panel content-panel"><h2>Balance and response</h2>
      ${concept('moments')}${concept('inertia', `
        ${slider('radius', 'Distance from axis', 2, 'ft', .5, 5, .1)}
        <p class="takeaway" id="inertia-demo">A 40 lbm mass contributes 160.0 lbm·ft² about this axis.</p>`)}${concept('torque', `
        ${slider('lever', 'Lever arm', 1, 'ft', .25, 4, .05)}
        <p class="takeaway" id="torque-demo">50 lb of force makes 50.0 lb-ft of torque.</p>`)}
      <p><a href="../articles/weight-distribution-50-50/">Read about weight distribution</a></p></section>
      <section class="panel content-panel"><h2>Grip and ride</h2>${concept('transfer')}${concept('grip')}${concept('ride')}
      <p><a href="../articles/traction-circle/">Read about the traction circle</a></p></section>
    </div>
    <section class="panel content-panel"><h2>Check the baseline</h2>
      <p>Record the configuration and load state before you compare measurements.</p>
      <p><a href="../build/">See the ESS research method</a> · <a href="../vehicles/">Find vehicle specifications</a></p>
    </section>
  </section>`;
}
