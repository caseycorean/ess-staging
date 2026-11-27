// ESS Plan — expectation → prediction → measurement, and accomplishment-based progress (Claude, 26 Nov 2026).
// Three distinct evidence classes per objective, each optional and kept separately:
//   expectation  — what the owner believes the change will do (owner opinion; flagged if entered after seeing the model)
//   prediction   — a frozen ESS model run: before/after values, the change, the configuration and the date. Never recomputed.
//   measurement  — what the owner measured, with method, conditions, date and the configuration it was measured on.
// Numbers are compared only when the metric, test method and configuration match; otherwise both are shown, unlabeled as a
// discrepancy. Pure functions; units are canonical (s, ft, g) and only formatted for display elsewhere.
import { OBJECTIVES } from './objectives.mjs';
import { cleanSetup, usableSetup } from '../models.mjs';
import { vehicles } from '../vehicles.mjs';

/** The one metric each objective's loop compares (the objective's own experiment test). */
export const LOOP_METRIC = { handling: 'corner', braking: 'brake', power: 'accelerate', weight: 'accelerate', traction: 'accelerate', comfort: 'brake' };

/** How a measurement must be taken to be comparable with the model's test. */
export const METHODS = {
  accelerate: { standard: 'Standing-start quarter mile (timeslip or timing gear)', other: 'Other (rolling start, phone app, partial distance)' },
  brake: { standard: '60–0 mph stop, measured distance', other: 'Other (different speed, estimated distance)' },
  corner: { standard: 'Steady circle about 200 ft across, measured lateral g', other: 'Other (autocross, different radius, logged peak)' },
};
const RANGE = { accelerate: [4, 40], brake: [40, 400], corner: [0.2, 2] };
const DIGITS = { accelerate: 2, brake: 0, corner: 2 };
const BETTER = { accelerate: -1, brake: -1, corner: 1 };

const date = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';
const num = (v, metric) => {
  const n = typeof v === 'number' ? v : Number.parseFloat(v);
  const [lo, hi] = RANGE[metric] ?? [];
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
};
const line = (v, n) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '';
const round = (v, metric) => Number(v.toFixed(DIGITS[metric] + 2));

/** A configuration signature: the same car in the same configuration gives the same string. */
export function signature(vehicle) {
  if (!vehicle?.id) return '';
  if (!vehicle.setup) return vehicle.id;
  return JSON.stringify([vehicle.id, vehicle.mode ?? 'before', vehicle.setup]);
}

function cleanSnapshotVehicle(raw) {
  if (!raw || !Object.hasOwn(vehicles, raw.id)) return null;
  const out = { id: raw.id };
  if (raw.setup) {
    try { const s = cleanSetup(raw.setup); if (s && s.id === raw.id && usableSetup(s)) { out.setup = s; out.mode = raw.mode === 'after' ? 'after' : 'before'; } } catch { /* drop */ }
  }
  return out;
}

export function cleanExpectation(raw, key) {
  const metric = LOOP_METRIC[key];
  if (!raw || !metric || raw.metric !== metric) return null;
  const value = num(raw.value, metric);
  if (value === null) return null;
  return { metric, value: round(value, metric), on: date(raw.on), afterReveal: raw.afterReveal !== false, note: line(raw.note, 160) };
}

export function cleanPrediction(raw, key) {
  const metric = LOOP_METRIC[key];
  if (!raw || !metric || raw.metric !== metric) return null;
  const before = num(raw.before, metric), after = num(raw.after, metric);
  const vehicle = cleanSnapshotVehicle(raw.vehicle);
  if (before === null || after === null || !vehicle) return null;
  const change = {};
  for (const k of ['weight', 'power', 'cg']) if (Number.isFinite(raw.change?.[k]) && raw.change[k] !== 0) change[k] = raw.change[k];
  if (typeof raw.change?.tire === 'string' && /^[a-z0-9]{1,24}$/i.test(raw.change.tire)) change.tire = raw.change.tire;
  return { metric, before: round(before, metric), after: round(after, metric), change, label: line(raw.label, 80), vehicle,
    vname: line(raw.vname, 80), sig: signature(vehicle), on: date(raw.on) };
}

