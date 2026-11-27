import { componentExamples, evidenceSources, referenceExampleLinks, vehicleEvidenceAdditions } from './data/component-observations.mjs';

const LABELS = {
  engine: 'Engines', transmission: 'Transmissions and gearing', axle: 'Axles and differentials',
  tires: 'Wheels and tires', brakes: 'Brakes', suspension: 'Suspension and chassis',
  capacities: 'Fuel and cooling', aero: 'Aerodynamics',
};
const SAFE = new Set(['manufacturer', 'published', 'independent_test', 'calculated', 'estimated']);
const DIMENSIONS = /^(?:front track|rear track|track front|track rear|wheelbase)$/i;
const AXLE = /final drive|differential|driven wheels/i;
const catalogue = new Map(componentExamples.map(item => [item.id, item]));

function publicFact(row) {
  if (!row || !SAFE.has(row.evidence) || row.value == null || row.value === '') return false;
  try { return new URL(row.source).protocol === 'https:'; } catch { return false; }
}

function group(out, name, rows) {
  for (const row of rows.filter(publicFact)) {
    const key = row.key ?? row.label;
    const existing = out[name] ??= [];
    if (!existing.some(other => (other.key ?? other.label) === key)) existing.push({ ...row });
  }
}

/** Projection over the canonical vehicle comparison corpus. No substitute for actual installation evidence. */
export function componentReference(comparison, configId) {
  if (!configId || typeof configId !== 'string') return null;
  const match = Object.entries(comparison?.cars ?? {}).find(([, car]) => car.id === configId);
  if (!match) return null;
  const [slug, car] = match;
  const buckets = {};
  for (const kind of ['engine','transmission','tires','brakes','suspension','capacities','aero']) {
    const rows = car.groups?.[kind] ?? [];
    if (kind === 'transmission') {
      group(buckets, 'axle', rows.filter(row => AXLE.test(row.label)));
      group(buckets, kind, rows.filter(row => !AXLE.test(row.label)));
    } else {
      group(buckets, kind, rows);
    }
  }
  group(buckets, 'suspension', (car.groups?.dimensions ?? []).filter(row => DIMENSIONS.test(row.label)));
  const additions = Object.hasOwn(vehicleEvidenceAdditions, configId) ? vehicleEvidenceAdditions[configId] : {};
  for (const [kind, rows] of Object.entries(additions)) group(buckets, kind, rows.map(row => ({
    ...row, source: evidenceSources[row.source]?.url, locator: evidenceSources[row.source]?.locator
  })));
  const links = Object.hasOwn(referenceExampleLinks, configId) ? referenceExampleLinks[configId] : [];
  return {
    id: configId, title: car.title, slug,
    groups: Object.entries(LABELS).flatMap(([id, label]) => buckets[id]?.length
      ? [{id, label, facts:buckets[id]}] : []),
    examples: links.map(componentExample).filter(Boolean),
  };
}

/** Structured catalog facts and maker-stated scope. Never an installed-weight or fitment decision. */
export function componentExample(id) {
  const item = catalogue.get(id);
  return item ? { ...item, source: evidenceSources[item.source] } : null;
}

/** Browse maker or supplier examples by category without assuming vehicle compatibility. */
export function componentExamplesFor(category) {
  return componentExamples.filter(item => item.group === category).map(item => componentExample(item.id));
}

const corpusUrl = new URL('../vehicles/comparison-data.json', import.meta.url);
let request;
export async function loadComponentReference(configId) {
  request ??= fetch(corpusUrl).then(response => {
    if (!response.ok) throw new Error('Component reference request failed');
    return response.json();
  }).catch(error => { request = undefined; throw error; });
  return componentReference(await request, configId);
}
