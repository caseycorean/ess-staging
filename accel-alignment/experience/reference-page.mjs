import { newSetup } from './models.mjs';
import { saveToGarage, shareResult } from './configuration.mjs';
import { track } from './measurement.mjs';
import { findVehicles, normalizeVehicleSearch, vehicleInterests } from './catalog.mjs';
import { vehicles } from './vehicles.mjs';

const input = document.querySelector('[data-reference-filter]');
if (input) {
  const entries = [...document.querySelectorAll('[data-reference-entry]')];
  const count = document.querySelector('[data-reference-count]');
  const publishedIds = entries.map(item => item.dataset.referenceId).filter(id => Object.hasOwn(vehicles, id));
  const categories = document.querySelector('[data-reference-categories]');
  const featured = document.querySelector('[data-reference-featured]');
  const results = document.querySelector('[data-reference-results]');
  const summary = results?.querySelector('summary');
  const more = document.querySelector('[data-reference-more]');
  const note = document.querySelector('[data-reference-category-note]');
  const categoryNotes = {
    muscle:'Explore V8 muscle from big-block classics to modern pony cars.',
    sports:'Compare lightweight roadsters, mid-engine coupes and high-performance sports cars.',
    compact:'See how quick steering, gearing and front-drive grip shape compact performance cars.',
    awd:'Explore how different AWD layouts put power to the road.',
    classic:'Look up classic pickups by engine, cab and drivetrain.',
    truck:'Compare truck variants with their exact engine and driveline.',
  };
  const pageSize = 12;
  let limit = pageSize;
  let interest = 'all';
  let categoryIds = null;
  input.value = (new URLSearchParams(location.search).get('q') ?? '').slice(0, 100);
  input.closest('label').hidden = false;
  const search = () => {
    const tokens = normalizeVehicleSearch(input.value).split(' ').filter(Boolean);
    const filtered = tokens.length > 0 || interest !== 'all';
    let matches = 0;
    for (const item of entries) {
      const text = normalizeVehicleSearch(item.dataset.referenceSearch);
      const match = (!categoryIds || categoryIds.has(item.dataset.referenceId)) &&
        tokens.every(token => text.includes(token));
      if (match) matches++;
      item.hidden = !match || (more !== null && matches > limit);
    }
    const label = matches + (matches === 1 ? ' configuration' : ' configurations');
    count.textContent = matches ? label : 'No matching vehicles. Try another search or category.';
    if (!results) return;
    featured.hidden = filtered;
    note.hidden = !categoryNotes[interest];
    note.textContent = categoryNotes[interest] ?? '';
    summary.textContent = filtered ? `Search results · ${label}` : `Browse all ${label}`;
    if (filtered) results.open = true;
    more.hidden = matches <= limit;
    if (!more.hidden) more.textContent = `Show ${Math.min(pageSize, matches - limit)} more vehicles`;
  };
  if (categories) {
    categories.hidden = false;
    for (const [id, label] of vehicleInterests) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.textContent = label;
      chip.dataset.referenceCategory = id;
      chip.setAttribute('aria-pressed', String(id === interest));
      chip.addEventListener('click', () => {
        interest = id;
        categoryIds = id === 'all' ? null : new Set(findVehicles({interest: id}, publishedIds));
        for (const button of categories.children) button.setAttribute('aria-pressed', String(button === chip));
        limit = pageSize;
        results.open = true;
        search();
      });
      categories.append(chip);
    }
  }
  input.addEventListener('input', () => { limit = pageSize; search(); });
  more?.addEventListener('click', () => {
    const firstNew = entries.filter(item => !item.hidden).length;
    limit += pageSize;
    search();
    entries.filter(item => !item.hidden)[firstNew]?.querySelector('a')?.focus();
  });
  search();
}

const status = document.querySelector('[data-reference-status]');
const save = document.querySelector('[data-save-reference]');
if (save) {
  save.hidden = false;
  save.addEventListener('click', () => {
    const result = saveToGarage(newSetup(save.dataset.saveReference), 'before');
    track('configuration_save', {capability:'reference', outcome:result ? 'saved' : 'unavailable'});
    status.textContent = result ? 'Stock configuration saved in My Garage on this browser.' :
      'Could not save the configuration. Check browser storage or available space in My Garage.';
  });
}
const share = document.querySelector('[data-share-reference]');
if (share) {
  share.hidden = false;
  share.addEventListener('click', async () => {
    const url = new URL(share.dataset.shareReference, location.href);
    url.searchParams.set('via', 'share');
    track('share_attempt', {capability:'reference'});
    const outcome = await shareResult(url.href, document.querySelector('h1').textContent, 'Stock setup in Endicott Speed Shop Vehicle Lab.');
    track('share_outcome', {capability:'reference', outcome});
    const messages = {shared:'Share sheet completed.', copied:'Stock setup link copied.',
      cancelled:'Sharing cancelled.', manual:'Copy the stock setup link below.'};
    status.replaceChildren(messages[outcome]);
    if (outcome === 'manual') {
      const input = document.createElement('input');
      input.setAttribute('aria-label', 'Stock setup link');
      input.value = url.href;
      input.readOnly = true;
      status.append(input);
      input.select();
    }
  });
}

const control = document.querySelector('[data-reference-units]');
if (control) {
  // This file belongs to Claude's separate units branch. Integrators may land the pages first.
  const module = new URL('./units.mjs', import.meta.url);
  import(module.href).then(units => {
    control.innerHTML = units.unitsControl('reference-units');
    units.bindUnitControls(control);
    const originals = [...document.querySelectorAll('[data-spec-quantity]')];
    const render = () => {
      const system = units.getUnits();
      for (const el of originals) {
        const {specQuantity:quantity, specValue:value, specUnit:unit} = el.dataset;
        const canonical = units.fromSource(quantity, Number(value), unit);
        const display = el.nextElementSibling;
        const target = system === 'dual' ? (units.quantities[quantity].us === unit ? 'metric' : 'us') : system;
        display.hidden = canonical == null || units.unitLabel(quantity, target) === unit;
        if (!display.hidden) display.textContent = units.format(quantity, canonical, {system:target}) + ' converted';
      }
    };
    document.addEventListener('ess:units-changed', render);
    render();
  }).catch(() => { /* Original source values are fully available without units.mjs. */ });
}
