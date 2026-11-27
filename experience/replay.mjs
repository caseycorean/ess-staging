import { atTime, MPH } from './models.mjs';
import { ovalPoint, ovalLength } from './oval.mjs';

export const laneColors = {a: '#ffab58', b: '#9fcebd', c: '#91baff', d: '#ebaac7'};

export function replayFrame(entries, time) {
  const samples = entries.map(({key, run}) => {
    const sample = atTime(run, time);
    const finish = run.lap ?? run.finish?.t;
    return {key, ...sample, mph: sample.speed / MPH, finished: finish != null && time >= finish};
  });
  const ahead = Math.max(0, ...samples.map(sample => sample.x));
  return samples.map(s => ({...s, gap: ahead - s.x}));
}

/** Top-view car symbol (shared with the graphical simulations, experience/replay/stage.mjs). */
export function drawCar(ctx, x, y, angle, color, mph, scale = 1) { car(ctx, x, y, angle, color, mph, scale); }

function car(ctx, x, y, angle, color, mph, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  if (mph > 8) {
    ctx.strokeStyle = color + '56';
    ctx.lineWidth = 1.6;
    for (const dy of [-4, 4]) {
      ctx.beginPath();
      ctx.moveTo(-27 - Math.min(mph * .26, 28), dy);
      ctx.lineTo(-19, dy);
      ctx.stroke();
    }
  }
  ctx.fillStyle = '#080b0e';
  for (const dx of [-14, 8]) for (const dy of [-11, 6]) ctx.fillRect(dx, dy, 7, 5);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-18, -8); ctx.lineTo(11, -8); ctx.lineTo(19, -5);
  ctx.lineTo(19, 5); ctx.lineTo(11, 8); ctx.lineTo(-18, 8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#192228';
  ctx.fillRect(-7, -5, 12, 10);
  ctx.fillStyle = '#fff0c7';
  ctx.fillRect(15, -5, 4, 2); ctx.fillRect(15, 3, 4, 2);
  ctx.fillStyle = '#a43532';
  ctx.fillRect(-18, -6, 3, 3); ctx.fillRect(-18, 3, 3, 3);
  ctx.restore();
}

function strip(ctx, width, height, entries, samples, time) {
  const left = 54, right = width - 41;
  const laneHeight = Math.min(58, (height - 46) / entries.length);
  const top = (height - laneHeight * entries.length) / 2;
  const finishX = x => left + x / 1320 * (right - left);
  ctx.fillStyle = '#262e34';
  ctx.fillRect(left - 17, top, right - left + 37, laneHeight * entries.length);
  entries.forEach((entry, index) => {
    const y = top + index * laneHeight;
    ctx.fillStyle = index % 2 ? '#303940' : '#282f36';
    ctx.fillRect(left - 17, y + 1, right - left + 37, laneHeight - 2);
    ctx.fillStyle = laneColors[entry.key];
    ctx.font = '700 17px monospace';
    ctx.fillText(entry.key.toUpperCase(), 13, y + laneHeight / 2 + 6);
  });
  for (const x of [0, 330, 660, 990, 1320]) {
    const screen = finishX(x);
    ctx.strokeStyle = x % 1320 === 0 ? '#d6dada' : '#79848a';
    ctx.setLineDash(x % 1320 === 0 ? [] : [5, 5]);
    ctx.beginPath(); ctx.moveTo(screen, top); ctx.lineTo(screen, height - top); ctx.stroke();
    ctx.fillStyle = '#adbac1';
    ctx.font = '13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(x.toLocaleString() + (x % 1320 === 0 ? ' ft' : ''), screen, height - 8);
    ctx.textAlign = 'start';
  }
  ctx.setLineDash([]);
  const running = time > 0;
  ctx.fillStyle = running ? '#9fcebd' : '#ffab58';
  ctx.fillRect(left - 4, top - 9, 8, 5);
  for (const sample of samples) {
    const index = entries.findIndex(entry => entry.key === sample.key);
    car(ctx, finishX(sample.x), top + (index + .5) * laneHeight, 0, laneColors[sample.key], sample.mph);
  }
}

function oval(ctx, width, height, entries, samples) {
  const project = position => [width * .248 + position.x * (width * .001), 20 + position.y * ((height - 40) / 400)];
  ctx.beginPath();
  ctx.moveTo(...project(ovalPoint(0)));
  for (let i = 1; i <= 160; i++) ctx.lineTo(...project(ovalPoint(i * ovalLength / 160)));
  ctx.closePath();
  for (const [style, line] of [['#7e8990', 30], ['#313b43', 27]]) {
    ctx.strokeStyle = style; ctx.lineWidth = line; ctx.stroke();
  }
  ctx.setLineDash([6, 7]); ctx.lineWidth = 1; ctx.strokeStyle = '#829096'; ctx.stroke(); ctx.setLineDash([]);
  const [sx, sy] = project(ovalPoint(0));
  ctx.fillStyle = '#eef5f4'; ctx.fillRect(sx, sy - 14, 2, 28);
  ctx.fillStyle = '#a4b3be'; ctx.font = '13px monospace'; ctx.textAlign = 'center';
  ctx.fillText('200 FT RADIUS', width / 2, height / 2); ctx.textAlign = 'start';
  for (const s of samples) {
    const [x, y] = project(ovalPoint(s.x));
    const [nx, ny] = project(ovalPoint(s.x + 2));
    const angle = Math.atan2(ny - y, nx - x);
    const offset = (entries.findIndex(entry => entry.key === s.key) - (entries.length - 1) / 2) * 6;
    car(ctx, x - Math.sin(angle) * offset, y + Math.cos(angle) * offset, angle, laneColors[s.key], s.mph, .57);
  }
}

export function paintReplay(canvas, event, entries, samples, time) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#12191f';
  ctx.fillRect(0, 0, width, height);
  if (event === 'oval') oval(ctx, width, height, entries, samples);
  else strip(ctx, width, height, entries, samples, time);
}
