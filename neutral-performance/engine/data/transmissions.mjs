import { transmissionAdditions, exactTransmissionApplications } from './transmission-additions.mjs';
// ESS component library — transmissions (gear sets, type, weight).
// Evidence tiers used across the library:
//   'manufacturer'  maker's own document or parts listing
//   'published'     secondary publication or parts retailer quoting the maker; checked against a second source where noted
//   'historical'    Supercar X archive (owner's 2004–08 site), unverified
//   'estimated'     ESS rule or range, shown with its basis
//   'owner'         entered by the visitor or measured by ESS
// Ratios are listed first gear first. Weights are dry and without torque converter unless `basis` says otherwise.

const S = {
  randys: { title: "Randy's Worldwide, Muncie transmission ID", url: 'https://www.randysworldwide.com/import_export/Muncie_Trans_ID.pdf' },
  jalopnik: { title: 'Jalopnik, Muncie M20/M21/M22 differences', url: 'https://jalopnik.com/2088022/difference-between-muncie-m20-m21-m22-transmissions/' },
  gmhq: { title: '700R4 Transmission HQ, GM automatic ratios', url: 'https://www.700r4transmissionhq.com/gm-automatic-transmissions/' },
  chevelle: { title: 'Chevellestuff, GM transmission ratio drop chart', url: 'https://chevellestuff.net/tech/trans_ratio_drop.html' },
  chevyPerf: { title: 'Chevrolet Performance, transmissions', url: 'https://www.chevrolet.com/performance-parts/transmissions' },
  gmPS: { title: 'GM Powered Solutions, 8L90', url: 'https://poweredsolutions.gm.com/products/8l90-8-speed-transmission/' },
  gmAuth10: { title: 'GM Authority, 10LXX vs 8LXX ratios', url: 'https://gmauthority.com/blog/gm/gm-transmissions/10lxx/' },
  autoWorld: { title: 'Automotive World, 8L90 vs 6L80 ratios (GM release)', url: 'https://www.automotiveworld.com/?p=220302' },
  torqueflite: { title: 'Wikipedia, TorqueFlite', url: 'https://en.wikipedia.com/wiki/Torqueflite' },
  f150hub: { title: 'F150Hub, Ford transmission ratio chart', url: 'https://www.f150hub.com/trans/ford-transmission-ratios.html' },
  lmrAuto: { title: 'LMR, Mustang automatic transmission specs', url: 'https://lmr.com/products/Mustang-Automatic-Transmission-Upgrades-Specs' },
  blueoval: { title: 'BlueOvalTrucks, Ford transmission ratios', url: 'https://www.blueovaltrucks.com/?p=570' },
  gearstar: { title: 'Gearstar, Ford automatics (weights without fluid or converter)', url: 'https://gearstar.com/blog/automatic-for-the-people' },
  lmrT5: { title: 'LMR, Mustang T5 transmission specs', url: 'https://lmr.com/products/mustang-t5-transmission-specs' },
  mdT5: { title: 'Modern Driveline, the many faces of the T5', url: 'https://www.moderndriveline.com/?p=37383' },
  amT5: { title: 'AmericanMuscle, Fox-body transmissions', url: 'https://www.americanmuscle.com/understanding-foxbody-transmissions.html' },
  fordTkx: { title: 'Ford Performance, TREMEC TKX-600 (.81 OD)', url: 'https://www.ford.com/product/tremec-tkx600-5-speed-transmission-81-overdrive-p2863594770' },
  tremecTkx: { title: 'TREMEC TKX parts manual', url: 'https://tremec.com/wp-content/uploads/2023/05/TKX-Parts-Manual_04.05.2021-1.pdf' },
  tremecMag: { title: 'TREMEC, Magnum (135 lb dry; 2.66 or 2.97 sets)', url: 'https://www.tremec.com/menu.php?m=104' },
  malwood: { title: 'Malwood Auto, TREMEC aftermarket gear ratios', url: 'https://malwoodauto.com.au/blogs/news/tremec-aftermarket-manual-transmission-gear-ratios' },
  weightLib: { title: 'ESS component weight library v5 (Gomog transmission table)', url: 'ess-knowledge archive/kb-v1.0.2/corpus/…component_weight_library_v5' },
  oocities: { title: 'Mustang T-5 vs TREMEC comparison (77 / 100 lb)', url: 'https://www.oocities.org/2bav8/compare.html' },
};
const src = (...keys) => keys.map(k => S[k]);
const tkxManual = { title: 'TREMEC TKX service manual', url: 'https://tremec.com/wp-content/uploads/2023/05/TKX-Service-Manual_04.05.2021.pdf' };
const tkxWeight = { value: 99, evidence: 'manufacturer', basis: 'dry gearbox, before installation', boundary: 'dry-gearbox', sources: [tkxManual] };
const magnumGuide = { title: 'TREMEC Magnum installation guide', url: 'https://tremec.com/wp-content/uploads/2023/05/TREMEC_Magnum_Installation.Tips_.pdf' };
const magnumDependencies = { source: magnumGuide, checks: ['Clutch and bellhousing alignment', 'Mount and crossmember', 'Driveshaft and slip yoke', 'Fluid and shifter position'] };


