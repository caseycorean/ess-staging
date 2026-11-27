import { G, MPH, driveForce, driveResistance, tractiveLimit, powerIssue, massIssue } from './models.mjs';
import { corneringLimit } from '../engine/cornering.mjs';

const radius = 200;
const straight = 520;
const arc = Math.PI * radius;
const straightPieces = 52;
const turnPieces = 64;
const pieces = [
  ...Array(straightPieces).fill({ ds: straight / straightPieces, curvature: 0 }),
  ...Array(turnPieces).fill({ ds: arc / turnPieces, curvature: 1 / radius }),
  ...Array(straightPieces).fill({ ds: straight / straightPieces, curvature: 0 }),
  ...Array(turnPieces).fill({ ds: arc / turnPieces, curvature: 1 / radius }),
];
export const ovalLength = 2 * (straight + arc);

// Geometry is shared by the solver and the replay. Units are feet.
export function ovalPoint(distance) {
  const s = ((distance % ovalLength) + ovalLength) % ovalLength;
  if (s < straight) return { x: s, y: 0 };
  if (s < straight + arc) {
    const angle = (s - straight) / radius;
    return { x: straight + radius * Math.sin(angle), y: radius * (1 - Math.cos(angle)) };
  }
  if (s < straight * 2 + arc) return { x: straight * 2 + arc - s, y: radius * 2 };
  const angle = (s - straight * 2 - arc) / radius;
  return { x: -radius * Math.sin(angle), y: radius * (1 + Math.cos(angle)) };
}

// Friction ellipse: lateral limit from the load-transfer model (v.lateralLimit), longitudinal limit v.grip.
function budget(v, speed, curvature) {
  const lateralG = speed ** 2 * curvature / G;
  const lateral = v.lateralLimit ?? v.grip;
  return v.grip * Math.sqrt(Math.max(0, 1 - (lateralG / lateral) ** 2));
}

function availableDrive(v, speed, curvature) {
  const resistance = driveResistance(v, speed);
  const forces = v.gears.map((_, index) => driveForce(v, speed, index));
  const power = Math.max(...forces);
  const gear = forces.indexOf(power) + 1;
  const cap = tractiveLimit({ ...v, grip: budget(v, speed, curvature) }, resistance);
  return { gear, limited: power > cap, acceleration: (Math.min(cap, power) - resistance) * G / v.weight };
}

/**
 * Flying lap. options.loadSensitivity: tire load sensitivity k for the cornering limit (default
 * engine/cornering.mjs LOAD_SENSITIVITY; 0 reproduces the earlier grip-only point mass).
 */
export function ovalLap(input, { loadSensitivity } = {}) {
  const issue = powerIssue(input, 'oval') || massIssue(input);
  if (issue) return { issue };
  const cornering = corneringLimit(input, loadSensitivity === undefined ? {} : { sensitivity: loadSensitivity });
  const v = { ...input, lateralLimit: cornering.ay };
  const n = pieces.length;
  // v². A constant-radius end is capped at 96% of the theoretical lateral limit
  // so the discrete solver can allow a little combined demand through transitions.
  const cap = .96 ** 2 * v.lateralLimit * G * radius;
  const speedSquared = pieces.map((p, i) => p.curvature || pieces[(i + n - 1) % n].curvature ?
    cap : (180 * MPH) ** 2);
  for (let iteration = 0; iteration < 60; iteration++) {
    let maxChange = 0;
    for (let i = n - 1; i >= 0; i--) {
      const j = (i + 1) % n;
      const p = pieces[i];
      const brake = budget(v, Math.sqrt(Math.max(speedSquared[i], speedSquared[j])), p.curvature) * G;
      const before = speedSquared[i];
      speedSquared[i] = Math.min(before, speedSquared[j] + 2 * brake * p.ds);
      maxChange = Math.max(maxChange, before - speedSquared[i]);
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const p = pieces[i];
      const speed = Math.sqrt(speedSquared[i]);
      const accel = availableDrive(v, speed, p.curvature).acceleration;
      const before = speedSquared[j];
      speedSquared[j] = Math.min(before, Math.max(0, speedSquared[i] + 2 * accel * p.ds));
      maxChange = Math.max(maxChange, before - speedSquared[j]);
    }
    if (maxChange < 1e-5) break;
  }
  const trace = [{ t: 0, x: 0, speed: Math.sqrt(speedSquared[0]), gear: 0, limited: false }];
  for (let i = 0; i < n; i++) {
    const p = pieces[i];
    const prior = trace[i];
    const speed = Math.sqrt(speedSquared[(i + 1) % n]);
    if (speed + prior.speed < 1) return { issue: 'The oval model could not solve a nonzero periodic lap for this setup.' };
    const dt = 2 * p.ds / (prior.speed + speed);
    const { gear, limited } = availableDrive(v, prior.speed, p.curvature);
    Object.assign(prior, { gear: speed < prior.speed ? 0 : gear, limited: speed >= prior.speed && limited });
    trace.push({ t: prior.t + dt, x: prior.x + p.ds, speed, gear, limited });
  }
  trace.at(-1).x = ovalLength;
  const peakSpeed = Math.max(...trace.map(s => s.speed)) / MPH;
  const turnSpeed = Math.min(...trace.filter((_, i) => pieces[i]?.curvature).map(s => s.speed)) / MPH;
  return { trace, lap: trace.at(-1).t, peakSpeed, turnSpeed, cornering };
}
