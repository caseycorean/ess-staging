// ESS measurement units: one shared conversion, formatting and input-parsing layer for the whole site.
//
// Rules
//  - Engineering models keep their canonical units (below). Nothing here changes a model; values are converted only
//    for display and converted back only from what a visitor types, so switching units never changes a result and
//    repeated switching cannot accumulate rounding (state is never rewritten from a displayed number).
//  - Shared links and saved configurations always store canonical values, so a recipient with other preferences
//    gets the same physical configuration.
//  - Source records keep their original value, unit and provenance; `fromSource()` converts them on read.
//
// Canonical units used by the ESS engine and experience models (do not change the models; convert at the edges):
//   length in (geometry, track, wheelbase, CG, tire diameter, travel) · distance ft (acceleration traces)
//   mass/weight lb (lbf) · force lbf · spring/wheel/tire rate lb/in · torque lb-ft · power hp · speed mph
//   angle deg · frequency Hz · acceleration g · time s · roll stiffness lb-ft/deg · motion ratio dimensionless
//
// Preference: 'us' (US customary / SAE), 'metric', or 'dual' (US first, metric in parentheses). Stored per browser.

const KEY = 'ess.units.v1';
export const systems = { us: 'US customary', metric: 'Metric', dual: 'Both' };

/** Quantity definitions: canonical unit, metric unit and the factor canonical → metric. Display digits per system. */
export const quantities = {
  length:    { us: 'in', metric: 'mm', k: 25.4, digits: { us: 2, metric: 0 }, step: { us: .1, metric: 2 } },
  distance:  { us: 'ft', metric: 'm', k: .3048, digits: { us: 0, metric: 0 }, step: { us: 1, metric: .5 } },
  weight:    { us: 'lb', metric: 'kg', k: .45359237, digits: { us: 0, metric: 0 }, step: { us: 1, metric: .5 } },
  force:     { us: 'lb', metric: 'N', k: 4.4482216152605, digits: { us: 0, metric: 0 }, step: { us: 1, metric: 5 } },
  rate:      { us: 'lb/in', metric: 'N/mm', k: 4.4482216152605 / 25.4, digits: { us: 0, metric: 1 }, step: { us: 5, metric: 1 } },
  torque:    { us: 'lb-ft', metric: 'N·m', k: 1.3558179483314, digits: { us: 0, metric: 0 }, step: { us: 1, metric: 1 } },
  power:     { us: 'hp', metric: 'kW', k: .745699872, digits: { us: 0, metric: 0 }, step: { us: 1, metric: 1 } },
  speed:     { us: 'mph', metric: 'km/h', k: 1.609344, digits: { us: 0, metric: 0 }, step: { us: 1, metric: 1 } },
  rollStiffness: { us: 'lb-ft/deg', metric: 'N·m/deg', k: 1.3558179483314, digits: { us: 0, metric: 0 }, step: { us: 10, metric: 10 } },
  angle:     { us: '°', metric: '°', k: 1, digits: { us: 2, metric: 2 }, step: { us: .1, metric: .1 } },
  frequency: { us: 'Hz', metric: 'Hz', k: 1, digits: { us: 2, metric: 2 }, step: { us: .05, metric: .05 } },
  ratio:     { us: '', metric: '', k: 1, digits: { us: 2, metric: 2 }, step: { us: .01, metric: .01 } },
  accel:     { us: 'g', metric: 'g', k: 1, digits: { us: 2, metric: 2 }, step: { us: .05, metric: .05 } },
};

