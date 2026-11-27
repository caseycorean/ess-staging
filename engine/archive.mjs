// ESS engineering library — the Supercar X historical archive as selectable vehicles.
// Every one of the 75 recovered specification pages becomes a catalog-shaped record that the shared resolver
// (resolve.mjs) and Garage adapter can use. Values keep their 'historical' evidence tier and the Wayback
// capture as the source. Nothing here is re-researched: it maps what the archive published.
//
// Tiers (what a visitor can do with the car):
//   'simulation-ready'      — acceleration AND tire loads run (some inputs may be ESS estimates, labelled)
//   'partial'               — at least one tool runs; others list the missing facts
//   'historical-reference'  — specification page only: competition cars (slicks/aero not modelled) or nothing runs
// Records the crosswalk marks as exact matches for a curated vehicle are not listed twice: they carry
// `mergedInto` and the curated record already uses their values (resolve.mjs historicalFor).
import { supercarx, exactMatches } from './data/supercarx.mjs';
import { supercarxSuspension } from './data/supercarx-suspension.mjs';
import { resolveVehicle } from './resolve.mjs';
import { archiveCorrections } from './data/archive-corrections.mjs';
import { notPublishable } from './data/publication.mjs';

const slug = s => s.toLowerCase().replace(/specifications$/i, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const archiveId = title => 'sx-' + slug(title);

const LAYOUT = l => { const s = (l ?? '').toLowerCase();
  if (s.includes('all-wheel')) return 'AWD';
  if (s.startsWith('mid')) return 'MR';
  if (s.startsWith('rear')) return 'RR';
  if (s.includes('front drive')) return 'FF';
  return 'FR'; };

// Archive sub-groups → the catalog's category vocabulary (used by estimation rules: cg, drag, ride defaults).
const CATEGORY = {
  'Sport coupe/sedan': 'Coupe / performance car', 'Front-engine sport/GT': 'Sports / GT car', 'Mid-/rear-engine sport/GT': 'Sports / GT car',
  'Race vehicles': 'Race car', Stock: 'Coupe / performance car', Modified: 'Modified car',
};

/** '6-speed manual, sequential paddle…' → 'S6'; '5-speed automatic' → 'A5'; '4-speed manual' → 'M4'. */
export function transmissionCode(text) {
  if (!text) return null;
  const n = text.match(/(\d)-speed/)?.[1] ?? '';
  if (/automatic/i.test(text) && !/manual/i.test(text)) return 'A' + n;
  if (/sequential|paddle/i.test(text)) return 'S' + n;
  return (/manual/i.test(text) ? 'M' : '?') + n;
}

const displayName = title => title.replace(/\s*Specifications$/i, '').replace(/\bZO6\b/g, 'Z06').replace(/Ferrari(\d)/, 'Ferrari $1')
  .replace(/^(\d{4}) Ferrari Enzo Ferrari$/, '$1 Ferrari Enzo').replace(/Infinity/, 'Infiniti');

/** Catalog-shaped record ({name, layout, category, transmission, fields:{key:[value, evidence, source, note]}}). */
// Archive pages without a gear table left a single ratio (top gear / 1.00) in the parsed data; a ratio list only
// counts when its length matches the published "n-speed" (or is at least 3 when the speed count is not stated).
export function validGears(r) {
  const n = +(r.trans?.match(/(\d)-speed/)?.[1] ?? 0);
  return r.gears?.length && (n ? r.gears.length === n : r.gears.length >= 3) ? r.gears : null;
}
// Implausible archive road-test values (transcription errors on the original page) are dropped, and listed in VERIFY-BACKLOG.
const plausible = (v, lo, hi) => v != null && v >= lo && v <= hi ? v : null;

export function archiveRecord(r) {
  const F = (v, note = 'As published by Supercar X (2004–08); not re-verified.') => v == null ? undefined : [v, 'historical', r.capture, note];
  const fields = Object.fromEntries(Object.entries({
    weight: F(r.curb, 'Supercar X curb weight (as published).'), front: F(r.front), wheelbase: F(r.wheelbase),
    frontTrack: F(r.trackF), rearTrack: F(r.trackR),
    hp: F(r.hp, r.rating), hpRpm: F(r.hpRpm), torque: F(r.tq, r.rating), torqueRpm: F(r.tqRpm), redline: F(r.redline),
    gears: F(validGears(r)), finalDrive: F(r.axle), tire: F(r.tireR), frontTire: F(r.tireF),
    test60: F(plausible(r.t60, 2, 20), 'Archive road-test 0–60 mph (source test and rollout convention not recorded).'),
    testEt: F(plausible(r.et, 8, 25), 'Archive road-test quarter mile.'), testTrap: F(plausible(r.trap, 50, 220), 'Archive road-test trap speed.'),
  }).filter(([, x]) => x));
  // Manufacturer-sourced values (Work's reviewed reference, 47501c2) take precedence; the archive value is kept for audit.
  for (const [key, [value, evidence, url, note]] of Object.entries(archiveCorrections[archiveId(r.title)] ?? {})) {
    const was = fields[key]?.[0];
    fields[key] = [value, evidence, url, note + (was != null && was !== value ? ` Supercar X published ${was}.` : '')];
  }
  const competition = r.sub === 'Race vehicles';
  return { name: displayName(r.title), year: +(r.title.match(/^(19|20)\d{2}/)?.[0] ?? 0) || null, layout: LAYOUT(r.layout),
    category: CATEGORY[r.sub] ?? 'Coupe / performance car', transmission: transmissionCode(r.trans), transmissionText: r.trans ?? null,
    archive: { group: r.group, sub: r.sub, title: r.title, capture: r.capture, competition, modified: r.sub === 'Modified' }, fields };
}

/** Options to pass to resolveVehicle for an archive id (adds the published suspension text). */
export function archiveResolveOptions(id, extra = {}) {
  const e = archiveCatalog?.[id]; const title = e?.record.archive.title ?? supercarx.find(r => archiveId(r.title) === id)?.title;
  const [typeFront, typeRear] = (supercarxSuspension[title] ?? []).map(x => x === 'No Info' ? null : x);
  return { configId: id, typeFront, typeRear, ...extra };
}

const mergedFor = Object.fromEntries(Object.entries(exactMatches).map(([configId, title]) => [title, configId]));

function tierOf(rec, readiness) {
  if (rec.archive.competition) return { tier: 'historical-reference', why: 'Competition car: racing tires, aero and gearing are outside the street models.' };
  const runs = Object.entries(readiness).filter(([, x]) => x.status !== 'blocked').map(([k]) => k);
  if (runs.includes('acceleration') && runs.includes('tireLoads')) return { tier: 'simulation-ready', runs };
  if (runs.length > 1 || (runs.length === 1 && runs[0] !== 'suspension')) return { tier: 'partial', runs };
  return { tier: 'historical-reference', runs, why: 'Too few published facts for any calculation.' };
}

/** All 75 archive entries: { id, name, record, mergedInto, tier, runs, missing:{tool:[fields]}, estimated:{tool:[fields]} }. */
export let archiveCatalog;
archiveCatalog = Object.fromEntries(supercarx.map(r => {
  const id = archiveId(r.title), record = archiveRecord(r);
  const res = resolveVehicle(record, archiveResolveOptions(id));
  const t = tierOf(record, res.readiness);
  const pick = key => Object.fromEntries(Object.entries(res.readiness).map(([k, x]) => [k, x[key]]).filter(([, a]) => a.length));
  return [id, { id, name: record.name, record, mergedInto: mergedFor[r.title] ?? null, ...t, missing: pick('missing'), estimated: pick('estimated') }];
}));

for (const x of Object.values(archiveCatalog)) x.publishable = !x.mergedInto && !notPublishable(x.id);

/** Archive entries not already represented by a curated vehicle. */
export const archiveVehicles = Object.values(archiveCatalog).filter(x => !x.mergedInto);
/** Archive entries the Lab and specification pages may offer (identity resolved, not withheld). */
export const publishableArchive = archiveVehicles.filter(x => x.publishable);

const norm = s => s.toLowerCase().replace(/[^a-z0-9/]+/g, ' ').trim();

/**
 * One search across curated and archive vehicles. Curated first (best-sourced), archive after,
 * each hit labelled so the UI can say "Supercar X archive · runs acceleration, tire loads".
 * @param catalog  curated catalog {configId: record}
 */
export function searchVehicles(catalog, query = '', { includeReference = true, limit = 50 } = {}) {
  const words = norm(query).split(' ').filter(Boolean);
  const match = name => words.every(w => norm(name).includes(w));
  const curated = Object.entries(catalog).filter(([, r]) => match(r.name)).map(([id, r]) => ({ id, name: r.name, source: 'curated', tier: 'curated' }));
  const order = { 'simulation-ready': 0, partial: 1, 'historical-reference': 2 };
  const arch = archiveVehicles.filter(x => match(x.name) && (includeReference || x.tier !== 'historical-reference'))
    .sort((a, b) => order[a.tier] - order[b.tier] || a.name.localeCompare(b.name))
    .map(x => ({ id: x.id, name: x.name, source: 'archive', tier: x.tier, runs: x.runs ?? [], group: x.record.archive.sub }));
  return [...curated, ...arch].slice(0, limit);
}
