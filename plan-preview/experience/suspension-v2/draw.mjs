// ESS Suspension V2 — drawings. One drawing per view; the same function draws the gallery illustration (static,
// no labels clutter) and the interactive engineering model, so the picture a visitor picks IS the model they edit.
// Colors follow design/ess-suspension-visual-reference.html (owner-approved rear top view): blue lower arms/links,
// amber upper arms/links, teal lateral locator, slate structure (tire, axle, upright). Solid = physical part.
// Dashed = reference, projection or construction line only, and every dashed line is labelled.

export const C = { lower: '#3979b9', upper: '#d97706', lateral: '#159a87', slate: '#64748b', ink: '#28323a',
  field: '#f8f7f3', grid: '#e7e4dc', ref: '#9aa3ab', rc: '#7a3db8', ic: '#28323a' };
const f1 = n => (Math.round(n * 10) / 10).toString();
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ln = (a, b, color, w, extra = '') => `<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" stroke="${color}" stroke-width="${w}" stroke-linecap="round" ${extra}/>`;
const dash = 'stroke-dasharray="5 4"';
const txt = (p, s, o = {}) => `<text x="${f1(p[0])}" y="${f1(p[1])}" ${o.anchor ? `text-anchor="${o.anchor}"` : ''} ${o.cls ? `class="${o.cls}"` : ''} fill="${o.fill ?? C.ink}" ${o.rot ? `transform="rotate(${o.rot} ${f1(p[0])} ${f1(p[1])})"` : ''}>${esc(s)}</text>`;
const dot = (p, r, fill, stroke = 'none', w = 0) => `<circle cx="${f1(p[0])}" cy="${f1(p[1])}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${w}"/>`;
const mount = (p, color = C.slate) => `<rect x="${f1(p[0] - 4)}" y="${f1(p[1] - 4)}" width="8" height="8" rx="1.5" fill="${C.field}" stroke="${color}" stroke-width="2"/>`;
const joint = (p, color) => dot(p, 4, '#fff', color, 2.2);
const frame = (w, h, body, label) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}" class="v2-svg"><rect width="${w}" height="${h}" fill="${C.field}"/>${body}</svg>`;
const poly = (pts, attrs) => `<polygon points="${pts.map(p => f1(p[0]) + ',' + f1(p[1])).join(' ')}" ${attrs}/>`;

// ---------------- planar corner: front view (front corner) or rear view (independent rear corner) ----------------
export const PLANAR = { w: 360, h: 290, sx: 8, ox: 22, oy: 262 };
export const planarMap = { to: ([y, z]) => [PLANAR.ox + y * PLANAR.sx, PLANAR.oy - z * PLANAR.sx * .9],
  from: ([X, Y]) => [(X - PLANAR.ox) / PLANAR.sx, (PLANAR.oy - Y) / (PLANAR.sx * .9)] };
// Equal scale is kept for angles: use the same factor both ways.
planarMap.to = ([y, z]) => [PLANAR.ox + y * PLANAR.sx, PLANAR.oy - z * PLANAR.sx];
planarMap.from = ([X, Y]) => [(X - PLANAR.ox) / PLANAR.sx, (PLANAR.oy - Y) / PLANAR.sx];

