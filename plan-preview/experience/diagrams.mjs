import { camberIllustration } from './models.mjs';
import { fmt, delta } from './ui.mjs';

export function camberDemo() {
  return `<section class="panel content-panel geometry-demo" data-camber-demo>
    <h2>Move the upper pickup</h2>
    <div class="geometry-grid">
      <canvas width="338" height="205" role="img" aria-label="Front-view schematic of a tire upright and control arms"></canvas>
      <div>
        <label class="slider"><span>Upper joint movement <output data-camber-offset>0.00 in</output></span>
          <input type="range" min="-1" max="1" step=".05" value="0" data-camber-input></label>
        <dl class="geometry-readout"><div><dt>Original</dt><dd>0.00°</dd></div>
          <div><dt>Result</dt><dd data-camber-result>0.00°</dd></div><div><dt>Change</dt><dd data-camber-delta>0.00°</dd></div></dl>
        <p class="small quiet" data-camber-meaning>Vertical tire at the starting position.</p>
      </div>
    </div>
    <details class="explain"><summary>What this illustrates</summary><p>A fixed lower joint and a 10 in vertical separation let horizontal upper-joint motion rotate the upright in this front view. The slope is the upper joint's offset divided by the separation. A real suspension also needs inboard pivots, arm lengths and travel geometry for a camber curve.</p></details>
  </section>`;
}

function paintCamber(canvas, offset) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const bottom = [234, 156];
  const upper = [bottom[0] + 11 * offset, 46];
  const pivot = [65, 73];
  const angle = camberIllustration(offset) * Math.PI / 180;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#12191f'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const line = (a, b, color, width = 1) => {
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
  };
  for (let x = 18; x < 338; x += 22) line([x, 0], [x, 205], '#202a30');
  for (let y = 15; y < 205; y += 22) line([0, y], [338, y], '#202a30');
  line([22, 177], [317, 177], '#56636e', 2);
  ctx.setLineDash([5, 4]);
  line([234, 28], bottom, '#9fcebd', 1.4);
  line(pivot, [234, 46], '#9fcebd', 1.4);
  ctx.setLineDash([]);
  line(pivot, upper, '#ffab58', 4);
  line([65, 139], bottom, '#728898', 4);
  line(upper, bottom, '#ffab58', 4);
  ctx.save();
  ctx.translate(...bottom); ctx.rotate(angle);
  ctx.fillStyle = '#26343e'; ctx.strokeStyle = '#ffab58'; ctx.lineWidth = 2;
  ctx.fillRect(14, -124, 37, 141); ctx.strokeRect(14, -124, 37, 141);
  ctx.restore();
  for (const [x, y] of [pivot, [65, 139], upper, bottom]) {
    ctx.fillStyle = '#ffab58'; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#c4ced5'; ctx.font = '13px monospace';
  ctx.fillText('CHASSIS', 24, 194); ctx.fillText('OUTBOARD', 236, 194);
}

export function mountCamber(root) {
  for (const panel of root.querySelectorAll('[data-camber-demo]')) {
    const input = panel.querySelector('[data-camber-input]');
    const update = () => {
      const position = Number(input.value);
      const angle = camberIllustration(position);
      paintCamber(panel.querySelector('canvas'), position);
      panel.querySelector('[data-camber-offset]').value = delta(position, 2) + ' in';
      panel.querySelector('[data-camber-result]').textContent = fmt(angle, 2) + '°';
      panel.querySelector('[data-camber-delta]').textContent = delta(angle, 2) + '°';
      panel.querySelector('[data-camber-meaning]').textContent = position < 0 ? 'The tire top leans inward. That is negative camber.' :
        position > 0 ? 'The tire top leans outward. That is positive camber.' : 'Vertical tire at the starting position.';
    };
    input.addEventListener('input', update);
    update();
  }
}
