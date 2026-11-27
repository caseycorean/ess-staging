import { slaAt, strutAt } from '../engine/suspension.mjs';
import { fmt, delta } from './ui.mjs';

const layouts = {
  sla: {solver: slaAt, hardpoints: {upperInner: [14, 16], upperOuter: [25, 17], lowerInner: [10, 7],
    lowerOuter: [27, 6], wheelCenter: [30, 12.5], tireRadius: 12.5, staticCamber: -.5}},
  strut: {solver: strutAt, hardpoints: {top: [22, 30], lowerInner: [8, 6], lowerOuter: [26, 5],
    wheelCenter: [29, 12], tireRadius: 12, staticCamber: -.5}},
};

export function frontGeometry(architecture) {
  return `<section class="shell panel content-panel geometry-demo" data-front-geometry>
    <h2>Camber through travel</h2>
    <p class="quiet">Compare two illustrative front suspensions as the wheel moves up and down.${architecture === 'sla' || architecture === 'strut' ? ' Starting layout follows the active vehicle; mounting points are examples.' : ''}</p>
    <div class="geometry-grid">
      <canvas width="338" height="225" role="img" aria-label="Calculated front-view suspension geometry"></canvas>
      <div>
        <label><span>Example layout</span><select data-front-layout>
          <option value="sla">Short / long arm</option><option value="strut" ${architecture === 'strut' ? 'selected' : ''}>MacPherson strut</option>
        </select></label>
        <label class="slider"><span>Wheel travel <output data-travel>0.00 in</output></span>
          <input type="range" min="-3" max="3" step=".1" value="0" data-front-travel></label>
        <dl class="geometry-readout">
          <div><dt>Camber</dt><dd data-front-camber>—</dd></div>
          <div><dt>Change</dt><dd data-front-change>—</dd></div>
          <div><dt>Roll center</dt><dd data-front-roll>—</dd></div>
        </dl>
        <p class="small quiet" role="status" data-front-comment></p>
      </div>
    </div>
    <details class="explain"><summary>What the geometry covers</summary><p>These example mounting points solve both sides in equal bump. The roll center is the height on the vehicle centerline from the tire contact and front-view instant center. The model leaves out steering, caster, compliance and clearances.</p></details>
  </section>`;
}

function paint(canvas, result, original) {
  const ctx = canvas.getContext('2d');
  const px = ([y, z]) => [34 + y * 7.1, 204 - z * 5.4];
  const line = (a, b, color, width = 1) => {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
    ctx.moveTo(...px(a)); ctx.lineTo(...px(b)); ctx.stroke();
  };
  ctx.fillStyle = '#f2eee4'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i=0; i <= 40; i+=5) line([i,-2], [i,34], '#ddd7ca');
  for (let i=0; i <= 35; i+=5) line([0,i], [40,i], '#ddd7ca');
  line([0,-2], [0,34], '#7f8880');
  const draw = (r, color, width) => {
    const p = r.points;
    line(p.lowerInner, p.lowerOuter, color, width);
    if (p.top) line(p.top, p.lowerOuter, color, width);
    else {
      line(p.upperInner, p.upperOuter, color, width);
      line(p.upperOuter, p.lowerOuter, color, width);
    }
    const [y,z] = p.wheelCenter;
    const d = -Math.sin(r.camber * Math.PI / 180) * 11;
    line([y + d, z - 11], [y - d, z + 11], color, width + 3);
  };
  ctx.setLineDash([5, 4]); draw(original, '#7f8880', 1.5); ctx.setLineDash([]);
  if (!result) return;
  line([0, result.travel], [40, result.travel], '#7f8880');
  if (Number.isFinite(result.rollCentreHeight)) {
    const rc = [0, result.travel + result.rollCentreHeight];
    line(rc, result.points.contact, '#326454', 1.5);
    ctx.fillStyle = '#326454'; ctx.beginPath(); ctx.arc(...px(rc), 4, 0, 2 * Math.PI); ctx.fill();
  }
  draw(result, '#7b4529', 3);
}

export function mountFrontGeometry(root) {
  for (const panel of root.querySelectorAll('[data-front-geometry]')) {
    const q = sel => panel.querySelector(sel);
    const mode = q('[data-front-layout]');
    const input = q('[data-front-travel]');
    const update = () => {
      const {solver, hardpoints} = layouts[mode.value];
      const travel = Number(input.value);
      const result = solver(hardpoints, travel);
      paint(q('canvas'), result, solver(hardpoints, 0));
      q('[data-travel]').value = delta(travel, 2) + ' in';
      q('[data-front-camber]').textContent = result ? fmt(result.camber, 2) + '°' : '—';
      q('[data-front-change]').textContent = result ? delta(result.camberChange, 2) + '°' : '—';
      q('[data-front-roll]').textContent = Number.isFinite(result?.rollCentreHeight) ? fmt(result.rollCentreHeight, 1) + ' in' : '—';
      q('[data-front-comment]').textContent = !result ? 'This linkage cannot reach the selected position.' :
        result.camberChange < -.01 ? 'The top of the wheel tilts farther inward.' :
        result.camberChange > .01 ? 'The top of the wheel tilts farther outward.' : 'The wheel is at its original camber.';
    };
    input.addEventListener('input', update);
    mode.addEventListener('change', update);
    update();
  }
}