/** Parts of one corner at a pose. pts: solver points; camber deg; radius in. */
function planarCorner(kind, pts, camber, radius, { ghost = false, labels = false } = {}) {
  const P = planarMap.to, s = PLANAR.sx;
  const c = P(pts.wheelCenter), a = camber * Math.PI / 180; // screen y is down: negative camber tips the top inboard (left)
  const half = 4.5 * s, rad = radius * s;
  const corners = [[-half, -rad], [half, -rad], [half, rad], [-half, rad]].map(([dx, dy]) => [c[0] + dx * Math.cos(a) - dy * Math.sin(a), c[1] + dx * Math.sin(a) + dy * Math.cos(a)]);
  const g = ghost;
  const col = k => g ? C.ref : C[k];
  const wd = w => g ? 1.6 : w;
  const ex = g ? dash : '';
  let out = '';
  out += poly(corners, g ? `fill="none" stroke="${C.ref}" stroke-width="1.4" ${dash}` : `fill="${C.slate}" fill-opacity=".22" stroke="${C.slate}" stroke-width="1.6"`);
  if (!g) out += dot(c, 5, C.slate);
  const lo = P(pts.lowerOuter), li = P(pts.lowerInner);
  if (kind === 'sla') {
    const uo = P(pts.upperOuter), ui = P(pts.upperInner);
    out += ln(lo, uo, col('slate'), wd(7), ex); // upright
    out += ln([(lo[0] + uo[0]) / 2, (lo[1] + uo[1]) / 2], c, col('slate'), wd(4), ex); // spindle
    out += ln(ui, uo, col('upper'), wd(6), ex) + ln(li, lo, col('lower'), wd(6), ex);
    if (!g) out += mount(ui) + mount(li) + joint(uo, C.upper) + joint(lo, C.lower);
    if (labels && !g) {
      out += txt([(ui[0] + uo[0]) / 2, Math.min(ui[1], uo[1]) - 9], 'Upper arm', { anchor: 'middle' });
      out += txt([(li[0] + lo[0]) / 2, Math.max(li[1], lo[1]) + 17], 'Lower arm', { anchor: 'middle' });
      out += txt([(lo[0] + uo[0]) / 2 - 8, (lo[1] + uo[1]) / 2], 'Upright', { anchor: 'end' });
    }
  } else {
    const top = P(pts.top);
    const dir = [top[0] - lo[0], top[1] - lo[1]], L = Math.hypot(...dir), u = [dir[0] / L, dir[1] / L];
    const bodyEnd = [lo[0] + u[0] * L * .55, lo[1] + u[1] * L * .55];
    out += ln(lo, top, col('slate'), wd(4), ex) + ln(lo, bodyEnd, col('slate'), wd(11), ex); // strut rod + body (upright)
    out += ln([lo[0] + u[0] * L * .25, lo[1] + u[1] * L * .25], c, col('slate'), wd(4), ex);
    out += ln(li, lo, col('lower'), wd(6), ex);
    if (!g) out += mount(top) + mount(li) + joint(lo, C.lower);
    if (labels && !g) {
      out += txt([top[0] - 8, top[1] + 4], 'Strut top', { anchor: 'end' });
      out += txt([(li[0] + lo[0]) / 2, Math.max(li[1], lo[1]) + 17], 'Lower arm', { anchor: 'middle' });
      out += txt([bodyEnd[0] - 10, bodyEnd[1] + 10], 'Strut (upright)', { anchor: 'end' });
    }
  }
  if (labels && !g) out += txt([corners[1][0] + 4, corners[1][1] + 10], 'Tire', {});
  return out;
}

/**
 * Front view (front) / rear view (independent rear) of the left corner.
 * o: { kind, end, result (pose, may be null), base (reference pose or null), radius, travel, thumb, overlayLabel, invalidPts }
 */
