// ESS journey band: connects a concept (article), a calculator or the planning guide to model-driven experiments on
// the visitor's own car. Every number is a shared-engine run; every "Try it" link opens the Vehicle Lab with that
// experiment already applied (reproducible share fragment). No host services, no network: plain ES modules.
import { getActive, example, shareFragment } from './configuration.mjs';
import { newSetup, resolve, usableSetup, presets, validValue, engineSwapMass } from './models.mjs';
import { perfModel, perfDefaults, nextSteps, frictionOptions, quickEt, effectivePerf, baseVehicle, withConditions } from './performance-view.mjs';
import { tractionCheck, frictionFor } from '../engine/traction.mjs';
import { components } from './components.mjs';
import { gearChart, lights, tree, ordinal } from './identity.mjs';
import { finding } from './identity-figures.mjs';
import { setupName } from './matchup.mjs';
import { ovalLap } from './oval.mjs';
import { escape, fmt, delta } from './ui.mjs';

/** What each page connects to. `car` is the reference car shown when the visitor has not chosen one. */
export const plans = {
  'articles/traction-circle': { watch: 'entry', car: 'corvette', chart: true, gens: ['gearing', 'tire', 'cg'],
    title: 'Where does your car run out of grip?', copy: 'The same limit decides a launch. See how much of the drivetrain’s force the tires can use, gear by gear, and what one change does.' },
  'articles/weight-distribution-50-50': { watch: 'corner', car: 'camaro', gens: ['weight', 'cg', 'gearing'],
    title: 'What would moving weight do to your car?', copy: 'Where mass sits changes the load on the driven tires. These are model runs of one change at a time.' },
  'articles/measured-firebird-weights': { watch: 'accelerate', car: 'firebird', gens: ['seats', 'weight', 'cg'],
    title: 'Put a measured part on a car', copy: 'Measured weights become useful when you see what removing or moving them does to balance and acceleration.' },
  'articles/ls-swap-real-cost': { watch: 'accelerate', car: 'firebird', chart: true, gens: ['engine', 'tire', 'gearing'],
    title: 'More power: can the tires use it?', copy: 'A swap adds torque. Whether it shows up as time depends on grip and gearing, gear by gear.' },
  'tools/load-transfer': { watch: 'brake', car: 'corvette', gens: ['cg', 'tire', 'weight'],
    title: 'From load transfer to a launch', copy: 'Accelerating moves load onto the rear tires. Here is what that load is worth at launch on a real car.' },
  'tools/cg-builder': { watch: 'corner', car: 'camaro', gens: ['cg', 'weight'],
    title: 'Balance and CG on a real car', copy: 'The same inputs drive launch grip. One change at a time, run through the acceleration model.' },
  'tools/scale-delta': { watch: 'accelerate', car: 'firebird', gens: ['seats', 'weight'],
    title: 'What is a part worth on the strip?', copy: 'Turn a measured part weight into a balance and acceleration result.' },
  'tools/spring-rate': { watch: 'corner', car: 'camaro', gens: ['cg', 'weight'],
    title: 'Ride is one part of the car', copy: 'Lowering and moving weight also change launch grip. Here is how much, for one car.' },
  'weight-distribution-calculator': { watch: 'corner', car: 'camaro', gens: ['weight', 'cg'],
    title: 'From a percentage to a result', copy: 'Front percentage is a starting point. Here is what changing it does to launch grip and time.' },
  'lab-build': { car: 'camaro', gens: ['weight', 'cg', 'tire', 'gearing', 'engine'], rank: true, lab: true,
    title: 'Next experiment on this car', copy: 'One change at a time from where this build is now, ranked by modelled quarter-mile gain. Apply one and keep going.' },
  'lab-compare': { car: 'camaro', gens: ['gearing', 'tire', 'weight', 'cg'], rank: true, lab: true,
    title: 'Next experiment for the selected car', copy: 'Each option is a model run of the car you are tuning. Apply one and the comparison reruns.' },
  tools: { watch: 'brake', car: 'corvette', gens: ['gearing', 'weight', 'cg'], title: 'Try it on a car', copy: 'Three experiments on one car, each a run of the shared models.' },
  articles: { watch: 'entry', car: 'corvette', chart: true, gens: ['gearing', 'tire', 'weight'], title: 'Read it, then run it', copy: 'Every article connects to an experiment. Start with this car.' },
  plan: { watch: 'corner', car: 'camaro', gens: ['gearing', 'tire', 'weight', 'cg', 'engine'], rank: true,
    title: 'Acceleration experiments: ranked for the drag strip', copy: 'One change at a time on the same car, sorted by modelled quarter-mile gain only. Building for corners, braking or ride? Watch those tests in the replays below, or explore suspension geometry; goal-based planning is coming.' },
};

