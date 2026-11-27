/* Derived rear-axle geometry from the rigid-link solver (Claude, 25 Nov).
 * Same frame as rear-links.mjs: x forward, y driver's right, z up from road, inches, axle roll +
 * = right side of the axle rises relative to the body (body leaning right, i.e. a left-hand turn).
 * Everything here is a small-motion derivative of solveRearLinks, so it works for any layout. */
import { solveRearLinks } from './rear-links.mjs';

const rad = d => d * Math.PI / 180;
const deg = r => r * 180 / Math.PI;

/** Instantaneous properties at the given heave/roll. Returns nulls when the pose does not fit. */
export function rearLinkInsights(links, {heave = 0, roll = 0, radius = 13} = {}) {
  const at = (h, r) => solveRearLinks(links, {heave: h, roll: r, radius});
  const base = at(heave, roll);
  if (!base.pose || base.residual > .02) return {rollCentre: null, rollSteer: null, pinionRate: null, fits: false};
  const dr = .05, dh = .01; // degrees, inches
  const ra = at(heave, roll - dr), rb = at(heave, roll + dr);
  const ha = at(heave - dh, roll), hb = at(heave + dh, roll);
  const fit = [ra, rb, ha, hb].every(r => r.pose && r.residual <= .02);
  if (!fit) return {rollCentre: null, rollSteer: null, pinionRate: null, fits: false};
  // Axle-centre plane point with zero lateral velocity in roll = kinematic roll centre (relative to the body).
  const dyPerRad = (rb.pose[1] - ra.pose[1]) / rad(2 * dr);
  const rollCentre = radius + heave + dyPerRad - heave; // height above road at this ride height
  const rollSteer = (rb.pose[3] - ra.pose[3]) / rad(2 * dr); // deg axle steer per deg roll
  const pinionRate = deg(hb.pose[2] - ha.pose[2]) / (2 * dh); // deg pinion change per inch of axle travel
  return {rollCentre, rollSteer, pinionRate, fits: true};
}

/** Plain-language reading of roll steer. Positive = rear axle steers out of the turn = roll oversteer. */
export function rollSteerMeaning(rollSteer) {
  if (!Number.isFinite(rollSteer)) return '';
  const pct = Math.abs(rollSteer * 100);
  if (pct < 1) return 'About neutral: the axle barely steers as the body rolls.';
  return rollSteer > 0
    ? `Roll oversteer: the axle steers out of the turn (${pct.toFixed(0)}% of body-to-axle roll). Lowering the lower links' front mounts reduces it.`
    : `Roll understeer: the axle steers into the turn (${pct.toFixed(0)}% of body-to-axle roll), which settles the rear.`;
}

/** Anti-squat across travel at zero roll, for a small chart or table. */
export function antiSquatCurve(links, {radius = 13, wheelbase, cg, from = -3, to = 3, step = 1} = {}) {
  const rows = [];
  for (let h = from; h <= to + 1e-9; h += step) {
    const r = solveRearLinks(links, {heave: h, roll: 0, radius, wheelbase, cg});
    rows.push({heave: +h.toFixed(3), antiSquat: Number.isFinite(r.antiSquat) ? r.antiSquat : null, center: r.center});
  }
  return rows;
}
