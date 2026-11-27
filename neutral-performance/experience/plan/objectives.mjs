// ESS Plan — development objectives (owner direction, 26 Nov 2026 evening).
// One vehicle development plan holds several objectives. Each objective moves through the same progression:
//   engineering question → learn → experiment → approaches → components → decision → measured verification.
// Content here is ESS editorial judgment (qualitative bands, not ratings) and links to existing ESS pages only.
// Engineering suitability is never ranked by commercial relationship; component examples are references, not picks.

/** The progression every objective follows. `kind` says what completing the step records. */
export const STEPS = [
  { key: 'question', label: 'Question', title: 'Frame the engineering question', kind: 'done' },
  { key: 'learn', label: 'Learn', title: 'Understand the mechanism', kind: 'done' },
  { key: 'experiment', label: 'Experiment', title: 'Try it on your car in the models', kind: 'done' },
  { key: 'approaches', label: 'Approaches', title: 'Compare engineering approaches', kind: 'choice' },
  { key: 'components', label: 'Components', title: 'Evaluate components for that approach', kind: 'done' },
  { key: 'decision', label: 'Decision', title: 'Make the build decision', kind: 'decision' },
  { key: 'verify', label: 'Verify', title: 'Measure the result', kind: 'measure' },
];
export const STEP_KEYS = STEPS.map(s => s.key);

// Effect notation used by approaches on other objectives: '+' helps, '−' works against, '±' depends on execution.
export const EFFECT = { '+': 'helps', '−': 'works against', '±': 'depends' };

/**
 * `change` is a one-change experiment in the replay vocabulary ({tire:'next'|key, weight, power, cg}); 'next' means
 * the next stickier tire class than the car has. `null` means no ESS model covers it yet (stated plainly).
 */