/** Units a visitor may type, mapped to [quantity, factor to canonical]. Case-insensitive; spaces optional. */
const typed = {
  length: { in: 1, inch: 1, inches: 1, '"': 1, mm: 1 / 25.4, cm: 10 / 25.4, m: 1000 / 25.4, ft: 12 },
  distance: { ft: 1, feet: 1, m: 1 / .3048, km: 1000 / .3048, mi: 5280 },
  weight: { lb: 1, lbs: 1, kg: 1 / .45359237, g: .001 / .45359237 },
  force: { lb: 1, lbf: 1, n: 1 / 4.4482216152605, kn: 1000 / 4.4482216152605, kgf: 1 / .45359237 },
  rate: { 'lb/in': 1, lbin: 1, 'n/mm': 25.4 / 4.4482216152605, 'kn/m': 25.4 / 4.4482216152605, 'kgf/mm': 25.4 / .45359237, 'n/m': .0254 / 4.4482216152605 },
  torque: { 'lb-ft': 1, 'lbft': 1, 'ft-lb': 1, 'n·m': 1 / 1.3558179483314, nm: 1 / 1.3558179483314, 'n-m': 1 / 1.3558179483314 },
  power: { hp: 1, kw: 1 / .745699872, ps: .98632 },
  speed: { mph: 1, 'km/h': 1 / 1.609344, kph: 1 / 1.609344, kmh: 1 / 1.609344 },
  rollStiffness: { 'lb-ft/deg': 1, 'n·m/deg': 1 / 1.3558179483314, 'nm/deg': 1 / 1.3558179483314 },
  angle: { '°': 1, deg: 1, rad: 180 / Math.PI },
  frequency: { hz: 1 }, ratio: { '': 1 }, accel: { g: 1 },
};

let current = null;
export function getUnits() {
  if (current) return current;
  try { current = systems[localStorage.getItem(KEY)] ? localStorage.getItem(KEY) : 'us'; } catch { current = 'us'; }
  return current;
}
export function setUnits(system) {
  if (!systems[system]) return false;
  current = system;
  try { localStorage.setItem(KEY, system); } catch { /* preference lasts for this page only */ }
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.units = system;
    for (const el of document.querySelectorAll('[data-units-pref]')) el.value = system;
    document.dispatchEvent(new CustomEvent('ess:units-changed', { detail: { system } }));
  }
  return true;
}
/** For tests: set without storage or events. */
export const _setUnitsForTest = s => { current = s; };

const primary = system => system === 'metric' ? 'metric' : 'us';
const sep = n => n.toLocaleString('en-US', { useGrouping: true });

/** Canonical → displayed number in a system (no rounding beyond float precision). */
export const toDisplay = (q, value, system = getUnits()) => primary(system) === 'metric' ? value * quantities[q].k : value;
/** Displayed number in a system → canonical. */
export const fromDisplay = (q, value, system = getUnits()) => primary(system) === 'metric' ? value / quantities[q].k : value;
export const unitLabel = (q, system = getUnits()) => quantities[q][primary(system)];
export const stepFor = (q, system = getUnits()) => quantities[q].step[primary(system)];
/** One display step expressed in canonical units (for keyboard nudges and handle steps). */
export const canonicalStep = (q, system = getUnits()) => fromDisplay(q, stepFor(q, system), system);
/** Plain number for an editable field in the preferred system (dual edits in US units; either system may be typed). */
export function inputValue(q, value, digits, system = getUnits()) {
  if (!Number.isFinite(value)) return '';
  const p = primary(system);
  const d = digits?.[p] ?? digits ?? quantities[q].digits[p];
  return String(+toDisplay(q, value, p).toFixed(typeof d === 'number' ? d : quantities[q].digits[p]));
}

function one(q, value, system, digits) {
  const def = quantities[q];
  const d = digits ?? def.digits[system];
  const n = system === 'metric' ? value * def.k : value;
  const text = n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const u = def[system];
  return u === '' ? text : u === '°' ? text + '°' : text + ' ' + u;
}

/**
 * Format a canonical value for display. opts: {digits (canonical-system digits), signed, system}.
 * 'dual' gives "1.50 in (38 mm)". Missing values give "—".
 */