export const transmissions = {
  // ---------- GM manual ----------
  'muncie-m20-66': { name: 'Muncie M20 wide-ratio 4-speed (1966–74)', type: 'manual', gears: [2.52, 1.88, 1.46, 1],
    evidence: 'published', sources: src('randys', 'jalopnik'), weight: { low: 75, high: 90, evidence: 'estimated', basis: 'Aluminum-case Muncie; library lists a GM Saginaw 4-speed at 82 lb. Measure before use.' } },
  'muncie-m20-63': { name: 'Muncie M20 wide-ratio 4-speed (1963–65)', type: 'manual', gears: [2.56, 1.91, 1.48, 1],
    evidence: 'published', sources: src('randys', 'jalopnik') },
  'muncie-m21': { name: 'Muncie M21 close-ratio 4-speed', type: 'manual', gears: [2.2, 1.64, 1.28, 1],
    evidence: 'published', sources: src('randys', 'jalopnik') },
  'muncie-m22': { name: 'Muncie M22 "Rock Crusher" close-ratio 4-speed', type: 'manual', gears: [2.2, 1.64, 1.28, 1],
    evidence: 'published', sources: src('randys', 'jalopnik'), note: 'Same ratios as the M21; heavier-duty, lower-helix gears.' },
  'super-t10-243': { name: 'Borg-Warner Super T-10 (2.43 first)', type: 'manual', gears: [2.43, 1.61, 1.23, 1],
    evidence: 'manufacturer', sources: [{ title: 'ESS vehicle reference, 1977 Trans Am W72 record', url: 'https://www.gm.com/content/dam/company/no_search/heritage-archive-docs/vehicle-information-kits/chevrolet/2002-Chevrolet-Camaro.pdf' }],
    weight: { value: 92, evidence: 'published', basis: 'Chevrolet-pattern Super T-10, unspecified dryness', sources: src('weightLib') } },
  't56-fbody': { name: 'T56 6-speed, 1998–2002 LS1 F-body', type: 'manual', gears: [2.66, 1.78, 1.3, 1, .74, .5],
    evidence: 'manufacturer', sources: [{ title: 'ESS vehicle reference, 2002 Camaro SS (GM)', url: 'https://www.gm.com/content/dam/company/no_search/heritage-archive-docs/vehicle-information-kits/chevrolet/2002-Chevrolet-Camaro.pdf' }] },
  't56-magnum-266': { name: 'TREMEC T56 Magnum, 2.66 first (.80/.63)', type: 'manual', gears: [2.66, 1.78, 1.3, 1, .8, .63],
    evidence: 'manufacturer', sources: src('chevyPerf', 'malwood', 'tremecMag'), weight: { value: 135, evidence: 'manufacturer', basis: 'dry gearbox, before installation', boundary: 'dry-gearbox', sources: src('tremecMag') }, dependencies: magnumDependencies },
  't56-magnum-297': { name: 'TREMEC T56 Magnum, 2.97 first (.74/.50)', type: 'manual', gears: [2.97, 2.1, 1.46, 1, .74, .5],
    evidence: 'published', sources: src('malwood', 'tremecMag'), weight: { value: 135, evidence: 'manufacturer', basis: 'dry gearbox, before installation', boundary: 'dry-gearbox', sources: src('tremecMag') }, dependencies: magnumDependencies },
  'tkx-287-068': { name: 'TREMEC TKX, 2.87 first / .68 fifth', type: 'manual', gears: [2.87, 1.89, 1.28, 1, .68],
    evidence: 'manufacturer', sources: [tkxManual, ...src('tremecTkx', 'malwood')], weight: tkxWeight },
  'tkx-287-081': { name: 'TREMEC TKX, 2.87 first / .81 fifth', type: 'manual', gears: [2.87, 1.89, 1.28, 1, .81],
    evidence: 'manufacturer', sources: [tkxManual, ...src('fordTkx')], weight: tkxWeight },
  'tkx-327-072': { name: 'TREMEC TKX, 3.27 first / .72 fifth', type: 'manual', gears: [3.27, 1.98, 1.34, 1, .72],
    evidence: 'manufacturer', sources: [tkxManual, ...src('tremecTkx')], weight: tkxWeight },
  'tr6060-mm6': { name: 'TREMEC TR6060 close-ratio (GM MM6)', type: 'manual', gears: [2.66, 1.78, 1.3, 1, .74, .5],
    evidence: 'published', sources: [{ title: 'Camaro5 forum, MM6 vs M10 ratios', url: 'https://www.camaro5.com/forums/showthread.php?p=5531850' },
      { title: 'Motor Matchup, 2015 Camaro Z/28 drivetrain', url: 'https://www.motormatchup.com/catalog/Chevrolet/Camaro/2015/Z+28-2DR-Coupe' }],
    note: 'GM MM6 ratios, used since the 1994 LT1 F-body; the 2015 Z/28 pairs them with a 3.91 axle. Secondary sources; verify with a GM spec sheet.' },
  'tr6060-m10': { name: 'TREMEC TR6060 (GM M10, 2010–15 Camaro SS)', type: 'manual', gears: [3.01, 2.07, 1.43, 1, .84, .57],
    evidence: 'published', sources: [{ title: 'Wikipedia, TREMEC TR-6060 (cites GM)', url: 'https://en.wikipedia.com/wiki/TR-6060' }] },
  // ---------- Ford manual ----------
  'mt82-d4-gt': { name: 'Getrag MT82-D4, 2018+ Mustang GT', type: 'manual', gears: [3.24, 2.1, 1.42, 1, .81, .62],
    evidence: 'published', sources: [{ title: 'CJ Pony Parts, 2018 Mustang transmission ratios', url: 'https://www.cjponyparts.com/resources/top-5-reasons-to-buy-2018-mustang' },
      { title: 'Mustang6G forum, Ford Performance Techline ratios', url: 'https://www.mustang6g.com/forums/goto/post?id=2061994' }],
    note: 'Sixth gear .62 (Ford Techline) — CJ table truncated at fifth; verify against a Ford workshop manual.' },
  'mt82-gt-2011': { name: 'Getrag MT82, 2011–17 Mustang GT', type: 'manual', gears: [3.66, 2.43, 1.69, 1.31, 1, .65],
    evidence: 'manufacturer', sources: [{ title: '2014 Mustang Workshop Manual, MT82 specifications (123.5 lb dry)', url: 'https://reichwein.it/manuals/Mustang_2014/Workshop_Manual_Wiring_Diagrams/Resources/Service_Manual/seb83a01.htm' }],
    weight: { value: 123.5, evidence: 'manufacturer', basis: 'dry (Ford workshop manual)', boundary: 'dry-gearbox' } },
  't5-wc-v8': { name: 'Borg-Warner T5 World Class, 5.0 Mustang (1985–93)', type: 'manual', gears: [3.35, 1.93, 1.29, 1, .68],
    evidence: 'published', sources: src('lmrT5', 'mdT5', 'amT5'), weight: { value: 78, evidence: 'published', basis: 'Ford-pattern T-5, unspecified', sources: src('weightLib') } },
  't5-nwc': { name: 'Borg-Warner T5 non-World Class (1983–84)', type: 'manual', gears: [2.95, 1.94, 1.34, 1, .73],
    evidence: 'published', sources: src('lmrT5'), note: 'Overdrive reported as .73 (LMR) or .63 (AmericanMuscle); verify the tag.' },
  't5z': { name: 'T5 "Z-spec" (2.95 first / .63)', type: 'manual', gears: [2.95, 1.94, 1.34, 1, .63],
    evidence: 'published', sources: src('oocities', 'mdT5'), weight: { value: 77, evidence: 'published', basis: 'unspecified', sources: src('oocities') } },
  // ---------- GM automatic ----------
  'powerglide': { name: 'GM Powerglide 2-speed', type: 'automatic', gears: [1.76, 1], evidence: 'published', sources: src('gmhq', 'chevelle'),
    note: 'Most common first gear 1.82; 1.76 on performance models.' },
  'th350': { name: 'GM Turbo 350', type: 'automatic', gears: [2.52, 1.52, 1], evidence: 'published', sources: src('gmhq', 'chevelle') },
  'th400': { name: 'GM Turbo 400', type: 'automatic', gears: [2.48, 1.48, 1], evidence: 'published', sources: src('chevelle') },
  '200-4r': { name: 'GM 200-4R', type: 'automatic', gears: [2.74, 1.57, 1, .67], evidence: 'published', sources: src('gmhq', 'chevelle') },
  '4l60e': { name: 'GM 700R4 / 4L60E', type: 'automatic', gears: [3.06, 1.62, 1, .7], evidence: 'manufacturer', sources: src('chevyPerf', 'gmhq'),
    note: 'Second gear published as 1.62 (Chevrolet Performance) and 1.63 elsewhere.' },
  '4l80e': { name: 'GM 4L80E / 4L85E', type: 'automatic', gears: [2.48, 1.48, 1, .75], evidence: 'published', sources: src('chevelle', 'chevyPerf') },
  '6l80': { name: 'GM 6L80 / 6L90', type: 'automatic', gears: [4.03, 2.36, 1.53, 1.15, .85, .67], evidence: 'manufacturer', sources: src('autoWorld', 'chevyPerf'),
    note: 'GM release lists 4.03 first; Chevrolet Performance lists 4.02.' },
  '8l90': { name: 'GM 8L90 / 8L80', type: 'automatic', gears: [4.56, 2.97, 2.08, 1.69, 1.27, 1, .85, .65], evidence: 'manufacturer', sources: src('gmPS', 'chevyPerf') },
  '10l80': { name: 'GM/Ford 10-speed (10L80/10L90/10R80)', type: 'automatic', gears: [4.7, 2.99, 2.15, 1.8, 1.52, 1.28, 1, .85, .69, .64],
    evidence: 'published', sources: src('gmAuth10', 'blueoval'), note: 'Fourth gear 1.80 (GM Authority, Ford) vs 1.77 in a 2017 ZL1 road-test sheet.' },
  // ---------- Chrysler / Ford automatic ----------
  'torqueflite-727': { name: 'Chrysler TorqueFlite A727 / A904', type: 'automatic', gears: [2.45, 1.45, 1], evidence: 'published', sources: src('torqueflite') },
  'ford-c4': { name: 'Ford C4', type: 'automatic', gears: [2.46, 1.46, 1], evidence: 'published', sources: src('f150hub', 'lmrAuto'),
    weight: { value: 110, evidence: 'published', basis: 'without fluid or converter', sources: src('gearstar') } },
  'ford-c6': { name: 'Ford C6', type: 'automatic', gears: [2.46, 1.46, 1], evidence: 'published', sources: src('f150hub', 'blueoval'),
    weight: { value: 140, evidence: 'published', basis: 'without fluid or converter (library: 171–202 lb, basis unclear)', sources: src('gearstar', 'weightLib') } },
  'ford-aod': { name: 'Ford AOD / AOD-E', type: 'automatic', gears: [2.4, 1.47, 1, .67], evidence: 'published', sources: src('lmrAuto', 'f150hub'),
    weight: { value: 150, evidence: 'published', basis: 'without fluid or converter', sources: src('gearstar') } },
  'ford-4r70w': { name: 'Ford 4R70W', type: 'automatic', gears: [2.84, 1.55, 1, .7], evidence: 'published', sources: src('f150hub') },
};

