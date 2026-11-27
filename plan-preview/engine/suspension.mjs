// ESS engineering library — simplified suspension geometry for interactive experiments.
// 2-D views only: front view (camber, front-view instant centre, roll centre) and side view (anti-squat,
// anti-dive, anti-lift). Body is held still; the wheel moves. Units: in and degrees.
// Front-view coordinates: y = outboard from the car's centreline, z = up from the ground at static ride height.
// Side-view coordinates: x = forward from the axle in question's tire contact patch, z = up from the ground.
// Limitations (shown to visitors): rigid links and bushings, no compliance, no steering, no caster/kingpin 3-D
// effects, symmetric heave for roll centres, tire contact moves with the wheel centre (constant loaded radius).

const deg = r => r * 180 / Math.PI;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const len = a => Math.hypot(a[0], a[1]);
const rot = (p, c, ang) => { const s = Math.sin(ang), k = Math.cos(ang), d = sub(p, c); return [c[0] + d[0] * k - d[1] * s, c[1] + d[0] * s + d[1] * k]; };

/** Intersection of line (p1→p2) with line (p3→p4). Null when parallel. */
export function intersect(p1, p2, p3, p4) {
  const d1 = sub(p2, p1), d2 = sub(p4, p3);
  const det = d1[0] * d2[1] - d1[1] * d2[0];
  if (Math.abs(det) < 1e-9 * len(d1) * len(d2)) return null;
  const t = ((p3[0] - p1[0]) * d2[1] - (p3[1] - p1[1]) * d2[0]) / det;
  return [p1[0] + t * d1[0], p1[1] + t * d1[1]];
}

/** Circle–circle intersection; picks the solution nearest `near`. */
function circles(c1, r1, c2, r2, near) {
  const d = len(sub(c2, c1));
  if (d > r1 + r2 || d < Math.abs(r1 - r2) || d === 0) return null;
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const u = [(c2[0] - c1[0]) / d, (c2[1] - c1[1]) / d];
  const m = [c1[0] + a * u[0], c1[1] + a * u[1]];
  const s1 = [m[0] - h * u[1], m[1] + h * u[0]], s2 = [m[0] + h * u[1], m[1] - h * u[0]];
  return len(sub(s1, near)) <= len(sub(s2, near)) ? s1 : s2;
}

/**
 * Find x near 0 with f(x) = target: walk outward from 0 in both directions over the reachable (finite) range,
 * then bisect the first bracket. Returns null if the linkage cannot reach the target.
 */
function solve(f, target, lo, hi, steps = 180) {
  const g = x => f(x) - target;
  const g0 = g(0);
  if (!Number.isFinite(g0)) return null;
  if (g0 === 0) return 0;
  for (const end of [hi, lo]) {
    let a = 0, ga = g0;
    for (let i = 1; i <= steps / 2; i++) {
      let b = end * i / (steps / 2); const gb = g(b);
      if (!Number.isFinite(gb)) break;            // linkage locks up beyond here
      if (ga * gb <= 0) {
        for (let k = 0; k < 80; k++) {
          const m = (a + b) / 2, gm = g(m);
          if (ga * gm <= 0) b = m; else { a = m; ga = gm; }
        }
        return (a + b) / 2;
      }
      a = b; ga = gb;
    }
  }
  return null;
}

// Roll-centre height above the ground (the ground sits at z = travel when the body is held still).
function rollCentre(ic, contact) {
  if (!ic) return { height: 0, note: 'parallel lines: roll centre at ground level' };
  if (Math.abs(ic[0] - contact[0]) < 1e-9) return { height: null, note: 'instant centre directly above the tire' };
  // Line from contact patch through IC, evaluated at the centreline (y = 0).
  return { height: (ic[1] - contact[1]) * (0 - contact[0]) / (ic[0] - contact[0]) };
}

/**
 * Short/long-arm (double wishbone) front view.
 * g: { upperInner, upperOuter, lowerInner, lowerOuter, wheelCenter, tireRadius, staticCamber=0 } as [y, z] pairs.
 * Returns state at a wheel travel (in, + = bump) or null if the linkage cannot reach it.
 */