export function planarSvg(o) {
  const P = planarMap.to, { w, h } = PLANAR;
  let b = '';
  if (!o.thumb) for (let y = 0; y <= 40; y += 10) b += ln(P([y, -2]), P([y, 32]), C.grid, 1);
  if (!o.thumb) for (let z = 0; z <= 30; z += 10) b += ln(P([-1, z]), P([42, z]), C.grid, 1);
  const travel = o.result?.travel ?? 0;
  b += ln(P([0, -3]), P([0, 34]), C.slate, 1, dash) + (o.thumb ? '' : txt([P([0, 0])[0] + 5, 16], 'Centerline (reference)'));
  b += ln(P([-2, travel]), P([43, travel]), C.slate, 1.5) + (o.thumb ? '' : txt([w - 6, P([0, travel])[1] + 14], 'Road', { anchor: 'end' }));
  if (o.base && !o.thumb) b += planarCorner(o.kind, o.base.points, o.base.camber, o.radius, { ghost: true });
  const r = o.result;
  if (r?.points) {
    if (!o.thumb && r.instantCentre && Number.isFinite(r.rollCentreHeight)) {
      const c = r.points.contact, rcPt = [0, travel + r.rollCentreHeight];
      const [iy, iz] = r.instantCentre;
      const inView = iy > -2 && iy < 44 && iz > -3 && iz < 36;
      // construction line: contact patch → instant centre → centreline (roll centre)
      const far = inView ? [iy, iz] : rcPt;
      b += ln(P(c), P(rcPt), C.ic, 1, 'stroke-dasharray="2 3"');
      if (inView) b += ln(P(c), P(far), C.ic, 1, 'stroke-dasharray="2 3"') + dot(P([iy, iz]), 3.5, C.ic) + txt([P([iy, iz])[0] + 6, P([iy, iz])[1] - 5], 'IC');
      const rcScreen = P(rcPt);
      if (rcScreen[1] > 6 && rcScreen[1] < h - 6) b += dot(rcScreen, 6, '#fff', C.rc, 2.5) + txt([rcScreen[0] + 10, rcScreen[1] + 4], 'Roll center', { fill: C.rc });
    } else if (!o.thumb && r.instantCentre === null && Number.isFinite(r.rollCentreHeight)) {
      const rcScreen = P([0, travel + r.rollCentreHeight]);
      b += dot(rcScreen, 6, '#fff', C.rc, 2.5) + txt([rcScreen[0] + 10, rcScreen[1] + 4], 'Roll center', { fill: C.rc });
    }
    b += planarCorner(o.kind, r.points, r.camber, o.radius, { labels: !o.thumb });
  } else if (o.invalidPts) {
    b += planarCorner(o.kind, o.invalidPts, o.invalidCamber ?? 0, o.radius, { labels: !o.thumb });
    b += `<rect x="${w - 150}" y="26" width="144" height="24" rx="5" fill="#fde8e6" stroke="#b3261e"/>` + txt([w - 78, 42], 'Not a buildable layout', { anchor: 'middle', fill: '#b3261e' });
  }
  if (!o.thumb) {
    b += txt([w - 6, 16], o.end === 'front' ? 'Outboard →' : 'Outboard →', { anchor: 'end' });
    if (o.base) b += ln([8, h - 10], [26, h - 10], C.ref, 1.4, dash) + txt([30, h - 6], o.overlayLabel ?? 'Reference: original example');
  }
  return frame(w, h, b, o.end === 'front' ? 'Front view of the left front corner, looking rearward from ahead of the car' : 'Rear view of the left rear corner, looking forward from behind the car');
}

/** Orientation-only top view of a planar corner (no fore/aft model exists). */
export function planarTopSvg({ kind, end, thumb = false }) {
  const w = 340, h = 250, front = end === 'front';
  let b = ln([45, 20], [45, 230], C.slate, 1, dash) + (thumb ? '' : txt([48, 225], 'Centerline (reference)'));
  b += `<rect x="248" y="55" width="55" height="140" rx="6" fill="${C.slate}" fill-opacity=".22" stroke="${C.slate}" stroke-width="1.6"/>`;
  b += ln([238, 85], [238, 165], C.slate, 7);
  b += ln([110, 60], [238, 125], C.lower, 5) + ln([110, 190], [238, 125], C.lower, 5) + mount([110, 60]) + mount([110, 190]);
  if (kind === 'sla') b += ln([135, 88], [236, 118], C.upper, 4) + ln([135, 162], [236, 118], C.upper, 4) + mount([135, 88]) + mount([135, 162]);
  else b += dot([238, 112], 9, C.slate, '#fff', 2);
  b += joint([238, 125], C.lower);
  if (!thumb) {
    b += txt([60, 40], front ? 'Front ↑' : 'Front ↓');
    b += txt([112, 210], 'Lower arm') + (kind === 'sla' ? txt([150, 82], 'Upper arm') : txt([200, 104], 'Strut', { anchor: 'end' })) + txt([252, 46], 'Tire');
    b += txt([170, 246], 'Orientation only: fore/aft positions are not modelled', { anchor: 'middle', cls: 'v2-note' });
  }
  return frame(w, h, b, `Top view of the ${front ? 'front' : 'rear'} corner, orientation only`);
}

