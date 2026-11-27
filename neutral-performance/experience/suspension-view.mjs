import { linkLayout, layouts, solveRearLinks, stages } from './rear-links.mjs';
import { architectureLabel } from './vehicles.mjs';
import { escape, fmt } from './ui.mjs';
import { rearLinkInsights, rollSteerMeaning } from './rear-link-insights.mjs';
import { attachHandles } from './manipulate.mjs';
import { format } from './units.mjs';

const colors = {lower: '#b3a487', upper: '#ffb971', lateral: '#8bcdb7', slider: '#9fc8ed'};
const dimensions = [
  {name: 'Forward from axle (in)', min: -12, max: 60},
  {name: 'Right of center (in)', min: -30, max: 30},
  {name: 'Height above road (in)', min: 5, max: 30},
];

function dial(id, name, min, max, step, value) {
  return `<label class="slider"><span>${name} <output data-link-value="${id}">${value}</output></span>
    <input type="range" data-link-input="${id}" min="${min}" max="${max}" step="${step}" value="${value}"></label>`;
}

export function suspensionView(activeName, reference, {embedded = false, initial = null} = {}) {
  const archLayout = {threeLink:'three', fourLinkParallel:'parallel', fourLinkTriangulated:'triangulated', torqueArm:'torque', fiveLink:'parallel'}[reference?.archRear];
  const activeLayout = initial?.layout ?? archLayout;
  const dimensions = initialDimensions(reference);
  const context = reference?.archRear ? `Active vehicle rear: ${architectureLabel('archRear', reference.archRear)}${activeLayout ? '. The starting layout uses example mounts.' : '. Working examples below use linked live axles.'}` : '';

  return `<section class="shell workspace suspension-workspace" data-suspension-lab>
    ${embedded ? `<header class="susp-sub"><h2>Rear: live-axle links, anti-squat, roll steer and pinion angle</h2>
      <p class="quiet">Drag a link end in the side view, or pick a link and type its mounts. Raise or roll the axle and watch the constraints solve. <b data-prov="example">Generic example</b> mounts unless you change them.</p></header>` :
    `<header class="page-title"><p class="eyebrow">Engineering experiments</p><h1>Rear suspension</h1>
      <p class="lede">Move a mount. Raise or roll the axle. Watch the links and the constraint change together.</p></header>`}
    <div class="susp-controller panel content-panel">
      <label><span>Link layout</span><select data-link-layout>${Object.entries(layouts).map(([id, l]) => `<option value="${id}" ${activeLayout === id ? 'selected' : ''}>${l.name}</option>`).join('')}</select></label>
      <div class="tool-controls">
        ${stages.map(({id, name, min, max, step}) => dial(id, name, min, max, step, 0)).join('')}
      </div>
      <div class="actions"><button class="button secondary small" data-link-quick="roll">Try 8° roll</button>
      <button class="button secondary small" data-link-quick="reset">Reset pose</button></div>
      <p data-link-status class="link-status" role="status"></p>
      <dl class="link-readout" data-link-readout></dl>
      <div class="link-canvas-grid"><figure><figcaption>Side view · front to the right</figcaption>
        <div class="dm-stage"><canvas width="580" height="225" data-link-canvas="side" role="img" aria-label="Side projection of axle and link positions"></canvas><div class="dm-layer" data-rear-layer></div></div></figure>
        <figure><figcaption>Top view · front to the right</figcaption>
        <canvas width="580" height="225" data-link-canvas="top" role="img" aria-label="Plan projection of axle and link positions"></canvas></figure></div>
    </div>
    <div class="tool-grid">
      <section class="panel content-panel">
        <h2>Move a mounting point</h2>
        <div class="pair-grid"><label><span>Link</span><select data-picked-link></select></label>
          <label><span>End</span><select data-link-end><option value="chassis">Chassis</option><option value="axle">Axle</option></select></label></div>
        <div class="link-mount-inputs" data-mount-inputs></div>
        <p class="quiet small">Link lengths are set from the edited ride-height coordinates. The blue arm guide constrains height only.</p>
        <button class="button secondary small" data-link-quick="mounts">Restore example mounts</button>
      </section>
      <section class="panel content-panel">
        <h2>Vehicle assumptions</h2>
        <div class="tool-controls">${dial('wheelbase','Wheelbase (in)',75,160,.1,dimensions.wheelbase)}${dial('cg','CG height (in)',8,34,.1,dimensions.cg)}</div>
        <p class="quiet small" data-link-assumptions>${escape(context)} ${dimensions.active ? 'Starting wheelbase and CG use the active setup.' : 'Starting dimensions are illustrative.'}</p>
        ${activeName ? `<button class="button secondary small" data-link-quick="garage">Use dimensions from ${escape(activeName)}</button>` : ''}
        <details class="explain"><summary>Instant center and anti-squat</summary><p>In level, symmetric travel the side-view link lines meet at a virtual pivot. The anti-squat estimate compares the slope from the rear tire contact patch to that pivot against CG height divided by wheelbase. It applies to the idealized rear-drive longitudinal force. For a torque arm, the height-only guide makes a vertical constraint line through the current nose. Roll, nonphysical fits and unresolved intersections suppress the readout.</p></details>
        <details class="explain"><summary>Roll center, roll steer and pinion change</summary><p>Roll center is the height on the axle about which the body rolls relative to the axle; with a Panhard bar it sits near the bar height, with a triangulated four-link near the upper links' meeting point. Roll steer is how many degrees the axle steers for each degree of body roll: positive means the rear steers out of the turn (roll oversteer, looser), negative steers into it (roll understeer, more stable). Lower links that climb toward their front mounts give roll oversteer. Pinion change is how the axle nose rotates per inch of travel, which drives U-joint angle changes; it is one over the instant-center distance. All three are small-motion values at the current pose and are blanked when the links cannot reach it.</p></details>
        <details class="explain"><summary>Leaf spring reference and model limits</summary><p>A conventional leaf spring locates and supports the axle through the eyes, spring and shackle. The axle path and windup depend on spring deformation and shackle geometry. This fixed-length solver covers rod-link layouts and a simplified torque-arm guide. Real bushings, joints, springs, dampers, stops, clearances, strength and safety require separate checks. Green reports agreement with these modeled constraints only.</p></details>
      </section>
    </div>
  </section>`;
}

