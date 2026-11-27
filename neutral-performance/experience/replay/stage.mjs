// Graphical simulations: one painter and one replay clock for all six experiments. Claude, 26 Nov 2026.
// The painter draws a road (a straight strip with lanes, or the plan view of the path the solver used) and puts each
// car where its calculated trace says it is at time t. Nothing moves that the model did not calculate.
// Colours come from CSS custom properties on the canvas (--replay-*), so the site palette can change without code.
import { buildPath } from '../../engine/path-geometry.mjs';
import { drawCar, laneColors } from '../replay.mjs';
import { sampleAt, LETTERS } from './runs.mjs';

const LANE_KEYS = ['a', 'b', 'c'];
export const laneColor = i => laneColors[LANE_KEYS[i]] ?? '#ffffff';

function theme(el) {
  const cs = el && typeof getComputedStyle === 'function' ? getComputedStyle(el) : null;
  const v = (name, d) => (cs?.getPropertyValue(name) || '').trim() || d;
  return { bg: v('--replay-bg', '#1b1f1b'), road: v('--replay-road', '#3a403a'), edge: v('--replay-edge', '#7b8378'),
    text: v('--replay-text', '#f4eee4'), muted: v('--replay-muted', '#b7b1a4'), brake: v('--replay-brake', '#e0604f'),
    font: v('--replay-font', 'ui-monospace, SFMono-Regular, Consolas, monospace') };
}

const niceStep = n => { const r = 10 ** Math.floor(Math.log10(n / 4)); return [1, 2, 2.5, 5, 10].map(k => k * r).find(k => n / k <= 5) ?? n; };
const fmt = (n, d = 0) => Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';

/** Prepare geometry once per scene. scene = {road, runs, labels} from the app. */
export function prepare(scene) {
  const { road } = scene;
  if (road.kind === 'path') {
    const path = buildPath(road.segments, { ds: 2, closed: !!road.closed });
    return { ...scene, path };
  }
  const longest = Math.max(1, ...scene.runs.filter(r => r.ok).map(r => r.distance));
  return { ...scene, stripFt: road.lengthFt ?? longest * 1.12 };
}

/**
 * Draw scene at time t into rect {x, y, w, h} of a 2D context (CSS pixels; caller handles devicePixelRatio).
 * opts: { theme, hud: true, done: boolean }
 */
export function paint(ctx, scene, t, rect, opts = {}) {
  const th = opts.theme ?? theme(null);
  const { x: X0, y: Y0, w: W, h: H } = rect;
  ctx.save();
  ctx.beginPath(); ctx.rect(X0, Y0, W, H); ctx.clip();
  ctx.fillStyle = th.bg; ctx.fillRect(X0, Y0, W, H);
  const lanes = scene.runs.map((run, i) => ({ run, i, q: run.ok ? sampleAt(run, Math.min(t, run.cruise ? t : run.time)) : null }));
  const hudH = opts.hud === false ? 0 : Math.min(18 * lanes.length + 10, H * .34);
  if (scene.road.kind === 'strip') strip(ctx, scene, lanes, { x: X0, y: Y0 + hudH, w: W, h: H - hudH }, th, t);
  else path(ctx, scene, lanes, { x: X0, y: Y0 + hudH, w: W, h: H - hudH }, th, t);
  if (opts.hud !== false) hud(ctx, scene, lanes, { x: X0, y: Y0, w: W, h: hudH }, th, t);
  ctx.restore();
}

