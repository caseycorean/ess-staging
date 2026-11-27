// ESS Suspension lab: front-view geometry with direct manipulation, springs/ride, roll balance and model-run
// next experiments. Physics: engine/suspension.mjs (slaAt, strutAt, sweep) and engine/loads.mjs (ride, tireLoads).
// Units: canonical inches/lb/lb-in/degrees internally (see units.mjs); every number shown passes through units.format,
// every number typed through units.parse. One state object drives drag, keyboard, sliders and number fields.
import { slaAt, strutAt } from '../engine/suspension.mjs';
import { ride, tireLoads } from '../engine/loads.mjs';
import { format, parse, toDisplay, unitLabel, stepFor, canonicalStep, inputValue, unitsControl, getUnits } from './units.mjs';
import { attachHandles } from './manipulate.mjs';
import { escape } from './ui.mjs';

// ---------- front geometry presets (generic, educational; NOT measured from any vehicle) ----------
export const frontPresets = {
  sla: { name: 'Short/long arm (double wishbone)', solver: 'sla', provenance: 'example',
    points: { upperInner: [14, 16], upperOuter: [25, 17], lowerInner: [10, 7], lowerOuter: [27, 6], wheelCenter: [30, 12.5] },
    tireRadius: 12.5, staticCamber: -.5 },
  strut: { name: 'MacPherson strut', solver: 'strut', provenance: 'example',
    points: { top: [22, 30], lowerInner: [8, 6], lowerOuter: [26, 5], wheelCenter: [29, 12] },
    tireRadius: 12, staticCamber: -.5 },
};
export const pointNames = { upperInner: 'Upper arm inner pivot', upperOuter: 'Upper ball joint', lowerInner: 'Lower arm inner pivot',
  lowerOuter: 'Lower ball joint', top: 'Strut top mount', wheelCenter: 'Wheel center' };
const movable = { sla: ['upperInner', 'upperOuter', 'lowerInner', 'lowerOuter'], strut: ['top', 'lowerInner', 'lowerOuter'] };
export const TRAVEL = { bump: 3, rebound: 3 }; // generic ±3 in (published 1977 F-body: 3.0 in jounce / 3.75 in rebound)
const BOUNDS = { y: [0, 34], z: [0, 34] };

export const suspDefaults = () => ({ front: { layout: 'sla', pts: {}, travel: 0 }, lat: .9, arb: { f: 0, r: 0 } });
const SKEY = 'ess.suspension-page.v1';
export function loadSusp() { try { return cleanSusp(JSON.parse(sessionStorage.getItem(SKEY))) ?? suspDefaults(); } catch { return suspDefaults(); } }
export function saveSusp(s) { try { sessionStorage.setItem(SKEY, JSON.stringify(s)); } catch { /* fine */ } }

const finite = (x, lo, hi) => Number.isFinite(x) && x >= lo && x <= hi;
/** Validate a suspension page state (from storage or a shared link). Null when invalid. */
export function cleanSusp(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = suspDefaults();
  const f = raw.front ?? {};
  if (f.layout !== undefined) { if (!frontPresets[f.layout]) return null; out.front.layout = f.layout; }
  if (f.travel !== undefined) { if (!finite(f.travel, -TRAVEL.rebound, TRAVEL.bump)) return null; out.front.travel = f.travel; }
  if (f.pts !== undefined) {
    if (typeof f.pts !== 'object' || f.pts === null) return null;
    for (const [k, p] of Object.entries(f.pts)) {
      if (!movable[out.front.layout].includes(k) || !Array.isArray(p) || p.length !== 2 ||
          !finite(p[0], BOUNDS.y[0], BOUNDS.y[1]) || !finite(p[1], BOUNDS.z[0], BOUNDS.z[1])) return null;
      out.front.pts[k] = [p[0], p[1]];
    }
  }
  if (raw.lat !== undefined) { if (!finite(raw.lat, 0, 1.5)) return null; out.lat = raw.lat; }
  if (raw.arb !== undefined) {
    for (const k of ['f', 'r']) { const x = raw.arb?.[k] ?? 0; if (!finite(x, 0, 5000)) return null; out.arb[k] = x; }
  }
  if (raw.rear !== undefined) out.rear = raw.rear; // validated by the rear lab (cleanRear)
  return out;
}

/** Hardpoints for the solver from preset + visitor overrides (canonical inches). */
export function frontGeometry(front) {
  const p = frontPresets[front.layout];
  return { ...Object.fromEntries(Object.entries(p.points).map(([k, v]) => [k, front.pts[k] ?? v])), tireRadius: p.tireRadius, staticCamber: p.staticCamber };
}
const solverOf = layout => frontPresets[layout].solver === 'strut' ? strutAt : slaAt;

/** All front results used by the page (pure; tested). */
export function frontModel(front) {
  const g = frontGeometry(front);
  const solve = solverOf(front.layout);
  const at = t => solve(g, t);
  const zero = at(0), now = at(front.travel), up = at(1), down = at(-1);
  const curve = [];
  for (let t = -TRAVEL.rebound; t <= TRAVEL.bump + 1e-9; t += .25) { const r = at(+t.toFixed(2)); if (r) curve.push({ t: +t.toFixed(2), camber: r.camber, rc: r.rollCentreHeight }); }
  const ok = Boolean(zero && up && down);
  return { g, zero, now, ok, curve,
    camberGain: ok ? (up.camber - down.camber) / 2 : null,           // deg per in of bump (negative = gains negative camber)
    rcMigration: ok && Number.isFinite(up.rollCentreHeight) && Number.isFinite(down.rollCentreHeight) ? (up.rollCentreHeight - down.rollCentreHeight) / 2 : null,
    rcStatic: zero?.rollCentreHeight ?? null, swingArm: zero?.swingArm ?? null };
}

