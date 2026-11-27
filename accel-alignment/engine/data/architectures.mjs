// ESS component library — suspension architecture codes (owner-approved 25 Nov) and per-architecture defaults.
// The free-text type in each vehicle record stays as the human label; the code lets tools pick the right experiment.

export const frontArchitectures = {
  sla: { name: 'Short/long arm (double wishbone, upper/lower A-arms)', geometry: 'slaAt', motionRatio: { low: .5, high: .7 }, unsprung: { low: 80, high: 110 } },
  strut: { name: 'MacPherson strut (incl. modified strut, coil on lower arm)', geometry: 'strutAt', motionRatio: { low: .85, high: 1 }, unsprung: { low: 70, high: 100 } },
  multilink: { name: 'Front multilink', geometry: 'slaAt', motionRatio: { low: .6, high: .9 }, unsprung: { low: 75, high: 105 },
    note: 'Modelled as an equivalent short/long arm in front view.' },
  twinIBeam: { name: 'Ford Twin I-Beam', geometry: null, motionRatio: { low: .8, high: 1 }, unsprung: { low: 130, high: 180 },
    note: 'Long swing axles crossing under the engine; camber changes with travel by beam length. Geometry function pending.' },
  solidAxle: { name: 'Solid front axle', geometry: null, motionRatio: { low: .9, high: 1 }, unsprung: { low: 150, high: 220 } },
};
export const rearArchitectures = {
  leaf: { name: 'Live axle, leaf springs', geometry: 'leaf', motionRatio: { low: .9, high: 1 }, unsprung: { low: 110, high: 170 } },
  truckArm: { name: 'Live axle, GM truck arms (long trailing arms) with coils', geometry: null, motionRatio: { low: .8, high: 1 }, unsprung: { low: 120, high: 175 },
    note: 'Two long arms rigid to the axle; anti-squat from the arm pivot line. Geometry function pending.' },
  threeLink: { name: 'Live axle, three-link + lateral locator', geometry: 'threeLink', motionRatio: { low: .9, high: 1 }, unsprung: { low: 110, high: 160 } },
  fourLinkParallel: { name: 'Live axle, parallel four-link + Panhard/Watts', geometry: 'fourLink', motionRatio: { low: .9, high: 1 }, unsprung: { low: 110, high: 160 } },
  fourLinkTriangulated: { name: 'Live axle, triangulated four-link (angled uppers)', geometry: 'fourLink', motionRatio: { low: .9, high: 1 }, unsprung: { low: 110, high: 160 } },
  fiveLink: { name: 'Live axle, five-link (four links + Panhard)', geometry: 'fourLink', motionRatio: { low: .9, high: 1 }, unsprung: { low: 120, high: 190 } },
  torqueArm: { name: 'Live axle, torque arm + Panhard', geometry: 'torqueArm', motionRatio: { low: .9, high: 1 }, unsprung: { low: 110, high: 160 } },
  irsControlArm: { name: 'Independent, upper/lower control arms (double wishbone)', geometry: 'independent', motionRatio: { low: .55, high: .8 }, unsprung: { low: 75, high: 105 } },
  irsMultilink: { name: 'Independent multilink / integral link', geometry: 'independent', motionRatio: { low: .6, high: .9 }, unsprung: { low: 75, high: 105 } },
  semiTrailing: { name: 'Independent semi-trailing arm', geometry: null, motionRatio: { low: .7, high: .9 }, unsprung: { low: 80, high: 110 } },
  irsStrut: { name: 'Independent rear strut', geometry: 'strutAt', motionRatio: { low: .85, high: 1 }, unsprung: { low: 70, high: 95 } },
};
export const rangeEvidence = { evidence: 'estimated', basis: 'Typical ranges for the architecture; motion ratio = spring travel ÷ wheel travel. Unsprung = per corner incl. wheel, tire, brake, half the links (live axle: half the axle).' };

/** Map a record's free-text type to a code. Returns null when the text is too vague. */
export function codeFromText(text, end) {
  const t = (text ?? '').toLowerCase();
  if (!t) return null;
  if (end === 'front') {
    if (/twin i-beam/.test(t)) return 'twinIBeam';
    if (/strut/.test(t)) return 'strut';
    if (/multi-?link/.test(t)) return 'multilink';
    if (/wishbone|short\/long|control.arm|a-\s?arm|unequal.length/.test(t)) return 'sla';
    return null;
  }
  if (/truck arm/.test(t)) return 'truckArm';
  if (/leaf/.test(t) && /live|axle/.test(t)) return 'leaf';
  if (/three-link/.test(t)) return 'threeLink';
  if (/five-link/.test(t)) return 'fiveLink';
  if (/torque arm/.test(t)) return 'torqueArm';
  if (/semi-tr(ai|ia)ling/.test(t)) return 'semiTrailing';
  if (/rigid axle/.test(t) && /3 trailing links/.test(t) && /panhard/.test(t)) return 'threeLink';
  if (/strut/.test(t)) return 'irsStrut';
  if (/multi-?link|integral.link/.test(t) && /live axle/.test(t)) return 'fiveLink';
  if (/multi-?link|integral.link/.test(t)) return 'irsMultilink';
  // Archive (Supercar X) wording: independent rears described by link counts, e.g. "1 trailing link and 2 lateral links per side".
  if (/^ind/.test(t) && /\d (lateral|diagonal|trailing|trialing|toe-control) links?/.test(t) && !/unequal.length|upper and lower/.test(t)) return 'irsMultilink';
  if (/^ind/.test(t) && /(upper|lower) (a-\s?arms?|l-\s?arms?)|upper and lower control arms|fixed-length half-shaft/.test(t)) return 'irsControlArm';
  if (/wishbone|short\/long|control arms/.test(t) && !/live/.test(t)) return 'irsControlArm';
  if (/trailing arms and watts/.test(t)) return 'fourLinkParallel';
  return null;
}

