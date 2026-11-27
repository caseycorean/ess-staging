// Shared identity figures for the homepage and articles. Values come from the shared engine only.
import { tireClasses } from '../engine/traction.mjs';
import { perfModel, perfDefaults } from './performance-view.mjs';
import { getActive, useConfig } from './configuration.mjs';
import { newSetup } from './models.mjs';
import { setupName } from './matchup.mjs';
import { escape, fmt } from './ui.mjs';
import { lights, ordinal, gearChart } from './identity.mjs';

/** Tire classes in period order for the "the circle got bigger" figure. Lateral grip = class typical × lateral ratio. */
export const circleClasses = ['bias', 'radial70s', 'perf80s', 'maxSummer', 'extremeSummer'].map((id, i) => {
  const c = tireClasses[id];
  return { id, label: c.label, g: +(c.longitudinal.typical * c.lateralRatio).toFixed(2), shade: ['#9d968a', '#7f8a74', '#55624f', '#2f3a2c', '#f2a81d'][i] };
});

/** SVG content (no outer <svg>) drawn in a 220×220 box: one circle per class, radius ∝ lateral g. */
export function circlesSvg() {
  const R = g => g * 92;
  const grid = [.5, 1].map(g => `<circle cx="110" cy="110" r="${R(g)}" fill="none" stroke="#cfc6b3" stroke-dasharray="3 4"/>
    <text x="${(110 - R(g) + 3).toFixed(1)}" y="106" font-size="10" fill="#6b6a60" font-family="var(--ig-mono)">${g.toFixed(1)} g</text>`).join('');
  return `<path d="M110 8v204M8 110h204" stroke="#cfc6b3"/>${grid}
    ${circleClasses.map(c => `<circle cx="110" cy="110" r="${R(c.g).toFixed(1)}" fill="none" stroke="${c.shade}" stroke-width="${c.id === 'extremeSummer' ? 4 : 2.4}"/>`).join('')}
    <circle cx="${(110 + R(circleClasses.at(-1).g) * .7071).toFixed(1)}" cy="${(110 - R(circleClasses.at(-1).g) * .7071).toFixed(1)}" r="6" fill="#f2a81d" stroke="#1b1e1a" stroke-width="2"/>`;
}

export function circleKey() {
  return `<ul class="ig-circle-key">${circleClasses.map(c => `<li style="color:${c.shade}"><i></i><span style="color:var(--ig-ink)">${escape(c.label)}</span><b style="color:var(--ig-ink)">${fmt(c.g, 2)} g</b></li>`).join('')}</ul>`;
}

/** The car to show: the visitor's active configuration, else the public C5 Z06 reference. */
export function liveSetup() {
  const active = getActive();
  if (!active) return { setup: newSetup('corvette'), example: true };
  const setup = active.mode === 'after' ? active.setup : { ...active.setup, tune: {}, parts: [], components: undefined };
  if (!setup.components) delete setup.components;
  return { setup, example: false };
}

/** One sentence that reads the result: what limits this car, grounded in byGear. */
export function finding(m) {
  const first = m.gearRows[0];
  if (!first) return `This car needs ${escape(m.check.missing?.join(', ') ?? 'more data')} before the traction check can run.`;
  const spin = m.gearRows.filter(r => r.status === 'red').length;
  if (first.status === 'red') return `In 1st the drivetrain asks for <b>${fmt(first.utilization * 100)}%</b> of the tires’ grip: the launch is grip-limited${spin > 1 ? ` through ${ordinal(spin)} gear` : ''}.`;
  if (first.status === 'yellow') return `In 1st it uses <b>${fmt(first.utilization * 100)}%</b> of the grip: right on the edge, so the tire and surface decide the launch.`;
  return `Even in 1st it uses only <b>${fmt(first.utilization * 100)}%</b> of the grip: the engine and gearing, not the tires, set the pace.`;
}

/**
 * Live result card for the homepage hero and the article ending: the visitor's car (or the public Z06 reference),
 * its quarter mile, and the compact gear chart. The timeslip stays in the tool, where a drag-strip result lives.
 */
export function liveCard(labRoot) {
  const { setup, example } = liveSetup();
  const m = perfModel(setup, perfDefaults());
  const name = escape(setupName(setup));
  const chart = gearChart(m.gearRows, { interactive: false, compact: true, label: `${setupName(setup)}: share of tire grip used in each gear` });
  return { m, example, setup, html: `<div class="ig-live-head"><strong>${name}${example ? ' · example' : ''}</strong>
      <span>${m.accel ? 'Quarter mile ' + fmt(m.accel.et, 2) + ' s' : 'Needs ' + escape((m.quarterMissing.length ? m.quarterMissing : ['data']).join(', '))}</span></div>
    ${chart}
    <p class="ig-live-find" data-level="${m.gearRows[0]?.status ?? 'missing'}">${finding(m)}</p>
    <div class="ig-hero-actions"><a class="ig-btn go" href="${labRoot}#performance" data-live-open>Change the gear or tire →</a></div>` };
}

/** Make sure the lab opens on the car the card showed (the example car becomes the active car only on tap). */
export function bindLiveOpen(root, setup, example, labRoot) {
  root.querySelector('[data-live-open]')?.addEventListener('click', event => {
    if (!example) return;
    event.preventDefault();
    useConfig(setup, 'before');
    location.assign(labRoot + '?start=vehicle#performance');
  });
}