// ---------- springs, ride and roll (pure) ----------
const RAD_TO_DEG_LBFT = Math.PI / 180 / 12; // lb-in/rad → lb-ft/deg
/**
 * v: resolved vehicle (lb, in, lb/in). orig: original (for ride-height change). opts: {lat, arb:{f,r} lb-ft/deg, frontRc, rearRc}.
 */
export function rideModel(v, orig, { lat = .9, arb = { f: 0, r: 0 }, frontRc = null, rearRc = null } = {}) {
  const need = ['weight', 'front', 'wheelbase', 'cg', 'frontTrack', 'rearTrack', 'frontSpring', 'rearSpring', 'frontMotion', 'rearMotion', 'frontUnsprung', 'rearUnsprung'];
  const missing = need.filter(k => !Number.isFinite(v[k]));
  if (missing.length) return { missing };
  const corner = axle => (axle === 'front' ? v.frontLb ?? v.weight * v.front : v.rearLb ?? v.weight * (1 - v.front)) / 2;
  const axle = (key, o) => {
    const r = ride({ cornerLb: corner(key), unsprung: v[key + 'Unsprung'], spring: v[key + 'Spring'], motion: v[key + 'Motion'], tireRate: v.tireRate });
    const r0 = ride({ cornerLb: corner(key), unsprung: o[key + 'Unsprung'], spring: o[key + 'Spring'], motion: o[key + 'Motion'], tireRate: o.tireRate });
    const track = v[key + 'Track'];
    const springRoll = r.wheel * track * track / 2 * RAD_TO_DEG_LBFT; // springs at the wheel, both sides
    const bar = key === 'front' ? arb.f : arb.r;
    return { ...r, springRoll, bar, roll: springRoll + bar, heightChange: Number.isFinite(r0.staticDeflection) ? r0.staticDeflection - r.staticDeflection : null };
  };
  const front = axle('front', orig), rear = axle('rear', orig);
  const frontRoll = front.roll / (front.roll + rear.roll);
  const rc = { f: Number.isFinite(frontRc) ? frontRc : 2, r: Number.isFinite(rearRc) ? rearRc : 12 };
  const loads = tireLoads(v, 0, lat, { frontRoll, frontCenter: rc.f, rearCenter: rc.r });
  const totalRoll = front.roll + rear.roll; // lb-ft/deg
  const sprungMoment = v.weight * (v.cg - loads.rollAxis) / 12; // lb-ft per g (approx, whole mass)
  return { front, rear, frontRoll, loads, rc, staticFront: v.front, lltdFront: loads.lltdFront,
    rollGradient: totalRoll > 0 ? sprungMoment / totalRoll : null, // deg per g
    freqRatio: front.hz && rear.hz ? rear.hz / front.hz : null };
}

export function balanceText(m) {
  if (!m || m.missing || !Number.isFinite(m.lltdFront)) return '';
  const d = (m.lltdFront - m.staticFront) * 100;
  if (d > 5) return `The front axle takes ${d.toFixed(0)} points more of the cornering load transfer than its share of the weight: a tendency toward understeer at the limit.`;
  if (d < -2) return `The rear axle takes a larger share of the cornering load transfer than its share of the weight: a tendency toward oversteer at the limit.`;
  return 'Front load-transfer share is close to the front weight share plus a few points, a commonly used near-neutral starting point.';
}


/** Model-run next experiments for the suspension page (pure). Each carries the change and its computed effects. */
export function suspExperiments({ v, orig, susp, rearRc, applyTune }) {
  const frontRc = frontModel(susp.front).rcStatic;
  const run = (veh, arb = susp.arb) => rideModel(veh, orig, { lat: susp.lat, arb, frontRc, rearRc });
  const base = run(v);
  if (base.missing) return [];
  const out = [], pct = x => (x * 100).toFixed(1);
  for (const [k, label] of [['frontSpring', 'Front springs +20%'], ['rearSpring', 'Rear springs +20%']]) {
    const value = Math.round(v[k] * 1.2);
    const nv = applyTune(k, value);
    if (!nv) continue;
    const r = run(nv), ax = k.startsWith('front') ? 'front' : 'rear';
    out.push({ id: k, title: `${label} (${format('rate', value, { digits: 0, metricDigits: 1 })})`, kind: 'tune', key: k, value,
      fx: `${ax} ride ${format('frequency', base[ax].hz)} → ${format('frequency', r[ax].hz)} · front load-transfer share ${pct(base.lltdFront)} → ${pct(r.lltdFront)}% · ${ax} sits ${format('length', r[ax].heightChange - base[ax].heightChange, { signed: true, digits: 2 })}`,
      dLltd: r.lltdFront - base.lltdFront });
  }
  if (!susp.arb.f) {
    const arb = { ...susp.arb, f: 300 }, r = run(v, arb);
    out.push({ id: 'arbF', title: `Add a front anti-roll bar (${format('rollStiffness', 300)})`, kind: 'arb', arb,
      fx: `front roll stiffness share ${pct(base.frontRoll)} → ${pct(r.frontRoll)}% · front load-transfer share ${pct(base.lltdFront)} → ${pct(r.lltdFront)}%`, dLltd: r.lltdFront - base.lltdFront });
  }
  if (susp.front.layout === 'sla') {
    const g = frontGeometry(susp.front);
    const front = { ...susp.front, pts: { ...susp.front.pts, upperInner: [g.upperInner[0], +(g.upperInner[1] - .5).toFixed(3)] } };
    const a = frontModel(susp.front), b = frontModel(front);
    if (b.ok) {
      const r = rideModel(v, orig, { lat: susp.lat, arb: susp.arb, frontRc: b.rcStatic, rearRc });
      out.push({ id: 'uiDown', title: `Lower the upper inner pivot ${format('length', .5, { digits: 1, metricDigits: 0 })}`, kind: 'front', front,
        fx: `camber gain ${format('angle', a.camberGain, { signed: true })} → ${format('angle', b.camberGain, { signed: true })} per in · roll center ${format('length', a.rcStatic, { digits: 1 })} → ${format('length', b.rcStatic, { digits: 1 })}`,
        dLltd: r.lltdFront - base.lltdFront });
    }
  }
  return out;
}

