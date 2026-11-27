// ESS engineering library — steady-state cornering limit with lateral load transfer and tire load sensitivity.
// Claude sprint, 26 Nov 2026. Pure functions, no DOM. Units: lb, in, g.
//
// Why: a point mass with one friction coefficient corners at exactly μ g whatever the CG height, track width
// or roll-stiffness split, so "lower the CG" could never change an oval lap. Real tires lose friction
// coefficient as their load rises, so moving load from the inside tire to the outside tire costs axle grip.
//
// Model (standard degressive tire, e.g. Milliken & Milliken, RCVD ch. 2):
//   μ(Fz) = μ0 · (1 − k · (Fz / F0 − 1)),  F0 = that axle's static load per tire.
// For one axle with load transfer ΔF (lb, from engine/loads.mjs tireLoads, the same split the Load Transfer
// calculator uses) the lateral capacity is Σ μ(Fz)·Fz = μ0 · (W_axle − 4·k·ΔF² / W_axle).
// Steady state each axle must supply W_axle · a_y, so each axle has its own limit and the car's limit is the
// lower one; which axle runs out first tells the balance (front = push, rear = loose).
// k = 0.15 is an ESS ESTIMATE ("about 15% less friction coefficient when a tire's load doubles"), typical of
// published street and track radial data; it is labelled as an estimate wherever it is shown.
import { tireLoads } from './loads.mjs';

export const LOAD_SENSITIVITY = 0.15;

const capacity = (mu0, k, load, nominal) =>
  Math.max(0, load) * Math.max(0, mu0 * (1 - k * (Math.max(0, load) / nominal - 1)));

/** Lateral g at which one axle's tires are saturated. axle: 'front' | 'rear'. */
function axleLimit(v, axle, k, options) {
  const axleLb = axle === 'front' ? v.frontLb : v.rearLb;
  const nominal = axleLb / 2;
  const surplus = ay => {
    const t = tireLoads(v, 0, ay, options).tires;
    const [outside, inside] = axle === 'front' ? [t[0], t[1]] : [t[2], t[3]];
    return capacity(v.grip, k, outside, nominal) + capacity(v.grip, k, inside, nominal) - axleLb * ay;
  };
  let low = 0, high = v.grip * 1.01;
  if (surplus(high) >= 0) return high; // only possible with k = 0
  for (let i = 0; i < 60; i++) {
    const mid = (low + high) / 2;
    if (surplus(mid) >= 0) low = mid; else high = mid;
  }
  return low;
}

/**
 * Steady-state lateral limit (g). Needs grip, weight, frontLb/rearLb, cg, wheelbase and both tracks; otherwise it
 * returns the grip-only point-mass limit with gripOnly: true so callers can say so.
 * Returns {ay, front, rear, limitingAxle, loss (fraction of μ0 lost), gripOnly, sensitivity}.
 */
export function corneringLimit(v, { sensitivity = LOAD_SENSITIVITY, ...options } = {}) {
  const ready = [v.grip, v.weight, v.frontLb, v.rearLb, v.cg, v.wheelbase, v.frontTrack, v.rearTrack]
    .every(Number.isFinite) && v.frontLb > 0 && v.rearLb > 0;
  if (!ready || !(sensitivity > 0)) {
    return { ay: v.grip, front: v.grip, rear: v.grip, limitingAxle: null, loss: 0, gripOnly: true, sensitivity: ready ? 0 : null };
  }
  const front = axleLimit(v, 'front', sensitivity, options);
  const rear = axleLimit(v, 'rear', sensitivity, options);
  const ay = Math.min(front, rear);
  return { ay, front, rear, limitingAxle: Math.abs(front - rear) < 1e-6 ? 'both' : front < rear ? 'front' : 'rear',
    loss: 1 - ay / v.grip, gripOnly: false, sensitivity };
}
