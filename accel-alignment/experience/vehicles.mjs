import { reference } from './reference.mjs';
import { catalog, sources } from './catalog-data.mjs';
import { tireGrip } from '../engine/acceleration.mjs';
import { labVehicle } from '../engine/garage-adapter.mjs';
import { publishableArchive } from '../engine/archive.mjs';
import { frontArchitectures, rearArchitectures } from '../engine/data/architectures.mjs';

const tireProfiles = {firebird: 'radial70s', mustang: 'perf80s', camaro: 'perf80s', fiero: 'perf80s',
  corvette: 'extreme', miata: 'perf80s', gto: 'uhp'};

const field = (value, title, url, evidence = 'published') => [value, evidence, title, url];
const estimate = (value, note) => [value, 'estimated', note];
const cdCamaro = 'https://www.caranddriver.com/reviews/a69819422/1991-chevrolet-camaro-z28-archive-test/';
const camaroData = 'https://www.teufert.net/camaro/1991.htm';
const fieroBook = 'https://fieroinfo.com/manuals/Fiero_by_Gary_Witzenburg.pdf';
const fieroManual = 'https://www.boomtastic.com/files/01%20Service%20Manuals%2C%20Guides%2C%20and%20Tips/Owners%20Manuals/1988/1988%20Fiero%20Owners%20Manual.pdf';
const fieroCatalog = 'https://www.automobile-catalog.com/car/1988/2850740/pontiac_fiero_gt.html';
const foxBook = 'https://fliphtml5.com/zfxcf/kmgt/The_Complete_Book_of_Ford_Mustang_Every_Model_Since_1964_%C2%BD/169/';
const foxChassis = n => field(n, 'Mike Mueller, 1993 LX V8 coupe (civilian reference)', foxBook);
const camaroTest = (n, evidence = 'independent_test') => field(n, 'Car and Driver, 1991 Camaro Z28 test', cdCamaro, evidence);
const fieroSpecs = n => field(n, 'Gary Witzenburg, Fiero, 1988 specifications', fieroBook);

export const fields = {
  drivetrain: 'Driven wheels', transmission: 'Transmission behavior',
  weight: 'Vehicle weight (lb)', front: 'Static front share (%)', wheelbase: 'Wheelbase (in)',
  archFront: 'Front suspension architecture', archRear: 'Rear suspension architecture',
  frontTrack: 'Front track (in)', rearTrack: 'Rear track (in)', cg: 'CG height (in)',
  hp: 'Peak power (hp)', hpRpm: 'Peak power RPM', torque: 'Peak torque (lb-ft)',
  torqueRpm: 'Peak torque RPM', redline: 'Upshift RPM (model shift point, not the rev limit)', gears: 'Gear ratios',
  finalDrive: 'Final drive', tire: 'Rear tire size', diameter: 'Rear tire diameter (in)',
  grip: 'Launch grip coefficient', cda: 'Drag area (ft²)', frontSpring: 'Front spring (lb/in)',
  rearSpring: 'Rear spring (lb/in)', frontMotion: 'Front motion ratio', rearMotion: 'Rear motion ratio',
  frontUnsprung: 'Front unsprung (lb/corner)', rearUnsprung: 'Rear unsprung (lb/corner)',
  tireRate: 'Tire vertical rate (lb/in)', test60: 'Published 0–60 (s)',
  testEt: 'Published quarter mile (s)', testTrap: 'Published trap (mph)',
};