// ---------- page ----------
const lenDigits = { us: 2, metric: 0 };
const fmtPt = p => `${format('length', p[0], { digits: 1, metricDigits: 0 })} outboard, ${format('length', p[1], { digits: 1, metricDigits: 0 })} high`;
const perIn = () => getUnits() === 'metric' ? '25 mm' : 'in';

/** Text field that accepts either unit system; the unit shown is the preferred one. */
function textField(id, q, value, label, data, { digits, note = '', range = null } = {}) {
  const r = range ? `<input type="range" id="${id}-r" min="${+toDisplay(q, range[0]).toFixed(3)}" max="${+toDisplay(q, range[1]).toFixed(3)}" step="${stepFor(q)}"
      value="${+toDisplay(q, value).toFixed(4)}" ${data} data-q="${q}" data-range aria-label="${escape(label)} slider" aria-valuetext="${escape(format(q, value))}">` : '';
  return `<div class="susp-field"><label for="${id}">${escape(label)}</label>
    <div class="susp-input">${r}<input type="text" inputmode="decimal" autocomplete="off" id="${id}" value="${escape(inputValue(q, value, digits))}" ${data} data-q="${q}" data-text
      aria-describedby="${id}-u"><span class="susp-unit" id="${id}-u">${escape(unitLabel(q) || '×')}</span></div>
    <small class="susp-err" data-err-for="${id}" role="alert"></small>${note ? `<small>${escape(note)}</small>` : ''}</div>`;
}

export function frontPanelHtml(susp) {
  const f = susp.front;
  const sel = movable[f.layout].includes(susp.selected) ? susp.selected : movable[f.layout][0];
  const g = frontGeometry(f);
  return `<section class="panel content-panel susp-front" aria-labelledby="susp-front-title" data-susp-front>
    <h2 id="susp-front-title">Front: camber and roll center through travel</h2>
    <div class="susp-prov" data-front-prov></div>
    <div class="susp-row"><label><span>Layout</span><select data-susp-layout>${Object.entries(frontPresets).map(([k, p]) => `<option value="${k}" ${k === f.layout ? 'selected' : ''}>${p.name}</option>`).join('')}</select></label>
      <button type="button" class="button secondary small" data-susp-reset-front>Reset front geometry</button></div>
    <div class="susp-front-grid">
      <div class="dm-stage" data-front-stage><svg viewBox="0 0 360 300" class="susp-svg" data-front-svg role="img" aria-label="Front view of the left front corner: arms, tire, instant center and roll center"></svg><div class="dm-layer" data-front-layer></div></div>
      <div class="susp-front-side"><div class="susp-readout" data-front-readout></div>
        <div class="susp-curves" data-front-curves></div></div>
    </div>
    <p class="susp-hint">Drag a pivot, or drag the wheel center up and down for travel. Keyboard: Tab to a point, arrow keys move it (Shift ×10, Alt fine), Home puts it back.</p>
    ${textField('susp-travel', 'length', f.travel, 'Wheel travel (+ bump, − rebound)', 'data-susp-travel', { digits: lenDigits, range: [-TRAVEL.rebound, TRAVEL.bump] })}
    <div class="susp-edit"><label class="susp-pick"><span>Point to edit exactly</span><select data-susp-point>${movable[f.layout].map(k => `<option value="${k}" ${k === sel ? 'selected' : ''}>${escape(pointNames[k])}</option>`).join('')}</select></label>
      <div class="pair-grid susp-xy">${textField('susp-pt-y', 'length', g[sel][0], 'Outboard from centerline', 'data-susp-pt="0"', { digits: lenDigits })}${textField('susp-pt-z', 'length', g[sel][1], 'Height above ground', 'data-susp-pt="1"', { digits: lenDigits })}</div>
      <p class="quiet small">Type in either system: “25.5”, “648 mm” or “25.5 in”. Measured at ride height, wheel at zero travel.</p></div>
    <details class="explain"><summary>What the front view assumes</summary><p>Two-dimensional front view of one corner: body held level, both wheels moving together (heave). Rigid arms and bushings, no compliance, steering or caster. The roll center is where the line from the tire contact patch through the arms' instant center crosses the car's centerline; it moves as the suspension moves, which changes how cornering load reaches the tires. Published 1977 Firebird travel is 3.0 in bump and 3.75 in rebound; this lab uses ±3 in.</p></details>
  </section>`;
}

function provHtml(f) {
  const moved = Object.keys(f.pts);
  return moved.length
    ? `<b data-prov="user">Your geometry</b> ${moved.length} point${moved.length > 1 ? 's' : ''} moved (${moved.map(k => escape(pointNames[k])).join(', ')}); the rest are the generic example. Results are only as good as the measurements.`
    : `<b data-prov="example">Generic example</b> Educational layout, not measured from any car. ESS has no verified second-gen F-body pickup points yet: measure yours and enter them.`;
}

