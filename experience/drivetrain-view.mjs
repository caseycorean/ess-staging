import { components, componentLabels, factoryComponent, eligibleComponent } from './components.mjs';
import { vehicles } from './vehicles.mjs';
import { resolve, tractionReadout } from './models.mjs';
import { escape, fmt } from './ui.mjs';

const taskFor = {engine: 'engine-output', transmission: 'gearing', tireClass: 'tire-grip'};

function originalComponent(kind, vehicle, baseline) {
  const {item, basis, candidates} = factoryComponent(kind, vehicle);
  if (item) return `<p>Reference original: <strong>${escape(item.name)}</strong>. ${escape(basis ?? 'Exact donor reference.')}</p>`;
  if (candidates) return `<p>Factory options: ${escape(candidates.map(candidate => candidate.name).join(' or '))}. Verify the gearbox tag or ratios before using a mass estimate.</p>`;
  if (kind === 'transmission') {
    const ratios = baseline.gears?.length ? ` Reference ratios: ${baseline.gears.join(', ')}.` : '';
    return `<p>Exact original gearbox unconfirmed.${ratios} Check its tag or enter the ratios in Original specifications.</p>`;
  }
  if (kind === 'engine') return `<p>Reference output: ${fmt(baseline.hp)} hp · ${fmt(baseline.torque)} lb-ft. Exact original engine unconfirmed.</p>`;
  return '<p>Use a tire class to test a grip assumption. Real grip varies with surface, temperature and condition.</p>';
}

function massContext(kind, item) {
  if (kind !== 'transmission') return '';
  const mass = item?.mass;
  const data = mass ? ` Catalog weight: ${mass.value ?? `${mass.low}–${mass.high}`} lb (${escape(mass.evidence)}, ${escape(mass.basis ?? 'weighing boundary unclear')}).` : '';
  const dependencies = item?.dependencies;
  return `<p><strong>Gearing and transmission type are applied.</strong> Vehicle mass and balance use your existing setup unless you add a comparable installed package.${data}</p>
    ${dependencies ? `<p>Confirm ${escape(dependencies.checks.join(', '))} for your car. <a href="${escape(dependencies.source.url)}" rel="noreferrer">Manufacturer installation notes</a></p>` : ''}`;
}

function weightComparison(vehicle) {
  const options = Object.entries(components.transmission).filter(([id, item]) =>
    !item.hidden && eligibleComponent('transmission', id, 'known-gearbox-weight'));
  const original = factoryComponent('transmission', vehicle).id;
  const select = (label, side) => `<label><span>${label}</span><select data-gearbox-weight="${side}">
    <option value="">Choose a known dry gearbox</option>${options.map(([id, item]) =>
      `<option value="${id}" ${side === 'from' && id === original ? 'selected' : ''}>${escape(item.name)} · ${item.mass.value} lb</option>`).join('')}</select></label>`;
  return `<details class="explain" data-details="dry-gearbox"><summary>Compare dry gearbox weights</summary>
    <p>Compare comparable dry assemblies. Confirm fitted parts and positions with the installed-package option before applying a vehicle-weight change.</p>
    <div class="pair-grid">${select('Original dry gearbox', 'from')}${select('Replacement dry gearbox', 'to')}</div>
    <p data-gearbox-difference role="status"></p></details>`;
}