// ---------------- live axle: top, side, rear views ----------------
export const LIVE = { top: { w: 340, h: 250, s: 3.2, ox: 95, oy: 125 }, side: { w: 340, h: 230, s: 4, ox: 75, oy: 212 }, rear: { w: 340, h: 230, s: 4, ox: 170, oy: 212 } };
export const liveMap = {
  top: { to: p => [LIVE.top.ox + p[0] * LIVE.top.s, LIVE.top.oy + p[1] * LIVE.top.s], from: ([X, Y]) => [(X - LIVE.top.ox) / LIVE.top.s, (Y - LIVE.top.oy) / LIVE.top.s], axes: [0, 1] },
  side: { to: p => [LIVE.side.ox + p[0] * LIVE.side.s, LIVE.side.oy - p[2] * LIVE.side.s], from: ([X, Y]) => [(X - LIVE.side.ox) / LIVE.side.s, (LIVE.side.oy - Y) / LIVE.side.s], axes: [0, 2] },
  rear: { to: p => [LIVE.rear.ox + p[1] * LIVE.rear.s, LIVE.rear.oy - p[2] * LIVE.rear.s], from: ([X, Y]) => [(X - LIVE.rear.ox) / LIVE.rear.s, (LIVE.rear.oy - Y) / LIVE.rear.s], axes: [1, 2] },
};
const groupColor = g => ({ lower: C.lower, upper: C.upper, lateral: C.lateral, slider: C.upper }[g]);
const TIRE_Y = 29, TIRE_W = 9, R = 13;

// rigid-body point on the axle for drawing (same transform as the solver)
function axleWorld(p, pose, heave, rollDeg) {
  const [dx, dy, pitch, yaw] = pose ?? [0, 0, 0, 0], roll = rollDeg * Math.PI / 180;
  const [x, y, z] = [p[0], p[1], p[2] - R];
  const py = y * Math.cos(roll) - z * Math.sin(roll), pz = y * Math.sin(roll) + z * Math.cos(roll);
  const xx = x * Math.cos(pitch) + pz * Math.sin(pitch), zz = -x * Math.sin(pitch) + pz * Math.cos(pitch);
  return [dx + xx * Math.cos(yaw) - py * Math.sin(yaw), dy + xx * Math.sin(yaw) + py * Math.cos(yaw), R + heave + zz];
}

/**
 * o: { view:'top'|'side'|'rear', links, result (solver output or null), base (reference result or null), thumb,
 *      selected (link index), side:{ic, lower, upper, antiSquat, hundred:[x,z]}, rollCentre, heave, roll, illustration }
 */
