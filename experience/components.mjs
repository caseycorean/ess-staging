// Browser-facing views of the shared engineering component records.
import { garageComponents, labVehicle } from '../engine/garage-adapter.mjs';
import { tireClasses } from '../engine/tires.mjs';
import { engineFamilies } from '../engine/data/engines.mjs';
import { catalog, sources } from './catalog-data.mjs';

const library = garageComponents();
const engineKeys = ['hp','hpRpm','torque','torqueRpm','redline'];
const engines = Object.fromEntries(Object.entries(library.engine).flatMap(([id, item]) => {
  const donor = labVehicle(item.from);
  if (!donor) return [];
  const values = Object.fromEntries(engineKeys.flatMap(key => Number.isFinite(donor.vehicle[key]) ? [[key, donor.vehicle[key]]] : []));
  const estimated = engineKeys.filter(key => donor.provenance[key]?.evidence === 'estimated');
  const source = sources[catalog[item.from]?.fields.hp?.[2]]?.[1];
  const mass = engineFamilies[item.family]?.weight ?? null;
  return [[id, {...item, values, estimated, url: source, mass, evidence: 'published',
    note: 'Donor ratings and shift ceiling. Installation mass and position depend on the swap.'}]];
}));
const transmissions = Object.fromEntries(Object.entries(library.transmission).map(([id, item]) => [id, {
  ...item, values:{gears:item.gears, transmission:item.type}, mass:item.weight, url:item.sources?.find(source => source.url?.startsWith('https://'))?.url,
}]));

// Preserve previously shared identifiers and the distinct second-gear ratio from the 1999 Camaro reference.
const aliases = {t56ss: 't56-fbody', tkx287: 'tkx-287-068', tkx327: 'tkx-327-072', gm4l60: '4l60e'};
for (const [id, canonical] of Object.entries(aliases)) {
  const item = transmissions[canonical];
  transmissions[id] = {...item, hidden:true};
}
transmissions.gm4l60 = {...transmissions.gm4l60, name:'GM 4L60E · 1999 Camaro V8 automatic',
  values:{gears:[3.06,1.63,1,.7], transmission:'automatic'},
  url:'https://news.chevrolet.com/content/dam/company/no_search/heritage-archive-docs/vehicle-information-kits/chevrolet/1999-Chevrolet-Camaro.pdf'};

export const componentLabels = {engine: 'Engine', transmission: 'Transmission', tireClass: 'Tire grip assumption'};
export const components = {
  engine: engines,
  transmission: transmissions,
  tireClass: Object.fromEntries(Object.entries(tireClasses).map(([id,item]) => [id, {
    name: item.label, evidence:'estimated', values:{grip:item.mu}, estimated:['grip'],
    note:'Scenario grip setting. Actual grip depends on the tire, surface and conditions.',
  }])),
};

const selected = setup => Object.entries(setup.components ?? {}).map(([kind,id]) => components[kind]?.[id]).filter(Boolean);

export function componentOverrides(setup) {
  return Object.assign({}, ...selected(setup).map(spec => spec.values));
}

export function componentProvenance(setup) {
  return Object.assign({}, ...selected(setup).map(spec =>
    Object.fromEntries(Object.keys(spec.values).map(key => [key, spec.estimated?.includes(key) ? 'estimated' : 'component']))));
}