export const OBJECTIVES = {
  handling: {
    name: 'Improve handling', short: 'Handling', metric: 'corner',
    question: 'Where does this car run out of grip in a corner — front or rear — and what sets that limit: tires, load transfer or how the wheels lean (camber) as the body rolls?',
    learn: [
      ['Understanding the traction circle', '../articles/traction-circle/', 'How a tire shares grip between braking, cornering and power.'],
      ['Load Transfer Calculator', '../tools/load-transfer/', 'How much load moves to the outside tires, and how roll stiffness splits it front to rear.'],
      ['Suspension geometry explorer', '../suspension-v2/?from=plan', 'How control-arm lengths and angles set camber gain and roll centre as the car rolls.'],
    ],
    experiment: { change: { tire: 'next' }, label: 'Stickier tires', replay: 'corner',
      also: [['Watch a corner sequence', 'sequence'], ['Brake into a corner', 'entry']] },
    approaches: [
      { key: 'setup', name: 'Tires, alignment and setup', what: 'Tire choice and pressures, alignment (camber, caster, toe), corner-weighting. Usually the first and cheapest step.', cost: 'Low', fab: 'None', reversible: 'Yes', effects: { braking: ['+', 'Better tires shorten stops too.'], comfort: ['±', 'Aggressive camber and stiff sidewalls wear and ride harder.'] } },
      { key: 'rates', name: 'Springs, anti-roll bars and dampers', what: 'Change roll stiffness and its front/rear split to move the balance and reduce body roll.', cost: 'Low–moderate', fab: 'Little', reversible: 'Mostly', effects: { comfort: ['−', 'Stiffer usually rides harder.'], traction: ['±', 'Rear roll stiffness affects inside-wheel load on corner exit.'] } },
      { key: 'geometry', name: 'Correct the geometry', what: 'Arms, ball joints, spindles or uprights that improve camber gain and roll centre — for many older cars the factory geometry loses camber as the body rolls.', cost: 'Moderate–high', fab: 'Little–moderate', reversible: 'Mostly', effects: { weight: ['±', 'Tubular arms can be lighter; some kits add mass.'], braking: ['±', 'Spindle changes can change brake fitment.'] } },
      { key: 'architecture', name: 'Replacement architecture', what: 'A complete aftermarket subframe or a suspension conversion from another car.', cost: 'High', fab: 'Substantial', reversible: 'Rarely', effects: { weight: ['±', 'Depends on the system.'], braking: ['+', 'Often brings larger brakes.'], comfort: ['±', 'Depends on bushings and rates.'] } },
    ],
    components: { category: 'suspension', also: 'tires' },
    checklist: ['The exact year, model and front-suspension type the part is made for', 'What is included (arms, ball joints, bushings, hardware) and what you still need', 'Weight of the new part against the part it replaces, weighed on the same scale', 'Camber gain and roll-centre change claimed, and whether they are measured', 'Wheel, tire and brake clearance with your wheel offset'],
    verify: 'Corner weights and alignment before and after; a timed constant-radius circle or skidpad, or an autocross run on the same day, tires and pressures.',
    verifyTools: [['Part Weight from Corner Scales', '../tools/scale-delta/'], ['How ESS measures and tests', '../build/']],
  },
  braking: {
    name: 'Improve braking', short: 'Braking', metric: 'brake',
    question: 'Are this car’s stops limited by tire grip, brake torque, front/rear bias or heat over repeated stops?',
    learn: [
      ['Understanding the traction circle', '../articles/traction-circle/', 'Why stopping distance is mostly a tire question once the brakes can lock the wheels.'],
      ['Load Transfer Calculator', '../tools/load-transfer/', 'How load moves forward under braking and why that sets the right front/rear bias.'],
    ],
    experiment: { change: { tire: 'next' }, label: 'Stickier tires', replay: 'brake', also: [['Brake into a corner', 'entry']] },
    approaches: [
      { key: 'consumables', name: 'Pads, fluid, lines and tires', what: 'Pad compound for the temperature range, high-boiling fluid, braided lines; tires set the single-stop limit.', cost: 'Low', fab: 'None', reversible: 'Yes', effects: { handling: ['+', 'Tires help cornering too.'] } },
      { key: 'thermal', name: 'Larger rotors and calipers', what: 'More thermal capacity and torque for repeated stops. A bigger kit rarely shortens one stop if the tires already lock.', cost: 'Moderate–high', fab: 'Little', reversible: 'Mostly', effects: { weight: ['±', 'Two-piece rotors can save mass; larger kits can add it.'], handling: ['±', 'May need larger wheels.'] } },
      { key: 'bias', name: 'Bias and ABS', what: 'Proportioning valve or master-cylinder and caliper sizing so both axles reach their grip together.', cost: 'Low–moderate', fab: 'Little', reversible: 'Yes', effects: {} },
      { key: 'mass', name: 'Reduce mass', what: 'Less mass means less energy and heat per stop.', cost: 'Varies', fab: 'Varies', reversible: 'Varies', effects: { weight: ['+', 'Same work as the weight objective.'] } },
    ],
    components: { category: 'brakes' },
    checklist: ['Rotor diameter and thickness, and the wheel size the caliper needs', 'Pad compound temperature range for street, autocross or track use', 'Front/rear bias after the change, and whether a proportioning valve is included', 'Master-cylinder bore and pedal ratio the kit expects', 'Weight of rotor and caliper against what you have'],
    verify: 'Repeated 60–0 stops on the same surface with a GPS logger or measured marks; note pedal feel and fade over several stops.',
    verifyTools: [['How ESS measures and tests', '../build/']],
  },
  power: {
    name: 'Increase horsepower', short: 'Power', metric: 'accelerate',
    question: 'Can this car use more power — or is it limited by traction, gearing or weight first? And what does the extra power cost in mass and cooling?',
    learn: [
      ['Gearing and traction', '../experience/#performance', 'Gear by gear, how much of the drivetrain’s force the tires can use.'],
      ['Engine and drivetrain in Test', '../improve/#drivetrain', 'Engines, transmissions and gearing on the same car.'],
    ],
    experiment: { change: { power: 20 }, label: '20% more power', replay: 'accelerate', also: [['Power out of a corner', 'exit']] },
    approaches: [
      { key: 'breathing', name: 'Tune and breathing', what: 'Intake, exhaust, cam and calibration on the existing engine.', cost: 'Low–moderate', fab: 'Little', reversible: 'Mostly', effects: { comfort: ['±', 'Noise and drivability.'] } },
      { key: 'induction', name: 'Forced induction', what: 'Supercharger or turbocharger on the existing engine; needs fuel, cooling and often driveline upgrades.', cost: 'Moderate–high', fab: 'Moderate', reversible: 'Partly', effects: { weight: ['−', 'Adds mass ahead of the front axle.'], braking: ['−', 'More speed to shed.'], traction: ['−', 'More torque to put down.'] } },
      { key: 'swap', name: 'Engine swap', what: 'A different engine family. Installed mass, cooling, mounts and electronics decide the real cost.', cost: 'High', fab: 'Moderate–substantial', reversible: 'Rarely', effects: { weight: ['±', 'Aluminium V8s can be lighter than iron originals; some swaps are heavier.'], inertia: ['±', 'Engine position changes mass placement.'], braking: ['−', 'More speed to shed.'] } },
      { key: 'gearing', name: 'Gear it instead', what: 'Axle ratio or transmission ratios: more force at the wheels without more engine power.', cost: 'Low–moderate', fab: 'Little', reversible: 'Yes', effects: { comfort: ['−', 'Higher cruising rpm.'] } },
    ],
    components: { category: 'engine', also: 'axle' },
    checklist: ['Rated power and where in the rpm range it arrives, measured how (engine or chassis dyno)', 'Fuel, cooling and ignition changes the kit needs', 'Driveline limits: transmission, driveshaft and axle torque ratings', 'Emissions and registration rules where you drive', 'Installed weight and where the weight sits'],
    verify: 'Dyno before and after on the same dyno and correction standard, or timed runs (60 ft, ⅛/¼ mile) on the same day and surface.',
    verifyTools: [['How ESS measures and tests', '../build/']],
  },
  weight: {
    name: 'Reduce vehicle weight', short: 'Weight', metric: 'all',
    question: 'What does this car actually weigh, where is the mass, and which reductions matter for my other objectives?',
    learn: [
      ['What 50/50 really means', '../articles/weight-distribution-50-50/', 'Why where mass sits matters as well as how much there is.'],
      ['Balance & CG Builder', '../tools/cg-builder/', 'Add, remove or move parts and see front share and CG height change.'],
      ['How ESS measures parts', '../build/', 'Weigh the part you remove; don’t trust a catalogue number.'],
    ],
    experiment: { change: { weight: -200 }, label: '200 lb lighter', replay: 'brake', also: [['Corner', 'corner'], ['Accelerate', 'accelerate']] },
    approaches: [
      { key: 'remove', name: 'Remove what you don’t need', what: 'Rear seats, spare, trim, unused brackets. Cheapest, but check what you give up.', cost: 'Low', fab: 'Little', reversible: 'Mostly', effects: { comfort: ['−', 'Less practical and often louder.'] } },
      { key: 'replace', name: 'Replace with lighter parts', what: 'Wheels, seats, battery, panels, glass. Weigh both parts; mass far from the centre counts most for inertia.', cost: 'Moderate–high', fab: 'Little', reversible: 'Yes', effects: { inertia: ['+', 'Lighter parts at the ends of the car help most.'] } },
      { key: 'structure', name: 'Structural and drivetrain mass', what: 'Lighter engine, axle or body structure — usually part of a larger change.', cost: 'High', fab: 'Substantial', reversible: 'Rarely', effects: { power: ['±', 'Often paired with an engine change.'] } },
    ],
    components: { category: 'tires' },
    checklist: ['Weigh the part you remove and the part you add on the same scale', 'Where the mass sits: high, low, ahead of or behind the axles', 'What you give up: safety, noise, practicality or legality', 'Cost per pound saved, so you can rank the options'],
    verify: 'Four-corner scales before and after with the same fuel level and driver ballast; record each removed part’s own weight.',
    verifyTools: [['Part Weight from Corner Scales', '../tools/scale-delta/'], ['Balance & CG Builder', '../tools/cg-builder/']],
  },
  inertia: {
    name: 'Reduce polar moment', short: 'Polar moment', metric: null,
    question: 'How much of the car’s mass sits far from its centre (bumpers, engine overhang, fuel, battery), and how much faster would it change direction with that mass moved inward?',
    learn: [
      ['Mass moment of inertia (Vehicle Lab)', '../experience/#learn', 'Each part adds mass × distance² about the car’s centre.'],
      ['What 50/50 really means', '../articles/weight-distribution-50-50/', 'Two cars with the same balance can have very different inertia.'],
      ['Balance & CG Builder', '../tools/cg-builder/', 'Work out where parts sit, as a first step to an inertia estimate.'],
    ],
    experiment: null,
    experimentNote: 'ESS does not yet model yaw inertia, so the replays cannot show this effect. Use the CG Builder to place masses, and record part positions for a later inertia estimate.',
    approaches: [
      { key: 'relocate', name: 'Move masses inward', what: 'Battery, fuel, spare and ancillaries toward the centre of the car.', cost: 'Low–moderate', fab: 'Moderate', reversible: 'Mostly', effects: { weight: ['±', 'Relocation alone does not reduce weight.'], handling: ['+', 'Quicker response.'] } },
      { key: 'ends', name: 'Lighter ends of the car', what: 'Bumpers, hood, trunk lid, front structure and overhanging parts.', cost: 'Moderate', fab: 'Little–moderate', reversible: 'Mostly', effects: { weight: ['+', 'Also reduces total weight.'] } },
      { key: 'setback', name: 'Engine setback', what: 'Mount the engine further back. Large change to firewall, steering and exhaust.', cost: 'High', fab: 'Substantial', reversible: 'Rarely', effects: { handling: ['+', 'Front share drops.'], comfort: ['−', 'Less cabin space.'] } },
    ],
    components: null,
    checklist: ['Mass and position (front-to-rear distance from the centre of the car) of each part you move', 'Whether moving it changes total weight or only where the weight sits', 'Wiring, plumbing and service access after the move'],
    verify: 'Record each moved part’s weight and position (front-axle distance and side offset) so the change can be estimated; compare response in a slalom on the same day and tires.',
    verifyTools: [['Balance & CG Builder', '../tools/cg-builder/']],
  },
  traction: {
    name: 'Put the power down', short: 'Traction', metric: 'accelerate',
    question: 'In which gears does this car run out of rear-tire grip, and is it the tire, the surface, the gearing or the differential?',
    learn: [
      ['Gearing and traction', '../experience/#performance', 'Force available versus grip available, gear by gear.'],
      ['Interactive tire loads', '../grip/', 'How load moves onto the driven tires.'],
    ],
    experiment: { change: { tire: 'next' }, label: 'Stickier tires', replay: 'accelerate', also: [['Power out of a corner', 'exit']] },
    approaches: [
      { key: 'tires', name: 'Tires and surface', what: 'Tire compound and size; the single largest lever when the car is grip-limited.', cost: 'Low–moderate', fab: 'None', reversible: 'Yes', effects: { handling: ['+', 'Also more cornering grip.'], braking: ['+', 'Shorter stops.'] } },
      { key: 'diff', name: 'Differential', what: 'Limited-slip or locking differential so both driven tires work on corner exit.', cost: 'Moderate', fab: 'Little', reversible: 'Yes', effects: { handling: ['±', 'Changes turn-in and exit balance.'] } },
      { key: 'transfer', name: 'Suspension for weight transfer', what: 'Rear geometry, springs and dampers that load the driven tires on launch.', cost: 'Low–moderate', fab: 'Little', reversible: 'Mostly', effects: { handling: ['±', 'Launch setup can work against cornering.'] } },
    ],
    components: { category: 'axle', also: 'tires' },
    checklist: ['Tire size and compound, and the wheel width it needs', 'Differential type and how it behaves on corner exit and launch', 'Rear suspension geometry and what it does to the driven tires under load', 'Axle and driveshaft limits for the torque you will put down'],
    verify: 'Timed 60 ft and 0–60 on the same day and surface; note where wheelspin starts.',
    verifyTools: [['How ESS measures and tests', '../build/']],
  },
  comfort: {
    name: 'Improve creature comforts', short: 'Comfort', metric: 'all',
    question: 'Which comforts matter most (air conditioning, quiet, seats, ride), and what will they add in weight and cost to my other objectives?',
    learn: [
      ['Spring Rate & Ride Frequency', '../tools/spring-rate/', 'Ride frequency is a measurable way to talk about comfort.'],
      ['Balance & CG Builder', '../tools/cg-builder/', 'Where added equipment sits.'],
    ],
    experiment: { change: { weight: 60 }, label: 'About 60 lb of A/C and sound deadening (illustrative)', replay: 'brake', also: [['Corner', 'corner']] },
    approaches: [
      { key: 'climate', name: 'Climate control', what: 'Modern compact A/C and heating systems.', cost: 'Moderate', fab: 'Little–moderate', reversible: 'Mostly', effects: { weight: ['−', 'Adds mass, often ahead of the front axle.'], power: ['−', 'Compressor load.'] } },
      { key: 'nvh', name: 'Noise, seats and interior', what: 'Sound deadening, better seats, insulation.', cost: 'Low–moderate', fab: 'Little', reversible: 'Yes', effects: { weight: ['−', 'Adds mass.'] } },
      { key: 'ride', name: 'Ride compliance', what: 'Spring and damper choice, bushings and tire sidewall for a better ride.', cost: 'Low–moderate', fab: 'Little', reversible: 'Yes', effects: { handling: ['±', 'A softer setup can still handle well with good damping and geometry.'] } },
    ],
    components: null,
    checklist: ['Installed weight of the system and where it sits', 'Power draw or engine load (compressor, alternator)', 'Space, wiring and service access', 'Noise and heat changes you can measure before and after'],
    verify: 'Weigh what you add; record ride frequency before and after; note cabin temperature and noise on a repeat drive.',
    verifyTools: [['Spring Rate & Ride Frequency', '../tools/spring-rate/']],
  },
};
export const OBJECTIVE_KEYS = Object.keys(OBJECTIVES);

