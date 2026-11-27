// ESS Plan — model-backed "what do I already know" and "how does this affect my other objectives".
// Runs the shared, validated maneuver engines through the replay lane runner (same numbers as /replay/), never a
// separate Plan model. Accelerate ¼ mile, brake 60–0, steady corner on a 200-ft skidpad (100 ft radius).
import { runLane, EXPERIMENTS, NO_CHANGE, quickChanges, laneVehicle, changeLabel } from '../replay/runs.mjs';
import { encodeState } from '../replay/share-state.mjs';
import { tireGrip } from '../../engine/acceleration.mjs';

export const METRICS = {
  accelerate: { label: 'Quarter mile', unit: 's', digits: 2, better: -1, value: r => r.time, objective: 'power' },
  brake: { label: '60–0 mph stop', unit: 'ft', digits: 0, better: -1, value: r => r.distance, objective: 'braking' },
  corner: { label: '200-ft skidpad', unit: 'g', digits: 2, better: 1, value: r => r.ay, objective: 'handling' },
};
export const METRIC_KEYS = Object.keys(METRICS);

/** The lane for a project vehicle: its saved configuration when present, else the documented record. */
export function laneFor(vehicle, change = NO_CHANGE) {
  if (!vehicle) return null;
  const lane = { id: vehicle.id, change: { ...NO_CHANGE, ...change } };
  if (vehicle.setup && vehicle.mode === 'after') lane.setup = vehicle.setup;
  else if (vehicle.setup && Object.keys(vehicle.setup.base).length) {
    const { id, base, name } = vehicle.setup;
    lane.setup = { id, base, ...(name ? { name } : {}), tune: {}, parts: [] };
  }
  return lane;
}

/** Resolve an objective's change spec on this car ('next' tire = the next stickier class than the car has). */
export function resolveChange(spec, vehicle) {
  if (!spec || !vehicle) return null;
  const c = { ...NO_CHANGE };
  if (spec.tire === 'next') {
    const v = laneVehicle(laneFor(vehicle));
    const next = quickChanges('corner', v).find(([x]) => x.tire)?.[0]?.tire;
    if (!next) return null;
    c.tire = next;
  } else if (spec.tire && tireGrip[spec.tire]) c.tire = spec.tire;
  for (const k of ['weight', 'power', 'cg']) if (Number.isFinite(spec[k])) c[k] = spec[k];
  return c;
}

function run(key, lane) {
  const r = runLane(key, EXPERIMENTS[key].params, lane);
  return r.ok ? { ok: true, value: METRICS[key].value(r), raw: r } : { ok: false, text: r.text ?? 'Not available for this car.' };
}

/** Baseline across the three metrics. */
export function baseline(vehicle) {
  const lane = laneFor(vehicle);
  if (!lane) return null;
  const v = laneVehicle(lane);
  return { v, runs: Object.fromEntries(METRIC_KEYS.map(k => [k, run(k, lane)])) };
}

/** One change run through all three metrics, with signed deltas and whether each is an improvement. */
export function crossEffects(vehicle, change) {
  const base = baseline(vehicle);
  if (!base || !change) return null;
  const lane = laneFor(vehicle, change);
  const rows = METRIC_KEYS.map(k => {
    const a = base.runs[k], b = run(k, lane), m = METRICS[k];
    if (!a.ok || !b.ok) return { key: k, ...m, ok: false, text: (a.ok ? b : a).text };
    const d = b.value - a.value;
    const tiny = Math.abs(d) < (m.digits ? 0.5 * 10 ** -m.digits : 0.5);
    return { key: k, ...m, ok: true, before: a.value, after: b.value, delta: d, verdict: tiny ? 'same' : d * m.better > 0 ? 'better' : 'worse' };
  });
  return { label: changeLabel(change), rows };
}

/** Replay link with the same car twice: as it is, and with the change. */
export function replayHref(vehicle, change, key, root = '../replay/') {
  const lane = laneFor(vehicle);
  if (!lane) return root;
  const frag = encodeState({ x: key, p: EXPERIMENTS[key].params, lanes: [lane, laneFor(vehicle, change ?? NO_CHANGE)] });
  return `${root}?car=${encodeURIComponent(vehicle.id)}${frag ? '#' + frag : '#' + key}`;
}
