// ESS engineering library — Suspension V2 planar corner solver (front view of one corner).
//
// Why this exists (owner review, 26 Nov 2026): engine/suspension.mjs `slaAt` finds travel by scanning the lower-arm
// angle for ANY sign change of (wheel-centre height − target), scanning the bump direction first, and picks the
// upper ball joint as the circle–circle solution nearest the STATIC ball joint. With an edited upper ball joint the
// far end of the bump scan flips to the other assembly branch, the height jumps across the target, and bisection
// converges onto that jump. Result: a "solution" for 0.1 in droop with ~20 in of track change, ~170° camber and a
// roll centre near 100 in. That module is left untouched (the preserved site uses it); V2 uses this one.
//
// Method here
//  1. The static layout the visitor drew defines the link lengths and the assembly branch (which side of the line
//     upper-inner → lower-ball-joint the upper ball joint sits on). Lengths and branch never change afterwards.
//  2. Travel is reached by CONTINUATION: march the lower-arm angle away from ride height in small steps in the
//     direction that moves the wheel the requested way, staying on the same branch, and stop at the first genuine
//     mechanical limit (links cannot assemble, toggle/dead point, arms collide, upright inverts).
//  3. The target height is bracketed between two neighbouring march samples on that one continuous path and bisected.
//  4. Every answer is verified: all link lengths and the requested height are re-measured. A mismatch is reported as a
//     SOLVER FAILURE, never shown as suspension movement.
//
// Coordinates: y = outboard from the car's centreline, z = up from the ground at static ride height, inches, degrees.
// Body held still; the road moves with travel (travel + = bump/compression, − = droop/rebound).

const deg = r => r * 180 / Math.PI;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const len = a => Math.hypot(a[0], a[1]);
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const rot = (p, c, ang) => { const s = Math.sin(ang), k = Math.cos(ang), d = sub(p, c); return [c[0] + d[0] * k - d[1] * s, c[1] + d[0] * s + d[1] * k]; };
const angleOf = v => Math.atan2(v[1], v[0]);
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

export const STATUS = {
  ok: 'ok',             // valid geometry
  caution: 'caution',   // valid, but undesirable or worth checking (explained)
  limit: 'limit',       // genuine mechanical limitation of this rigid-link model: the wheel cannot get there
  invalid: 'invalid',   // the drawn layout itself is not a buildable linkage
  failure: 'failure',   // the solver could not verify an answer (numerical problem, not suspension behaviour)
};

/** Ball-joint articulation treated as a hard mechanical stop (deg from ride height). Typical parts allow ~20–35°,
 * high-angle parts ~40°; 45° is deliberately generous so it only removes motion no real joint can follow. */
export const BALL_JOINT_MAX = 45;
/** Roll-centre heights beyond this (in) are reported as 'extremely sensitive' instead of plotted as numbers. */
export const RC_EXTREME = 60;

export const KINDS = {
  sla: ['upperInner', 'upperOuter', 'lowerInner', 'lowerOuter', 'wheelCenter'],
  strut: ['top', 'lowerInner', 'lowerOuter', 'wheelCenter'],
};

/** Proper segment intersection (excludes shared end points). */
function segmentsCross(a, b, c, d) {
  const d1 = cross(sub(b, a), sub(c, a)), d2 = cross(sub(b, a), sub(d, a));
  const d3 = cross(sub(d, c), sub(a, c)), d4 = cross(sub(d, c), sub(b, c));
  return d1 * d2 < -1e-9 && d3 * d4 < -1e-9;
}

/** Line (p1→p2) with line (p3→p4). Null when parallel. */
export function intersect(p1, p2, p3, p4) {
  const d1 = sub(p2, p1), d2 = sub(p4, p3);
  const det = cross(d1, d2);
  if (Math.abs(det) < 1e-9 * len(d1) * len(d2)) return null;
  const t = cross(sub(p3, p1), d2) / det;
  return [p1[0] + t * d1[0], p1[1] + t * d1[1]];
}

