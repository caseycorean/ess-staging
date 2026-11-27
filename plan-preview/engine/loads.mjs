// ESS engineering library — mass, balance, tire loads and ride.
// One copy of the formulas used by the calculators (tools/*) and the Vehicle Lab (experience/models.mjs).
// Units: lb, in, g (acceleration in g). Pure functions, no DOM.

export const G_IN = 32.174 * 12; // in/s²

/** Axle loads and longitudinal CG position from total weight, front share (0–1) and wheelbase. */
export function axleWeights({ weight, front, wheelbase }) {
  const frontLb = weight * front;
  return { weight, front, wheelbase, frontLb, rearLb: weight - frontLb, cgX: (1 - front) * wheelbase };
}

/**
 * Add, remove or move items. Each item: {oldWeight, oldX, newWeight, newX} with x measured rearward from the
 * front axle (in). Returns the new total, front share and CG position. Same moment balance as the CG Builder.
 */
export function applyItems({ weight, front, wheelbase }, items = []) {
  let total = weight;
  let moment = weight * (1 - front) * wheelbase;
  for (const p of items) {
    total += p.newWeight - p.oldWeight;
    moment += p.newWeight * p.newX - p.oldWeight * p.oldX;
  }
  if (!(total > 0)) return { weight: total, front: NaN, wheelbase, frontLb: NaN, rearLb: NaN, cgX: NaN, invalid: true };
  const cgX = moment / total;
  const out = axleWeights({ weight: total, front: 1 - cgX / wheelbase, wheelbase });
  return { ...out, invalid: out.frontLb <= 0 || out.rearLb <= 0 };
}

/** Longitudinal load transfer (lb) for acceleration ax (g); positive = onto the front (braking). */
export const longitudinalTransfer = (weight, cg, wheelbase, ax) => weight * cg * ax / wheelbase;

/**
 * Steady-state four-tire loads, identical to the ESS Load Transfer Calculator:
 * longitudinal W·h·a/L, lateral split into elastic (roll stiffness share) and geometric (roll-center) parts.
 * brake: g of braking (+) or acceleration (−). lateral: g of cornering (load goes to the outside tires).
 * Returns tires [outside front, inside front, outside rear, inside rear].
 */
export function tireLoads(v, brake, lateral, { frontRoll = .6, frontCenter = 2, rearCenter = 12 } = {}) {
  const frontLb = v.frontLb ?? v.weight * v.front;
  const rearLb = v.rearLb ?? v.weight - frontLb;
  const longitudinal = longitudinalTransfer(v.weight, v.cg, v.wheelbase, brake);
  const rollAxis = frontCenter + (rearCenter - frontCenter) * (rearLb / v.weight);
  const elastic = v.cg - rollAxis;
  const dF = lateral * (v.weight * elastic * frontRoll + frontLb * frontCenter) / v.frontTrack;
  const dR = lateral * (v.weight * elastic * (1 - frontRoll) + rearLb * rearCenter) / v.rearTrack;
  const f = (frontLb + longitudinal) / 2;
  const r = (rearLb - longitudinal) / 2;
  const tires = [f + dF, f - dF, r + dR, r - dR];
  return { tires, longitudinal, front: dF, rear: dR, lateral: dF + dR,
    lltdFront: dF + dR > 0 ? dF / (dF + dR) : null, rollAxis,
    invalid: tires.some(x => x <= 0) || elastic <= 0 };
}

/**
 * Wheel rate, ride rate and natural frequency for one corner, identical to the ESS Spring Rate calculator.
 * cornerLb: total corner weight; unsprung: unsprung lb; spring lb/in; motion = spring travel / wheel travel;
 * angleDeg: spring angle from vertical; tireRate lb/in (optional, omit for rigid tire).
 */
export function ride({ cornerLb, unsprung, spring, motion, angleDeg = 0, tireRate = null }) {
  const m = motion * Math.cos(angleDeg * Math.PI / 180);
  const wheel = spring * m * m;
  const rate = tireRate ? wheel * tireRate / (wheel + tireRate) : wheel;
  const sprung = cornerLb - unsprung;
  return { wheel, rate, sprung, hz: sprung > 0 ? Math.sqrt(rate * G_IN / sprung) / (2 * Math.PI) : null,
    staticDeflection: sprung > 0 ? sprung / rate : null };
}

/** Spring rate needed for a target ride frequency (inverse of ride). Returns null if the tire alone is too soft. */
export function springForFrequency({ cornerLb, unsprung, motion, angleDeg = 0, tireRate = null, hz }) {
  const m = motion * Math.cos(angleDeg * Math.PI / 180);
  const need = (cornerLb - unsprung) * (2 * Math.PI * hz) ** 2 / G_IN;
  if (tireRate && need >= tireRate) return null;
  const wheel = tireRate ? need * tireRate / (tireRate - need) : need;
  return wheel / (m * m);
}