const clone = s => JSON.parse(JSON.stringify(s));
// The graphical replay each page links to (replay/?car=…#experiment), shown above the ranked list so it is not buried.
const WATCH = { accelerate: 'Watch two cars launch and run', brake: 'Watch two cars stop from 60 mph', corner: 'Watch two cars hold a corner',
  entry: 'Watch trail braking into a corner', exit: 'Watch the differentials power out', sequence: 'Watch a corner sequence' };
const watchHref = (labRoot, key, id) => new URL(`../replay/?car=${encodeURIComponent(id)}#${key}`, new URL(labRoot, globalThis.location?.href ?? 'https://endicottspeedshop.com/experience/')).href;

/** The car to show: the active configuration, else the page's reference car. */
export function journeyCar(plan, active = getActive()) {
  if (active) {
    const setup = active.mode === 'after' ? clone(active.setup) : { ...clone(active.setup), tune: {}, parts: [] };
    if (active.mode !== 'after') delete setup.components;
    return { setup, example: false };
  }
  return { setup: newSetup(plan.car), example: true };
}

/** Light metrics for before/after: quarter mile, launch share of grip, front share, launch grip. */
export function metrics(setup, pagePerf = perfDefaults(), event = 'strip') {
  const perf = effectivePerf(setup, pagePerf);
  const v = resolve(setup, true);
  const lapRun = event === 'oval' ? ovalLap(v) : null;
  const lap = Number.isFinite(lapRun?.lap) ? lapRun.lap : null;
  const lateral = lapRun?.cornering && !lapRun.cornering.gripOnly ? lapRun.cornering.ay : null;
  const { opts } = frictionOptions(baseVehicle(setup), perf);
  let launch = null;
  if (opts.customMu !== null) {
    const c = tractionCheck(v, { ...opts, gear: 0 });
    if (c.status !== 'missing') launch = c;
  }
  return { v, et: event === 'oval' ? lap : quickEt(setup, perf), lap, lateral, launch: launch?.utilization ?? null, status: launch?.status ?? 'missing',
    grip: launch?.availableLb.typical ?? null, front: v.front, weight: v.weight };
}

const fxLine = (a, b) => {
  const parts = [];
  if (Number.isFinite(a.front) && Number.isFinite(b.front) && Math.abs(a.front - b.front) > .0004) parts.push(`front ${fmt(a.front * 100, 1)}% → ${fmt(b.front * 100, 1)}%`);
  if (Number.isFinite(a.weight) && Number.isFinite(b.weight) && Math.abs(a.weight - b.weight) >= .5) parts.push(`${fmt(a.weight)} → ${fmt(b.weight)} lb`);
  if (!Number.isFinite(a.lateral) && Number.isFinite(a.grip) && Number.isFinite(b.grip) && Math.abs(a.grip - b.grip) >= 1) parts.push(`launch grip ${fmt(a.grip)} → ${fmt(b.grip)} lb`);
  if (Number.isFinite(a.lateral) && Number.isFinite(b.lateral) && Math.abs(a.lateral - b.lateral) >= .0005) parts.push(`cornering ${fmt(a.lateral, 3)} → ${fmt(b.lateral, 3)} g`);
  if (Number.isFinite(a.lateral)) return parts.join(' · ');
  if (Number.isFinite(a.launch) && Number.isFinite(b.launch) && Math.abs(a.launch - b.launch) >= .005) parts.push(`launch uses ${fmt(a.launch * 100)}% → ${fmt(b.launch * 100)}% of grip`);
  return parts.join(' · ');
};

