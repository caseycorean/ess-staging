// ESS engineering library — Suspension V2 live-axle link solver (3-D rigid links, continuation from ride height).
//
// Same physical model as experience/rear-links.mjs (preserved unchanged): the axle is a rigid body whose height
// (heave) and roll are prescribed; the solver finds fore/aft shift, lateral shift, pitch and yaw so every link keeps
// its length. Differences in V2:
//  - Continuation: the pose is reached in small steps from ride height, each warm-started from the last, so the
//    answer stays on the assembly the visitor drew (the preserved lab starts every solve from zero).
//  - Classification: an exactly constrained layout (4 links) either fits, reaches a genuine lock-up, or the solver
//    fails; an over-constrained layout (5 links, e.g. parallel four-link + Panhard) is reported as BINDING with the
//    amount the bushings would have to absorb, which is what happens on a real car.
// Frame: x forward from the axle centre, y driver's right, z up from the road. Inches; roll in degrees.

import { rearGeometry } from './suspension.mjs';

export const STATUS = { ok: 'ok', caution: 'caution', limit: 'limit', invalid: 'invalid', failure: 'failure' };
const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
const norm = v => Math.hypot(...v);
const DOF = 4;

export function axlePoint(point, radius, pose, heave, roll) {
  const [dx, dy, pitch, yaw] = pose;
  const [x, y, z] = [point[0], point[1], point[2] - radius];
  const py = y * Math.cos(roll) - z * Math.sin(roll), pz = y * Math.sin(roll) + z * Math.cos(roll);
  const xx = x * Math.cos(pitch) + pz * Math.sin(pitch), zz = -x * Math.sin(pitch) + pz * Math.cos(pitch);
  return [dx + xx * Math.cos(yaw) - py * Math.sin(yaw), dy + xx * Math.sin(yaw) + py * Math.cos(yaw), radius + heave + zz];
}

function solveLinear(m, v) {
  const a = m.map((row, i) => [...row, v[i]]);
  for (let i = 0; i < v.length; i++) {
    let p = i; for (let j = i + 1; j < a.length; j++) if (Math.abs(a[j][i]) > Math.abs(a[p][i])) p = j;
    if (Math.abs(a[p][i]) < 1e-14) return null;
    [a[i], a[p]] = [a[p], a[i]];
    const s = a[i][i]; a[i] = a[i].map(x => x / s);
    for (let j = 0; j < a.length; j++) if (j !== i) { const q = a[j][i]; a[j] = a[j].map((x, c) => x - q * a[i][c]); }
  }
  return a.map(r => r.at(-1));
}

/** Smallest eigenvalue of a symmetric 4×4 (JᵀJ) by inverse power iteration; ~0 means the linkage is locked. */
function minEigen(m) {
  let v = [1, .7, .4, .2], lam = 0;
  for (let k = 0; k < 40; k++) {
    const w = solveLinear(m, v); if (!w) return 0;
    const n = norm(w); v = w.map(x => x / n); lam = 1 / n;
  }
  return lam;
}

export function validateLinks(links) {
  const issues = [];
  for (const l of links) {
    if (l.group === 'slider') continue;
    if (norm(l.axle.map((v, i) => v - l.chassis[i])) < 4) issues.push({ level: STATUS.invalid, text: `${l.name} is shorter than 4 in: move its mounting points apart.` });
  }
  return issues;
}

/**
 * Solver for one link layout. links: [{name, group:'lower'|'upper'|'lateral'|'slider', axle:[x,y,z], chassis:[x,y,z]}]
 * at({heave, roll}) → { status, reason, pose, current, bind, residual, … }.
 */