/** Static layout checks. Returns a list of {level:'invalid'|'caution', code, text}. */
export function checkLayout(kind, g) {
  const out = [];
  const bad = (code, text) => out.push({ level: STATUS.invalid, code, text });
  for (const k of KINDS[kind]) if (!Array.isArray(g[k]) || !g[k].every(Number.isFinite)) bad('missing', `Missing point: ${k}.`);
  if (out.length) return out;
  const shortest = 2; // in — below this a "link" is a joint, not an arm
  if (len(sub(g.lowerOuter, g.lowerInner)) < shortest) bad('short-lower', 'The lower arm is shorter than 2 in: its pivot and ball joint are on top of each other.');
  if (g.lowerInner[0] >= g.lowerOuter[0] - .5) bad('lower-reversed', 'The lower arm’s inner pivot is not inboard of its ball joint.');
  if (kind === 'sla') {
    if (len(sub(g.upperOuter, g.upperInner)) < shortest) bad('short-upper', 'The upper arm is shorter than 2 in: its pivot and ball joint are on top of each other.');
    if (g.upperInner[0] >= g.upperOuter[0] - .5) bad('upper-reversed', 'The upper arm’s inner pivot is not inboard of its ball joint.');
    if (g.upperOuter[1] <= g.lowerOuter[1] + 1) bad('upright-inverted', 'The upper ball joint must sit above the lower ball joint.');
    if (segmentsCross(g.upperInner, g.upperOuter, g.lowerInner, g.lowerOuter)) bad('arms-cross', 'The upper and lower arms cross each other.');
  } else {
    if (g.top[1] <= g.lowerOuter[1] + 4) bad('strut-low', 'The strut top mount must sit well above the lower ball joint.');
    if (segmentsCross(g.top, g.lowerOuter, g.lowerInner, g.lowerOuter)) bad('arms-cross', 'The strut crosses the lower arm.');
  }
  return out;
}

/**
 * Build a solver for one corner. `kind` 'sla' | 'strut'. g: points as [y, z] plus tireRadius, staticCamber.
 * Returns { kind, g, issues, valid, at(travel), sweep(opts), reach } — `reach` = { bump:{travel, reason}, droop:{…} }.
 */