export function drivetrainPanel(setup) {
  const vehicle = vehicles[setup.id];
  const baseline = resolve(setup, false);
  const resolved = resolve(setup);
  return `<div class="modify-choices">
    ${Object.entries(components).map(([kind, list]) => {
      const selected = setup.components?.[kind];
      const item = list[selected];
      const title = kind === 'tireClass' ? 'Traction' : componentLabels[kind];
      const rating = kind === 'engine' && item ? ` <strong>${fmt(item.values.hp)} hp · ${fmt(item.values.torque)} lb-ft</strong> (${escape(item.evidence)}).` : '';
      const source = item?.url ? ` <a href="${escape(item.url)}" rel="noreferrer">Component source</a>` : '';
      return `<details class="explain modify-option" data-details="modify-${kind}">
        <summary>${title}<span>${escape(item?.name ?? 'Original settings')}</span></summary>
        ${originalComponent(kind, vehicle, baseline)}
        <label><span>Find a ${title.toLowerCase()} option</span><input type="search" data-component-search="${kind}" placeholder="${kind === 'transmission' ? 'e.g. T-56, Magnum, TKX' : 'Search by name'}"></label>
        <label><span>${title} choice</span><select data-component="${kind}"><option value="">Use original</option>
        ${Object.entries(list).filter(([id, value]) => id === selected || (!value.hidden && eligibleComponent(kind, id, taskFor[kind]))).map(([id, value]) =>
          `<option value="${id}" ${selected === id ? 'selected' : ''}>${escape(value.name)}</option>`).join('')}</select></label>
        ${item ? `<p>${rating} ${escape(item.note ?? '')}${source}</p>${massContext(kind, item)}` : ''}
        ${kind === 'engine' ? swapMassLine(resolved) : ''}
        ${kind === 'transmission' ? weightComparison(vehicle) : ''}</details>`;
    }).join('')}
    <details class="explain" data-details="build-traction"><summary>Modeled launch grip</summary>
      ${tractionPanel(resolved)}
      <p class="small"><a href="#performance">Compare tire classes and check every gear</a></p>
    </details>
  </div>`;
}

/** One line on what an engine swap did to mass and balance (or why the stock mass is kept). */
export function swapMassLine(v) {
  const s = v?.engineSwap;
  if (!s) return '';
  if (s.ownerInstalled) return '<p class="swap-mass" data-swap-mass><strong>Engine swap mass:</strong> using your entered installation weights and positions.</p>';
  if (s.part) {
    const d = s.part.newWeight - s.part.oldWeight;
    return `<p class="swap-mass" data-swap-mass><strong>Engine swap mass:</strong> ${d < 0 ? '−' : '+'}${fmt(Math.abs(d))} lb modeled (${escape(s.part.label.replace(/^Engine /, ''))}), so the car is now ${fmt(v.weight)} lb with ${fmt(v.front * 100, 1)}% on the front axle. <span class="quiet">Estimate: library dressed weights, engine centre of mass 8 in behind the front axle.</span></p>`;
  }
  return `<p class="swap-mass" data-swap-mass><strong>Engine swap mass:</strong> no automatic change. <span class="quiet">${escape(s.unchanged)}</span></p>`;
}

export function tractionPanel(v) {
  const r = tractionReadout(v);
  if (!r) return `<div data-traction-result>${swapMassLine(v)}<p class="quiet small">Add the missing weight and drivetrain inputs to see gearing and grip.</p></div>`;
  return `<div data-traction-result class="traction-panel" data-level="${r.color}">${swapMassLine(v)}
    <strong>${r.color === 'red' ? 'Grip limits launch force' : r.color === 'yellow' ? 'Near the modeled grip limit' : 'Modeled grip reserve'}</strong>
    <div class="force-meter" role="img" aria-label="Modeled launch demand uses ${fmt(r.utilization * 100)} percent of grip."
      style="--force-mark:${Math.min(100, 100 * r.utilization / 1.6)}%"><span></span></div>
    <p class="force-caption">${fmt(r.demand)} lbf demand · ${fmt(r.limit)} lbf available · ${fmt(r.utilization * 100)}% utilization</p>
    <p>${r.color === 'red' ? 'A shorter gear adds wheel torque, but the tires already set the launch limit.' :
      r.color === 'yellow' ? 'A small gearing or grip change can move the launch across the traction limit.' :
      'A shorter gear may increase launch force. Check how soon it reaches shift RPM.'}</p>
    <p>${fmt(r.rear)} lb dynamic rear load · ${fmt(r.mphInFirst, 1)} mph at shift RPM in first · ${fmt(r.cruiseRpm)} rpm at 70 mph</p>
  </div>`;
}
