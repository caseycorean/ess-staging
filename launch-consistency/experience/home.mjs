import { getActive, example, shareFragment, useConfig, getGarage } from './configuration.mjs';
import { newSetup } from './models.mjs';
import { vehicles } from './vehicles.mjs';
import { installCatalog } from './catalog.mjs';

const control = document.querySelector('[data-home-vehicle]');
if (control) {
  installCatalog();
  const active = getActive();
  if (active) {
    control.querySelector('[data-open-catalog]').textContent = active.setup.name || vehicles[active.setup.id].name;
  }

  control.addEventListener('ess:vehicle-selected', event => {
    const {id, template} = event.detail;
    const setup = newSetup(id);
    const carried = useConfig(setup, 'before');
    const root = new URL(control.dataset.labRoot, location.href);
    if (carried) root.searchParams.set('start', 'vehicle');
    if (template) root.searchParams.set('edit', 'original');
    root.hash = carried ? 'build' : shareFragment({...example(), a: setup}, 'build').slice(1);
    location.assign(root);
  });
  // Existing Grip Lab share URLs at the old homepage keep opening the same experiment.
  if (location.hash.startsWith('#lab:')) location.replace('grip/' + location.hash);
}

// Proving Ground identity: live timeslip for the visitor's car (or the public Z06 reference) and the tire-circle figure.
import { liveCard, bindLiveOpen, circlesSvg } from './identity-figures.mjs';
const live = document.querySelector('[data-home-live]');
if (live) {
  try {
    const card = liveCard('experience/');
    live.insertAdjacentHTML('beforeend', card.html);
    bindLiveOpen(live, card.setup, card.example, 'experience/');
  } catch {
    live.insertAdjacentHTML('beforeend', '<p class="ig-live-find"><a href="experience/#performance">Open the gearing and traction lab</a></p>');
  }
}
const circles = document.querySelector('[data-home-circles]');
if (circles) circles.innerHTML = circlesSvg();

// Return visits: continue where you left off (saved builds in this browser).
const garage = getGarage();
if (control && garage.length) {
  const last = garage[0];
  const name = last.setup.name || vehicles[last.setup.id]?.name || 'your saved build';
  const p = document.createElement('p');
  p.className = 'ig-home-continue';
  const a = document.createElement('a');
  a.href = control.dataset.labRoot + '#garage';
  a.textContent = `Continue with ${name}`;
  p.append(a, ` · ${garage.length} saved in My Garage`);
  control.after(p);
}