export function corner(kind, g, { maxTravel = 8 } = {}) {
  const issues = checkLayout(kind, g);
  const valid = !issues.some(i => i.level === STATUS.invalid);
  const api = { kind, g, issues, valid };
  if (!valid) {
    const fail = travel => ({ travel, status: STATUS.invalid, reason: issues[0].text, issues });
    return Object.assign(api, { at: fail, sweep: () => ({ rows: [], reach: null }), reach: null });
  }

  const Ll = len(sub(g.lowerOuter, g.lowerInner));
  const Lu = kind === 'sla' ? len(sub(g.upperOuter, g.upperInner)) : null;
  const Lk = kind === 'sla' ? len(sub(g.upperOuter, g.lowerOuter)) : null;
  // Wheel centre expressed in the upright's own frame (origin lower ball joint, x along upright axis).
  const axisPoint = kind === 'sla' ? g.upperOuter : g.top;
  const upright0 = angleOf(sub(axisPoint, g.lowerOuter));
  const wcLocal = rot(sub(g.wheelCenter, g.lowerOuter), [0, 0], -upright0);
  const branch = kind === 'sla' ? Math.sign(cross(sub(g.lowerOuter, g.upperInner), sub(g.upperOuter, g.upperInner))) || 1 : 0;
  const bjLower0 = wrap(angleOf(sub(g.lowerInner, g.lowerOuter)) - upright0);
  const bjUpper0 = kind === 'sla' ? wrap(angleOf(sub(g.upperInner, g.upperOuter)) - (upright0 + Math.PI)) : null;

  /** Pose at lower-arm rotation da (rad). {ok:false, why} when the linkage cannot assemble here. */
  function pose(da) {
    const lo = rot(g.lowerOuter, g.lowerInner, da);
    let uo, axis;
    if (kind === 'sla') {
      const c = g.upperInner, d = len(sub(lo, c));
      if (d > Lu + Lk - 1e-9 || d < Math.abs(Lu - Lk) + 1e-9) return { ok: false, why: 'assembly' };
      const a = (Lu * Lu - Lk * Lk + d * d) / (2 * d), h = Math.sqrt(Math.max(0, Lu * Lu - a * a));
      const u = [(lo[0] - c[0]) / d, (lo[1] - c[1]) / d], m = [c[0] + a * u[0], c[1] + a * u[1]];
      // Two solutions either side of c→lo; keep the one on the original side (branch).
      const s1 = [m[0] - h * u[1], m[1] + h * u[0]], s2 = [m[0] + h * u[1], m[1] - h * u[0]];
      uo = Math.sign(cross(sub(lo, c), sub(s1, c))) === branch ? s1 : s2;
      axis = sub(uo, lo);
      if (h < 1e-3 * Lu) return { ok: false, why: 'toggle', lo, uo };
    } else axis = sub(g.top, lo);
    const ang = angleOf(axis);
    const turn = wrap(ang - upright0);
    const wc = add(lo, rot(wcLocal, [0, 0], ang));
    return { ok: true, da, lo, uo, turn, wc };
  }

  /** Physical sanity of a pose that assembled: returns null or {why, text}. */
  function interference(p) {
    if (kind === 'sla') {
      if (p.uo[1] <= p.lo[1]) return { why: 'inverted', text: 'the upright would turn upside down' };
      if (segmentsCross(g.upperInner, p.uo, g.lowerInner, p.lo)) return { why: 'collision', text: 'the upper and lower arms would pass through each other' };
    } else if (g.top[1] <= p.lo[1] + 2) return { why: 'inverted', text: 'the lower ball joint would reach the strut top mount' };
    if (Math.abs(p.turn) > Math.PI / 3) return { why: 'inverted', text: 'the upright would rotate more than 60°, which no wheel assembly can do' };
    const bj = jointAngles(p);
    if (Math.max(...bj.map(Math.abs)) > BALL_JOINT_MAX) return { why: 'ball-joint', text: `a ball joint would have to rotate more than ${BALL_JOINT_MAX}° from ride height; even high-angle ball joints stop short of that` };
    return null;
  }
  /** Ball-joint rotation from ride height (deg): [lower, upper] for SLA, [lower] for strut (arm vs strut axis). */
  function jointAngles(p) {
    const up = p.turn + upright0;
    const lower = deg(wrap(angleOf(sub(g.lowerInner, p.lo)) - up - bjLower0));
    if (kind !== 'sla') return [lower];
    return [lower, deg(wrap(angleOf(sub(g.upperInner, p.uo)) - (up + Math.PI) - bjUpper0))];
  }
  const okPose = p => p.ok && !interference(p);

  const z0 = g.wheelCenter[1];
  // Direction of lower-arm rotation that raises the wheel (bump).
  const e = 1e-4, zp = pose(e), zm = pose(-e);
  const dzdA = zp.ok && zm.ok ? (zp.wc[1] - zm.wc[1]) / (2 * e) : NaN;
  const STEP = .002, MAX_ANGLE = 1.5;

  const why = {
    assembly: 'the upper arm and upright cannot reach each other (linkage fully stretched or folded)',
    toggle: 'the upper arm and upright line up (toggle position); the linkage locks',
    deadpoint: 'the lower arm reaches the end of its arc for this travel direction',
    range: 'travel beyond the range this lab explores',
  };

  /** March one direction (+1 bump, −1 droop) on the static branch. Samples [{da, z}] and the limit. */
  function trace(dir) {
    const sgn = dir * Math.sign(dzdA);
    const samples = [{ da: 0, z: z0 }];
    let prev = pose(0), limit = null;
    for (let i = 1; i * STEP <= MAX_ANGLE; i++) {
      const da = sgn * i * STEP, p = pose(da);
      const bad = !p.ok ? { why: p.why, text: why[p.why] } : interference(p);
      const stalls = p.ok && (p.wc[1] - prev.wc[1]) * dir <= 0;
      const jumps = p.ok && Math.abs(wrap(p.turn - prev.turn)) > .15; // > 8.6° per 0.11° of arm: near a toggle
      if (bad || stalls || jumps) {
        // Refine where the good path ends.
        let a = samples.at(-1).da, b = da;
        for (let k = 0; k < 40; k++) {
          const m = (a + b) / 2, q = pose(m);
          const good = okPose(q) && (q.wc[1] - pose(a).wc[1]) * dir > 0;
          if (good) a = m; else b = m;
        }
        const end = pose(a);
        if (Math.abs(a - samples.at(-1).da) > 1e-12) samples.push({ da: a, z: end.wc[1] });
        const reason = bad ? bad : stalls ? { why: 'deadpoint', text: why.deadpoint } : { why: 'toggle', text: why.toggle };
        limit = { travel: end.wc[1] - z0, ...reason };
        break;
      }
      samples.push({ da, z: p.wc[1] });
      prev = p;
      if ((p.wc[1] - z0) * dir >= maxTravel) break;
    }
    if (!limit && (samples.at(-1).z - z0) * dir < maxTravel) limit = { travel: samples.at(-1).z - z0, why: 'range', text: why.range };
    return { samples, limit };
  }
  const traces = Number.isFinite(dzdA) && Math.abs(dzdA) > 1e-6 ? { 1: trace(1), [-1]: trace(-1) } : null;
  const reach = traces ? { bump: traces[1].limit, droop: traces[-1].limit } : null;

  function metrics(p, travel) {
    const contact = [p.wc[0], travel];
    let ic, rc, rcNote = null;
    if (kind === 'sla') ic = intersect(g.upperInner, p.uo, g.lowerInner, p.lo);
    else { const ax = sub(g.top, p.lo); ic = intersect(g.lowerInner, p.lo, g.top, add(g.top, [-ax[1], ax[0]])); }
    if (ic) {
      if (Math.abs(ic[0] - contact[0]) < 1e-6) { rc = null; rcNote = 'The instant center is directly above the tire contact patch: the roll center is undefined.'; }
      else rc = contact[1] + (ic[1] - contact[1]) * (0 - contact[0]) / (ic[0] - contact[0]) - travel;
    } else {
      // Parallel arms: the instant centre is at infinity in the arms' direction. The force line from the contact
      // patch runs parallel to the arms (engine/suspension.mjs returned 0 here; that is only right for level arms).
      const d = sub(p.lo, g.lowerInner);
      rc = contact[1] + d[1] / d[0] * (0 - contact[0]) - travel;
      rcNote = 'Parallel arms: instant center at infinity; roll center from the arm direction.';
    }
    const camber = (g.staticCamber ?? 0) - deg(p.turn);
    const out = {
      travel, camber, camberChange: camber - (g.staticCamber ?? 0),
      instantCentre: ic, rollCentreHeight: rc, rollCentreNote: rcNote,
      swingArm: ic ? Math.abs(ic[0] - contact[0]) : Infinity,
      trackChange: 2 * (p.wc[0] - g.wheelCenter[0]),
      points: { lowerInner: g.lowerInner, lowerOuter: p.lo, wheelCenter: p.wc, contact,
        ...(kind === 'sla' ? { upperInner: g.upperInner, upperOuter: p.uo } : { top: g.top }) },
    };
    if (kind === 'strut') out.strutLengthChange = len(sub(g.top, p.lo)) - len(sub(g.top, g.lowerOuter));
    const bj = jointAngles(p);
    out.ballJointLower = bj[0];
    if (kind === 'sla') out.ballJointUpper = bj[1];
    return out;
  }

  /** Re-measure an answer: every link length and the requested height. Max error in inches. */
  function residual(p, travel) {
    const errs = [len(sub(p.lo, g.lowerInner)) - Ll, p.wc[1] - (z0 + travel)];
    if (kind === 'sla') errs.push(len(sub(p.uo, g.upperInner)) - Lu, len(sub(p.uo, p.lo)) - Lk);
    errs.push(len(sub(p.wc, p.lo)) - len(wcLocal));
    return Math.max(...errs.map(Math.abs));
  }

  function at(travel) {
    if (!Number.isFinite(travel)) return { travel, status: STATUS.failure, reason: 'Travel is not a number.' };
    if (!traces) return { travel, status: STATUS.limit, reason: 'At ride height the wheel cannot move up or down with this layout (lower arm at a dead point).' };
    let p;
    if (Math.abs(travel) < 1e-12) p = pose(0);
    else {
      const dir = travel > 0 ? 1 : -1, { samples, limit } = traces[dir];
      const target = z0 + travel;
      const i = samples.findIndex((s, k) => k > 0 && (s.z - target) * dir >= 0);
      if (i < 0) {
        return { travel, status: STATUS.limit, limit, reach,
          reason: `${dir > 0 ? 'Bump' : 'Droop'} stops at ${Math.abs(limit.travel).toFixed(2)} in: ${limit.text}.` };
      }
      let a = samples[i - 1].da, b = samples[i].da;
      for (let k = 0; k < 70; k++) {
        const m = (a + b) / 2, q = pose(m);
        if (!q.ok) { b = m; continue; }
        if ((q.wc[1] - target) * dir >= 0) b = m; else a = m;
      }
      p = pose((a + b) / 2);
    }
    if (!p.ok) return { travel, status: STATUS.failure, reason: 'The solver could not assemble a pose it had already reached. Result withheld.' };
    const res = residual(p, travel);
    if (res > 1e-6) return { travel, status: STATUS.failure, residual: res, reason: `Solver failure: the answer does not keep the link lengths (error ${res.toExponential(1)} in). Result withheld.` };
    return { ...metrics(p, travel), status: STATUS.ok, residual: res, reach };
  }

  /** Rows over travel; only valid rows carry metrics. Adds cautions computed over the whole range. */
  function sweep({ bump = 3, droop = 3, step = .1 } = {}) {
    const rows = [];
    for (let t = -droop; t <= bump + 1e-9; t += step) rows.push(at(+t.toFixed(4)));
    return { rows, reach };
  }

  return Object.assign(api, { at, sweep, reach, lengths: { lower: Ll, upper: Lu, upright: Lk } });
}