export function frontReadoutHtml(m) {
  if (!m.ok) return '<p class="warning">This linkage cannot reach ride height or ±1 in of travel. Move the point back or reset.</p>';
  const n = m.now, gain = m.camberGain;
  return `<dl class="gc-facts">
    <div><dt>Camber now</dt><dd>${n ? format('angle', n.camber) : '—'} <small>${n ? format('angle', n.camberChange, { signed: true }) + ' from ride height' : 'out of reach'}</small></dd></div>
    <div><dt>Camber gain</dt><dd>${format('angle', gain * (getUnits() === 'metric' ? 25 / 25.4 : 1), { signed: true })} per ${perIn()} bump <small>${gain < -.6 ? 'strong: tire stays flatter in roll, more scrub' : gain < -.05 ? 'moderate negative gain' : gain > .05 ? 'positive: tire tips outward in bump' : 'nearly constant camber'}</small></dd></div>
    <div><dt>Roll center</dt><dd>${format('length', m.rcStatic, { digits: 1 })} <small>at ride height${n && Number.isFinite(n.rollCentreHeight) && n.travel ? '; ' + format('length', n.rollCentreHeight, { digits: 1 }) + ' now' : ''}</small></dd></div>
    <div><dt>Roll center migration</dt><dd>${format('length', m.rcMigration * (getUnits() === 'metric' ? 25 / 25.4 : 1), { digits: 2, signed: true })} per ${perIn()} <small>vertical, with heave</small></dd></div>
    <div><dt>Swing-arm length</dt><dd>${Number.isFinite(m.swingArm) && Math.abs(m.swingArm) < 2000 ? format('length', m.swingArm, { digits: 0 }) : 'very long (near-parallel arms)'}</dd></div>
    <div><dt>Track change</dt><dd>${n ? format('length', n.trackChange, { digits: 2, signed: true }) : '—'} <small>both sides, at this travel</small></dd></div>
  </dl>`;
}

function curveSvg(model, key, label, q) {
  const pts = model.curve.filter(r => Number.isFinite(r[key]));
  if (pts.length < 2) return '';
  const xs = pts.map(r => r.t), ys = pts.map(r => r[key]);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  const span = key === 'rc' ? 1 : .5;
  if (hi - lo < span) { const mid = (hi + lo) / 2; lo = mid - span / 2; hi = mid + span / 2; }
  const X = t => 40 + (t - xs[0]) / (xs.at(-1) - xs[0]) * 146, Y = y => 66 - (y - lo) / (hi - lo) * 54;
  const n = model.now, nowY = n ? (key === 'rc' ? n.rollCentreHeight : n.camber) : null;
  return `<figure class="susp-curve"><figcaption>${escape(label)}</figcaption><svg viewBox="0 0 196 92" role="img" aria-label="${escape(label)}: ${escape(format(q, ys[0], { digits: 1 }))} at full rebound to ${escape(format(q, ys.at(-1), { digits: 1 }))} at full bump">
    <line x1="40" y1="66" x2="186" y2="66" class="ax"/><line x1="${X(0).toFixed(1)}" y1="8" x2="${X(0).toFixed(1)}" y2="70" class="ax0"/>
    <polyline points="${pts.map(r => `${X(r.t).toFixed(1)},${Y(r[key]).toFixed(1)}`).join(' ')}" class="ln"/>
    ${Number.isFinite(nowY) ? `<circle cx="${X(n.travel).toFixed(1)}" cy="${Y(nowY).toFixed(1)}" r="4" class="pt"/>` : ''}
    <text x="36" y="${(Y(hi) + 4).toFixed(1)}" text-anchor="end">${escape(format(q, hi, { digits: 1, system: getUnits() === 'dual' ? 'us' : getUnits() }))}</text>
    <text x="36" y="${(Y(lo) + 4).toFixed(1)}" text-anchor="end">${escape(format(q, lo, { digits: 1, system: getUnits() === 'dual' ? 'us' : getUnits() }))}</text>
    <text x="40" y="84">rebound</text><text x="186" y="84" text-anchor="end">bump</text></svg></figure>`;
}

// Front-view SVG frame: model inches → 360×300 viewBox
const VX = y => 20 + (y + 1) * 9.4, VZ = z => 280 - (z + 4) * 7;
const MX = vx => (vx - 20) / 9.4 - 1, MZ = vz => (280 - vz) / 7 - 4;

