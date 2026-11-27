import { ride } from '../engine/loads.mjs';

const spring = document.querySelector('[data-wheel-example]');
if (spring) {
  const slider = spring.querySelector('input');
  const motion = spring.querySelector('output');
  const wheel = spring.querySelector('[data-example-rate]');
  const rate = spring.querySelector('[data-example-ride]');
  const update = () => {
    const ratio = Number(slider.value);
    const result = ride({ cornerLb: 891, unsprung: 95, spring: 500, motion: ratio, tireRate: 1400 });
    motion.textContent = ratio.toFixed(2);
    wheel.textContent = Math.round(result.wheel) + ' lb/in';
    rate.textContent = Math.round(result.rate) + ' lb/in';
  };
  slider.addEventListener('input', update);
  update();
  spring.hidden = false;
}

// Both readings are rounded from the independently checked full 1990 reference run.
const clocks = document.querySelector('[data-clock-example]');
if (clocks) {
  const switchStart = clocks.querySelector('[data-rollout-clock]');
  const reading = clocks.querySelector('[data-0-60-reading]');
  const update = () => { reading.textContent = switchStart.checked ? '8.74 s' : '9.11 s'; };
  switchStart.addEventListener('change', update);
  update();
  clocks.hidden = false;
}