/**
 * Interpretations for one result in the context of its neighbours. Each: {level:'caution'|'info', text}.
 * Contextual, not universal limits: each says what is happening and why, using this geometry's own numbers.
 */
export function interpret(c, r) {
  if (!r || r.status !== STATUS.ok) return [];
  const notes = [];
  const near = t => c.at(t);
  const a = near(r.travel - .25), b = near(r.travel + .25);
  if (a.status === STATUS.ok && b.status === STATUS.ok) {
    const dRc = (b.rollCentreHeight - a.rollCentreHeight) / .5;
    const dCam = (b.camber - a.camber) / .5;
    const dTrack = (b.trackChange - a.trackChange) / .5;
    if (Number.isFinite(dRc) && Math.abs(dRc) > 3) {
      const gap = r.instantCentre ? Math.abs(r.instantCentre[0] - r.points.contact[0]) : null;
      notes.push({ level: STATUS.caution, code: 'rc-sensitive', text: `Roll center moves ${Math.abs(dRc).toFixed(1)} in for each inch of travel here${gap !== null ? `: the instant center is only ${gap.toFixed(1)} in from the tire, so small arm movements swing the roll-center line steeply` : ''}. Valid geometry, but the car's roll behavior will change sharply with ride height and load.` });
    }
    if (dCam > .05) notes.push({ level: STATUS.caution, code: 'positive-gain', text: `The top of the tire tips outward as the suspension compresses (${dCam.toFixed(2)}° per in). In a turn the loaded outside tire loses contact patch; most road and race geometry aims for negative gain.` });
    if (Math.abs(dTrack) > 1) notes.push({ level: STATUS.caution, code: 'scrub', text: `Track changes ${Math.abs(dTrack).toFixed(2)} in per inch of travel (both sides). The tires scrub sideways over bumps, which costs grip and stability.` });
  }
  for (const [k, word] of [['bump', 'compression'], ['droop', 'droop']]) {
    const lim = c.reach?.[k];
    if (lim && lim.why !== 'range' && Math.abs(lim.travel - r.travel) < .5)
      notes.push({ level: STATUS.caution, code: 'near-limit', text: `Only ${Math.abs(lim.travel - r.travel).toFixed(2)} in of ${word} remains before ${lim.text}. Near that point small movements swing the wheel sharply.` });
  }
  if (Number.isFinite(r.ballJointLower) && Math.max(Math.abs(r.ballJointLower), Math.abs(r.ballJointUpper ?? 0)) > 25)
    notes.push({ level: STATUS.caution, code: 'ball-joint', text: `A ball joint has rotated ${Math.max(Math.abs(r.ballJointLower), Math.abs(r.ballJointUpper ?? 0)).toFixed(0)}° from ride height. Many ball joints allow roughly 20–35° of articulation; check the part you use.` });
  if (Number.isFinite(r.rollCentreHeight) && Math.abs(r.rollCentreHeight) > RC_EXTREME)
    notes.push({ level: STATUS.caution, code: 'rc-extreme', text: `The instant center is almost directly above or below the tire contact patch, so the roll-center line is nearly vertical and its height (${r.rollCentreHeight.toFixed(0)} in) swings wildly with tiny movements. The geometry is buildable, but a roll center this far away has no practical meaning.` });
  if (r.rollCentreNote) notes.push({ level: 'info', code: 'rc-note', text: r.rollCentreNote });
  if (Number.isFinite(r.rollCentreHeight) && r.rollCentreHeight < 0) notes.push({ level: 'info', code: 'rc-below', text: 'The roll center is below the road. That is physically meaningful (a common result with a low lower arm), not an error.' });
  return notes;
}