const supplements = {
  firebird: {
    front: estimate(0.58, 'A scenario value informed by the historical Formula. The W72 Trans Am test car has no verified axle split.'),
    diameter: estimate(27, 'Nominal approximation for the test’s GR70-15.'),
    redline: estimate(5000, 'Illustrative shift ceiling; exact test shift points are unavailable.'),
    cda: estimate(9, 'Illustrative drag area, independent of the Formula’s archive estimate.'),
    frontMotion: estimate(.55, 'Illustrative second-gen control-arm spring installation.'),
  },
  mustang: {
    weight: foxChassis(3035), wheelbase: foxChassis(100.5), frontTrack: foxChassis(56.6), rearTrack: foxChassis(57),
    front: estimate(.57, 'Illustrative Fox front share.'),
    diameter: estimate(24.7, 'Representative Fox V8 tire; SSP test fitment unknown.'),
    gears: estimate([3.35, 1.99, 1.33, 1, .68], 'Representative late Fox T5 ratios; SSP equipment unverified.'),
    finalDrive: estimate(3.08, 'Scenario axle ratio; verify the actual axle tag.'),
    cda: estimate(8, 'Illustrative drag area.'),
  },
  camaro: {
    weight: camaroTest(3329), wheelbase: camaroTest(101, 'published'),
    hp: camaroTest(230, 'published'), hpRpm: camaroTest(4400, 'published'),
    torque: field(300, 'Teufert 1991 Camaro data, LB9 manual', camaroData),
    torqueRpm: field(3200, 'Teufert 1991 Camaro data, LB9 manual', camaroData),
    tire: camaroTest('245/50ZR16', 'published'), test60: camaroTest(6.4),
    testEt: camaroTest(14.9), testTrap: camaroTest(93),
    front: estimate(.56, 'Illustrative third-gen front share.'),
    gears: estimate([2.95, 1.94, 1.34, 1, .63], 'Representative GM T5 gearing; tested gearbox ratios unconfirmed.'),
    finalDrive: estimate(3.45, 'Representative performance axle; exact test ratio unverified.'),
  },
  fiero: {
    weight: field(2791, 'Automobile Catalog, 1988 GT five-speed', fieroCatalog),
    wheelbase: fieroSpecs(93.4), frontTrack: fieroSpecs(57.8), rearTrack: fieroSpecs(58.7),
    hp: fieroSpecs(135), hpRpm: fieroSpecs(4500), torque: fieroSpecs(165), torqueRpm: fieroSpecs(3600),
    gears: field([3.5, 2.05, 1.38, .94, .72], '1988 Pontiac Fiero owner’s manual, GT five-speed', fieroManual, 'manufacturer'),
    finalDrive: field(3.61, '1988 Pontiac Fiero owner’s manual, GT five-speed', fieroManual, 'manufacturer'),
    tire: field('215/60R15', '1988 Pontiac ordering guide, GT', 'https://reloaded.fiero.de/images/ordering.pdf', 'manufacturer'),
    front: estimate(.44, 'Illustrative front load for a mid-engine GT.'),
  },
  corvette: { cda: estimate(7, 'Illustrative drag area.') },
  miata: { front: estimate(.51, 'Illustrative NA Miata front share.'), diameter: estimate(23.1, 'Representative NA tire diameter.'), redline: estimate(7000, 'Illustrative shift ceiling.') },
  gto: { front: estimate(.55, 'Illustrative US GTO front share.'), cda: estimate(8, 'Illustrative drag area.') },
};

export const vehicleIds = ['firebird', 'mustang', 'camaro', 'fiero', 'corvette', 'miata', 'gto'];
const v1Extras = {
  camaro: { name: '1991 Camaro Z28', trim: 'Third-gen LB9 · 5-speed · C/D test car' },
  fiero: { name: '1988 Pontiac Fiero GT', trim: 'Mid-engine L44 V6 · 5-speed' },
};

function tireDiameter(size) {
  const match = size?.match(/^(\d{3})\/(\d{2})Z?R(\d{2})$/);
  return match ? Math.round((+match[3] + 2 * +match[1] * +match[2] / 2540) * 100) / 100 : null;
}

const demoVehicles = Object.fromEntries(vehicleIds.map(id => {
  const meta = reference[id] ?? v1Extras[id];
  const data = { ...meta.published, ...supplements[id] };
  const track = estimate(60, 'Generic track-width placeholder for this prototype.');
  const fallback = {
    cg: estimate(20, 'Common starting point for comparisons. No matching measured CG height.'),
    frontTrack: track, rearTrack: track,
    redline: estimate(6000, 'Illustrative shift ceiling.'),
    grip: estimate(tireGrip[tireProfiles[id]].mu, tireGrip[tireProfiles[id]].label +
      '. Estimated class grip on dry pavement; actual tires and test surface vary.'),
    cda: estimate(7.5, 'Common illustrative drag area.'),
    frontSpring: estimate(350, 'Example spring; measure or enter your own.'),
    rearSpring: estimate(160, 'Example spring; measure or enter your own.'),
    frontMotion: estimate(.75, 'Example spring travel divided by wheel travel.'),
    rearMotion: estimate(1, 'Example spring travel divided by wheel travel.'),
    frontUnsprung: estimate(95, 'Illustrative per-corner unsprung weight.'),
    rearUnsprung: estimate(95, 'Illustrative per-corner unsprung weight.'),
    tireRate: estimate(1400, 'Generic street tire vertical rate.'),
  };
  if (!data.diameter) {
    const diameter = tireDiameter(data.tire?.[0]);
    data.diameter = diameter === null ? estimate(26, 'Generic rear tire diameter.') :
      [diameter, 'calculated', 'Nominal tire sidewall dimensions; loaded radius varies.', data.tire[3]];
  }
  return [id, { name: meta.name, trim: meta.trim, ref: meta.ref, data: { ...fallback, ...data } }];
}));

export const missing = note => [null, 'missing', note ?? 'Add a value from your vehicle.'];
const oldAlias = Object.fromEntries(Object.entries(reference).map(([id, data]) => [data.ref, id]));
const stockBasics = ['weight', 'front', 'wheelbase', 'hp', 'hpRpm', 'torque', 'torqueRpm', 'redline', 'gears', 'finalDrive', 'diameter'];

const catalogDefaults = Object.fromEntries(['cg','frontTrack','rearTrack','grip','cda','frontSpring','rearSpring','frontMotion','rearMotion','frontUnsprung','rearUnsprung','tireRate']
  .map(key => [key, demoVehicles.camaro.data[key][1] === 'estimated' ? demoVehicles.camaro.data[key] : estimate(key === 'cda' ? 7.5 : 60, 'Generic modeling assumption; enter one for this vehicle.')]));