export function slaAt(g, travel) {
  const Lu = len(sub(g.upperOuter, g.upperInner)), Ll = len(sub(g.lowerOuter, g.lowerInner));
  const Lk = len(sub(g.upperOuter, g.lowerOuter));
  const a0 = Math.atan2(g.lowerOuter[1] - g.lowerInner[1], g.lowerOuter[0] - g.lowerInner[0]);
  const upright0 = Math.atan2(g.upperOuter[1] - g.lowerOuter[1], g.upperOuter[0] - g.lowerOuter[0]);
  const pose = da => {
    const lo = rot(g.lowerOuter, g.lowerInner, da);
    const uo = circles(g.upperInner, Lu, lo, Lk, g.upperOuter);
    if (!uo) return null;
    const turn = Math.atan2(uo[1] - lo[1], uo[0] - lo[0]) - upright0;
    const wc = rot(add(lo, sub(g.wheelCenter, g.lowerOuter)), lo, turn);
    return { lo, uo, turn, wc };
  };
  const z = da => pose(da)?.wc[1] ?? NaN;
  const span = .9; // ± ~50° of lower-arm swing
  const da = solve(z, g.wheelCenter[1] + travel, -span, span);
  if (da === null) return null;
  const p = pose(da);
  const ic = intersect(g.upperInner, p.uo, g.lowerInner, p.lo);
  const contact = [p.wc[0], travel];
  const rc = rollCentre(ic, contact);
  // Upright rotating toward the car's centreline at the top = more negative camber (top in).
  // y is outboard, so a counter-clockwise turn in (y, z) moves the top inboard.
  const camber = (g.staticCamber ?? 0) - deg(p.turn);
  return {
    travel, camber, camberChange: camber - (g.staticCamber ?? 0),
    instantCentre: ic, rollCentreHeight: rc.height, rollCentreNote: rc.note ?? null,
    swingArm: ic ? Math.abs(ic[0] - contact[0]) : Infinity,
    trackChange: 2 * (p.wc[0] - g.wheelCenter[0]), // both sides in heave
    points: { upperInner: g.upperInner, upperOuter: p.uo, lowerInner: g.lowerInner, lowerOuter: p.lo, wheelCenter: p.wc, contact },
    lowerArmAngle: deg(a0 + da),
  };
}

/**
 * MacPherson strut front view. The upright is taken as rigid with the line from the lower ball joint to the strut
 * top mount (ignores strut offset from the ball joint: a teaching simplification).
 * g: { top, lowerInner, lowerOuter, wheelCenter, tireRadius, staticCamber=0 }
 */
export function strutAt(g, travel) {
  const axis0 = Math.atan2(g.top[1] - g.lowerOuter[1], g.top[0] - g.lowerOuter[0]);
  const pose = da => {
    const lo = rot(g.lowerOuter, g.lowerInner, da);
    const turn = Math.atan2(g.top[1] - lo[1], g.top[0] - lo[0]) - axis0;
    const wc = rot(add(lo, sub(g.wheelCenter, g.lowerOuter)), lo, turn);
    return { lo, turn, wc };
  };
  const da = solve(d => pose(d).wc[1], g.wheelCenter[1] + travel, -.9, .9);
  if (da === null) return null;
  const p = pose(da);
  const axis = sub(g.top, p.lo);
  const perp = add(g.top, [-axis[1], axis[0]]); // line through the top mount, perpendicular to the strut
  const ic = intersect(g.lowerInner, p.lo, g.top, perp);
  const contact = [p.wc[0], travel];
  const rc = rollCentre(ic, contact);
  const camber = (g.staticCamber ?? 0) - deg(p.turn);
  return {
    travel, camber, camberChange: camber - (g.staticCamber ?? 0),
    instantCentre: ic, rollCentreHeight: rc.height, rollCentreNote: rc.note ?? null,
    swingArm: ic ? Math.abs(ic[0] - contact[0]) : Infinity, trackChange: 2 * (p.wc[0] - g.wheelCenter[0]),
    strutLength: len(axis),
    points: { top: g.top, lowerInner: g.lowerInner, lowerOuter: p.lo, wheelCenter: p.wc, contact },
  };
}

/** Sweep any front-view corner function over travel (in). Rows that cannot be reached are omitted. */
export function sweep(fn, g, { bump = 3, rebound = 3, step = .25 } = {}) {
  const rows = [];
  for (let t = -rebound; t <= bump + 1e-9; t += step) { const r = fn(g, +t.toFixed(4)); if (r) rows.push(r); }
  return rows;
}

// ---------- Side view: anti-squat / anti-dive / anti-lift ----------

/** Side-view instant centre of two links given as [axleEnd, chassisEnd] points in side-view coordinates. */
export function linkInstantCentre(upper, lower) {
  const ic = intersect(upper[0], upper[1], lower[0], lower[1]);
  if (ic) return { ic, slope: ic[1] / ic[0] };
  // Parallel links: the axle translates; use the common link slope.
  const d = sub(lower[1], lower[0]);
  return { ic: null, slope: d[1] / d[0] };
}

/**
 * Rear anti-squat (%) under acceleration.
 * slope = tan of the line from the reaction point (tire contact for a live axle; wheel centre for an independent
 * rear with a chassis-mounted differential) to the side-view instant centre. 100% = no squat or rise from
 * the drive force; >100% = the rear lifts under power.
 */