/** Experiment generators: each returns a modified setup and/or page conditions, or null when it does not apply. */
const generators = {
  gearing(base, perf, m) {
    const step = nextSteps(m, perf).find(s => s.kind === 'axle');
    if (!step) return null;
    const setup = clone(base); setup.tune.finalDrive = step.ratio;
    return { setup, perf, title: `Try a ${fmt(step.ratio, 2)} final drive`, what: `${fmt(m.v.finalDrive, 2)} → ${fmt(step.ratio, 2)}`, view: 'performance' };
  },
  tire(base, perf, m, event) {
    const step = nextSteps(m, perf).find(s => s.kind === 'tire' && (event !== 'oval' || s.surface !== 'preppedStrip'));
    if (!step) return null;
    const next = { ...effectivePerf(base, perf), tire: step.tire, surface: step.surface, customMu: null };
    return { setup: withConditions(clone(base), next), perf: next, title: step.title, what: step.detail, view: 'performance' };
  },
  weight(base, perf, m) {
    if (![m.v.weight, m.v.front, m.v.wheelbase].every(Number.isFinite) || base.parts.length >= 8) return null;
    const p = presets.ballast; const setup = clone(base);
    setup.parts.push({ label: p.label, preset: 'ballast', oldWeight: p.oldWeight, oldX: p.oldX, newWeight: p.newWeight, newX: p.newX });
    return usableSetup(setup) ? { setup, perf, title: 'Move 40 lb rearward', what: '40 lb from 18 in to 90 in behind the front axle (illustrative)', view: 'build' } : null;
  },
  seats(base, perf, m) {
    if (base.id !== 'firebird' || base.parts.length >= 8 || base.parts.some(x => x.preset === 'seats')) return null;
    const p = presets.seats; const setup = clone(base);
    setup.parts.push({ label: p.label, preset: 'seats', oldWeight: p.oldWeight, oldX: p.oldX, newWeight: p.newWeight, newX: p.newX });
    return usableSetup(setup) ? { setup, perf, title: 'Remove the rear seats (ESS measured)', what: '23 lb measured by ESS, 76 in behind the front axle (location estimated)', view: 'build' } : null;
  },
  cg(base, perf, m, event) {
    if (!Number.isFinite(m.v.cg)) return null;
    const cg = Math.round((m.v.cg - 2) * 10) / 10;
    if (!validValue('cg', cg)) return null;
    const setup = clone(base); setup.tune.cg = cg;
    return { setup, perf, title: 'Lower the CG by 2 in', what: `CG height ${fmt(m.v.cg, 1)} → ${fmt(cg, 1)} in (${event === 'oval' ? 'less load moves to the outside tires in a turn' : 'less load moves onto the rear'})`, view: 'performance' };
  },
  engine(base, perf, m) {
    const current = base.components?.engine;
    const id = ['ls1gto', ...Object.keys(components.engine)].find(k => components.engine[k] && k !== current && !components.engine[k].hidden);
    if (!id) return null;
    const setup = clone(base); setup.components = { ...(setup.components ?? {}), engine: id };
    for (const k of Object.keys(components.engine[id].values ?? {})) delete setup.tune[k];
    if (!usableSetup(setup)) return null;
    // Say what the model did with mass (owner Plan review 26 Nov: the old text claimed mass was not modelled while the
    // weight changed): library installed-weight change when both engines are in it, otherwise stock mass kept.
    const mass = engineSwapMass(setup);
    const massText = mass?.part ? 'installed weight change from ESS component-library weights (estimate)' : mass?.unchanged ? mass.unchanged.replace(/\.$/, '').replace(/^./, c => c.toLowerCase()) : 'stock mass kept';
    return { setup, perf, title: `Swap to the ${components.engine[id].name}`, what: `Donor power ratings; ${massText}`, view: 'performance' };
  },
};