export function liveSvg(o) {
  const { view } = o, M = liveMap[view].to, { w, h } = LIVE[view];
  const r = o.result, pose = r?.pose ?? [0, 0, 0, 0], heave = r?.heave ?? 0, roll = r?.roll ?? 0;
  const A = p => axleWorld(p, pose, heave, roll);
  const links = r?.current ?? o.links.map(l => ({ ...l, current: l.axle }));
  const labels = !o.thumb;
  let b = '';
  const drawAxle = (Aw, ghost) => {
    const col = ghost ? C.ref : C.slate, ex = ghost ? dash : '';
    let s = '';
    if (view === 'top') {
      for (const sy of [-1, 1]) {
        const c = M(Aw([0, sy * TIRE_Y, R]));
        s += ghost ? '' : `<rect x="${f1(c[0] - R * LIVE.top.s)}" y="${f1(c[1] - TIRE_W / 2 * LIVE.top.s)}" width="${f1(2 * R * LIVE.top.s)}" height="${f1(TIRE_W * LIVE.top.s)}" rx="5" fill="${C.slate}" fill-opacity=".22" stroke="${C.slate}" stroke-width="1.6"/>`;
      }
      s += ln(M(Aw([0, -26, R])), M(Aw([0, 26, R])), col, ghost ? 1.6 : 9, ex);
      if (!ghost) s += dot(M(Aw([0, 0, R])), 13, C.slate);
    } else if (view === 'side') {
      const c = M(Aw([0, 0, R]));
      s += `<circle cx="${f1(c[0])}" cy="${f1(c[1])}" r="${f1(R * LIVE.side.s)}" fill="${ghost ? 'none' : C.slate}" fill-opacity="${ghost ? 0 : .15}" stroke="${col}" stroke-width="${ghost ? 1.4 : 1.6}" ${ex}/>`;
      if (!ghost) s += dot(c, 7, C.slate) + ln(M(Aw([0, 0, R - 5])), M(Aw([0, 0, R + 6])), C.slate, 3);
    } else {
      for (const sy of [-1, 1]) {
        const corners = [[-TIRE_W / 2, 0], [TIRE_W / 2, 0], [TIRE_W / 2, 2 * R], [-TIRE_W / 2, 2 * R]].map(([dy, z]) => M(Aw([0, sy * TIRE_Y + dy, z])));
        s += poly(corners, ghost ? `fill="none" stroke="${C.ref}" stroke-width="1.4" ${dash}` : `fill="${C.slate}" fill-opacity=".22" stroke="${C.slate}" stroke-width="1.6"`);
      }
      s += ln(M(Aw([0, -26, R])), M(Aw([0, 26, R])), col, ghost ? 1.6 : 8, ex);
      if (!ghost) s += dot(M(Aw([0, 0, R])), 12, C.slate);
    }
    return s;
  };
  // reference lines
  if (view === 'top') {
    b += `<rect x="20" y="22" width="${w - 40}" height="${h - 44}" rx="26" fill="none" stroke="#b9bcc0" stroke-width="1" ${dash}/>`;
    b += ln([12, LIVE.top.oy], [w - 10, LIVE.top.oy], C.slate, 1, dash);
    if (labels) b += txt([w - 12, LIVE.top.oy - 6], 'Front →', { anchor: 'end' }) + txt([w - 12, h - 8], 'Centerline and body outline: reference', { anchor: 'end', cls: 'v2-note' });
  } else if (view === 'side') {
    b += ln([8, M([0, 0, heave])[1]], [w - 8, M([0, 0, heave])[1]], C.slate, 1.5);
    if (labels) b += txt([w - 10, M([0, 0, heave])[1] + 14], 'Road datum', { anchor: 'end' }) + txt([w - 10, 19], 'Front →', { anchor: 'end' });
  } else {
    b += ln([LIVE.rear.ox, 8], [LIVE.rear.ox, h - 4], C.slate, 1, dash) + ln([8, M([0, 0, heave])[1]], [w - 8, M([0, 0, heave])[1]], C.slate, 1.5);
    if (labels) b += txt([LIVE.rear.ox + 4, 34], 'Centerline (reference)') + txt([w - 10, M([0, 0, heave])[1] + 14], 'Road', { anchor: 'end' }) + txt([w - 10, 19], 'Driver’s right →', { anchor: 'end' });
  }
  if (o.base && labels) b += drawAxle(p => axleWorld(p, o.base.pose, o.base.heave, o.base.roll), true);
  b += drawAxle(A, false);
  // side-view construction: instant centre and anti-squat lines (projections)
  if (view === 'side' && o.side && labels) {
    const s = o.side, contact = M([0, 0, heave]);
    if (s.hundred) { const e = M([s.hundred[0], 0, heave + s.hundred[1]]); b += ln(contact, e, C.ref, 1.2, dash) + txt([e[0] + 4, e[1] - 4], '100% line', { cls: 'v2-note' }); }
    if (!s.ic && s.parallel) b += txt([w - 10, 32], 'Links parallel: instant center at infinity', { anchor: 'end' });
    if (s.ic) {
      const icS = M([s.ic[0], 0, s.ic[1]]), inView = icS[0] > 0 && icS[0] < w && icS[1] > 0 && icS[1] < h;
      const ahead = s.ic[0] >= 0;
      const clip = inView ? icS : (() => { const d = [icS[0] - contact[0], icS[1] - contact[1]], edge = ahead ? w - 12 : 12, k = Math.min(1, (edge - contact[0]) / d[0]); return [contact[0] + d[0] * k, contact[1] + d[1] * k]; })();
      b += ln(contact, clip, C.ic, 1.2, 'stroke-dasharray="2 3"');
      for (const [line, col] of [[s.lower, C.lower], [s.upper, C.upper]]) if (line) b += ln(M([line[0][0], 0, line[0][1]]), clip, col, 1, 'stroke-dasharray="2 3"');
      const what = s.kinematic ? 'Axle pitch center' : 'IC';
      b += inView ? dot(icS, 4, C.ic) + txt([icS[0] + 6, icS[1] - 6], what) : ahead
        ? txt([w - 10, 46], `${what}: ${Math.round(s.ic[0])} in ahead, off the drawing →`, { anchor: 'end' })
        : txt([10, 46], `← ${what}: ${Math.round(-s.ic[0])} in behind the axle`);
    }
  }
  // links
  links.forEach((l, i) => {
    const col = groupColor(l.group), sel = i === o.selected && labels;
    const a = l.current, c = l.chassis;
    if (l.group === 'slider') { // torque arm: rigid to the axle, nose rides in a guide
      const root = M(A([2, 0, 17])), nose = M(a);
      b += ln(root, nose, col, sel ? 7 : 5) + mount(nose);
      if (view === 'side') b += ln([nose[0], nose[1] - 12], [nose[0], nose[1] + 12], C.slate, 2) ;
      if (labels) b += txt([(root[0] + nose[0]) / 2, (root[1] + nose[1]) / 2 - 8], 'Torque arm', { anchor: 'middle' });
      return;
    }
    if (view === 'side' && l.group === 'lateral') { // seen end-on
      const p = M(a), q = M(c);
      b += ln(p, q, col, sel ? 7 : 5) + joint(p, col);
      return;
    }
    if (view === 'rear' && l.group !== 'lateral') { // longitudinal link seen end-on: its axle mount
      b += joint(M(a), col);
      return;
    }
    if (view === 'side' && a[1] > .5 && (l.group === 'lower' || l.group === 'upper')) {
      // far-side link, hidden behind the near one: coincides when mirrored; drawn dashed (hidden) when it differs
      if (o.symmetric !== false) return;
      b += ln(M(a), M(c), col, 1.6, `stroke-dasharray="6 4" data-link="${i}" class="v2-link"`);
      if (labels && !o._hiddenLabel) { o._hiddenLabel = true; b += ln([10, 30], [26, 30], col, 1.6, 'stroke-dasharray="6 4"') + txt([30, 33], 'Right-side links, hidden behind (not mirrored)', { cls: 'v2-note' }); }
      return;
    }
    const pa = M(a), pc = M(c);
    b += ln(pa, pc, col, sel ? 7 : 5, `data-link="${i}" class="v2-link"`) + joint(pa, col) + mount(pc);
  });
  if (labels) {
    if (view === 'top') {
      const named = new Set();
      links.forEach(l => {
        if (l.group === 'slider') return;
        const key = l.group === 'lateral' ? 'Panhard bar' : l.group === 'lower' ? 'Lower link' : l.name.includes('Left') || l.name.includes('Right') ? 'Upper link' : 'Upper link';
        const m = [(l.current[0] + l.chassis[0]) / 2, (l.current[1] + l.chassis[1]) / 2];
        const p = M([m[0], m[1]]);
        if (l.group === 'lateral') b += txt([p[0] - 10, p[1]], key, { anchor: 'middle', rot: -90 });
        else if (!named.has(key + Math.sign(m[1]))) { named.add(key + Math.sign(m[1])); b += txt([p[0], p[1] - 8], key, { anchor: 'middle' }); }
      });
      b += txt([M([0, -TIRE_Y, R])[0] - 30, 14], 'Tire') + txt([M([0, 0, R])[0] + 16, LIVE.top.oy + 44], 'Axle');
    } else if (view === 'side') {
      b += txt([M([24, 0, 4])[0], M([24, 0, 4])[1] + 2], o.symmetric === false ? 'Left lower link' : 'Lower links (overlap)', { anchor: 'middle' });
      if (links.some(l => l.group === 'upper')) b += txt([M([12, 0, 22])[0], M([12, 0, 22])[1] - 10], links.filter(l => l.group === 'upper').length > 1 ? 'Upper links' : 'Upper link', { anchor: 'middle' });
      b += txt([M([0, 0, 2 * R + heave])[0] - 30, M([0, 0, 2 * R + heave])[1] - 6], 'Rear tire');
    } else {
      if (Number.isFinite(o.rollCentre)) { const rc = M([0, 0, o.rollCentre + heave]); b += dot(rc, 6, '#fff', C.rc, 2.5) + txt([rc[0] + 10, rc[1] - 6], 'Roll center', { fill: C.rc }); }
      const pan = links.find(l => l.group === 'lateral');
      if (pan) { const m = M(pan.current); b += txt([m[0], m[1] - 12], 'Panhard bar', { anchor: 'middle' }); }
      b += txt([M([0, TIRE_Y, 2 * R])[0] - 14, M([0, TIRE_Y, 2 * R])[1] - 6], 'Tire', { anchor: 'middle' });
    }
    if (o.base) b += ln([10, 16], [26, 16], C.ref, 1.4, dash) + txt([30, 19], o.baseLabel ?? 'Reference: original example', { cls: 'v2-note' });
  }
  const name = { top: 'Top view of the rear axle and links, front to the right', side: 'Side view of the rear axle and links, front to the right', rear: 'Rear view of the axle, looking forward from behind the car' }[view];
  return frame(w, h, b, name);
}

