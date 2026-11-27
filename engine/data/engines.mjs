// ESS component library — engines. Ratings come from the vehicle reference records (one engine per record);
// this file adds engine families (installed weight, rating convention) and the swap engines offered in the Garage.
const lib = { title: 'ESS component weight library v5', url: 'ess-knowledge archive/kb-v1.0.2/corpus/…component_weight_library_v5' };
const teardown = { title: 'ESS LS1 teardown weight log (2004 GTO donor)', url: 'ess-knowledge archive/kb-v1.0.2/corpus/…LS1_Teardown_Weight_Log' };

export const engineFamilies = {
  'gm-ls-gen3': { name: 'GM LS Gen III/IV (aluminum block)', weight: { value: 474, low: 430, high: 474, evidence: 'published', basis: 'LS1 fully dressed 474 lb; aluminum LS family 430–470 dressed', sources: [lib] } },
  'gm-ls7': { name: 'GM LS7 7.0', weight: { low: 430, high: 470, evidence: 'estimated', basis: 'Aluminum LS family range; dry-sump hardware not itemised' } },
  'gm-lt-gen5': { name: 'GM LT1/LT4 Gen V', weight: { low: 450, high: 520, evidence: 'estimated', basis: 'Aluminum Gen V; supercharger adds weight on LT4' } },
  'gm-bbc': { name: 'Chevrolet big-block (396/427/454)', weight: { value: 675, evidence: 'published', basis: '454, unspecified dress', sources: [lib] } },
  'gm-sbc': { name: 'Chevrolet small-block (iron)', weight: { low: 525, high: 575, evidence: 'estimated', basis: 'Iron small-block, dressed; library lists an aluminum-head 400 at 470 lb without accessories' } },
  'pontiac-v8': { name: 'Pontiac V8 (326–455)', weight: { low: 600, high: 650, evidence: 'estimated', basis: 'Iron Pontiac V8 dressed; measure before use' } },
  'ford-modular-sohc': { name: 'Ford 4.6/5.4 SOHC Modular', weight: { value: 529, evidence: 'published', basis: '1998 Mustang 4.6 SOHC dressed with flywheel, dry', sources: [lib] } },
  'ford-modular-dohc': { name: 'Ford 4.6 DOHC Modular', weight: { value: 535, evidence: 'published', basis: '1998 4.6 DOHC dressed, dry', sources: [lib] } },
  'ford-windsor': { name: 'Ford Windsor 289/302/351W', weight: { low: 460, high: 500, evidence: 'estimated', basis: 'Iron small-block Ford, dressed' } },
  'ford-fe': { name: 'Ford FE 352–428', weight: { low: 625, high: 675, evidence: 'estimated', basis: 'Iron FE big-block, dressed' } },
  'mopar-hemi-426': { name: 'Chrysler 426 Hemi', weight: { low: 750, high: 800, evidence: 'estimated', basis: 'Iron Hemi, dressed' } },
};

/** Measured ESS parts that change installed weight (owner-measured tier). */
export const measuredParts = {
  'ls1-exhaust-manifold': { name: 'LS1 exhaust manifold with heat shield (avg of 2)', value: 15.6, evidence: 'owner', sources: [teardown] },
  'header-single': { name: 'Aftermarket header, single side', value: 10.7, evidence: 'owner', sources: [teardown] },
  'bellhousing-speedway-steel': { name: 'Speedway steel bellhousing', value: 23.6, evidence: 'owner', sources: [teardown] },
  't5-bellhousing-aluminum': { name: 'Factory T5 aluminum bellhousing', value: 7.9, evidence: 'owner', sources: [teardown] },
};

/**
 * Rating convention. US ratings before 1972 were SAE gross (no accessories, ideal exhaust); later ratings are SAE net.
 * The simulator needs net. Gross→net factor: estimated 0.80 (0.75–0.87), engine-dependent; replace with a dyno sheet.
 */
