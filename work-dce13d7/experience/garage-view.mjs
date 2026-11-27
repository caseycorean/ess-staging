import { resolve } from './models.mjs';
import { setupName } from './matchup.mjs';
import { escape, fmt, vehicleSelector } from './ui.mjs';

export function garageView(items, active) {
  return `<section class="shell workspace garage-page">
    <header class="page-title"><p class="eyebrow">Your builds</p><h1>My Garage</h1>
    <p class="lede">Keep separate setups and choose which one follows you through ESS. Saved builds stay in this browser.</p></header>
    <section class="panel content-panel garage-current"><h2>Active vehicle</h2>
      <p>${active ? escape(setupName(active.setup)) + ' · ' + (active.mode === 'after' ? 'Modified' : 'Original') : 'Choose a vehicle to start.'}</p>
      <div class="actions">${vehicleSelector('My Garage', active?.setup.id ?? 'custom', {key:'garage', name:'Choose a car'})}
        <a class="button secondary" href="#build">Edit current build</a></div></section>
    <div class="garage-grid">${items.map(({key,setup,mode}) => {
      const v = resolve(setup, mode === 'after');
      return `<article class="panel content-panel garage-card"><h2>${escape(setupName(setup))}</h2>
        <p>${mode === 'after' ? 'Modified' : 'Original'} · ${fmt(v.weight)} lb · ${fmt(v.hp)} hp</p>
        <div class="actions"><button class="button primary" data-garage-use="${key}">Use this configuration</button>
        <button class="button secondary" data-garage-open="${key}">Open to edit</button>
        <button class="button plain" data-garage-remove="${key}">Remove</button></div>
      </article>`;
    }).join('')}</div>
    ${items.length ? '' : '<p class="quiet">Build or tune a car, then choose Save to My Garage.</p>'}
  </section>`;
}