export function antiSquat({ wheelbase, cg, slope }) {
  return 100 * slope / (cg / wheelbase);
}

/**
 * Rear suspension side-view geometry by architecture. Returns { slope, ic, antiSquat, approximate, note }.
 *  fourLink / threeLink: { upper:[axleEnd, chassisEnd], lower:[axleEnd, chassisEnd] } (3-link: the single upper)
 *  torqueArm: { lower:[axleEnd, chassisEnd], armFrontX } — IC where the lower-arm line meets the vertical
 *             through the torque-arm front mount (the mount carries vertical load only).
 *  leaf:      { frontEye:[x,z], axleSeat:[x,z] } — approximate: reports the range between treating the front
 *             segment as a link pivoting at the eye and at 3/4 of its length (leaf wind-up is not a pin joint).
 *  independent: { upper, lower, tireRadius } — drive torque reacted by the chassis: line from wheel centre.
 */
export function rearGeometry(arch, g, { wheelbase, cg }) {
  const pack = (slope, ic, extra = {}) => ({ slope, ic, antiSquat: antiSquat({ wheelbase, cg, slope }), ...extra });
  if (arch === 'fourLink' || arch === 'threeLink') {
    const { ic, slope } = linkInstantCentre(g.upper, g.lower);
    return pack(slope, ic, { note: ic ? null : 'parallel links: instant centre at infinity, slope = link angle' });
  }
  if (arch === 'torqueArm') {
    const ic = intersect(g.lower[0], g.lower[1], [g.armFrontX, 0], [g.armFrontX, 1]);
    return ic ? pack(ic[1] / ic[0], ic) : pack(NaN, null, {note: 'No finite side-view intersection.'});
  }
  if (arch === 'leaf') {
    const seg = sub(g.frontEye, g.axleSeat);
    const atEye = g.frontEye, atThreeQuarter = add(g.axleSeat, [seg[0] * .75, seg[1] * .75]);
    const s1 = atEye[1] / atEye[0], s2 = atThreeQuarter[1] / atThreeQuarter[0];
    return { approximate: true, range: [antiSquat({ wheelbase, cg, slope: Math.min(s1, s2) }), antiSquat({ wheelbase, cg, slope: Math.max(s1, s2) })],
      ...pack((s1 + s2) / 2, atEye), note: 'Leaf springs wind up rather than pivot; shown as a range.' };
  }
  if (arch === 'independent') {
    const { ic, slope: s } = linkInstantCentre(g.upper, g.lower);
    const slope = ic ? (ic[1] - g.tireRadius) / ic[0] : s;
    return pack(slope, ic, { note: 'Independent rear with chassis-mounted differential: line drawn from the wheel centre.' });
  }
  throw new Error('Unknown rear architecture: ' + arch);
}

/**
 * Front anti-dive (%) with outboard brakes: slope from the front contact patch to the front side-view IC
 * (x measured rearward from the front contact patch), times L/h, times the front share of braking.
 * Inboard brakes: pass reaction 'wheelCentre' and tireRadius.
 */
export function antiDive({ wheelbase, cg, ic, frontBrakeShare, reaction = 'contact', tireRadius = 0 }) {
  const z = reaction === 'contact' ? ic[1] : ic[1] - tireRadius;
  return 100 * (z / ic[0]) * (wheelbase / cg) * frontBrakeShare;
}

/** Rear anti-lift (%) under braking for a live axle with outboard brakes. */
export function antiLift({ wheelbase, cg, slope, frontBrakeShare }) {
  return 100 * slope * (wheelbase / cg) * (1 - frontBrakeShare);
}

// ---------- Live-axle roll centre by lateral locator ----------
/**
 * panhard: { left:[y,z], right:[y,z] } bar ends in front view — RC = bar height at the centreline.
 * watts:   { pivotHeight } — RC at the centre pivot.
 * leaf:    { seatHeight } — approximate: RC near the spring-to-axle seat height.
 */
export function liveAxleRollCentre(locator, g) {
  if (locator === 'panhard') {
    const [l, r] = [g.left, g.right];
    return { height: l[1] + (r[1] - l[1]) * (0 - l[0]) / (r[0] - l[0]), note: 'Moves with the bar angle: changes with ride height and in roll.' };
  }
  if (locator === 'watts') return { height: g.pivotHeight, note: 'Fixed to the axle if the pivot is on the axle; to the body if on the body.' };
  if (locator === 'leaf') return { height: g.seatHeight, approximate: true, note: 'Approximate: leaf shackle angle and spring twist move it.' };
  throw new Error('Unknown locator: ' + locator);
}