/** Typical torque-converter model inputs for automatics (estimates, for the simulator's coupling). */
export const converterDefaults = { stallRpm: { low: 1800, value: 2200, high: 2800 }, multiplication: { low: 1.8, value: 2.0, high: 2.3 },
  evidence: 'estimated', basis: 'Typical stock street converters; measured stall and converter data override.' };

/** Which library gearbox each reference vehicle uses (only where the record's transmission is identified). */
export const vehicleTransmission = {
  'chevrolet-camaro-4th-gen--2002-ss-ls1-m6-coupe': { id: 't56-fbody', basis: '2002 Chevrolet information kit, factory V8 six-speed gear stack.' },
  'chevrolet-chevelle-2nd-gen--1970-ss-454-ls6-m22-coupe': { id: 'muncie-m22', basis: 'Record name: M22 four-speed' },
  'dodge-challenger-1st-gen--1970-rt-426-hemi-a3-3.23-hardtop-drums': { id: 'torqueflite-727', basis: 'Hemi automatics used the A727' },
  'ford-mustang-1st-gen--1969-mach-1-428-a3-3.91-sportsroof': { id: 'ford-c6', basis: '428 Cobra Jet automatic used the C6' },
  'buick-regal-g-body--1987-grand-national-lc2-a4-coupe': { id: '200-4r', basis: 'Grand National four-speed automatic was the 200-4R' },
  'gmc-syclone-s-series--1991-syclone-4.3-a4-regular-cab-awd': { id: '4l60e', basis: 'Syclone used the 700R4/4L60 family' },
  'chevrolet-camaro-1st-gen--1969-z28-302-m4-3.73-sport-coupe': { id: 'muncie-m21', basis: 'First-generation Z/28s came only with the close-ratio M21 (Ate Up With Motor; Fast Lane Cars).' },
  'chevrolet-camaro-5th-gen--2015-z28-ls7-m6-coupe': { id: 'tr6060-mm6', basis: 'Z/28 used the close-ratio MM6 TR6060 with 3.91 axle (secondary sources).' },
  'ford-mustang-s550--2018-gt-pp2-5.0-m6-fastback': { id: 'mt82-d4-gt', basis: '2018 Mustang GT manual is the MT82-D4.' },
  'pontiac-gto-1st-gen--1965-tri-power-389-m4-hardtop': { id: 'muncie-m21', basis: 'Assumed close-ratio four-speed, as in the Car Life Tri-Power test car; wide-ratio M20 also offered.' },
  'ford-mustang-fox--1993-lx-ssp-5.0-m5-notchback': { id: 't5-wc-v8', basis: '1990–93 5.0 used the World Class T5 3.35 gear set' },
  'chevrolet-silverado-1500-t1--2022-zr2-l87-a10-crew-cab-4wd': { id: '10l80', basis: '6.2 L87 trucks use the 10-speed 10L80' },
};
/** Vehicles whose gearbox family is known but whose ratio option varied: offered as choices, not filled. */
export const vehicleTransmissionChoices = {
  'chevrolet-chevy-ii-2nd-gen--1966-nova-ss-l79-m4-sport-coupe': ['muncie-m20-66', 'muncie-m21'],
  'pontiac-gto-1st-gen--1965-tri-power-389-m4-hardtop': ['muncie-m21', 'muncie-m20-63'],
};

Object.assign(transmissions, transmissionAdditions);
Object.assign(vehicleTransmission, exactTransmissionApplications);