// ---------------- illustration-only architectures (recognizable, no model) ----------------
export function illustrationSvg(code, { thumb = false } = {}) {
  const w = 340, h = 250;
  let b = '';
  const tire = (x, y, ww, hh) => `<rect x="${x}" y="${y}" width="${ww}" height="${hh}" rx="5" fill="${C.slate}" fill-opacity=".22" stroke="${C.slate}" stroke-width="1.6"/>`;
  const L = s => thumb ? '' : s;
  if (code === 'leaf') {
    b += ln([12, 125], [w - 10, 125], C.slate, 1, dash) + tire(52, 22, 83, 29) + tire(52, 199, 83, 29);
    b += ln([93, 40], [93, 210], C.slate, 9) + dot([93, 125], 13, C.slate);
    for (const y of [70, 180]) b += ln([30, y], [200, y], C.lower, 6) + mount([30, y]) + mount([200, y]);
    b += L(txt([115, 62], 'Leaf spring') + txt([115, 198], 'Leaf spring') + txt([w - 12, 118], 'Front →', { anchor: 'end' }) + txt([60, 14], 'Tire'));
  } else if (code === 'truckArm') {
    b += ln([12, 125], [w - 10, 125], C.slate, 1, dash) + tire(52, 22, 83, 29) + tire(52, 199, 83, 29);
    b += ln([93, 40], [93, 210], C.slate, 9) + dot([93, 125], 13, C.slate);
    for (const y of [75, 175]) b += ln([93, y], [300, y + (y < 125 ? 20 : -20)], C.lower, 7) + mount([300, y + (y < 125 ? 20 : -20)]);
    b += ln([70, 70], [70, 180], C.lateral, 4);
    b += L(txt([190, 78], 'Truck arm (rigid to axle)') + txt([190, 186], 'Truck arm') + txt([60, 125], 'Panhard bar', { anchor: 'middle', rot: -90 }) + txt([w - 12, 118], 'Front →', { anchor: 'end' }));
  } else if (code === 'semiTrailing') {
    b += ln([45, 20], [45, 230], C.slate, 1, dash) + tire(248, 70, 55, 110);
    b += ln([110, 60], [250, 150], C.lower, 7) + ln([150, 40], [250, 110], C.lower, 7) + mount([110, 60]) + mount([150, 40]);
    b += ln([110, 60], [150, 40], C.ref, 1, dash);
    b += L(txt([118, 82], 'Semi-trailing arm') + txt([100, 36], 'Pivot axis (diagonal)', { cls: 'v2-note' }) + txt([60, 230], 'Front ↑') + txt([252, 62], 'Tire'));
  } else if (code === 'twinIBeam') {
    b += ln([170, 20], [170, 230], C.slate, 1, dash) + ln([10, 200], [330, 200], C.slate, 1.5);
    b += tire(20, 100, 36, 100) + tire(284, 100, 36, 100);
    b += ln([38, 150], [230, 165], C.lower, 9) + ln([302, 150], [110, 165], C.upper, 9) + mount([230, 165]) + mount([110, 165]);
    b += L(txt([70, 140], 'Left I-beam') + txt([270, 140], 'Right I-beam', { anchor: 'end' }) + txt([174, 30], 'Centerline (reference)'));
  } else if (code === 'solidAxle') {
    b += ln([170, 20], [170, 230], C.slate, 1, dash) + ln([10, 200], [330, 200], C.slate, 1.5);
    b += tire(20, 100, 36, 100) + tire(284, 100, 36, 100);
    b += ln([38, 150], [302, 150], C.slate, 10) + ln([60, 120], [280, 132], C.lateral, 4);
    b += L(txt([170, 172], 'Solid axle', { anchor: 'middle' }) + txt([170, 116], 'Track bar', { anchor: 'middle' }));
  }
  return frame(w, h, b, `Illustration of ${code}`);
}

