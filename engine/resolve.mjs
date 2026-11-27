// ESS engineering library — one resolver: vehicle record + selected components + owner entries → a simulator-ready
// vehicle with per-field provenance, plus which simulators can run and on what evidence.
// Precedence per field: owner > selected component > record > Supercar X exact match > library mapping > estimate.
import { transmissions, vehicleTransmission, vehicleTransmissionChoices } from './data/transmissions.mjs';
import { swapEngines, engineFamilies, engineFamilyFor, grossToNet, ratingConvention } from './data/engines.mjs';
import { finalDriveChoices } from './data/axles.mjs';
import { architectureFor } from './data/architectures.mjs';
import { supercarx, exactMatches } from './data/supercarx.mjs';
import { recovered } from './data/recovered.mjs';
import { tireClassFor, tireClasses, parseTire } from './tires.mjs';
import * as rules from './estimates.mjs';
import { springForFrequency } from './loads.mjs';

export const VERIFIED = new Set(['manufacturer', 'independent_test', 'published', 'calculated', 'owner']);
export const SIMULATORS = {
  acceleration: ['weight', 'front', 'wheelbase', 'cg', 'hp', 'hpRpm', 'torque', 'torqueRpm', 'redline', 'gears', 'finalDrive', 'diameter', 'grip', 'cda'],
  tireLoads: ['weight', 'front', 'wheelbase', 'cg', 'frontTrack', 'rearTrack'],
  ride: ['weight', 'front', 'frontSpring', 'rearSpring', 'frontMotion', 'rearMotion', 'frontUnsprung', 'rearUnsprung', 'tireRate'],
  suspension: ['archFront', 'archRear'],
};
// Typical ride frequencies (Hz) used to estimate springs when no rate is known.
const RIDE_HZ = { truck: [1.1, 1.3], sports: [1.6, 1.8], car: [1.3, 1.45] };

const yearOf = name => +(String(name).match(/(19|20)\d{2}/)?.[0] ?? 0) || null;

function historicalFor(configId) {
  const title = exactMatches[configId];
  const r = title && supercarx.find(x => x.title === title);
  if (!r) return {};
  const h = (value, label) => value == null ? undefined : [value, 'historical', `Supercar X archive: ${r.title}`, r.capture, label];
  return { weight: h(r.curb), front: h(r.front), wheelbase: h(r.wheelbase), frontTrack: h(r.trackF), rearTrack: h(r.trackR),
    redline: h(r.redline), gears: h(r.gears?.length ? r.gears : null), finalDrive: h(r.axle), tire: h(r.tireR) };
}

/**
 * @param record  catalog entry {name, layout, category, transmission, fields:{key:[value, evidence, source, note]}}
 * @param opts    { configId, components: { transmission, engine, finalDrive, tireClass }, owner: { key: value } }
 */