/**
 * How objectives depend on each other even before an approach is chosen (ESS engineering judgment).
 * Read as: progress on `from` affects `to`.
 */
export const RELATIONS = [
  ['power', 'braking', '−', 'More speed means more energy to shed and more heat.'],
  ['power', 'traction', '−', 'More torque is harder to put down.'],
  ['weight', 'braking', '+', 'Less mass to stop.'],
  ['weight', 'handling', '+', 'Less load to hold in a corner; tires work better lightly loaded.'],
  ['weight', 'power', '+', 'Better power-to-weight without touching the engine.'],
  ['weight', 'inertia', '±', 'Helps most when the removed mass is far from the centre.'],
  ['inertia', 'handling', '+', 'Quicker response to steering.'],
  ['comfort', 'weight', '−', 'Comfort equipment adds mass.'],
  ['handling', 'comfort', '±', 'Stiffer setups ride harder unless damping and geometry do the work.'],
  ['traction', 'handling', '±', 'Launch-focused rear setup can work against cornering.'],
];

export function relationsFor(key, present) {
  return RELATIONS.filter(([a, b]) => (a === key && present.includes(b)) || (b === key && present.includes(a)))
    .map(([a, b, sign, text]) => ({ from: a, to: b, sign, text, other: a === key ? b : a, outgoing: a === key }));
}
