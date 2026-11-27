import { resolve } from './models.mjs';
import { setupName } from './matchup.mjs';
import { escape, fmt, vehicleSelector } from './ui.mjs';

const garageNameKey = 'ess.garage-name.v1';

function cleanName(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 44) : '';
}

export function garageName() {
  try { return cleanName(localStorage.getItem(garageNameKey)); }
  catch { return ''; }
}

export function storeGarageName(value) {
  const name = cleanName(value);
  try {
    if (name) localStorage.setItem(garageNameKey, name);
    else localStorage.removeItem(garageNameKey);
    return true;
  } catch { return false; }
}

export function garageView(items, active) {
  const name = garageName();
  return `<section class="shell workspace garage-page">
    <header class="page-title ess-garage-title">
      <div>${name ? '<p class="eyebrow">My Garage</p>' : ''}<h1>${escape(name || 'My Garage')}</h1>
        <p class="lede">Keep your cars and builds here, then pick one to carry through ESS.</p></div>
      <details class="ess-garage-custom"><summary>Customize</summary>
        <form data-garage-name><label>Garage name<input name="name" maxlength="44" value="${escape(name)}" placeholder="My Garage"></label>
        <button type="submit" class="button secondary">Save name</button>
        <p class="quiet">Saved in this browser. Leave it blank to restore My Garage.</p></form>
      </details>
    </header>
    <section class="panel content-panel garage-current"><h2>${active ? 'Active vehicle' : 'Start with a car'}</h2>
      <p>${active ? escape(setupName(active.setup)) + ' · ' + (active.mode === 'after' ? 'Modified' : 'Original') :
        'Choose a factory configuration or enter a car of your own. You can save its original setup and separate versions as you experiment.'}</p>
      <div class="actions">${vehicleSelector('Garage vehicle', active?.setup.id ?? 'custom', {key:'garage', name:'Choose a vehicle'})}
        ${active ? '<a class="button secondary" href="#build">Edit current build</a>' :
          '<a class="button secondary" href="?custom=1#build">Enter my own vehicle</a>'}</div></section>
    <div class="garage-grid">${items.map(({key,setup,mode}) => {
      const v = resolve(setup, mode === 'after');
      return `<article class="panel content-panel garage-card"><h2>${escape(setupName(setup))}</h2>
        <p>${mode === 'after' ? 'Modified' : 'Original'} · ${fmt(v.weight)} lb · ${fmt(v.hp)} hp</p>
        <div class="actions"><button class="button primary" data-garage-use="${key}">Use this configuration</button>
        <button class="button secondary" data-garage-open="${key}">Open to edit</button>
        <button class="button plain" data-garage-remove="${key}">Remove</button></div>
      </article>`;
    }).join('')}</div>
    ${items.length ? '' : '<p class="quiet">Saved configurations will appear here on this browser.</p>'}
  </section>`;
}
