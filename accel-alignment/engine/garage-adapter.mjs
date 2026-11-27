// Adapter for the Vehicle Lab / Garage (Work owns the UI). One call per vehicle gives everything every tool needs.
// Usage:  import { labVehicle, garageComponents } from '../engine/garage-adapter.mjs';
//         const r = labVehicle(configId, { transmission: 'tkx-287-068', engine: 'ls1gto', finalDrive: 3.73 });
//         r.vehicle → same keys as experience/models.mjs (weight, front, wheelbase, cg, hp … gears, finalDrive, diameter,
//         grip, cda, springs …) plus drive, transmission, archFront, archRear.  r.provenance[key].evidence → label.
import { catalog } from '../experience/catalog-data.mjs';
import { resolveVehicle, linkSwapDonors, swapMassChange } from './resolve.mjs';
import { transmissions } from './data/transmissions.mjs';
import { swapEngines, engineFamilyFor } from './data/engines.mjs';
import { applyItems } from './loads.mjs';
import { straightLine } from './acceleration.mjs';
import { archiveCatalog, archiveVehicles, archiveResolveOptions, searchVehicles as search } from './archive.mjs';

linkSwapDonors(catalog);

/** Plain-language evidence labels for the UI. */
export const evidenceLabel = {
  manufacturer: 'Factory spec', independent_test: 'Road test', published: 'Published', calculated: 'Calculated',
  historical: 'Supercar X archive', estimated: 'ESS estimate', owner: 'Your value', missing: 'Missing',
};

export function labVehicle(configId, components = {}, owner = {}) {
  // Curated vehicles first; 'sx-…' ids are Supercar X archive records (evidence 'historical').
  const rec = catalog[configId] ?? archiveCatalog[configId]?.record;
  if (!rec) return null;
  const r = resolveVehicle(rec, catalog[configId] ? { configId, components, owner } : archiveResolveOptions(configId, { components, owner }));
  if (rec.archive) r.archive = { ...rec.archive, tier: archiveCatalog[configId].tier, why: archiveCatalog[configId].why ?? null };
  // Engine swap changes mass too (estimated position), so every tool sees the same modified car.
  if (components.engine && r.vehicle.weight && r.vehicle.front) {
    const to = swapEngines[components.engine]?.family, from = engineFamilyFor(rec.name);
    const move = from && to && from !== to && swapMassChange({ fromFamily: from, toFamily: to, wheelbase: r.vehicle.wheelbase });
    if (move && !Object.hasOwn(owner, 'weight') && !Object.hasOwn(owner, 'front') && Number.isFinite(r.vehicle.wheelbase)) {
      const m = applyItems(r.vehicle, [move]);
      r.vehicle.weight = Math.round(m.weight); r.vehicle.front = +m.front.toFixed(4);
      r.provenance.weight = { evidence: 'estimated', basis: move.basis, change: move };
      r.provenance.front = { evidence: 'estimated', basis: move.basis, change: move };
    }
  }
  return r;
}

/** Straight-line run with the candidate v2 model; returns magazine-style numbers plus the evidence behind them. */
export function labRun(configId, components = {}, owner = {}) {
  const r = labVehicle(configId, components, owner);
  if (!r || r.readiness.acceleration.status === 'blocked') return { blocked: r?.readiness.acceleration.missing ?? ['vehicle'] };
  const run = straightLine(r.vehicle);
  return { ...run.magazine, standstill: { zeroTo60: run.zeroTo60, et: run.finish?.t, trap: run.finish?.trap }, limitedBy: run.time,
    readiness: r.readiness.acceleration, provenance: r.provenance };
}

/** Component lists for the Garage drivetrain picker (replaces experience/components.mjs data, same idea). */
export function garageComponents() {
  return {
    transmission: Object.fromEntries(Object.entries(transmissions).map(([id, t]) => [id, { name: t.name, type: t.type, gears: t.gears,
      evidence: t.evidence, label: evidenceLabel[t.evidence], weight: t.weight ?? null, note: t.note ?? null, sources: t.sources,
      details: t.details, dependencies: t.dependencies }])),
    engine: Object.fromEntries(Object.entries(swapEngines).map(([id, e]) => [id, { name: e.name, from: e.from, family: e.family }])),
  };
}

/** Search curated + archive vehicles in one list (curated first). Each hit: {id, name, source, tier, runs}. */
export const searchVehicles = (query, options) => search(catalog, query, options);

/** Counts for a coverage line, e.g. "53 curated · 70 archive (61 simulation-ready)". */
export function vehicleCoverage() {
  const by = t => archiveVehicles.filter(x => x.tier === t).length;
  return { curated: Object.keys(catalog).length, archive: archiveVehicles.length, simulationReady: by('simulation-ready'), partial: by('partial'), reference: by('historical-reference') };
}