export function paintFront(svg, f) {
  const m = frontModel(f), base = frontModel({ ...f, pts: {} });
  const P = ([y, z]) => `${VX(y).toFixed(1)},${VZ(z).toFixed(1)}`;
  const line = (a, b, cls) => `<line x1="${VX(a[0]).toFixed(1)}" y1="${VZ(a[1]).toFixed(1)}" x2="${VX(b[0]).toFixed(1)}" y2="${VZ(b[1]).toFixed(1)}" class="${cls}"/>`;
  const corner = r => {
    if (!r) return '';
    const p = r.points, rad = frontPresets[f.layout].tireRadius, c = p.wheelCenter, a = r.camber * Math.PI / 180, half = 4.2;
    const tire = [[-half, -rad], [half, -rad], [half, rad], [-half, rad]].map(([dy, dz]) => [c[0] + dy * Math.cos(a) - dz * Math.sin(a), c[1] + dy * Math.sin(a) + dz * Math.cos(a)]);
    const arms = p.top ? line(p.lowerInner, p.lowerOuter, 'arm') + line(p.top, p.lowerOuter, 'arm strut')
      : line(p.lowerInner, p.lowerOuter, 'arm') + line(p.upperInner, p.upperOuter, 'arm') + line(p.upperOuter, p.lowerOuter, 'upright');
    return `<polygon points="${tire.map(P).join(' ')}" class="tire"/>${arms}`;
  };
  const r = m.now;
  let ic = '', rc = '';
  if (r?.instantCentre && r.points.contact) {
    const [iy, iz] = r.instantCentre, inView = iy > -2 && iy < 36 && iz > -4 && iz < 38;
    // Line from the contact patch toward the instant center, clipped to the drawing
    const c = r.points.contact, d = [iy - c[0], iz - c[1]], L = Math.hypot(...d) || 1, far = Math.min(L, 60);
    const end = [c[0] + d[0] / L * far, c[1] + d[1] / L * far];
    ic = line(c, end, 'icl') + (inView ? `<circle cx="${VX(iy).toFixed(1)}" cy="${VZ(iz).toFixed(1)}" r="3" class="ic"/><text x="${(VX(iy) + 5).toFixed(1)}" y="${(VZ(iz) - 4).toFixed(1)}" class="lbl">IC</text>` : '');
  }
  if (r && Number.isFinite(r.rollCentreHeight)) {
    const z = f.travel + r.rollCentreHeight;
    rc = `<circle cx="${VX(0)}" cy="${VZ(z).toFixed(1)}" r="5" class="rc"/><text x="${VX(0) + 8}" y="${(VZ(z) + 4).toFixed(1)}" class="lbl rcl">RC</text>`;
  }
  svg.innerHTML = `<rect x="0" y="0" width="360" height="300" class="bg"/>
    ${[0, 10, 20, 30].map(y => `<line x1="${VX(y)}" y1="10" x2="${VX(y)}" y2="292" class="grid"/>`).join('')}
    ${[0, 10, 20, 30].map(z => `<line x1="8" y1="${VZ(z)}" x2="352" y2="${VZ(z)}" class="grid"/>`).join('')}
    <line x1="${VX(0)}" y1="6" x2="${VX(0)}" y2="296" class="cl"/><text x="${VX(0) + 4}" y="18" class="lbl">car centerline</text>
    <line x1="6" y1="${VZ(f.travel).toFixed(1)}" x2="354" y2="${VZ(f.travel).toFixed(1)}" class="ground"/><text x="352" y="${(VZ(f.travel) + 13).toFixed(1)}" text-anchor="end" class="lbl">road (body fixed; road moves with travel)</text>
    ${Object.keys(f.pts).length ? `<g class="ghost">${corner(base.now)}</g>` : ''}${ic}<g class="live">${corner(r)}</g>${rc}
    <text x="352" y="18" text-anchor="end" class="lbl">grid ${escape(format('length', 10, { digits: 0, metricDigits: 0, system: getUnits() === 'dual' ? 'us' : getUnits() }))}</text>`;
}

// ---------- springs, ride, roll ----------
export function ridePanelHtml(v, susp) {
  const axle = k => `<div class="susp-axle"><h3>${k === 'front' ? 'Front' : 'Rear'}</h3>
    ${textField(`susp-${k}-spring`, 'rate', v[k + 'Spring'], 'Spring rate', `data-susp-tune="${k}Spring"`, { digits: { us: 0, metric: 1 } })}
    ${textField(`susp-${k}-motion`, 'ratio', v[k + 'Motion'], 'Motion ratio (spring ÷ wheel travel)', `data-susp-tune="${k}Motion"`, { digits: 3 })}
    ${textField(`susp-${k}-bar`, 'rollStiffness', susp.arb[k[0]], 'Anti-roll bar roll stiffness', `data-susp-arb="${k[0]}"`, { note: '0 = no bar modelled. Enter your bar’s rate at the wheels.' })}
    <div data-ride-axle="${k}"></div></div>`;
  return `<section class="panel content-panel susp-ride" aria-labelledby="susp-ride-title" data-susp-ride>
    <h2 id="susp-ride-title">Springs, ride height and roll balance</h2>
    <p class="quiet small">Spring and motion-ratio changes are saved with the car, so Use this configuration, Garage, Compare and shared links keep them. Starting values are the car's data in ESS (see provenance in Build).</p>
    <div class="susp-axles">${axle('front')}${axle('rear')}</div>
    <p class="susp-ratio" data-ride-ratio></p>
    <h3 class="ig-h3">Cornering</h3>
    ${textField('susp-lat', 'accel', susp.lat, 'Cornering acceleration', 'data-susp-lat', { digits: 2, range: [0, 1.5] })}
    <div data-ride-corner aria-live="polite"></div>
    <details class="explain"><summary>How these are calculated</summary><p>Wheel rate = spring rate × motion ratio². Ride rate combines wheel and tire rates in series. Ride frequency = √(ride rate × g ÷ sprung corner weight) ÷ 2π. Static deflection = sprung corner weight ÷ ride rate; the ride-height change assumes the same spring free length and perch. Axle roll stiffness from springs = wheel rate × track² ÷ 2, plus any anti-roll bar you enter. Cornering load transfer is split into a geometric part through each roll center and an elastic part shared by roll stiffness (the ESS Load Transfer calculator method). Shocks, bushings, tire lateral stiffness and chassis flex are not modelled.</p></details>
  </section>`;
}

