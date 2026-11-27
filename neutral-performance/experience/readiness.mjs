import { fields } from './vehicles.mjs';

const balance = ['weight', 'front'];
const geometry = [...balance, 'wheelbase', 'cg'];
const rates = ['frontSpring', 'rearSpring', 'frontMotion', 'rearMotion', 'frontUnsprung', 'rearUnsprung'];
const power = ['hp', 'hpRpm', 'torque', 'torqueRpm', 'redline', 'gears', 'finalDrive', 'diameter', 'drivetrain'];
export const studies = {
  balance: {name: 'Weight and balance', keys: [...balance, 'wheelbase']},
  'load-transfer': {name: 'Tire loads', keys: [...geometry, 'frontTrack', 'rearTrack']},
  'spring-rate': {name: 'Ride frequency', keys: [...balance, ...rates], optional: ['tireRate']},
  quarter: {name: 'Quarter mile', keys: [...geometry, ...power, 'transmission', 'grip', 'cda']},
  oval: {name: 'Test oval', keys: [...geometry, ...power, 'grip', 'cda']},
};

export const missingFor = (v, tool) => studies[tool].keys.filter(key =>
  Array.isArray(v[key]) ? v[key].length < 2 : typeof v[key] === 'string' ? !v[key] : !Number.isFinite(v[key]));

export const missingText = keys => keys.map(key => fields[key]).join(', ');

export function estimatedFor(v, tool) {
  return [...studies[tool].keys, ...(studies[tool].optional ?? [])].filter(key => v.evidence?.[key] === 'estimated');
}