function initialDimensions(reference) {
  const active = reference?.wheelbase >= 75 && reference.wheelbase <= 160 && reference.cg >= 8 && reference.cg <= 34;
  return active ? {wheelbase: reference.wheelbase, cg: reference.cg, active} : {wheelbase: 108, cg: 20, active: false};
}

function draw(canvas, view, links, result, selected) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  // Draw in CSS pixels at device resolution so labels stay readable on phones (Claude, 25 Nov).
  const height = 225;
  const width = Math.max(240, Math.round(canvas.clientWidth || 580));
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(width * dpr)) { canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const xMax = Math.max(48, ...links.map(l => l.chassis[0]), view === 'side' && result.center ?
    Math.min(110, result.center[0] + 4) : 0);
  const xMin = Math.min(-10, ...links.map(l => l.axle[0])) - 2;
  const x = n => 21 + (n - xMin) / (xMax - xMin) * (width - 42);
  const y = view === 'side' ? z => height - 26 - z * 5.5 : q => height / 2 + q * 3.12;
  const point = p => [x(p[0]), y(p[view === 'side' ? 2 : 1])];
  canvas._map = {x, y, xi: px => xMin + (px - 21) / (width - 42) * (xMax - xMin), yi: view === 'side' ? py => (height - 26 - py) / 5.5 : py => (py - height / 2) / 3.12};
  const line = (a, b, color, size = 1) => {
    ctx.strokeStyle = color; ctx.lineWidth = size;
    ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
  };
  ctx.fillStyle = '#141b21'; ctx.fillRect(0, 0, width, height);
  for (let i = Math.ceil(xMin / 10) * 10; i <= xMax; i += 10) line([x(i), 10], [x(i),height - 12], '#2b363d');
  line([15,y(0)], [width - 15,y(0)], '#68777c');
  const axle = result.pose ?? [0,0,0,0];
  if (view === 'side') {
    const rear = point([axle[0], axle[1], (result.radius ?? 13) + (result.heave ?? 0)]);
    ctx.beginPath(); ctx.arc(...rear, 32, 0, 2 * Math.PI); ctx.strokeStyle = '#697578'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(...rear, 5, 0, 2 * Math.PI); ctx.fillStyle = '#d2d6cf'; ctx.fill();
  } else {
    const deltaX = 26 * Math.sin(axle[3]);
    line(point([axle[0] + deltaX, axle[1] - 26, 0]), point([axle[0] - deltaX, axle[1] + 26, 0]), '#b5bbb8', 4);
  }
  const center = result.center;
  if (view === 'side' && center && center[0] <= xMax && center[0] >= xMin && center[1] >= 0 && center[1] <= 32) {
    const ic = [x(center[0]), y(center[1])];
    ctx.setLineDash([8, 5]);
    line([x(result.lowerLine[0][0]), y(result.lowerLine[0][1])], ic, colors.lower);
    if (!links.some(l => l.group === 'slider')) line([x(result.upperLine[0][0]), y(result.upperLine[0][1])], ic, colors.upper);
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffdda8'; ctx.fillText('IC', ic[0] - 10, ic[1] - 11);
    ctx.beginPath(); ctx.arc(...ic, 4, 0, 2 * Math.PI); ctx.fill();
  }
  for (const [index, link] of (result.current ?? links).entries()) {
    const rear = point(link.current ?? link.axle);
    const front = point(link.chassis);
    const color = colors[link.group];
    ctx.setLineDash(index === selected ? [] : [6, 3]);
    if (link.group === 'slider' && view === 'side') {
      line([rear[0], rear[1] - 20], [rear[0], rear[1] + 20], color, 3);
    } else line(rear, front, color, index === selected ? 4 : 2.4);
    ctx.setLineDash([]);
    for (const p of [rear, front]) {
      ctx.beginPath(); ctx.arc(...p, index === selected ? 5.5 : 3.8, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
    }
  }
  ctx.font = '12px monospace';
  ctx.fillStyle = '#a9b3b4';
  ctx.fillText(view === 'side' ? 'ROAD DATUM' : 'CENTERLINE', 15, height - 8);
}

/** Validate a shared/stored rear-lab state {layout, links:[{axle,chassis}], heave, roll}. Null when invalid. */
export function cleanRear(raw) {
  if (!raw || typeof raw !== 'object' || !Object.hasOwn(layouts, raw.layout)) return null;
  const base = linkLayout(raw.layout);
  const ok = (n, lo, hi) => Number.isFinite(n) && n >= lo && n <= hi;
  const heave = raw.heave ?? 0, roll = raw.roll ?? 0;
  if (!ok(heave, stages[0].min, stages[0].max) || !ok(roll, stages[1].min, stages[1].max)) return null;
  if (raw.links !== undefined) {
    if (!Array.isArray(raw.links) || raw.links.length !== base.length) return null;
    for (const [i, l] of raw.links.entries()) {
      for (const end of ['axle', 'chassis']) {
        const p = l?.[end];
        if (!Array.isArray(p) || p.length !== 3 || !p.every((n, k) => ok(n, dimensions[k].min, dimensions[k].max))) return null;
        base[i][end] = [...p];
      }
    }
  }
  return {layout: raw.layout, links: base.map(l => ({axle: l.axle, chassis: l.chassis})), heave, roll};
}

export function mountSuspension(root, reference, {initial = null, onChange = null} = {}) {
  const panel = root.querySelector('[data-suspension-lab]');
  if (!panel) return;
  const layout = panel.querySelector('[data-link-layout]');
  const pick = panel.querySelector('[data-picked-link]');
  const end = panel.querySelector('[data-link-end]');
  const axes = panel.querySelector('[data-mount-inputs]');
  const status = panel.querySelector('[data-link-status]');
  const readout = panel.querySelector('[data-link-readout]');
  const start = cleanRear(initial);
  let links = linkLayout(start?.layout ?? layout.value);
  if (start) { layout.value = start.layout; start.links.forEach((l, i) => { links[i].axle = [...l.axle]; links[i].chassis = [...l.chassis]; }); }
  let state = {heave: start?.heave ?? 0, roll: start?.roll ?? 0, ...initialDimensions(reference)};
  let lastResult = null;
  const sideCanvas = panel.querySelector('[data-link-canvas="side"]');
  const rearLayer = panel.querySelector('[data-rear-layer]');
  const fmtSide = p => `${format('length', p[0], {digits: 1, metricDigits: 0})} forward of the axle, ${format('length', p[1], {digits: 1, metricDigits: 0})} high`;
  const dm = rearLayer && attachHandles(rearLayer, {
    handles() {
      const map = sideCanvas?._map, i = Number(pick.value), link = links[i];
      if (!map || !link) return [];
      const cur = lastResult?.current?.[i]?.current ?? link.axle;
      const out = [{id: 'chassis', point: [link.chassis[0], link.chassis[2]], label: `${link.name} chassis end`, axes: link.group === 'slider' ? 'y' : 'xy', step: [.25, .25], describe: fmtSide}];
      if (link.group !== 'slider') out.push({id: 'axle', point: [cur[0], cur[2]], label: `${link.name} axle end`, axes: 'xy', step: [.25, .25], describe: fmtSide});
      return out;
    },
    toScreen: ([n, z]) => { const m = sideCanvas._map; return [m.x(n), m.y(z)]; },
    toModel: ([px, py]) => { const m = sideCanvas._map; return [m.xi(px), m.yi(py)]; },
    clamp: (id, [n, z]) => [Math.min(dimensions[0].max, Math.max(dimensions[0].min, n)), Math.min(dimensions[2].max, Math.max(dimensions[2].min, z))],
    onMove(id, [n, z]) {
      const link = links[Number(pick.value)];
      if (id === 'chassis') { link.chassis[0] = +n.toFixed(2); link.chassis[2] = +z.toFixed(2); if (link.group === 'slider') link.axle[2] = link.chassis[2]; }
      else {
        const cur = lastResult?.current?.[Number(pick.value)]?.current ?? link.axle;
        link.axle[0] = +Math.min(dimensions[0].max, Math.max(dimensions[0].min, link.axle[0] + n - cur[0])).toFixed(2);
        link.axle[2] = +Math.min(dimensions[2].max, Math.max(dimensions[2].min, link.axle[2] + z - cur[2])).toFixed(2);
      }
      pickFields();
      update();
    },
    onReset(id) {
      const i = Number(pick.value), fresh = linkLayout(layout.value)[i];
      links[i][id] = [...fresh[id]];
      pickFields(); update();
    },
  });
  function pickFields(refreshOptions = false) {
    if (refreshOptions) pick.innerHTML = links.map((l, i) => `<option value="${i}">${l.name}</option>`).join('');
    const current = links[Number(pick.value)];
    axes.innerHTML = dimensions.map(({name, min, max}, i) =>
      current.group === 'slider' && end.value === 'chassis' && i !== 2 ? '' :
        dial('axis-' + i, name, min, max, .25, current[end.value][i])).join('');
  }
  function update() {
    const result = solveRearLinks(links, state);
    lastResult = result;
    const insight = rearLinkInsights(links, state);
    status.dataset.level = result.level;
    status.textContent = result.message + (Number.isFinite(result.residual) ? ' Max mismatch ' + fmt(result.residual, 3) + ' in.' : '');
    const metrics = [
      ['Instant center', result.center ? fmt(result.center[0], 1) + ' in forward · ' + fmt(result.center[1], 1) + ' in high' : '—'],
      ['Anti-squat', Number.isFinite(result.antiSquat) ? fmt(result.antiSquat, 0) + '%' : '—'],
      ['Axle shift', result.pose ? fmt(result.pose[0], 2) + ' fore/aft · ' + fmt(result.pose[1], 2) + ' lateral (in)' : '—'],
      ['Axle steer / pitch', result.pose ? fmt(result.yaw, 2) + '° / ' + fmt(result.pitch, 2) + '°' : '—'],
      ['Roll center', insight.fits ? fmt(insight.rollCentre, 1) + ' in high' : '—'],
      ['Roll steer', insight.fits ? fmt(insight.rollSteer, 3) + '° per 1° roll' : '—'],
      ['Pinion change', insight.fits ? fmt(insight.pinionRate, 2) + '° per in of travel' : '—'],
    ];
    readout.innerHTML = metrics.map(([label,value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('') +
      (insight.fits ? `<div class="link-readout-wide"><dt>What the roll steer means</dt><dd>${rollSteerMeaning(insight.rollSteer)}</dd></div>` : '');
    for (const canvas of panel.querySelectorAll('canvas')) draw(canvas, canvas.dataset.linkCanvas, links, result, Number(pick.value));
    dm?.refresh();
    // Roll centre at ride height (not the posed value) feeds the load-transfer model.
    const rc = state.heave || state.roll ? rearLinkInsights(links, {heave: 0, roll: 0}) : insight;
    onChange?.({rollCentre: rc.fits ? rc.rollCentre : null,
      state: {layout: layout.value, links: links.map(l => ({axle: [...l.axle], chassis: [...l.chassis]})), heave: state.heave, roll: state.roll}});
  }
  if (typeof ResizeObserver !== 'undefined' && sideCanvas) new ResizeObserver(() => { if (lastResult) { draw(sideCanvas, 'side', links, lastResult, Number(pick.value)); dm?.refresh(); } }).observe(sideCanvas);
  panel.addEventListener('input', event => {
    const key = event.target.dataset.linkInput;
    if (!key) return;
    const n = Number(event.target.value);
    if (key.startsWith('axis-')) links[Number(pick.value)][end.value][Number(key.slice(-1))] = n;
    else state[key] = n;
    panel.querySelector(`[data-link-value="${key}"]`).value = n;
    update();
  });
  panel.addEventListener('change', event => {
    if (event.target === layout) {
      links = linkLayout(layout.value);
      pickFields(true);
    } else if (event.target === pick || event.target === end) pickFields();
    else return;
    update();
  });
  panel.addEventListener('click', ({target}) => {
    const key = target.closest('[data-link-quick]')?.dataset.linkQuick;
    if (!key) return;
    if (key === 'garage') {
      if (initialDimensions(reference).active) {
        state = {...state, wheelbase: reference.wheelbase, cg: reference.cg};
        panel.querySelector('[data-link-assumptions]').textContent = 'Wheelbase and CG height use the active build. Missing source provenance is shown in My Garage.';
      } else panel.querySelector('[data-link-assumptions]').textContent = 'Add wheelbase and CG height to the active build before applying it.';
    }
    if (key === 'roll') state.roll = 8;
    if (key === 'reset') Object.assign(state, {heave: 0, roll: 0});
    if (key === 'mounts') { links = linkLayout(layout.value); pickFields(); }
    for (const [field, n] of Object.entries(state)) {
      const input = panel.querySelector(`[data-link-input="${field}"]`), out = panel.querySelector(`[data-link-value="${field}"]`);
      if (input) input.value = n; // 'active' is bookkeeping with no control (previously threw here, so these buttons did nothing)
      if (out) out.value = n;
    }
    update();
  });
  pickFields(true);
  for (const field of ['heave', 'roll']) {
    const input = panel.querySelector(`[data-link-input="${field}"]`), out = panel.querySelector(`[data-link-value="${field}"]`);
    if (input) input.value = state[field];
    if (out) out.value = state[field];
  }
  update();
}
