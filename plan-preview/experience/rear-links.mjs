import { rearGeometry } from '../engine/suspension.mjs';

/* Rear-axle-local frame: x forward, y driver's right, z up from road. Inches. */
const rad = degrees => degrees * Math.PI / 180;
const degrees = angle => angle * 180 / Math.PI;
const norm = values => Math.hypot(...values);

const lower = [
  {name: 'Left lower', group: 'lower', axle: [0, -22, 11], chassis: [32, -22, 15]},
  {name: 'Right lower', group: 'lower', axle: [0, 22, 11], chassis: [32, 22, 15]},
];
const panhard = {name: 'Panhard bar', group: 'lateral', axle: [1, -22, 15], chassis: [1, 22, 15]};
const uppers = triangulated => [-1, 1].map(side => ({
  name: side < 0 ? 'Left upper' : 'Right upper', group: 'upper',
  axle: [-1, side * (triangulated ? 8 : 17), 19],
  chassis: [23, side * (triangulated ? 23 : 17), 19.5],
}));

export const layouts = {
  three: {name: 'Three-link + Panhard', links: [...lower, {name: 'Upper link', group: 'upper', axle: [-1, 0, 20], chassis: [23, 0, 20.5]}, panhard]},
  parallel: {name: 'Parallel four-link + Panhard', links: [...lower, ...uppers(false), panhard]},
  triangulated: {name: 'Triangulated four-link', links: [...lower, ...uppers(true)]},
  torque: {name: 'Torque arm + Panhard', links: [...lower, panhard, {name: 'Arm nose guide', group: 'slider', axle: [40, 0, 14], chassis: [40, 0, 14]}]},
};

export const stages = [
  {id: 'heave', name: 'Axle travel (in)', min: -3, max: 3, step: .1},
  {id: 'roll', name: 'Axle roll (°)', min: -9, max: 9, step: .25},
];

export function linkLayout(id) {
  return layouts[id].links.map(link => ({...link, axle: [...link.axle], chassis: [...link.chassis]}));
}

function axlePoint(point, radius, pose, heave, roll) {
  const [dx, dy, pitch, yaw] = pose;
  const [x, y, z] = [point[0], point[1], point[2] - radius];
  const py = y * Math.cos(roll) - z * Math.sin(roll);
  const pz = y * Math.sin(roll) + z * Math.cos(roll);
  const xx = x * Math.cos(pitch) + pz * Math.sin(pitch);
  const zz = -x * Math.sin(pitch) + pz * Math.cos(pitch);
  return [dx + xx * Math.cos(yaw) - py * Math.sin(yaw),
    dy + xx * Math.sin(yaw) + py * Math.cos(yaw), radius + heave + zz];
}

function solveLinear(matrix, vector) {
  const a = matrix.map((row, index) => [...row, vector[index]]);
  for (let i = 0; i < vector.length; i++) {
    let p = i;
    for (let j = i + 1; j < a.length; j++) if (Math.abs(a[j][i]) > Math.abs(a[p][i])) p = j;
    if (Math.abs(a[p][i]) < 1e-12) return null;
    [a[i], a[p]] = [a[p], a[i]];
    const scale = a[i][i];
    a[i] = a[i].map(value => value / scale);
    for (let j = 0; j < a.length; j++) if (j !== i) {
      const q = a[j][i];
      a[j] = a[j].map((value, col) => value - q * a[i][col]);
    }
  }
  return a.map(row => row.at(-1));
}

function leastSquares(fn) {
  let pose = [0, 0, 0, 0];
  let error = fn(pose);
  let damping = 1e-4;
  const step = [1e-4, 1e-4, 1e-5, 1e-5];
  for (let iteration = 0; iteration < 70 && norm(error) > 1e-8; iteration++) {
    const columns = step.map((h, j) => fn(pose.map((p, i) => p + (i === j ? h : 0))).map((e, i) => (e - error[i]) / h));
    const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
    const matrix = columns.map((a, i) => columns.map((b, j) => dot(a, b) + (i === j ? damping : 0)));
    const correction = solveLinear(matrix, columns.map(col => -dot(col, error)));
    if (!correction) break;
    if (norm(correction) < 1e-8) break;
    const next = pose.map((p, i) => p + correction[i]);
    if (Math.abs(next[0]) > 12 || Math.abs(next[1]) > 12 || Math.abs(next[2]) > .6 || Math.abs(next[3]) > .6) {
      damping *= 10;
      continue;
    }
    const residual = fn(next);
    if (norm(residual) < norm(error)) {
      pose = next;
      error = residual;
      damping = Math.max(1e-8, damping * .35);
    } else damping *= 8;
  }
  return {pose, error};
}

function lineOf(links) {
  const average = points => [0, 2].map(axis => points.reduce((sum, p) => sum + p[axis], 0) / points.length);
  return [average(links.map(l => l.current)), average(links.map(l => l.chassis))];
}

export function solveRearLinks(links, {heave = 0, roll = 0, radius = 13, wheelbase = null, cg = null} = {}) {
  const valid = links.every(link => link.group === 'slider' || norm(link.axle.map((v, i) => v - link.chassis[i])) >= 4);
  if (!valid) return {level: 'red', message: 'A modeled rigid link is shorter than 4 in. Move its mounting points apart.'};
  const lengths = links.map(link => norm(link.axle.map((v, i) => v - link.chassis[i])));
  const angle = rad(roll);
  const diff = pose => links.map((link, i) => {
    const p = axlePoint(link.axle, radius, pose, heave, angle);
    if (link.group === 'slider') return p[2] - link.chassis[2];
    return norm(p.map((v, j) => v - link.chassis[j])) - lengths[i];
  });
  const {pose, error} = leastSquares(diff);
  const current = links.map(link => ({...link, current: axlePoint(link.axle, radius, pose, heave, angle)}));
  const residual = Math.max(...error.map(Math.abs));
  const lowerLine = lineOf(current.filter(l => l.group === 'lower'));
  const slider = current.find(l => l.group === 'slider');
  const upperLine = slider ? [[slider.current[0], 0], [slider.current[0], 1]] :
    lineOf(current.filter(l => l.group === 'upper'));
  const offset = ([x, z]) => [x - pose[0], z - heave];
  const projection = !roll && residual <= .08 ? rearGeometry(slider ? 'torqueArm' : 'fourLink', {
    upper: upperLine.map(offset), lower: lowerLine.map(offset), armFrontX: slider && slider.current[0] - pose[0],
  }, {wheelbase, cg}) : null;
  const point = projection?.ic;
  const center = point?.every(Number.isFinite) ? [point[0] + pose[0], point[1] + heave] : null;
  const antiSquat = (wheelbase > 0 && cg > 0 && Number.isFinite(projection?.antiSquat) && (!point || point[0] > .1))
    ? projection.antiSquat : null;
  const level = residual > .08 ? 'red' : residual > .02 ? 'yellow' : 'green';
  const message = level === 'red' ? 'Ideal links cannot reach this pose at fixed length.' :
    level === 'yellow' ? 'Approaching geometric constraint. A perfect fit was not found.' :
    'Pose fits the modeled rigid-link lengths.';
  return {current, residual, error, pose, center, lowerLine, upperLine, antiSquat, level, message,
    pitch: degrees(pose[2]), yaw: degrees(pose[3]), heave, roll, radius};
}