const PLACE = ['1st', '2nd', '3rd'];
const PHASE = { braking: 'braking', 'cornering limit': 'at the grip limit', accelerating: 'accelerating' };
function hud(ctx, scene, lanes, r, th, t) {
  const size = Math.max(11, Math.min(14, r.w / 46));
  ctx.font = `600 ${size}px ${th.font}`;
  ctx.textBaseline = 'middle';
  // leader by distance covered (not for the steady circle, where everyone just circles at their own speed)
  const lead = Math.max(...lanes.filter(x => x.run.ok && !x.run.cruise).map(x => x.q.s), 0);
  lanes.forEach(({ run, i, q }) => {
    const y = r.y + 8 + i * (size + 5) + size / 2;
    // letter badge: the lane is identified by its letter and position, not only by colour
    ctx.fillStyle = laneColor(i); ctx.fillRect(r.x + 8, y - size / 2 - 1, size + 4, size + 2);
    ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.fillText(LETTERS[i], r.x + 10 + size / 2, y + 1);
    ctx.fillStyle = th.text; ctx.textAlign = 'left';
    const name = scene.labels[i] ?? '';
    const done = run.ok && !run.cruise && t >= run.time;
    const place = done && scene.order?.length ? PLACE[scene.order.indexOf(i)] : '';
    let right;
    if (!run.ok) right = 'no run';
    else if (done) right = `${place ? place + ' · ' : ''}${scene.key === 'brake' ? `stopped in ${fmt(run.distance)} ft` : `${fmt(run.time, 2)} s`}`;
    else {
      const gap = run.cruise ? 0 : lead - q.s;
      const phase = q.phase && PHASE[q.phase] ? ` · ${PHASE[q.phase]}` : '';
      right = `${fmt(q.mph)} mph${gap >= 1 ? ` · −${fmt(gap)} ft` : ''}${r.w > 520 ? phase : ''}`;
    }
    const rw = ctx.measureText(right).width;
    let label = name;
    while (label.length > 4 && ctx.measureText(label).width > r.w - rw - 60) label = label.slice(0, -2);
    if (label !== name) label = label.slice(0, -1) + '…';
    ctx.fillText(label, r.x + size + 20, y);
    ctx.textAlign = 'right'; ctx.fillStyle = done ? laneColor(i) : th.text;
    ctx.fillText(right, r.x + r.w - 10, y);
  });
  ctx.textAlign = 'left';
}