catalogDefaults.grip = estimate(.9, 'Generic dry street-tire scenario; measure or edit for your tires.');
export const customEstimates = {...catalogDefaults};

function sourcedFields(entry) {
  const specs = {};
  for (const [key, [value, kind, source, note]] of Object.entries(entry.fields)) {
    const [title, url] = sources[source] ?? [];
    specs[key] = [value, kind === 'comparable_estimate' ? 'estimated' : kind, title, url, note];
  }
  for (const key of ['hp','torque']) {
    if (/\bgross\b/i.test(specs[key]?.[4] ?? '')) specs[key] = missing('Archive contains a gross rating. Enter a net rating for this model.');
  }
  return specs;
}
export const layoutNames = {FF: 'Front engine / FWD', FR: 'Front engine / RWD', MR: 'Mid engine / RWD', RR: 'Rear engine / RWD', AWD: 'All-wheel drive'};
function resolveReference(ref) {
  const {vehicle, provenance, choices} = labVehicle(ref);
  const values = Object.fromEntries(Object.entries(vehicle).filter(([key]) => key !== 'drive').map(([key, value]) => {
    const {evidence, source, sourceTitle, basis, low, high, sources: publications} = provenance[key];
    const [title, url] = sources[source] ?? [sourceTitle ?? publications?.[0]?.title, publications?.[0]?.url ?? source];
    const range = low != null && high != null ? ` Indicative range ${low}–${high}.` : '';
    return [key, [value, evidence, title || basis, url, (title && basis ? basis : '') + range]];
  }));
  return {values, choices};
}

const provisionVehicle = (entry, ref) => {
  const fallback = Object.fromEntries([...Object.keys(catalogDefaults), ...stockBasics].map(key => [key, missing()]));
  const resolved = resolveReference(ref);
  const data = {...fallback, ...sourcedFields(entry), ...resolved.values};
  data.drivetrain = [entry.layout === 'FF' ? 'FWD' : entry.layout === 'AWD' ? 'AWD' : 'RWD', 'published', layoutNames[entry.layout]];
  return {name: entry.name, trim: entry.body, ref, data, choices: resolved.choices,
    ...Object.fromEntries(['make','generation','category','layout','history','model','year'].map(k => [k, entry[k]]))};
};
const full = Object.fromEntries(Object.entries(catalog)
  .map(([ref, entry]) => [ref, provisionVehicle(entry, ref)]));
// Supercar X archive configurations whose identity is resolved (engine/data/publication.mjs) join the same registry,
// so a specification page, shared link or Garage entry can carry an 'sx-…' id into every tool. Values come from the
// shared resolver with archive / manufacturer / estimate provenance; nothing is re-entered here.
const archiveMake = name => name.replace(/^\d{4}\s+/, '').split(' ')[0];
for (const x of publishableArchive) {
  const rec = x.record;
  full[x.id] = provisionVehicle({name: rec.name, body: rec.archive.sub, layout: rec.layout, category: rec.category,
    make: archiveMake(rec.name), generation: 'Supercar X archive', year: rec.year, fields: {},
    history: [[rec.archive.title, rec.archive.capture, 'archive']]}, x.id);
  full[x.id].archive = {tier: x.tier, competition: rec.archive.competition, modified: rec.archive.modified, capture: rec.archive.capture};
}
for (const id of vehicleIds) {
  const entry = catalog[demoVehicles[id].ref] ?? (id === 'camaro' ?
    {make:'Chevrolet', generation:'Third generation', category:'Coupe / performance car', layout:'FR'} :
    {make:'Pontiac', generation:'First generation', category:'Coupe / performance car', layout:'MR'});
  const {make, generation, category, layout, history} = entry;
  Object.assign(demoVehicles[id], {make, generation, category, layout, history});
  if (demoVehicles[id].ref && catalog[demoVehicles[id].ref]) {
    const {values, choices} = resolveReference(demoVehicles[id].ref);
    for (const key of ['archFront','archRear']) if (values[key]) demoVehicles[id].data[key] = values[key];
    demoVehicles[id].choices = choices;
  }
  demoVehicles[id].data.drivetrain = ['RWD', 'published', layoutNames[layout]];
  demoVehicles[id].data.transmission = ['manual', 'published', 'Reference transmission type'];
}
export const vehicles = {...demoVehicles, ...full,
  custom: {name: 'My custom car', trim: 'Enter your vehicle measurements and drivetrain specifications.', make:'Custom', category:'Custom',
    data: Object.fromEntries([...Object.keys(customEstimates), ...stockBasics, 'drivetrain','transmission'].map(key => [key, missing()]))},
};
export function architectureLabel(key, code) {
  return (key === 'archFront' ? frontArchitectures : rearArchitectures)[code]?.name ?? code;
}

export const browseIds = Object.keys(vehicles).filter(id => id !== 'custom' && !oldAlias[id])
  .sort((a,b) => vehicles[a].make.localeCompare(vehicles[b].make) || vehicles[a].name.localeCompare(vehicles[b].name));

export function stock(id) {
  return Object.fromEntries(Object.entries(vehicles[id].data).map(([key, info]) => [key, info[0]]));
}
