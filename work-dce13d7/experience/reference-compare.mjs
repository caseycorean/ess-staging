import { installCatalog } from './catalog.mjs';

const form = document.querySelector('#comparison-select');
const status = document.querySelector('#comparison-state');
const results = document.querySelector('#comparison-results');
const params = new URLSearchParams(location.search);
const evidence = {manufacturer:'Manufacturer', published:'Published', independent_test:'Independent test',
  calculated:'Calculated from source', historical:'Supercar X archive', estimated:'Estimate'};

function el(tag, text) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  return node;
}
function profile(car) {
  const link = el('a', car.title);
  link.href = car.href;
  return link;
}
function printValue(fact) {
  if (!fact) return '—';
  if (Array.isArray(fact.value)) return fact.value.join(' · ');
  if ((fact.unit === 'fraction' || fact.key === 'front_share') && typeof fact.value === 'number') {
    return (fact.value * 100).toLocaleString('en-US', {maximumFractionDigits:4}) + '%';
  }
  const value = typeof fact.value === 'number' ? fact.value.toLocaleString('en-US', {maximumFractionDigits:10}) : fact.value;
  return value + (fact.unit && !['label','ratio','text'].includes(fact.unit) ? ' ' + fact.unit : '');
}
function cell(fact) {
  const node = el('td', printValue(fact));
  if (fact) {
    node.append(el('small', evidence[fact.evidence] ?? 'Published'));
    if (fact.note) node.append(el('small', fact.note));
    if (fact.source?.startsWith('https://')) {
      const source = el('a','Source');
      source.href = fact.source;
      source.rel = 'noreferrer';
      node.append(el('small'));
      node.lastElementChild.append(source);
    }
  }
  return node;
}
function indexFacts(rows) {
  const index = new Map();
  for (const fact of rows ?? []) {
    const key = fact.label.toLowerCase() + (fact.label.includes('mph') || fact.label.includes('km/h') ? '|' + fact.evidence : '');
    // Repeated labels with variant notes stay separate instead of receiving a false one-to-one pairing.
    const duplicate = index.has(key);
    index.set(duplicate ? key + ':' + index.size : key, fact);
  }
  return index;
}
function render(a,b,groups) {
  results.replaceChildren();
  if (!a || !b || a === b) {
    status.textContent = a && a === b ? 'Choose two distinct configurations.' : 'Choose two vehicles to see their sourced specifications.';
    return;
  }
  status.textContent = 'Comparing ' + a.title + ' with ' + b.title + '.';
  for (const [group, title] of Object.entries(groups)) {
    const left = indexFacts(a.groups[group]);
    const right = indexFacts(b.groups[group]);
    const keys = new Set([...left.keys(), ...right.keys()]);
    if (!keys.size) continue;
    const section = el('section'); section.className = 'vr-spec';
    const heading = el('h2', title);
    const table = el('table'); table.className = 'vr-compare';
    const caption = el('caption', title + ' specifications');
    const head = el('thead'), headers = el('tr');
    headers.append(el('th','Specification'));
    for (const car of [a,b]) {
      const th = el('th'); th.append(profile(car)); headers.append(th);
    }
    for(const th of headers.children) th.scope = 'col';
    head.append(headers);
    const body = el('tbody');
    for (const key of keys) {
      const x = left.get(key), y = right.get(key);
      const line = el('tr');
      const th = el('th', (x ?? y).label);
      th.scope = 'row';
      line.append(th, cell(x), cell(y));
      body.append(line);
    }
    table.append(caption,head,body);
    section.append(heading,table);
    results.append(section);
  }
}

try {
  const response = await fetch('../comparison-data.json');
  if (!response.ok) throw Error('Reference library unavailable');
  const {cars,groups} = await response.json();
  const keysById = new Map(Object.entries(cars).map(([key, car]) => [car.id, key]));
  const submit = form.querySelector('[type="submit"]');
  const setPick = (side, key) => {
    const car = Object.hasOwn(cars, key) ? cars[key] : null;
    form.elements[side].value = car ? key : '';
    form.querySelector(`[data-compare-side="${side}"]`).textContent = car?.title ?? 'Choose a vehicle';
    submit.disabled = !form.elements.a.value || !form.elements.b.value;
  };
  for (const side of ['a', 'b']) setPick(side, params.get(side));
  installCatalog(document, { allowedIds: keysById.keys(), label: 'Choose a vehicle to compare', templates: false });
  form.addEventListener('ess:vehicle-selected', event => {
    const side = event.target.dataset.compareSide;
    const key = keysById.get(event.detail.id);
    if (side && key) setPick(side, key);
  });
  const show = () => render(cars[form.elements.a.value],cars[form.elements.b.value],groups);
  form.hidden = false;
  form.addEventListener('submit', event => {
    event.preventDefault();
    const url = new URL(location.href);
    for (const key of ['a','b']) url.searchParams.set(key,form.elements[key].value);
    history.replaceState(null,'',url);
    show();
  });
  show();
} catch {
  status.textContent = 'The comparison library is temporarily unavailable. Individual specifications remain accessible from the library.';
}