/** Letter tag beside a car on the road (non-colour cue). */
function tag(ctx, x, y, i, th) {
  ctx.save();
  ctx.font = `700 11px ${th.font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.fillText(LETTERS[i], x, y + .5);
  ctx.restore();
}

function strip(ctx, scene, lanes, r, th, t) {
  const L = scene.stripFt, padL = 42, padR = 24;
  const n = lanes.length, laneH = Math.min(46, (r.h - 34) / n), top = r.y + (r.h - 22 - laneH * n) / 2;
  const X = s => r.x + padL + s / L * (r.w - padL - padR);
  ctx.fillStyle = th.road; ctx.fillRect(r.x + 6, top, r.w - 12, laneH * n);
  for (let i = 1; i < n; i++) { ctx.strokeStyle = th.edge; ctx.setLineDash([8, 8]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(r.x + 6, top + i * laneH); ctx.lineTo(r.x + r.w - 6, top + i * laneH); ctx.stroke(); }
  ctx.setLineDash([]);
  // distance marks
  const step = niceStep(L);
  ctx.font = `${Math.max(10, Math.min(12, r.w / 60))}px ${th.font}`; ctx.fillStyle = th.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  for (let s = 0; s <= L + 1e-6; s += step) {
    ctx.strokeStyle = th.edge; ctx.lineWidth = 1; ctx.globalAlpha = .55;
    ctx.beginPath(); ctx.moveTo(X(s), top); ctx.lineTo(X(s), top + laneH * n); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.fillText(fmt(s) + (s === 0 ? ' ft' : ''), X(s), top + laneH * n + 15);
  }
  // start and finish (or brakes-on) lines
  ctx.fillStyle = th.text; ctx.fillRect(X(0) - 1.5, top - 6, 3, laneH * n + 12);
  ctx.textAlign = 'left'; ctx.fillStyle = th.muted;
  if (scene.key === 'brake') ctx.fillText('brakes on', X(0) + 5, top - 8);
  if (scene.road.lengthFt) { ctx.fillStyle = th.text; ctx.fillRect(X(scene.road.lengthFt) - 1.5, top - 6, 3, laneH * n + 12); }
  lanes.forEach(({ run, i, q }) => {
    if (!run.ok) return;
    const y = top + (i + .5) * laneH;
    if (scene.key === 'brake' && t >= run.time) {   // where each car stopped
      ctx.strokeStyle = laneColor(i); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(run.distance), y - laneH / 2 + 3); ctx.lineTo(X(run.distance), y + laneH / 2 - 3); ctx.stroke();
    }
    drawCar(ctx, X(q.s), y, 0, laneColor(i), q.mph, Math.min(1, laneH / 34));
    tag(ctx, X(q.s) - 30 * Math.min(1, laneH / 34), y, i, th);
  });
}

// Rotate the plan view so the road uses as much of the stage as possible (an L-shaped corner on a wide screen).
function bestView(p, aspect) {
  p.views ??= {};
  const key = aspect.toFixed(2);
  if (p.views[key]) return p.views[key];
  let best = null;
  for (let deg = 0; deg < 180; deg += 3) {
    if (p.closed && deg) break;
    const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const q of p.points) { const x = q.x * c - q.y * s, y = q.x * s + q.y * c; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    const fit = Math.min(aspect / Math.max(1, maxX - minX), 1 / Math.max(1, maxY - minY));
    if (!best || fit > best.fit * 1.02) best = { fit, a, c, s, b: { minX, maxX, minY, maxY } };
  }
  return (p.views[key] = best);
}

function path(ctx, scene, lanes, r, th, t) {
  const p = scene.path, pad = 30, view = bestView(p, (r.w - 2 * pad) / Math.max(1, r.h - 2 * pad)), b = view.b;
  const sc = Math.min((r.w - 2 * pad) / Math.max(1, b.maxX - b.minX), (r.h - 2 * pad) / Math.max(1, b.maxY - b.minY));
  const ox = r.x + (r.w - (b.maxX - b.minX) * sc) / 2, oy = r.y + (r.h + (b.maxY - b.minY) * sc) / 2;
  const P = (x0, y0) => { const x = x0 * view.c - y0 * view.s, y = x0 * view.s + y0 * view.c; return [ox + (x - b.minX) * sc, oy - (y - b.minY) * sc]; };   // y up in the model, down on screen
  const roadPx = Math.max(16, Math.min(30, 30 * sc));
  const trace = () => { ctx.beginPath(); p.points.forEach((q, i) => { const [x, y] = P(q.x, q.y); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); if (p.closed) ctx.closePath(); };
  ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
  trace(); ctx.strokeStyle = th.edge; ctx.lineWidth = roadPx + 3; ctx.stroke();
  trace(); ctx.strokeStyle = th.road; ctx.lineWidth = roadPx; ctx.stroke();
  trace(); ctx.setLineDash([6, 8]); ctx.strokeStyle = th.edge; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
  const normal = s => { const q = p.pointAt(s); const [x, y] = P(q.x, q.y); const a = -(q.heading + view.a); return { x, y, a, nx: -Math.sin(a), ny: Math.cos(a) }; };
  // braking zones: a coloured band along each car's side of the road while that car is braking
  const off = i => (i - (lanes.length - 1) / 2) * roadPx / (lanes.length > 2 ? 3.2 : 2.6);
  lanes.forEach(({ run, i }) => {
    if (!run.ok || !run.zones) return;
    for (const z of run.zones) {
      ctx.beginPath();
      for (let s = z.fromFt; s <= z.toFt; s += 4) { const n = normal(s); const x = n.x + n.nx * off(i), y = n.y + n.ny * off(i); s === z.fromFt ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
      ctx.strokeStyle = laneColor(i); ctx.globalAlpha = .45; ctx.lineWidth = 3; ctx.stroke(); ctx.globalAlpha = 1;
      const n = normal(z.fromFt);   // brake point tick
      ctx.beginPath(); ctx.moveTo(n.x + n.nx * (roadPx / 2 + 2), n.y + n.ny * (roadPx / 2 + 2)); ctx.lineTo(n.x - n.nx * (roadPx / 2 + 2), n.y - n.ny * (roadPx / 2 + 2));
      ctx.strokeStyle = laneColor(i); ctx.lineWidth = 2; ctx.stroke();
    }
  });
  // start / finish and labelled marks
  ctx.font = `${Math.max(10, Math.min(12, r.w / 60))}px ${th.font}`; ctx.fillStyle = th.muted; ctx.textBaseline = 'middle';
  const tick = (s, label, color = th.text) => {
    const n = normal(s), e = roadPx / 2 + 3;
    ctx.beginPath(); ctx.moveTo(n.x + n.nx * e, n.y + n.ny * e); ctx.lineTo(n.x - n.nx * e, n.y - n.ny * e); ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke();
    if (label) {   // put the label on the side of the road that faces the middle of the stage, inside the frame
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2, sgn = (cx - n.x) * n.nx + (cy - n.y) * n.ny >= 0 ? 1 : -1;
      const lx = n.x + sgn * n.nx * (e + 8), ly = n.y + sgn * n.ny * (e + 8), tw = ctx.measureText(label).width;
      ctx.fillStyle = th.muted; ctx.textAlign = 'left';
      ctx.fillText(label, Math.max(r.x + 4, Math.min(r.x + r.w - tw - 4, lx - tw / 2)), Math.max(r.y + 8, Math.min(r.y + r.h - 8, ly)));
    }
  };
  tick(0, p.closed ? 'start' : 'start');
  if (!p.closed) tick(p.length, 'finish');
  for (const m of scene.road.marks ?? []) if (m.s > 1 && m.s < p.length - 1) tick(m.s, m.label, th.muted);
  // cars
  lanes.forEach(({ run, i, q }) => {
    if (!run.ok) return;
    const n = normal(q.s);
    const cx = n.x + n.nx * off(i), cy = n.y + n.ny * off(i);
    drawCar(ctx, cx, cy, n.a, laneColor(i), q.mph, Math.max(.5, Math.min(.8, roadPx / 30)));
    // letter on the outside of the road, so overlapping cars stay distinguishable
    const side = off(i) >= 0 ? 1 : -1;
    const away = roadPx / 2 + 12 + (lanes.length === 3 && i === 1 ? 16 : 0);
    tag(ctx, n.x + n.nx * side * away, n.y + n.ny * side * away, i, th);
  });
}

/** Replay clock bound to a canvas. Returns a controller {set(scene), play(), pause(), seek(t), speed(x), drawFinal()}. */
export function createStage(canvas, { onTick } = {}) {
  let scene = null, t = 0, playing = false, rate = 1, last = 0, raf = 0, duration = 0;
  const ctx = canvas.getContext('2d');
  const th = () => theme(canvas);
  function size() {
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1), w = canvas.clientWidth || 640, h = canvas.clientHeight || 360;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  }
  function draw() {
    if (!scene) return;
    const { w, h } = size();
    paint(ctx, scene, t, { x: 0, y: 0, w, h }, { theme: th() });
    onTick?.(t, duration, playing);
  }
  function frame(now) {
    const dt = Math.min(.1, (now - last) / 1000); last = now;
    t = Math.min(duration, t + dt * rate);
    draw();
    if (t >= duration) { playing = false; onTick?.(t, duration, false); return; }
    raf = requestAnimationFrame(frame);
  }
  const api = {
    set(s) { cancelAnimationFrame(raf); playing = false; scene = prepare(s); duration = s.duration; t = 0; draw(); },
    play() { if (!scene) return; if (t >= duration) t = 0; playing = true; last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); onTick?.(t, duration, true); },
    pause() { playing = false; cancelAnimationFrame(raf); draw(); },
    toggle() { playing ? api.pause() : api.play(); },
    seek(x) { t = Math.max(0, Math.min(duration, x)); draw(); },
    speed(x) { rate = x; },
    end() { t = duration; draw(); },
    redraw: draw,
    get time() { return t; }, get duration() { return duration; }, get playing() { return playing; },
  };
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => draw()).observe(canvas);
  return api;
}
