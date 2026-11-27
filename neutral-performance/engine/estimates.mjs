// ESS engineering library — estimation rules for missing specifications.
// Each rule returns { value, low, high, evidence: 'estimated', basis }. Rules were set from ESS reference records
// with known values plus the Supercar X archive (historical), and checked against road tests (see engine/README.md).
import { parseTire } from './tires.mjs';
import { rearArchitectures, frontArchitectures, rangeEvidence } from './data/architectures.mjs';

const est = (value, low, high, basis) => ({ value, low, high, evidence: 'estimated', basis });

/** Layout class from record identity. */
export function layoutClass({ layout = 'FR', category = '', year, torque = 0, name = '' }) {
  if (/pickup|truck/i.test(category)) return layout === 'AWD' ? 'awd-truck' : 'fr-truck';
  if (layout === 'FF') return 'ff';
  if (layout === 'MR') return 'mr';
  if (layout === 'RR') return 'rr';
  if (layout === 'AWD') return /911|cayman/i.test(name) ? 'rr' : 'awd-car';
  if (/corvette|viper|ferrari|aston|gt-r|928/i.test(name)) return 'fr-transaxle';
  if (year && year < 1980 && torque >= 280) return 'fr-classic-v8';
  return torque >= 300 ? 'fr-large' : 'fr-small';
}

// Calibration: ESS records (13 with known split) + Supercar X archive (55 street cars). 10th / 50th / 90th percentiles.
const FRONT = {
  'fr-classic-v8': [.567, .584, .605, '6 classic F-body/muscle cars (Supercar X + ESS)'],
  'fr-large': [.525, .544, .567, '24 front-engine cars with ≥300 lb-ft'],
  'fr-small': [.49, .52, .541, '7 front-engine cars under 300 lb-ft'],
  'fr-transaxle': [.48, .51, .53, '12 front-mid / transaxle cars (Corvette, Viper, Aston, GT-R …)'],
  ff: [.6, .62, .64, '3 front-drive cars'],
  'awd-car': [.54, .58, .62, '3 all-wheel-drive cars'],
  mr: [.4, .422, .43, '17 mid-engine cars'],
  rr: [.367, .383, .4, '5 rear-engine cars'],
  'fr-truck': [.55, .58, .61, '2 pickups: 1967 F-100 factory 2,010/1,450 lb (58.1%) and 2022 Silverado ZR2 test (56%). Low confidence.'],
  'awd-truck': [.55, .58, .61, 'Same pickup range; few calibration points. Low confidence.'],
};
export function frontShare(v) {
  const c = layoutClass(v), [low, value, high, n] = FRONT[c];
  return est(value, low, high, `Layout class "${c}": ${n}.`);
}

/** Shift ceiling from peak-power rpm: median ratio 1.067 (64 archive cars; 10–90%: 1.00–1.16). */
export function redline({ hpRpm, year }) {
  if (year && year < 1985 && hpRpm < 4500)
    return est(Math.round((hpRpm + 1200) / 50) * 50, hpRpm + 500, hpRpm + 1400,
      'Low-peak pre-1985 engine: peak-power rpm + 1,200 (archive classics run +500 to +1,400; 1977 Formula 3,600 → 5,000).');
  return est(Math.round(hpRpm * 1.067 / 50) * 50, hpRpm, Math.round(hpRpm * 1.16 / 50) * 50,
    'Peak-power rpm × 1.067 (Supercar X archive median, 64 cars; range ×1.00–1.16).');
}

/** Track width from wheelbase by category and era. */
export function track({ wheelbase, category = '', year }) {
  const truck = /pickup|truck/i.test(category), roadster = /roadster/i.test(category), classic = year && year < 1980;
  const [r, lo, hi, why] = truck ? [.53, .5, .56, '6 ESS pickups'] : roadster ? [.62, .61, .65, '3 ESS roadsters'] :
    classic ? [.555, .527, .57, '9 classic cars in the Supercar X archive'] : [.585, .55, .62, '16 modern ESS cars'];
  return est(+(wheelbase * r).toFixed(1), +(wheelbase * lo).toFixed(1), +(wheelbase * hi).toFixed(1), `Wheelbase × ${r} (${why}).`);
}

/** CG height by vehicle type. Engineering ranges, not calibrated on ESS measurements (none exist yet). */
export function cgHeight({ category = '', layout = 'FR' }) {
  if (/pickup|truck/i.test(category)) return layout === 'AWD' ? est(29, 26, 32, 'Typical 4×4 pickup, unladen. No ESS measurement.') : est(25, 22, 28, 'Typical 2WD pickup, unladen. No ESS measurement.');
  if (/roadster|sports|handling/i.test(category) || ['MR', 'RR'].includes(layout)) return est(18, 16, 20, 'Typical low sports car. No ESS measurement.');
  if (/hatch|sedan/i.test(category)) return est(21, 19, 23, 'Typical sedan / hatchback. No ESS measurement.');
  return est(20, 18, 22, 'Typical coupe. No ESS measurement.');
}

/** Drag area Cd·A (ft²) by vehicle type. */
export function dragArea({ category = '', year }) {
  if (/pickup|truck/i.test(category)) return est(15, 12, 19, 'Typical pickup Cd 0.40–0.50 × 28–38 ft² frontal area.');
  if (year && year < 1980) return est(9, 8, 10.5, 'Typical 1960s–70s coupe Cd 0.40–0.48 × 20–22 ft².');
  if (/roadster|sports|handling/i.test(category)) return est(6.5, 5.5, 7.5, 'Typical modern sports car Cd 0.30–0.36 × 19–21 ft².');
  return est(7.5, 6.5, 8.5, 'Typical modern coupe/sedan Cd 0.30–0.36 × 22–24 ft².');
}

/** Rear tire diameter from the size string (calculated) — not an estimate unless the size is letter-series. */
export function tireDiameter({ tire }) {
  const t = parseTire(tire);
  return t ? { value: t.diameter, evidence: t.evidence, basis: t.note } : null;
}

/** Ride-model inputs per architecture (midpoints of typical ranges). */
export function rideDefaults({ archFront, archRear }) {
  const f = frontArchitectures[archFront], r = rearArchitectures[archRear];
  const mid = x => x && +((x.low + x.high) / 2).toFixed(2);
  return {
    frontMotion: f && est(mid(f.motionRatio), f.motionRatio.low, f.motionRatio.high, `${f.name}. ${rangeEvidence.basis}`),
    rearMotion: r && est(mid(r.motionRatio), r.motionRatio.low, r.motionRatio.high, `${r.name}. ${rangeEvidence.basis}`),
    frontUnsprung: f && est(Math.round(mid(f.unsprung)), f.unsprung.low, f.unsprung.high, `${f.name}. ${rangeEvidence.basis}`),
    rearUnsprung: r && est(Math.round(mid(r.unsprung)), r.unsprung.low, r.unsprung.high, `${r.name}. ${rangeEvidence.basis}`),
  };
}