/** Run the page's experiments on a car. Pure: used by the band and by tests. */
// On the test oval the same one-step changes are ranked by flying-lap time; launch-only ideas are left out.
const ovalGens = ['tire', 'cg', 'weight', 'gearing'];

export function experiments(planKey, setup, perf = perfDefaults(), { event = 'strip' } = {}) {
  const plan = plans[planKey];
  const m = perfModel(setup, perf);
  const before = metrics(setup, perf, event);
  const out = [];
  const gens = event === 'oval' && plan.lab ? ovalGens : plan.gens;
  for (const g of gens) {
    const x = generators[g]?.(setup, perf, m, event);
    if (!x) continue;
    const after = metrics(x.setup, x.perf, event);
    out.push({ ...x, gen: g, before, after, dEt: Number.isFinite(after.et) && Number.isFinite(before.et) ? after.et - before.et : null, fx: fxLine(before, after) });
  }
  if (plan.rank) out.sort((a, b) => (a.dEt ?? 0) - (b.dEt ?? 0));
  return { m, before, list: out };
}

/** Lab link that opens the experiment already applied (same share format the Lab uses). */
export function tryHref(labRoot, x) {
  const state = { ...example(), a: x.setup, aMode: 'after', focus: 'a',
    perf: { tire: x.perf.tire ?? null, surface: x.perf.surface ?? 'dryAsphalt', customMu: x.perf.customMu ?? null, gear: x.perf.gear ?? 0 } };
  return labRoot + shareFragment(state, x.view);
}

export function journeyHtml(planKey, labRoot, active) {
  const plan = plans[planKey];
  if (!plan) return '';
  const { setup, example: isExample } = journeyCar(plan, active);
  const { m, before, list } = experiments(planKey, setup);
  const name = escape(setupName(setup));
  const facts = [
    Number.isFinite(before.et) ? `Quarter mile <b>${fmt(before.et, 2)} s</b>` : '',
    Number.isFinite(before.front) ? `${fmt(before.front * 100, 1)}% front` : '',
    Number.isFinite(before.weight) ? `${fmt(before.weight)} lb` : '',
  ].filter(Boolean).join(' · ');
  const rows = list.map(x => {
    const gain = x.dEt === null ? '' : Math.abs(x.dEt) < .005 ? '±0.00 s' : `${delta(x.dEt, 2)} s`;
    const etLine = Number.isFinite(x.before.et) && Number.isFinite(x.after.et) ? `Quarter mile ${fmt(x.before.et, 2)} → ${fmt(x.after.et, 2)} s` : '';
    return `<li><a class="ig-exp" href="${escape(tryHref(labRoot, x))}" data-journey-try="${x.gen}">
      <span class="ig-exp-title">${escape(x.title)}</span>
      <b class="ig-exp-gain ${x.dEt > .004 ? 'worse' : ''}">${escape(gain)}</b>
      <span class="ig-exp-what">${escape(x.what)}</span>
      <span class="ig-exp-fx">${escape([etLine, x.fx].filter(Boolean).join(' · '))}</span>
      <span class="ig-exp-go">Try it in the Lab →</span></a></li>`;
  }).join('');
  return `<p class="ig-eyebrow">Try it on a car</p><h2>${escape(plan.title)}</h2><p class="ig-journey-copy">${escape(plan.copy)}</p>
    <div class="ig-journey-car"><div class="ig-journey-head"><strong>${name}${isExample ? ' <small>example</small>' : ' <small>your car</small>'}</strong>
      <span>${tree(before.status, { label: false })} Launch: ${escape(lights[before.status].word.toLowerCase())}</span></div>
      <p class="ig-journey-facts">${facts || 'This car needs more data for a run: ' + escape(m.quarterMissing.join(', '))}</p>
      ${plan.chart ? gearChart(m.gearRows, { interactive: false, compact: true, label: `${setupName(setup)}: share of tire grip used in each gear` }) + `<p class="ig-journey-find">${finding(m)}</p>` : ''}
    </div>
    ${plan.watch ? `<p class="ig-journey-watch"><a href="${escape(watchHref(labRoot, plan.watch, setup.id))}">▶ ${escape(WATCH[plan.watch])}</a></p>` : ''}
    ${rows ? `<ol class="ig-exp-list">${rows}</ol>` : '<p>No experiment applies to this car yet. Open it in the Lab to add the missing data.</p>'}
    <p class="ig-journey-note">Model estimates for ${name}${isExample ? '. Choose your own car with the vehicle panel at the top of the page' : ''}. <a href="${escape(labRoot)}#performance">Gearing and traction</a> · <a href="${escape(labRoot)}#build">Build</a> · <a href="${escape(labRoot)}#garage">My Garage</a></p>`;
}