export function resolveVehicle(record, { configId, components = {}, owner = {}, typeFront, typeRear } = {}) {
  const year = record.year ?? yearOf(record.name);
  const out = {}, prov = {};
  const set = (key, value, evidence, basis, extra = {}) => { if (value == null || out[key] != null) return; out[key] = value; prov[key] = { evidence, basis, ...extra }; };
  const fromRecord = key => { const original = record.fields?.[key]; const f = original?.[0] != null ? original : recovered[configId]?.[key];
    if (f) set(key, f[0], f[1] === 'comparable_estimate' ? 'estimated' : f[1], f[4] ?? (original === f ? f[3] : null), { source: original === f ? f[2] : f[3] ?? f[2], sourceTitle: original === f ? undefined : f[2] }); };

  // 1. owner entries
  for (const [k, v] of Object.entries(owner)) set(k, v, 'owner', 'Entered by the visitor or measured by ESS.');
  // 2. selected components
  const trans = components.transmission && transmissions[components.transmission];
  if (trans) set('gears', trans.gears, trans.evidence, trans.name, { component: components.transmission, sources: trans.sources });
  if (components.finalDrive) set('finalDrive', components.finalDrive, 'owner', 'Selected axle ratio.');
  const swap = components.engine && swapEngines[components.engine];
  // 3. record, 4. Supercar X exact match, 5. library mapping
  for (const k of ['weight', 'front', 'wheelbase', 'frontTrack', 'rearTrack', 'cg', 'hp', 'hpRpm', 'torque', 'torqueRpm', 'redline', 'gears', 'finalDrive', 'cda', 'frontSpring', 'rearSpring', 'frontMotion', 'rearMotion'])
    if (!(swap && ['hp', 'hpRpm', 'torque', 'torqueRpm', 'redline'].includes(k))) fromRecord(k);
  const hist = historicalFor(configId);
  for (const [k, h] of Object.entries(hist)) if (h && k !== 'tire') set(k, h[0], 'historical', h[2], { source: h[3] });
  const mapped = vehicleTransmission[configId];
  if (mapped) { const t = transmissions[mapped.id]; set('gears', t.gears, t.evidence, `${t.name}. ${mapped.basis}`, { component: mapped.id, sources: t.sources }); }
  const fd = finalDriveChoices[configId];
  if (fd) set('finalDrive', fd.default, 'estimated', `${fd.basis}; default ${fd.default} until the axle tag is known.`, { options: fd.options });

  // engine swap: ratings from the donor record
  if (swap) for (const k of ['hp', 'hpRpm', 'torque', 'torqueRpm', 'redline']) { const d = swap.donor?.fields?.[k]; if (d) set(k, d[0], d[1], `${swap.name} (donor rating)`, { component: components.engine }); }

  // gross → net for classic ratings
  const conv = ratingConvention(year, `${record.fields?.hp?.[3] ?? ''} ${record.fields?.torque?.[3] ?? ''}`);
  if (conv === 'gross' && !swap && out.hp != null && prov.hp.evidence !== 'owner') {
    for (const k of ['hp', 'torque'].filter(key => Number.isFinite(out[key]))) { prov[k] = { ...prov[k], ratedGross: out[k], evidence: 'estimated',
      basis: `Published SAE gross ${out[k]} × ${grossToNet.value} (net ≈ ${grossToNet.low}–${grossToNet.high}× gross). ${grossToNet.basis}` }; out[k] = Math.round(out[k] * grossToNet.value); }
  }

  // tires
  const tireSize = (record.layout === 'FF' ? record.fields?.frontTire?.[0] : record.fields?.tire?.[0]) ?? hist.tire?.[0];
  const parsed = parseTire(tireSize);
  if (parsed) set('diameter', parsed.diameter, parsed.evidence, `${tireSize}: ${parsed.note}`);
  const tc = components.tireClass ? { id: components.tireClass, ...tireClasses[components.tireClass], evidence: 'owner' } : tireClassFor({ year, tire: tireSize, category: record.category });
  set('grip', tc.mu, tc.evidence, `${tc.label} (tire-type default; see acceleration validation).`, { tireClass: tc.id });

  // architecture
  const arch = architectureFor(configId, typeFront, typeRear);
  const archEv = arch.evidence === 'record' ? (record.archive ? 'historical' : 'manufacturer') : arch.evidence;
  set('archFront', arch.front, archEv, arch.basis);
  set('archRear', arch.rear, archEv, arch.basis);

  // 6. estimates
  const ctx = { layout: record.layout, category: record.category, year, torque: out.torque ?? 0, name: record.name, hpRpm: out.hpRpm, wheelbase: out.wheelbase, tire: tireSize };
  const put = (k, e) => e && set(k, e.value, e.evidence, e.basis, { low: e.low, high: e.high });
  put('front', rules.frontShare(ctx));
  if (out.hpRpm) put('redline', rules.redline(ctx));
  if (out.wheelbase) { const t = rules.track(ctx); put('frontTrack', t); put('rearTrack', t); }
  put('cg', rules.cgHeight(ctx)); put('cda', rules.dragArea(ctx));
  if (!out.diameter) put('diameter', { value: /pickup|truck/i.test(record.category) ? 29 : 25.5, low: 24, high: 31, evidence: 'estimated', basis: 'No tire size on record: typical diameter for the vehicle type.' });
  const rd = rules.rideDefaults({ archFront: out.archFront, archRear: out.archRear });
  for (const k of ['frontMotion', 'rearMotion', 'frontUnsprung', 'rearUnsprung']) put(k, rd[k]);
  set('tireRate', /pickup|truck/i.test(record.category) ? 1800 : 1400, 'estimated', 'Typical tire vertical rate for the vehicle type.', { low: 1000, high: 2400 });
  if (out.weight && out.front && out.frontMotion && out.rearMotion) {
    const kind = /pickup|truck/i.test(record.category) ? 'truck' : /roadster|sports/i.test(record.category) || ['MR', 'RR'].includes(record.layout) ? 'sports' : 'car';
    const [hf, hr] = RIDE_HZ[kind];
    const spring = (corner, uns, motion, hz) => Math.round(springForFrequency({ cornerLb: corner, unsprung: uns, motion, tireRate: out.tireRate, hz }) ?? 0) || null;
    const fs = spring(out.weight * out.front / 2, out.frontUnsprung, out.frontMotion, hf), rs = spring(out.weight * (1 - out.front) / 2, out.rearUnsprung, out.rearMotion, hr);
    set('frontSpring', fs, 'estimated', `Spring giving a typical ${hf} Hz front ride frequency (${kind}).`);
    set('rearSpring', rs, 'estimated', `Spring giving a typical ${hr} Hz rear ride frequency (${kind}).`);
  }

  // driven axle and transmission type, used by the acceleration model
  out.drive = record.layout === 'AWD' ? 'all' : record.layout === 'FF' ? 'front' : 'rear';
  prov.drive = { evidence: 'manufacturer', basis: `Layout ${record.layout}` };
  const transType = owner.transmission ?? trans?.type ?? (/dual.clutch|\b(?:PDK|DSG)\b/i.test(record.name) ? 'dual-clutch' : null) ?? (mapped && transmissions[mapped.id].type) ?? (/^A/.test(record.transmission ?? '') ? 'automatic' : 'manual');
  out.transmission = transType; prov.transmission = { evidence: owner.transmission ? 'owner' : 'published', basis: `Record transmission code ${record.transmission ?? '—'}` };

  // readiness
  const readiness = {};
  for (const [sim, req] of Object.entries(SIMULATORS)) {
    const missing = req.filter(k => out[k] == null);
    const estimated = req.filter(k => out[k] != null && !VERIFIED.has(prov[k].evidence) && prov[k].evidence !== 'historical');
    const historical = req.filter(k => prov[k]?.evidence === 'historical');
    readiness[sim] = { status: missing.length ? 'blocked' : estimated.length ? 'estimated' : historical.length ? 'historical' : 'verified', missing, estimated, historical };
  }
  const choices = { transmission: vehicleTransmissionChoices[configId] ?? null, finalDrive: fd?.options ?? null };
  return { name: record.name, year, vehicle: out, provenance: prov, readiness, choices, engineFamily: engineFamilyFor(record.name) };
}

/** Attach donor records to the swap-engine list (call once with the catalog). */
export function linkSwapDonors(catalog) {
  for (const s of Object.values(swapEngines)) s.donor = catalog[s.from];
  return swapEngines;
}

/** Mass change from swapping engine or transmission families (estimated positions; owner can measure). */
export function swapMassChange({ fromFamily, toFamily, wheelbase }) {
  const w = f => engineFamilies[f]?.weight; const a = w(fromFamily), b = w(toFamily);
  if (!a || !b) return null;
  const mid = x => x.value ?? (x.low + x.high) / 2;
  return { label: `Engine ${engineFamilies[fromFamily].name} → ${engineFamilies[toFamily].name}`, oldWeight: mid(a), newWeight: mid(b), oldX: 8, newX: 8,
    evidence: a.evidence === 'published' && b.evidence === 'published' ? 'published' : 'estimated',
    basis: 'Engine centre of mass assumed 8 in behind the front axle (estimate, 0–16 in). Dressed weights from the component library.', wheelbase };
}