export const grossToNet = { value: .9, low: .8, high: 1, evidence: 'estimated',
  basis: 'Advertised gross ratings of 1960s performance engines were often understated, offsetting the usual gross-to-net loss. ' +
    'Set to 0.90 because five classic road tests (1965 GTO, 1968 and 1970 Z/28, 1969 Mach 1 428CJ, 1970 Hemi Challenger) all ran quicker than the model at 0.80. ' +
    'Even at 1.00 the model stays 0.3–1.7 s slower than those period tests, so classic results are best read as comparisons, not absolute times.' };
export function ratingConvention(year, note = '') {
  if (/gross/i.test(note)) return 'gross';
  if (/net/i.test(note)) return 'net';
  return year && year < 1972 ? 'gross' : 'net';
}

/** Which family each reference vehicle's engine belongs to (for installed weight and swap comparisons). */
export function engineFamilyFor(name = '') {
  const n = name.toLowerCase();
  if (/ls7/.test(n)) return 'gm-ls7';
  if (/\bls[1236]\b|5\.7 ls1|ls1/.test(n)) return 'gm-ls-gen3';
  if (/lt4|lt1|lt2|l87|6\.2/.test(n) && /chevrolet|camaro|corvette|silverado/.test(n)) return 'gm-lt-gen5';
  if (/454|396|427/.test(n) && /chevrolet|chevelle|c10/.test(n)) return 'gm-bbc';
  if (/283|302|305|327|350|307|l79|lb9|l98/.test(n) && /chevrolet|camaro|nova|chevy|c10|corvette/.test(n) && !/ls\d|lt\d/.test(n)) return 'gm-sbc';
  if (/pontiac/.test(n) && /389|400|455|w72/.test(n)) return 'pontiac-v8';
  if (/426 hemi|hemi/.test(n) && /1970|challenger|charger/.test(n)) return 'mopar-hemi-426';
  if (/428|390|360|fe\b/.test(n) && /ford|mustang|f-100/.test(n)) return 'ford-fe';
  if (/5\.0|302/.test(n) && /ford|mustang/.test(n)) return 'ford-windsor';
  if (/4\.6/.test(n) && /cobra/.test(n)) return 'ford-modular-dohc';
  if (/4\.6|5\.4/.test(n) && /ford|mustang|lightning/.test(n)) return 'ford-modular-sohc';
  return null;
}

/** Swap engines offered in the Garage: ratings come from the named reference vehicle. */
export const swapEngines = {
  ls1gto: { name: 'LS1 · 2004 GTO (350 hp)', from: 'pontiac-gto-v2--2004-gto-ls1-m6-coupe', family: 'gm-ls-gen3' },
  ls1fbody: { name: 'LS1 · 2002 Camaro SS (325 hp)', from: 'chevrolet-camaro-4th-gen--2002-ss-ls1-m6-coupe', family: 'gm-ls-gen3' },
  ls6c5: { name: 'LS6 · 2002 Corvette Z06 (405 hp)', from: 'chevrolet-corvette-c5--2002-z06-ls6-m6-hardtop', family: 'gm-ls-gen3' },
  ls7c6: { name: 'LS7 · 2006 Corvette Z06 (505 hp)', from: 'chevrolet-corvette-c6--2006-z06-ls7-m6-coupe', family: 'gm-ls7' },
  lt4zl1: { name: 'LT4 · 2017 Camaro ZL1 (650 hp)', from: 'chevrolet-camaro-6th-gen--2017-zl1-lt4-a10-coupe', family: 'gm-lt-gen5' },
  coyote18: { name: 'Coyote 5.0 · 2018 Mustang GT', from: 'ford-mustang-s550--2018-gt-pp2-5.0-m6-fastback', family: null },
  hemi392: { name: '392 Hemi · 2023 Challenger Scat Pack (485 hp)', from: 'dodge-challenger-la--2023-rt-scat-pack-6.4-m6-coupe', family: null },
};
