// ESS engineering library — road geometry for the maneuver presets. Claude, 26 Nov 2026.
// Turns the path solver's segments (engine/maneuvers.mjs runPath: straight / arc / spiral) into a plan-view
// centreline, using exactly the same segment lengths and the same linear-curvature spirals, so a distance s
// on a runPath trace lands on the same point of the drawn road. Pure, no DOM. Units: ft, radians.
//
// Direction: runPath uses unsigned curvature (a quasi-steady model does not care which way a corner turns).
// Geometry does. Each curved segment may carry `turn: 'left' | 'right'` (default left). A spiral that is not
// marked takes the direction of the nearest arc it joins, so an S-curve only needs its two arcs marked.
// Nothing here changes any model result.

const arcLength = seg => seg.type === 'arc' ? seg.radiusFt * seg.deg * Math.PI / 180 : seg.ft;
const curv = r => (r && Number.isFinite(r) ? 1 / r : 0);

/** Direction (+1 left, −1 right) of every segment; straights get 0. */
export function turnSigns(segments) {
  const own = segments.map(s => s.type === 'straight' ? 0 : s.turn === 'right' ? -1 : s.turn === 'left' ? 1 : null);
  return own.map((d, i) => {
    if (d !== null) return d;
    const seg = segments[i];
    // spiral: it leaves an arc (toRadius straight) → previous arc; it enters an arc → next arc
    const leaving = seg.type === 'spiral' && !seg.toRadiusFt;
    const order = leaving ? [i - 1, i + 1] : [i + 1, i - 1];
    for (const j of order) if (segments[j] && segments[j].type === 'arc') return own[j] ?? 1;
    return 1;
  });
}

/**
 * Build the centreline. Returns { length, points: [{s, x, y, heading, k}] every ~ds ft, pointAt(s), bounds }.
 * Start at (0,0) heading +x. Left turns increase the heading (y up, maths convention).
 * `closed: true` lets pointAt wrap distance around the length (used by the constant-radius circle).
 */
export function buildPath(segments, { ds = 1, closed = false } = {}) {
  const signs = turnSigns(segments);
  const points = [];
  let x = 0, y = 0, h = 0, s = 0;
  points.push({ s: 0, x, y, heading: 0, k: 0, seg: 0 });
  segments.forEach((seg, i) => {
    const len = arcLength(seg), n = Math.max(1, Math.ceil(len / ds)), step = len / n, sign = signs[i];
    for (let j = 0; j < n; j++) {
      const k0 = seg.type === 'arc' ? 1 / seg.radiusFt : seg.type === 'spiral' ? curv(seg.fromRadiusFt) + (curv(seg.toRadiusFt) - curv(seg.fromRadiusFt)) * j / n : 0;
      const k1 = seg.type === 'arc' ? k0 : seg.type === 'spiral' ? curv(seg.fromRadiusFt) + (curv(seg.toRadiusFt) - curv(seg.fromRadiusFt)) * (j + 1) / n : 0;
      // heading at the middle of the step (midpoint rule on the curvature integral; exact for arcs and linear spirals)
      const hm = h + sign * step * (0.75 * k0 + 0.25 * k1) / 2;
      x += step * Math.cos(hm); y += step * Math.sin(hm);
      h += sign * step * (k0 + k1) / 2; s += step;
      points.push({ s, x, y, heading: h, k: sign * k1, seg: i });
    }
  });
  const length = s;
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  function pointAt(d) {
    let q = closed ? ((d % length) + length) % length : Math.min(Math.max(d, 0), length);
    let lo = 0, hi = points.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (points[m].s <= q) lo = m; else hi = m; }
    const a = points[lo], b = points[hi], f = (q - a.s) / ((b.s - a.s) || 1);
    return { s: q, x: a.x + f * (b.x - a.x), y: a.y + f * (b.y - a.y), heading: a.heading + f * (b.heading - a.heading), seg: a.seg };
  }
  return { length, points, pointAt, bounds, closed, signs };
}

/** Total length of a segment list, as runPath measures it. */
export const pathLength = segments => segments.reduce((sum, seg) => sum + arcLength(seg), 0);

/** A full circle of the given radius (the steady-cornering pad). */
export const circleSegments = radiusFt => [{ type: 'arc', radiusFt, deg: 360, turn: 'left' }];