/**
 * Coordinated ride-height change for a planar corner (inches; + raises the car, − lowers it). Link lengths are kept.
 *  mode 'springs': only springs/perches change. The car settles at the pose that was `−change` of travel, and that
 *                  pose becomes the new ride height (arm angles, camber and roll center all move).
 *  mode 'spindle': chassis pivots and ball joints move with the body and the spindle compensates (e.g. a drop
 *                  spindle): arm angles and camber are unchanged; the wheel centre moves on the upright. The roll centre
 *                  still moves, because the tire contact patch has moved relative to the arms.
 * Returns { g, status, reason } with points re-expressed so the new ground is z = 0.
 */
export function rideHeightGeometry(kind, g, change, mode = 'springs') {
  if (!change) return { g, status: STATUS.ok };
  if (mode === 'spindle') {
    const out = { ...g };
    for (const k of KINDS[kind]) if (k !== 'wheelCenter') out[k] = [g[k][0], g[k][1] + change];
    const issues = checkLayout(kind, out);
    return issues.some(i => i.level === STATUS.invalid) ? { g, status: STATUS.invalid, reason: issues[0].text } : { g: out, status: STATUS.ok };
  }
  const c = corner(kind, g), r = c.at(-change);
  if (r.status !== STATUS.ok) return { g, status: r.status, reason: r.reason };
  const out = { ...g, staticCamber: r.camber };
  for (const k of KINDS[kind]) out[k] = [r.points[k][0], r.points[k][1] + change];
  return { g: out, status: STATUS.ok };
}