export function format(q, value, opts = {}) {
  if (!Number.isFinite(value)) return '—';
  const system = opts.system ?? getUnits();
  const sign = s => opts.signed && value > 0 ? '+' + s : opts.signed && value < 0 ? '−' + s.replace(/^-/, '') : s;
  if (system === 'dual' && quantities[q].us !== quantities[q].metric) {
    return `${sign(one(q, value, 'us', opts.digits))} (${sign(one(q, value, 'metric', opts.metricDigits))})`;
  }
  return sign(one(q, value, primary(system), primary(system) === 'us' ? opts.digits : opts.metricDigits));
}

/**
 * Parse what a visitor typed into a canonical value. Accepts a number with an optional unit in either system
 * ("38 mm", "1.5 in", "450 lb/in", "79 N/mm", "1,200 lb"); a bare number uses the preferred system's unit.
 * Returns null when it cannot be read or the unit does not fit the quantity.
 */
export function parse(q, text, system = getUnits()) {
  if (text == null) return null;
  const m = String(text).trim().replace(/,/g, '').match(/^([-+−]?\d*\.?\d+(?:e[-+]?\d+)?)\s*([^\d\s].*)?$/i);
  if (!m) return null;
  const n = Number(m[1].replace('−', '-'));
  if (!Number.isFinite(n)) return null;
  const unit = (m[2] ?? '').trim().toLowerCase().replace(/\s+/g, '').replace('·', '·');
  if (!unit) return fromDisplay(q, n, system);
  const factor = typed[q]?.[unit] ?? typed[q]?.[unit.replace('·', '')];
  return factor === undefined ? null : n * factor;
}

/** Read a source record value in its original unit (e.g. hardpoints in mm, track in in) into canonical units. */
export function fromSource(q, value, unit) {
  const factor = typed[q]?.[String(unit).toLowerCase().replace(/_per_/g, '/').replace(/\s+/g, '')];
  if (factor === undefined || !Number.isFinite(value)) return null;
  return value * factor;
}

/** Unit preference control (select) for any page; bound automatically by bindUnitControls(). */
export function unitsControl(id = 'units') {
  const s = getUnits();
  return `<label class="ess-units"><span>Units</span><select data-units-pref id="${id}" aria-label="Measurement units">
    ${Object.entries(systems).map(([k, v]) => `<option value="${k}" ${k === s ? 'selected' : ''}>${v}</option>`).join('')}</select></label>`;
}

export function bindUnitControls(root = document) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.units = getUnits();
  for (const el of root.querySelectorAll('[data-units-pref]')) {
    el.value = getUnits();
    if (el.dataset.unitsBound) continue;
    el.dataset.unitsBound = '1';
    el.addEventListener('change', () => setUnits(el.value));
  }
}

// Keep pages that load this module in step with a preference changed in another tab.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key === KEY && systems[event.newValue] && event.newValue !== current) setUnits(event.newValue);
  });
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => bindUnitControls());
    else bindUnitControls();
  }
}

// R8 (26 Nov): every slider needs an accessible name. Many sliders sit beside a visible caption that is not a <label>;
// name them from that caption (first line of the surrounding control) so screen readers announce what they change.
function nameControls(root = document) {
  for (const el of root.querySelectorAll('input[type="range"]:not([aria-label]):not([aria-labelledby])')) {
    if (el.labels?.length) continue;
    const box = el.closest('label, .slider, .gl-s, .sg-ctl, .field, div') ?? el.parentElement;
    const raw = box?.innerText?.trim() ? box.innerText : (box?.textContent ?? '');
    const text = raw.split(/\n|\s{2,}/).map(s => s.trim()).find(s => s && !/^[-+−]?[\d.,]+\s*\S{0,6}$/.test(s));
    if (text) el.setAttribute('aria-label', text.slice(0, 80));
  }
}
if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
  const run = () => nameControls();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
  let queued = false;
  new MutationObserver(() => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; run(); }); })
    .observe(document.documentElement, { childList: true, subtree: true });
}