export function axleSolver(links, { radius = 13 } = {}) {
  const issues = validateLinks(links);
  const lengths = links.map(l => norm(l.axle.map((v, i) => v - l.chassis[i])));
  const constraints = links.length;
  const over = constraints > DOF;
  const valid = !issues.length;

  const errors = (pose, heave, roll) => links.map((l, i) => {
    const p = axlePoint(l.axle, radius, pose, heave, roll);
    return l.group === 'slider' ? p[2] - l.chassis[2] : norm(p.map((v, j) => v - l.chassis[j])) - lengths[i];
  });
  const jac = (pose, heave, roll, e0) => [1e-6, 1e-6, 1e-7, 1e-7].map((h, j) =>
    errors(pose.map((p, i) => p + (i === j ? h : 0)), heave, roll).map((e, i) => (e - e0[i]) / h));

  function lm(start, heave, roll) {
    let pose = [...start], e = errors(pose, heave, roll), damping = 1e-6;
    for (let it = 0; it < 60; it++) {
      const cols = jac(pose, heave, roll, e);
      const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
      const g = cols.map(c => dot(c, e));
      if (norm(g) < 1e-13) break;
      const m = cols.map((a, i) => cols.map((b, j) => dot(a, b) + (i === j ? damping : 0)));
      const dlt = solveLinear(m, g.map(x => -x)); if (!dlt) break;
      const next = pose.map((p, i) => p + dlt[i]), en = errors(next, heave, roll);
      if (norm(en) < norm(e)) { pose = next; e = en; damping = Math.max(1e-12, damping * .3); if (norm(dlt) < 1e-11) break; }
      else damping *= 10;
    }
    const cols = jac(pose, heave, roll, e);
    const jtj = cols.map(a => cols.map(b => a.reduce((s, x, i) => s + x * b[i], 0)));
    return { pose, e, residual: Math.max(...e.map(Math.abs)), rms: norm(e), stiffness: minEigen(jtj) };
  }

  const cache = new Map();
  function at({ heave = 0, roll = 0 } = {}) {
    if (!valid) return { status: STATUS.invalid, reason: issues[0].text, issues, heave, roll };
    const key = heave.toFixed(4) + '|' + roll.toFixed(4);
    if (cache.has(key)) return cache.get(key);
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(heave) / .1, Math.abs(roll) / .25)));
    let pose = [0, 0, 0, 0], last = null, tol = 1e-7;
    for (let s = 1; s <= steps; s++) {
      let tryFrom = pose, done = false;
      for (const sub of [1, 2, 4, 8, 16]) {
        let p = tryFrom, ok = true, r;
        for (let k = 1; k <= sub; k++) {
          const f = (s - 1 + k / sub) / steps;
          r = lm(p, heave * f, rad(roll * f));
          if (!over && r.residual > tol) { ok = false; break; }
          if (Math.abs(r.pose[2]) > .6 || Math.abs(r.pose[3]) > .6 || Math.abs(r.pose[0]) > 12 || Math.abs(r.pose[1]) > 12) { ok = false; r.wild = true; break; }
          p = r.pose;
        }
        if (ok) { pose = p; last = r; done = true; break; }
        last = r;
      }
      if (!done) {
        const reached = (s - 1) / steps;
        const locked = last.wild || last.stiffness < 1e-6;
        const out = { heave, roll, status: locked ? STATUS.limit : STATUS.failure, reachedFraction: reached,
          reason: locked
            ? `The rigid links lock up at about ${(heave * reached).toFixed(2)} in of travel and ${(roll * reached).toFixed(1)}° of roll: the axle cannot move further without a link changing length.`
            : `Solver failure: no verified pose was found (error ${last.residual.toExponential(1)} in). Result withheld.` };
        cache.set(key, out); return out;
      }
    }
    if (!last) last = lm(pose, heave, rad(roll));
    const current = links.map(l => ({ ...l, current: axlePoint(l.axle, radius, pose, heave, rad(roll)) }));
    let status = STATUS.ok, reason = 'Every link keeps its length.';
    const bind = over ? last.residual : 0;
    if (over && bind > .5) { status = STATUS.limit; reason = `The links bind: rigid links would disagree by ${bind.toFixed(2)} in. Bushings cannot absorb that; this layout cannot reach this pose.`; }
    else if (over && bind > .005) { status = STATUS.caution; reason = `The links bind by ${bind.toFixed(3)} in: five links over-constrain a live axle, so in roll the bushings must deflect this much. Valid only with compliant bushings.`; }
    const out = { heave, roll, status, reason, pose, current, residual: last.residual, bind, radius,
      pitch: deg(pose[2]), yaw: deg(pose[3]) };
    cache.set(key, out); return out;
  }

  /** Side-view instant centre and anti-squat at zero roll (rear-drive, outboard brakes). */
  function sideView(r, { wheelbase, cg } = {}, { side = 0 } = {}) {
    if (!r.current) return null;
    const avg = (pts, a) => pts.reduce((s, p) => s + p[a], 0) / pts.length;
    const onSide = l => !side || Math.abs(l.axle[1]) < 1e-6 || Math.sign(l.axle[1]) === side;
    const line = g => { const ls = r.current.filter(l => l.group === g && onSide(l)); return ls.length ? [[avg(ls.map(l => l.current), 0), avg(ls.map(l => l.current), 2)], [avg(ls.map(l => l.chassis), 0), avg(ls.map(l => l.chassis), 2)]] : null; };
    const lower = line('lower'), upper = line('upper'), slider = r.current.find(l => l.group === 'slider');
    const off = ([x, z]) => [x - r.pose[0], z - r.heave];
    const geo = rearGeometry(slider ? 'torqueArm' : 'fourLink', { upper: upper?.map(off), lower: lower.map(off), armFrontX: slider ? slider.current[0] - r.pose[0] : undefined }, { wheelbase, cg });
    const ic = geo.ic ? [geo.ic[0] + r.pose[0], geo.ic[1] + r.heave] : null;
    return { lower, upper, ic, antiSquat: wheelbase && cg && Number.isFinite(geo.antiSquat) && (!geo.ic || geo.ic[0] > .1) ? geo.antiSquat : null, parallel: !geo.ic };
  }

  /**
   * Kinematic side-view instant centre from the axle's actual motion (works for any layout, symmetric or not):
   * the point on the axle's centre plane (y = 0) whose small-heave displacement in x and z is zero. For a symmetric
   * layout this equals the link-line intersection; for an asymmetric one the link lines of the two sides disagree and
   * there is no single "line" answer, but the axle still pitches about one point. Null for pure translation.
   */
  function kinematicIC(r, { wheelbase, cg } = {}) {
    if (!r.pose || Math.abs(r.roll) > 1e-9) return null;
    const dh = .01, q = lm(r.pose, r.heave + dh, 0);
    if (!over && q.residual > 1e-6) return null;
    const disp = p => { const a = axlePoint([p[0], 0, p[1]], radius, r.pose, r.heave, 0), b = axlePoint([p[0], 0, p[1]], radius, q.pose, r.heave + dh, 0); return [b[0] - a[0], b[2] - a[2]]; };
    // displacement is affine in the axle-frame point: d(p) = d0 + M p; solve d = 0
    const d0 = disp([0, radius]), dx = disp([1, radius]), dz = disp([0, radius + 1]);
    const M = [[dx[0] - d0[0], dz[0] - d0[0]], [dx[1] - d0[1], dz[1] - d0[1]]];
    const det = M[0][0] * M[1][1] - M[0][1] * M[1][0];
    if (Math.abs(det) < 1e-12) return { ic: null, parallel: true, antiSquat: wheelbase && cg ? 100 * (d0[1] ? (d0[1] / (d0[0] || 1e-12)) : 0) / (cg / wheelbase) : null };
    const px = -(M[1][1] * d0[0] - M[0][1] * d0[1]) / det, pz = -(-M[1][0] * d0[0] + M[0][0] * d0[1]) / det;
    const world = axlePoint([px, 0, radius + pz], radius, r.pose, r.heave, 0);
    const ic = [world[0] - r.pose[0], world[2]]; // x from the axle centre, z above the road datum at this travel
    const slope = (ic[1] - r.heave) / ic[0];
    return { ic, parallel: false, antiSquat: wheelbase && cg && ic[0] > .1 ? 100 * slope / (cg / wheelbase) : null };
  }

  /** Is the layout mirror-symmetric (every left link has a right twin, centre links on y = 0)? */
  function symmetric() {
    const tol = 1e-6;
    return links.every(l => {
      if (l.group === 'slider' || l.group === 'lateral') return true;
      if (Math.abs(l.axle[1]) < tol && Math.abs(l.chassis[1]) < tol) return true;
      return links.some(m => m !== l && m.group === l.group && Math.abs(m.axle[0] - l.axle[0]) < tol && Math.abs(m.axle[1] + l.axle[1]) < tol && Math.abs(m.axle[2] - l.axle[2]) < tol &&
        Math.abs(m.chassis[0] - l.chassis[0]) < tol && Math.abs(m.chassis[1] + l.chassis[1]) < tol && Math.abs(m.chassis[2] - l.chassis[2]) < tol);
    });
  }

  /** Small-motion properties: roll centre height, roll steer (deg/deg), pinion change (deg/in). */
  function derivatives(r) {
    if (!r.pose || r.status === STATUS.limit) return null;
    const h = r.heave, ro = r.roll, s = (dh, dr) => {
      const q = lm(r.pose, h + dh, rad(ro + dr));
      return !over && q.residual > 1e-6 ? null : q.pose;
    };
    const ra = s(0, -.05), rb = s(0, .05), ha = s(-.01, 0), hb = s(.01, 0);
    if (!ra || !rb || !ha || !hb) return null;
    return { rollCentre: radius + (rb[1] - ra[1]) / rad(.1), rollSteer: (rb[3] - ra[3]) / rad(.1), pinionRate: deg(hb[2] - ha[2]) / .02, travelSteer: deg(hb[3] - ha[3]) / .02 };
  }

  return { at, sideView, kinematicIC, symmetric, derivatives, valid, issues, over, lengths };
}
