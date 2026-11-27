// ESS component library — rear axle assemblies (weight) and final-drive handling.
const lib = { title: 'ESS component weight library v5 (Ranger Station axle chart and others)', url: 'ess-knowledge archive/kb-v1.0.2/corpus/…component_weight_library_v5' };
export const axles = {
  'ford-8.8': { name: 'Ford 8.8 in (full-size)', weight: { value: 167, evidence: 'published', basis: 'assembly', sources: [lib] } },
  'ford-9': { name: 'Ford 9 in', weight: { value: 245, low: 238, high: 245, evidence: 'published', basis: 'assembly (two sources)', sources: [lib] } },
  'gm-12-bolt': { name: 'GM 12-bolt', weight: { value: 210, evidence: 'published', basis: 'assembly; low-confidence source', sources: [lib] } },
  'strange-s60': { name: 'Strange S60', weight: { value: 230, evidence: 'published', basis: 'assembly; low-confidence source', sources: [lib] } },
  'dana-44-rear': { name: 'Dana 44 rear', weight: { value: 140, evidence: 'published', basis: 'assembly', sources: [lib] } },
  'dana-60-semi': { name: 'Dana 60 semi-float', weight: { value: 210, evidence: 'published', basis: 'assembly', sources: [lib] } },
};
/** Final drive: any ratio 2.0–6.0 is accepted; the record's factory ratio is the default when known. */
export const finalDriveLimits = [2, 6];
/** Final-drive options documented for specific reference vehicles. */
export const finalDriveChoices = {
  'ford-mustang-fox--1993-lx-ssp-5.0-m5-notchback': { options: [2.73, 3.08], default: 2.73, evidence: 'published',
    basis: '5.0 with World Class T5: 2.73 standard, 3.08 optional', sources: [{ title: 'Modern Driveline, the many faces of the T5', url: 'https://www.moderndriveline.com/?p=37383' }] },
};
