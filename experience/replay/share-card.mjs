// Graphical simulations: a downloadable share image (1200×630, the common link-preview size).
// It shows the finished replay, the experiment, each car with its figures and the headline, and says plainly that the
// numbers are ESS model estimates. Drawn in the browser from the same scene the visitor watched.
import { paint, prepare, laneColor } from './stage.mjs';

const W = 1200, H = 630;

export function drawShareCard(canvas, scene, summary, { checked, url = 'endicottspeedshop.com' } = {}) {
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const th = { bg: '#1b1f1b', road: '#3a403a', edge: '#7b8378', text: '#f4eee4', muted: '#b7b1a4', brake: '#e0604f', font: 'ui-monospace, SFMono-Regular, Consolas, monospace' };
  const sans = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
  ctx.fillStyle = '#242823'; ctx.fillRect(0, 0, W, H);
  // left: words
  const L = 56; let y = 70;
  ctx.fillStyle = '#f0c36d'; ctx.font = `700 22px ${sans}`; ctx.fillText('ENDICOTT SPEED SHOP · SIMULATION', L, y);
  y += 52; ctx.fillStyle = '#f4eee4'; ctx.font = `600 30px ${sans}`;
  y = wrap(ctx, summary.what, L, y, 520, 36);
  y += 18; ctx.font = `700 40px ${sans}`; ctx.fillStyle = '#ffffff';
  y = wrap(ctx, summary.headline, L, y, 520, 48);
  y += 26;
  summary.lanes.forEach((l, i) => {
    ctx.fillStyle = laneColor(i); ctx.fillRect(L, y - 20, 16, 24);
    ctx.fillStyle = '#f4eee4'; ctx.font = `600 24px ${sans}`;
    const name = fit(ctx, l.name, 500); ctx.fillText(name, L + 28, y);
    y += 32; ctx.fillStyle = '#d9d2c4'; ctx.font = `500 24px ${th.font}`;
    ctx.fillText(l.ok ? l.figures.join('  ·  ') : 'no run', L + 28, y); y += 40;
  });
  ctx.fillStyle = '#b7b1a4'; ctx.font = `20px ${sans}`;
  ctx.fillText(checked ? 'ESS model estimate · model checked against published tests' : 'ESS model estimate · not a measured result', L, H - 64);
  ctx.fillStyle = '#f0c36d'; ctx.font = `600 22px ${sans}`; ctx.fillText(url, L, H - 32);
  // right: the finished replay
  const ready = scene.path || scene.stripFt ? scene : prepare(scene);
  paint(ctx, ready, scene.duration, { x: 620, y: 40, w: 540, h: 550 }, { theme: th, hud: false });
  ctx.strokeStyle = '#4a5047'; ctx.lineWidth = 2; ctx.strokeRect(620, 40, 540, 550);
  return canvas;
}
function fit(ctx, text, max) { let t = text; while (t.length > 4 && ctx.measureText(t).width > max) t = t.slice(0, -2); return t === text ? t : t.slice(0, -1) + '…'; }
function wrap(ctx, text, x, y, max, lh) {
  const words = String(text).split(' '); let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > max && line) { ctx.fillText(line, x, y); y += lh; line = w; } else line = test;
  }
  if (line) { ctx.fillText(line, x, y); y += lh; }
  return y;
}
