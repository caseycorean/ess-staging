// Native disclosure keeps definitions usable by touch, keyboard and pointer.
const definitions = {
  'motion ratio': ['Spring travel divided by wheel travel. The wheel rate uses the square of this ratio.', '../tools/spring-rate/'],
  'scrub radius': ['The lateral distance on the ground between the steering axis and the tire contact patch center.', '../suspension-v2/'],
  'trap speed': ['The speed reported near the end of the timed drag strip. It is a separate result from elapsed time.'],
  'final drive ratio': ['The ratio between driveshaft and axle speed. A higher number multiplies wheel torque and raises engine speed at a given road speed.', '../experience/#performance'],
  'polar moment': ['Resistance to turning about an axis. Moving the same mass farther from that axis increases the resistance.'],
  'traction circle': ['A way to show how much tire grip is available for braking, accelerating and cornering at the same time.', '../articles/traction-circle/'],
  'one-foot rollout': ['The elapsed-time clock starts after the car travels its first foot. The Replay stage still follows motion from the start.'],
};
export function term(name) {
  const definition = definitions[name];
  if (!definition) return '';
  const [text, href] = definition;
  return `<details class="ess-term"><summary aria-label="Define ${name}">ⓘ</summary><span>${text}${href ? ` <a href="${new URL(href, import.meta.url).href}">Explore this</a>` : ''}</span></details>`;
}