export function rideAxleHtml(r) {
  return `<dl class="gc-facts">
    <div><dt>Wheel rate</dt><dd>${format('rate', r.wheel, { digits: 0, metricDigits: 1 })}</dd></div>
    <div><dt>Ride rate with tire</dt><dd>${format('rate', r.rate, { digits: 0, metricDigits: 1 })}</dd></div>
    <div><dt>Ride frequency</dt><dd>${format('frequency', r.hz)}</dd></div>
    <div><dt>Static deflection</dt><dd>${format('length', r.staticDeflection, { digits: 2 })}</dd></div>
    <div><dt>Ride height vs stock springs</dt><dd>${Math.abs(r.heightChange) < .005 ? 'same' : format('length', r.heightChange, { digits: 2, signed: true })}</dd></div>
    <div><dt>Roll stiffness</dt><dd>${format('rollStiffness', r.roll)} <small>springs ${format('rollStiffness', r.springRoll)}${r.bar ? ' + bar' : ''}</small></dd></div>
  </dl>`;
}

export function cornerHtml(rm, lat) {
  const L = rm.loads, pct = x => (x * 100).toFixed(1) + '%', max = Math.max(...L.tires, 1);
  const tire = (i, name) => `<div class="susp-tire" style="--load:${Math.max(0, L.tires[i] / max * 100).toFixed(0)}%"><span>${name}</span><b>${escape(format('weight', L.tires[i]))}</b></div>`;
  return `<div class="susp-tires" role="img" aria-label="Tire loads at ${escape(format('accel', lat))}: inside front ${escape(format('weight', L.tires[1]))}, outside front ${escape(format('weight', L.tires[0]))}, inside rear ${escape(format('weight', L.tires[3]))}, outside rear ${escape(format('weight', L.tires[2]))}">
      ${tire(1, 'Inside front')}${tire(0, 'Outside front')}${tire(3, 'Inside rear')}${tire(2, 'Outside rear')}</div>
    <dl class="gc-facts">
      <div><dt>Front share of roll stiffness</dt><dd>${pct(rm.frontRoll)}</dd></div>
      <div><dt>Front share of load transfer</dt><dd>${Number.isFinite(rm.lltdFront) ? pct(rm.lltdFront) : '—'} <small>front weight ${pct(rm.staticFront)}</small></dd></div>
      <div><dt>Roll centers used</dt><dd>front ${escape(format('length', rm.rc.f, { digits: 1 }))} · rear ${escape(format('length', rm.rc.r, { digits: 1 }))} <small>from the front view and rear link lab</small></dd></div>
      <div><dt>Roll gradient</dt><dd>${Number.isFinite(rm.rollGradient) ? rm.rollGradient.toFixed(1) + '° per g' : '—'} <small>whole-car estimate</small></dd></div>
    </dl>
    <p class="susp-balance">${escape(balanceText(rm))}</p>
    ${L.invalid ? '<p class="warning">At this cornering level an inside tire would lift in the model.</p>' : ''}`;
}

export function ratioText(rm) {
  return `Rear ÷ front ride frequency: <b>${rm.freqRatio ? rm.freqRatio.toFixed(2) : '—'}</b>. ${rm.freqRatio > 1.02 ? 'Rear slightly faster than front: a common road-car choice for a flatter ride over bumps.' : rm.freqRatio < .98 ? 'Front faster than rear: common on race cars with stiff front ends; it can pitch more over bumps.' : 'Front and rear about equal.'}`;
}

export function nextHtml(list) {
  if (!list.length) return '';
  return `<p class="ig-step-why">Each one is a model run of this car and geometry. Apply it, then compare.</p>
    <ol class="ig-exp-list">${list.map(x => `<li><button type="button" class="ig-exp" data-susp-try="${x.id}"><span class="ig-exp-title">${escape(x.title)}</span>
      <b class="ig-exp-gain">${Number.isFinite(x.dLltd) ? `${x.dLltd > 0 ? '+' : '−'}${Math.abs(x.dLltd * 100).toFixed(1)} pts front` : ''}</b>
      <span class="ig-exp-fx">${escape(x.fx)}</span><span class="ig-exp-go">Apply</span></button></li>`).join('')}</ol>`;
}

/** Whole page (header, front, rear lab placeholder, ride, next, links). */
export function suspensionPageHtml({ name, v, susp, rearHtml, provenance = '' }) {
  return `<section class="shell workspace suspension-workspace">
    <header class="page-title"><p class="eyebrow">Engineering experiments</p><h1>Suspension</h1>
      <p class="lede">Grab a pivot and move it. Camber, roll center, load transfer and the next experiment update from the same model as you go.</p></header>
    <div class="panel content-panel susp-top">
      <p><b>${escape(name)}</b>${provenance ? ` · <span class="quiet">${escape(provenance)}</span>` : ''}</p>
      ${unitsControl('susp-units')}
      <ul class="susp-legend"><li><b data-prov="actual">Car data</b> weights, track, springs and motion ratios from this configuration (Build shows each value's source)</li>
        <li><b data-prov="estimate">Estimated</b> marked in Build when a value is ESS's estimate</li>
        <li><b data-prov="example">Generic example</b> educational geometry, not any real car</li></ul>
      <div class="actions"><button type="button" class="button small" data-susp-share>Share this suspension experiment</button></div>
      <p id="susp-share-feedback" class="share-feedback" aria-live="polite"></p>
    </div>
    ${frontPanelHtml(susp)}
    ${rearHtml}
    ${ridePanelHtml(v, susp)}
    <section class="panel content-panel" aria-labelledby="susp-next-title"><h2 id="susp-next-title">Next experiment</h2><div data-susp-next></div></section>
    <section class="panel content-panel"><h2>Keep going</h2><ul class="susp-links">
      <li><a href="#build">Build</a>: change weight, parts or springs and see their source.</li>
      <li><a href="#compare">Compare</a>: run this configuration against another.</li>
      <li><a href="#garage">Garage</a>: save it.</li>
      <li><a href="../tools/spring-rate/">Spring rate calculator</a> and <a href="../tools/load-transfer/">Load transfer calculator</a>: the same formulas step by step.</li>
      <li><a href="../articles/traction-circle/">The traction circle</a>: why tire load matters for grip.</li>
      <li><a href="#performance">Gearing and traction</a>: what the rear tire load does for launch.</li></ul></section>
  </section>`;
}

