// ESS engineering library — tire sizes and tire-type grip defaults.
import { tireGrip } from './acceleration.mjs';

export const tireClasses = { ...tireGrip, allTerrain: { mu: .8, label: 'Light-truck all-terrain / off-road tire' } };
// Approximate section widths for letter-series sizes (E70-14, F60-15 …). Estimated equivalents.
const LETTER = { D: 205, E: 215, F: 225, G: 235, H: 245, J: 255, L: 265 };

/**
 * Parse a tire size. Returns {diameter (in), width (mm), aspect, rim (in), radial, lt, evidence, note}.
 * Accepts P-metric (P245/50R16, 265/40ZR-18 97Y, LT285/70R17), flotation (37x12.50R17LT) and letter series (F60-15, GR70-15).
 */
export function parseTire(size) {
  if (!size) return null;
  const s = String(size).toUpperCase().replace(/\s+/g, '');
  let m = s.match(/^(P|LT)?(\d{3})\/(\d{2})(Z?R|-|B|D)?-?(\d{2})/);
  if (m) {
    const [, pre, w, a, kind, rim] = m;
    const diameter = +rim + 2 * (+w) * (+a) / 100 / 25.4;
    return { diameter: +diameter.toFixed(2), width: +w, aspect: +a, rim: +rim, radial: !!kind && kind.includes('R'), lt: pre === 'LT' || /LT$/.test(s),
      zRated: /ZR/.test(s), evidence: 'calculated', note: 'Nominal unloaded diameter from the size; loaded radius is smaller.' };
  }
  m = s.match(/^(\d{2}(?:\.\d+)?)X(\d{1,2}(?:\.\d+)?)R(\d{2})/);
  if (m) return { diameter: +m[1], width: Math.round(+m[2] * 25.4), aspect: null, rim: +m[3], radial: true, lt: true, evidence: 'calculated', note: 'Flotation size: first number is the nominal diameter.' };
  m = s.match(/^([D-L])(R)?(\d{2})-(\d{2})/);
  if (m) {
    const w = LETTER[m[1]], a = +m[3], rim = +m[4];
    return { diameter: +(rim + 2 * w * a / 100 / 25.4).toFixed(2), width: w, aspect: a, rim, radial: !!m[2], lt: false,
      evidence: 'estimated', note: `Letter-series size: section width approximated as ${w} mm.` };
  }
  return null;
}

/** Default tire class from year, size and vehicle category (a labelled estimate; owner selection overrides). */
export function tireClassFor({ year, tire, category = '' }) {
  const t = parseTire(tire);
  const why = c => ({ id: c, mu: tireClasses[c].mu, label: tireClasses[c].label, evidence: 'estimated' });
  if (t?.lt || /pickup|truck/i.test(category) && t && t.aspect >= 60) return why('allTerrain');
  if (t && !t.radial && year && year < 1980) return why('bias');
  if (!year || year < 1985) return why('radial70s');
  // 1990s supercar ZR sizes (≥ 40-series or ≥ 300 mm) were the era's ultra-high-performance tires; 'perf80s' made
  // F40 / McLaren F1 / Viper ACR 0.4–0.6 s slow in the Supercar X hold-out (Claude, 25 Nov; see engine/README).
  if (year >= 1990 && year < 2000 && t?.zRated && ((t.aspect ?? 99) <= 40 || t.width >= 300)) return why('uhp');
  if (year < 2000) return why('perf80s');
  if (t && (t.zRated || (t.aspect ?? 99) <= 40)) return why(year >= 2010 ? 'extreme' : 'extreme');
  return why('uhp');
}