const E = (front, rear, note) => ({ front, rear, evidence: 'estimated', basis: note ?? 'Well-established factory architecture for this platform; record text missing. Verify against a factory manual.' });
/** Codes for records whose type text is missing or vague (owner approved adding codes, 25 Nov). */
export const assignedArchitectures = {
  'amc-amx-1st-gen--1969-amx-390-m4-coupe': E('sla', 'leaf'),
  'bmw-m3-e46--2004-m3-3.2-m6-18inch-coupe': E('strut', 'irsMultilink'),
  'buick-regal-g-body--1987-grand-national-lc2-a4-coupe': E('sla', 'fourLinkTriangulated'),
  'chevrolet-c10-2nd-gen--1972-c10-307-m3-short-fleetside': E('sla', 'truckArm', '1967–72 half-ton C10: coil SLA front, coil-sprung trailing (truck) arms rear. Verify.'),
  'chevrolet-camaro-1st-gen--1969-z28-302-m4-3.73-sport-coupe': E('sla', 'leaf'),
  'chevrolet-camaro-4th-gen--2002-ss-ls1-m6-coupe': { front: 'sla', rear: 'torqueArm', evidence: 'estimated', basis: 'Record text: Salisbury axle with lower control arms. Fourth-gen F-body uses a torque arm and Panhard rod.' },
  'chevrolet-camaro-5th-gen--2015-z28-ls7-m6-coupe': E('strut', 'irsMultilink'),
  'chevrolet-chevelle-2nd-gen--1970-ss-454-ls6-m22-coupe': E('sla', 'fourLinkTriangulated'),
  'chevrolet-chevy-ii-2nd-gen--1966-nova-ss-l79-m4-sport-coupe': E('sla', 'leaf'),
  'chevrolet-corvette-c5--2002-z06-ls6-m6-hardtop': { front: 'sla', rear: 'irsControlArm', evidence: 'record', basis: 'Short/long arms with transverse composite leaf, both ends.' },
  'chevrolet-silverado-1500-t1--2022-zr2-l87-a10-crew-cab-4wd': E('sla', 'leaf'),
  'dodge-challenger-la--2023-rt-scat-pack-6.4-m6-coupe': E('sla', 'irsMultilink'),
  'dodge-challenger-1st-gen--1970-rt-426-hemi-a3-3.23-hardtop-drums': { front: 'sla', rear: 'leaf', evidence: 'estimated', basis: 'Record: control-arm front, live rear axle. E-body uses torsion-bar SLA and leaf springs.' },
  'dodge-charger-2nd-gen--1970-rt-440-a3-3.23-hardtop': E('sla', 'leaf', 'B-body: torsion-bar SLA front, leaf rear.'),
  'dodge-ram-dr--2004-srt10-8.3-m6-regular-cab': E('sla', 'leaf'),
  'ford-f150-10th-gen--2004-svt-lightning-5.4-a4-regular-cab': E('sla', 'leaf'),
  'ford-mustang-1st-gen--1969-mach-1-428-a3-3.91-sportsroof': E('sla', 'leaf'),
  'ford-mustang-fox--1993-lx-ssp-5.0-m5-notchback': E('strut', 'fourLinkTriangulated', 'Fox: modified MacPherson (coil on lower arm), four-link rear with angled upper arms.'),
  'ford-mustang-sn95--2004-svt-cobra-4.6-m6-coupe': E('strut', 'irsControlArm', '2003–04 Cobra: strut front, independent control-arm rear.'),
  'gmc-syclone-s-series--1991-syclone-4.3-a4-regular-cab-awd': E('sla', 'leaf'),
  'hyundai-elantra-cn7--2024-n-2.0-m6-sedan': E('strut', 'irsMultilink'),
  'mitsubishi-lancer-evolution-x--2014-gsr-2.0-m5-sedan': E('strut', 'irsMultilink'),
  'nissan-gt-r-r35--2017-premium-3.8-a6-coupe': E('sla', 'irsMultilink'),
  'pontiac-gto-1st-gen--1965-tri-power-389-m4-hardtop': E('sla', 'fourLinkTriangulated'),
  'porsche-911-991--2014-gt3-3.8-a7-coupe': E('strut', 'irsMultilink'),
  'volkswagen-golf-mk8--2024-r-2.0-m6-hatch': E('strut', 'irsMultilink'),
  'chevrolet-colorado-3rd-gen--2023-zr2-2.7-a8-crew-cab-4wd': { front: 'sla', rear: 'leaf', evidence: 'estimated', basis: 'Record: live axle; Colorado uses leaf springs.' },
};
import { architectureCodes } from './architecture-codes.mjs';
/** Architecture codes for one record: explicit assignment, then the generated table, then the record's own text. */
export function architectureFor(configId, typeFront, typeRear) {
  const t = architectureCodes[configId];
  if (t?.front && t?.rear && !assignedArchitectures[configId]) return { front: t.front, rear: t.rear, evidence: 'record', basis: `Mapped from the record's suspension text: "${t.text[0]}" / "${t.text[1]}".` };
  const a = assignedArchitectures[configId];
  const f = codeFromText(typeFront, 'front'), r = codeFromText(typeRear, 'rear');
  return {
    front: a?.front ?? f, rear: a?.rear ?? r,
    evidence: a ? a.evidence : (f && r ? 'record' : 'missing'), basis: a?.basis ?? (f && r ? 'Mapped from the record\'s suspension text.' : null),
  };
}