// ---------- behaviour ----------
const fieldError = (root, input, text) => { const e = root.querySelector(`[data-err-for="${input.id}"]`); if (e) e.textContent = text; input.setAttribute('aria-invalid', text ? 'true' : 'false'); };

/**
 * ctx: { susp, v, orig, applyTune(key, value) → true|string (error), save(), rerender(), announce(text), mountRear(root, onRear) }
 * One state (ctx.susp + the configuration) feeds every input method; nothing is rewritten from displayed text.
 */
export function mountSuspensionPage(root, ctx) {
  const { susp, v, orig } = ctx;
  const f = susp.front;
  let rearRc = null;
  const $ = sel => root.querySelector(sel);
  const front = mountFront(root, susp, { onChange: phase => { updateFront(); if (phase !== 'move') { updateRide(); ctx.save(); } }, announce: ctx.announce });

  function syncField(sel, q, value, digits) {
    for (const el of root.querySelectorAll(sel)) {
      if (el === document.activeElement && el.dataset.text !== undefined) continue;
      if (el.dataset.range !== undefined) { el.value = +toDisplay(q, value).toFixed(4); el.setAttribute('aria-valuetext', format(q, value)); }
      else { el.value = inputValue(q, value, digits); fieldError(root, el, ''); }
    }
  }
  function selected() { return movable[f.layout].includes(susp.selected) ? susp.selected : movable[f.layout][0]; }
  function updateFront() {
    const m = frontModel(f);
    front?.repaint();
    $('[data-front-readout]').innerHTML = frontReadoutHtml(m);
    $('[data-front-curves]').innerHTML = curveSvg(m, 'camber', 'Camber through travel', 'angle') + curveSvg(m, 'rc', 'Roll center height through travel', 'length');
    $('[data-front-prov]').innerHTML = provHtml(f);
    syncField('[data-susp-travel]', 'length', f.travel, lenDigits);
    const g = frontGeometry(f), sel = selected();
    $('[data-susp-point]').value = sel;
    syncField('[data-susp-pt="0"]', 'length', g[sel][0], lenDigits);
    syncField('[data-susp-pt="1"]', 'length', g[sel][1], lenDigits);
  }
  let lastRm = null;
  function updateRide() {
    const rm = rideModel(v, orig, { lat: susp.lat, arb: susp.arb, frontRc: frontModel(f).rcStatic, rearRc });
    lastRm = rm;
    const ride = $('[data-susp-ride]');
    if (rm.missing) { ride.querySelector('[data-ride-corner]').innerHTML = `<p class="warning">This car needs ${escape(rm.missing.join(', '))} for ride and roll results. Add them in Build.</p>`; return; }
    for (const k of ['front', 'rear']) ride.querySelector(`[data-ride-axle="${k}"]`).innerHTML = rideAxleHtml(rm[k]);
    ride.querySelector('[data-ride-ratio]').innerHTML = ratioText(rm);
    ride.querySelector('[data-ride-corner]').innerHTML = cornerHtml(rm, susp.lat);
    syncField('[data-susp-lat]', 'accel', susp.lat, 2);
    nextList = suspExperiments({ v, orig, susp, rearRc, applyTune: ctx.preview });
    $('[data-susp-next]').innerHTML = nextHtml(nextList) || '<p class="quiet">Add the missing car data to get model-run suggestions.</p>';
  }
  let nextList = [];

  function readText(el) {
    const q = el.dataset.q, value = parse(q, el.value);
    if (value === null) { fieldError(root, el, `Could not read “${el.value}”. Enter a number${unitLabel(q) ? `, optionally with a unit (${unitLabel(q, 'us')} or ${unitLabel(q, 'metric')})` : ''}.`); return null; }
    fieldError(root, el, '');
    return value;
  }
  function apply(el, value, phase) {
    if (el.dataset.suspTravel !== undefined) {
      f.travel = Math.min(TRAVEL.bump, Math.max(-TRAVEL.rebound, value));
      if (Math.abs(value) > 3 && phase === 'change') fieldError(root, el, `Travel is limited to ±${format('length', 3, { digits: 0 })} here.`);
      updateFront(); if (phase === 'change') { updateRide(); ctx.save(); }
    } else if (el.dataset.suspPt !== undefined) {
      const sel = selected(), axis = Number(el.dataset.suspPt), g = frontGeometry(f), prev = f.pts[sel];
      const next = [...g[sel]]; next[axis] = value;
      const b = axis ? BOUNDS.z : BOUNDS.y;
      if (value < b[0] || value > b[1]) { fieldError(root, el, `Keep this between ${format('length', b[0], { digits: 0 })} and ${format('length', b[1], { digits: 0 })}.`); return; }
      f.pts[sel] = next;
      if (!frontModel(f).ok) { if (prev) f.pts[sel] = prev; else delete f.pts[sel]; fieldError(root, el, 'At that position the linkage cannot reach ride height. Not applied.'); return; }
      susp.selected = sel; updateFront(); updateRide(); ctx.save();
    } else if (el.dataset.suspLat !== undefined) {
      if (value < 0 || value > 1.5) { fieldError(root, el, 'Use 0 to 1.5 g.'); return; }
      susp.lat = value; updateRide(); ctx.save();
    } else if (el.dataset.suspArb !== undefined) {
      if (value < 0 || value > 5000) { fieldError(root, el, `Use 0 to ${format('rollStiffness', 5000)}.`); return; }
      susp.arb[el.dataset.suspArb] = value; updateRide(); ctx.save();
    } else if (el.dataset.suspTune !== undefined) {
      const res = ctx.applyTune(el.dataset.suspTune, el.dataset.q === 'rate' ? Math.round(value * 10) / 10 : Math.round(value * 1000) / 1000);
      if (res !== true) fieldError(root, el, res);
    }
  }
  root.addEventListener('input', event => {
    const el = event.target;
    if (el.dataset?.range === undefined || !el.closest('[data-susp-front],[data-susp-ride]')) return;
    apply(el, Number(el.value) / (toDisplay(el.dataset.q, 1)), 'input');
  });
  root.addEventListener('change', event => {
    const el = event.target;
    if (!el.closest?.('[data-susp-front],[data-susp-ride]')) return;
    if (el.matches('[data-susp-layout]')) { susp.front = { layout: el.value, pts: {}, travel: 0 }; susp.selected = null; ctx.save(); ctx.rerender(); return; }
    if (el.matches('[data-susp-point]')) { susp.selected = el.value; updateFront(); front?.dm.refresh(); return; }
    if (el.dataset.range !== undefined) { apply(el, Number(el.value) / toDisplay(el.dataset.q, 1), 'change'); return; }
    if (el.dataset.text === undefined) return;
    const value = readText(el);
    if (value !== null) apply(el, value, 'change');
  });
  root.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target.dataset?.text !== undefined && event.target.closest('[data-susp-front],[data-susp-ride]')) { event.preventDefault(); const el = event.target; el.blur(); el.focus({ preventScroll: true }); }
  });
  root.addEventListener('click', event => {
    const reset = event.target.closest('[data-susp-reset-front]');
    if (reset) { susp.front = { layout: f.layout, pts: {}, travel: 0 }; susp.selected = null; ctx.save(); ctx.rerender(); ctx.announce('Front geometry reset to the generic example.'); return; }
    const t = event.target.closest('[data-susp-try]');
    if (!t) return;
    const x = nextList.find(e => e.id === t.dataset.suspTry);
    if (!x) return;
    if (x.kind === 'tune') { const res = ctx.applyTune(x.key, x.value, x.title); if (res !== true) ctx.announce(res); }
    else { if (x.kind === 'arb') susp.arb = x.arb; if (x.kind === 'front') susp.front = x.front; ctx.save(); ctx.rerender(); ctx.announce('Applied: ' + x.title); }
  });

  ctx.mountRear?.(root, info => { rearRc = Number.isFinite(info.rollCentre) ? info.rollCentre : null; susp.rear = info.state; ctx.save(); updateRide(); });
  updateFront();
  updateRide();
  return { get model() { return lastRm; } };
}