/** In-Lab version: buttons apply the experiment to the focused car in place (data-lab-try), no navigation. */
export function labJourneyHtml(planKey, setup, laneLabel, { event = 'strip' } = {}) {
  const plan = plans[planKey];
  const oval = event === 'oval';
  const { before, list } = experiments(planKey, setup, perfDefaults(), { event });
  if (!list.length) return '';
  const testName = oval ? 'Flying lap' : 'Quarter mile';
  const copy = oval ? 'Each option is a model run of the car you are tuning on the test oval, ranked by modelled lap gain. Apply one and the comparison reruns.' : plan.copy;
  return `<section class="ig-journey ig-lab-journey" aria-labelledby="lab-journey-title"><p class="ig-eyebrow">${escape(laneLabel)}</p>
    <h2 id="lab-journey-title">${escape(plan.title)}</h2><p class="ig-journey-copy">${escape(copy)}</p>
    <ol class="ig-exp-list">${list.map(x => {
      const gain = x.dEt === null ? '' : Math.abs(x.dEt) < .005 ? '±0.00 s' : `${delta(x.dEt, 2)} s`;
      const etLine = Number.isFinite(x.before.et) && Number.isFinite(x.after.et) ? `${testName} ${fmt(x.before.et, 2)} → ${fmt(x.after.et, 2)} s` : '';
      return `<li><button type="button" class="ig-exp" data-lab-try="${x.gen}" data-lab-plan="${planKey}" data-lab-event="${oval ? 'oval' : 'strip'}">
        <span class="ig-exp-title">${escape(x.title)}</span><b class="ig-exp-gain ${x.dEt > .004 ? 'worse' : ''}">${escape(gain)}</b>
        <span class="ig-exp-what">${escape(x.what)}</span><span class="ig-exp-fx">${escape([etLine, x.fx].filter(Boolean).join(' · '))}</span>
        <span class="ig-exp-go">Apply to this car</span></button></li>`;
    }).join('')}</ol>
    <p class="ig-journey-note">${Number.isFinite(before.et) ? `Now ${fmt(before.et, 2)} s ${oval ? 'per lap ' : ''}for ${escape(setupName(setup))}. ` : ''}Undo any change in Build; save the ones worth testing to My Garage.</p></section>`;
}

function mountAll() {
  for (const el of document.querySelectorAll('[data-ess-journey]')) {
    try {
      el.innerHTML = journeyHtml(el.dataset.essJourney, el.dataset.labRoot || '../experience/');
    } catch (error) {
      el.innerHTML = `<p><a href="${escape(el.dataset.labRoot || '../experience/')}">Open the Vehicle Lab</a></p>`;
    }
  }
}
if (typeof document !== 'undefined') {
  mountAll();
  // The page's vehicle panel sets the active car; refresh after its handler has run.
  document.addEventListener('ess:vehicle-selected', () => setTimeout(mountAll, 0));
}