export function cleanMeasurement(raw, key) {
  const metric = LOOP_METRIC[key];
  if (!raw || !metric || raw.metric !== metric) return null;
  const after = num(raw.after, metric);
  if (after === null) return null;
  const before = num(raw.before, metric);
  return { metric, after: round(after, metric), ...(before !== null ? { before: round(before, metric) } : {}),
    method: raw.method === 'standard' ? 'standard' : 'other', conditions: line(raw.conditions, 200), on: date(raw.on),
    sig: typeof raw.sig === 'string' ? raw.sig.slice(0, 4000) : '' };
}

/** Freeze one model comparison row as a prediction. `fx` is crossEffects(vehicle, change). */
export function predictionFrom(key, vehicle, change, fx, { vname = '', label = '', on = '' } = {}) {
  const metric = LOOP_METRIC[key];
  const row = fx?.rows?.find(r => r.key === metric);
  if (!row?.ok) return null;
  return cleanPrediction({ metric, before: row.before, after: row.after, change, label, vehicle, vname, on }, key);
}

/** Does the saved prediction still describe what the live model gives for the same car and change? */
export function predictionCurrent(prediction, fx) {
  const row = fx?.rows?.find(r => r.key === prediction?.metric);
  return !!row?.ok && Math.abs(row.after - prediction.after) < 0.5 * 10 ** -DIGITS[prediction.metric] &&
    Math.abs(row.before - prediction.before) < 0.5 * 10 ** -DIGITS[prediction.metric];
}

/**
 * How the three readings relate. Returns plain-language findings; a numeric difference only when comparable.
 * kind: 'compare' (same metric, method, configuration) | 'different-basis' | 'different-config' | null
 */
export function compareLoop(o, currentSig) {
  const { expectation: e, prediction: p, measurement: m } = o;
  const out = { measured: null, expected: null, configChanged: !!p && !!currentSig && p.sig !== currentSig };
  if (p && e) {
    const better = (e.value - p.after) * BETTER[p.metric];
    out.expected = { delta: e.value - p.after, verdict: Math.abs(e.value - p.after) < 0.5 * 10 ** -DIGITS[p.metric] ? 'same' : better > 0 ? 'more optimistic' : 'less optimistic' };
  }
  if (p && m) {
    if (m.method !== 'standard') out.measured = { kind: 'different-basis' };
    else if (m.sig !== p.sig) out.measured = { kind: 'different-config' };
    else if (Number.isFinite(m.before)) out.measured = { kind: 'compare', basis: 'change', measured: m.after - m.before, predicted: p.after - p.before };
    else out.measured = { kind: 'compare', basis: 'value', measured: m.after, predicted: p.after };
  }
  return out;
}

/** Real accomplishments of one objective, in the order a project usually gathers them. */
export function accomplishments(o) {
  const def = OBJECTIVES[o.key];
  const out = [];
  if (o.prediction) out.push({ key: 'prediction', text: 'Prediction saved' });
  if (o.expectation) out.push({ key: 'expectation', text: 'Expectation recorded' });
  if (o.approach) out.push({ key: 'approach', text: `Approach: ${def.approaches.find(a => a.key === o.approach)?.name ?? ''}` });
  if (o.done?.decision) out.push({ key: 'decision', text: 'Decision recorded' });
  if (o.measurement || o.measured) out.push({ key: 'measured', text: 'Result measured' });
  return out;
}

/** One suggested next action (never mandatory). `hasCar` = the plan has a catalogue car the models can run. */
export function suggestion(o, { hasCar, modeled }) {
  if (modeled && !hasCar) return { view: 'car', text: 'Choose your car so the model runs on it' };
  if (modeled && !o.prediction) return { view: 'experiment', text: 'Save the model prediction for your car' };
  if (!o.approach) return { view: 'approaches', text: 'Compare the approaches' };
  if (!o.done?.decision) return { view: 'decision', text: 'Record what you decided' };
  if (!o.measurement && !o.measured) return { view: 'verify', text: 'Measure the result after the change' };
  return null;
}

/** Whole-plan progress in real accomplishments (Garage keeps using plan-store summary()). */
export function progress(project) {
  const objs = project.objectives;
  return { objectives: objs.length, predictions: objs.filter(o => o.prediction).length, decisions: objs.filter(o => o.done?.decision).length,
    measured: objs.filter(o => o.measurement || o.measured).length, blockers: objs.reduce((n, o) => n + o.blockers.length, 0) };
}