function mountFront(root, susp, { onChange, announce }) {
  const stage = root.querySelector('[data-front-stage]');
  if (!stage) return null;
  const svg = stage.querySelector('svg'), layer = stage.querySelector('[data-front-layer]');
  const scale = () => (svg.getBoundingClientRect().width || 360) / 360;
  const f = susp.front;
  const handles = () => {
    const g = frontGeometry(f), step = canonicalStep('length');
    const list = movable[f.layout].map(k => ({ id: k, point: g[k], label: pointNames[k], axes: 'xy', selected: susp.selected === k, step: [step, step], describe: fmtPt }));
    const now = frontModel(f).now;
    if (now) list.push({ id: 'travel', point: now.points.wheelCenter, label: 'Wheel center (travel)', axes: 'y', step: [0, step],
      describe: () => `${format('length', f.travel, { signed: true })} travel` });
    return list;
  };
  const dm = attachHandles(layer, {
    handles,
    toScreen: ([y, z]) => [VX(y) * scale(), VZ(z) * scale()],
    toModel: ([px, py]) => [MX(px / scale()), MZ(py / scale())],
    clamp: (id, [y, z]) => [Math.min(BOUNDS.y[1], Math.max(BOUNDS.y[0], y)), Math.min(BOUNDS.z[1], Math.max(BOUNDS.z[0], z))],
    onMove(id, p, phase) {
      if (id === 'travel') {
        // The body is held still in this view: dragging the wheel up is bump. Wheel center rises with travel.
        const z0 = frontModel({ ...f, travel: 0 }).zero.points.wheelCenter[1];
        const now = frontModel(f).now, zNow = now ? now.points.wheelCenter[1] : z0;
        const t = f.travel + (p[1] - zNow);
        f.travel = Math.round(Math.min(TRAVEL.bump, Math.max(-TRAVEL.rebound, t)) * 1000) / 1000;
      } else {
        const prev = f.pts[id];
        f.pts[id] = [Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000];
        susp.selected = id;
        if (!frontModel(f).ok) {
          if (prev) f.pts[id] = prev; else delete f.pts[id];
          if (phase !== 'move') announce?.('That position leaves the linkage unable to reach ride height; it was not applied.');
        }
      }
      onChange(phase);
    },
    onReset(id) { if (id === 'travel') f.travel = 0; else delete f.pts[id]; onChange('end'); },
    announce,
  });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => dm.refresh()).observe(svg);
  return { repaint() { paintFront(svg, f); dm.refresh(); }, dm };
}

export { unitsControl };