// ---------------- charts ----------------
/**
 * Travel chart. rows: [{t, y, status}] (status ok|caution); reach: {lo, hi} reachable travel; base: [{t, y}] reference.
 * Valid range solid; cautions shaded amber; unreachable shaded and labelled; current travel marked.
 */
export function chartSvg({ title, unit, rows, base = [], reach, now, span = 1, x0 = -4, x1 = 4, xLabel = ['droop', 'bump'], digits = 1 }) {
  const w = 300, h = 120, L = 44, Rm = 10, T = 22, B = 96;
  const ys = [...rows, ...base].map(r => r.y).filter(Number.isFinite);
  if (!ys.length) return `<figure class="v2-chart"><figcaption>${esc(title)}</figcaption><p class="v2-empty">No valid results to plot.</p></figure>`;
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (hi - lo < span) { const m = (hi + lo) / 2; lo = m - span / 2; hi = m + span / 2; }
  const pad = (hi - lo) * .08; lo -= pad; hi += pad;
  const X = t => L + (t - x0) / (x1 - x0) * (w - L - Rm), Y = y => B - (y - lo) / (hi - lo) * (B - T);
  let s = `<rect x="${L}" y="${T}" width="${w - L - Rm}" height="${B - T}" fill="#fff" stroke="${C.grid}"/>`;
  if (reach) {
    if (reach.lo > x0) s += `<rect x="${L}" y="${T}" width="${f1(X(reach.lo) - L)}" height="${B - T}" fill="url(#v2hatch)"/>` + txt([(L + X(reach.lo)) / 2, T + 14], 'cannot reach', { anchor: 'middle', cls: 'v2-note', fill: '#b3261e' });
    if (reach.hi < x1) s += `<rect x="${f1(X(reach.hi))}" y="${T}" width="${f1(w - Rm - X(reach.hi))}" height="${B - T}" fill="url(#v2hatch)"/>` + txt([(X(reach.hi) + w - Rm) / 2, T + 14], 'cannot reach', { anchor: 'middle', cls: 'v2-note', fill: '#b3261e' });
  }
  for (const r of rows) if (r.status === 'caution') s += `<rect x="${f1(X(r.t) - 3)}" y="${T}" width="6" height="${B - T}" fill="#f4c76b" fill-opacity=".45"/>`;
  s += ln([X(0), T], [X(0), B], C.grid, 1);
  const path = list => { let d = '', pen = false; for (const r of list) { if (!Number.isFinite(r.y)) { pen = false; continue; } d += `${pen ? 'L' : 'M'}${f1(X(r.t))},${f1(Y(r.y))}`; pen = true; } return d; };
  if (base.length) s += `<path d="${path(base)}" fill="none" stroke="${C.ref}" stroke-width="1.4" ${dash}/>`;
  s += `<path d="${path(rows)}" fill="none" stroke="#2f557f" stroke-width="2.2"/>`;
  if (now && Number.isFinite(now.y)) s += dot([X(now.t), Y(now.y)], 4.5, '#2f557f', '#fff', 1.5);
  s += txt([L - 4, T + 8], hi.toFixed(digits), { anchor: 'end', cls: 'v2-tick' }) + txt([L - 4, B], lo.toFixed(digits), { anchor: 'end', cls: 'v2-tick' });
  s += txt([L, B + 14], xLabel[0], { cls: 'v2-tick' }) + txt([w - Rm, B + 14], xLabel[1], { anchor: 'end', cls: 'v2-tick' }) + txt([X(0), B + 14], '0', { anchor: 'middle', cls: 'v2-tick' });
  s += txt([L, 14], `${title} (${unit})`, { cls: 'v2-ctitle' });
  const defs = `<defs><pattern id="v2hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#fdf0ee"/><line x1="0" y1="0" x2="0" y2="6" stroke="#e7b4ae" stroke-width="2"/></pattern></defs>`;
  const desc = `${title}: ${rows.filter(r => Number.isFinite(r.y)).length ? `${rows.find(r => Number.isFinite(r.y)).y.toFixed(digits)} to ${[...rows].reverse().find(r => Number.isFinite(r.y)).y.toFixed(digits)} ${unit}` : 'no data'}`;
  return `<figure class="v2-chart"><svg viewBox="0 0 ${w} ${h + 4}" role="img" aria-label="${esc(desc)}">${defs}${s}</svg></figure>`;
}
