const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

for (const group of document.querySelectorAll('[data-home-rotation]')) {
  const panels = [...group.querySelectorAll('.home-rotation-panel')];
  const controls = group.querySelector('.home-rotation-controls');
  const position = group.querySelector('[data-rotation-position]');
  const toggle = group.querySelector('[data-rotation-toggle]');
  let current = 0;
  let timer;
  let paused = reducedMotion.matches;
  let hovered = false;
  let focused = false;

  function schedule() {
    clearTimeout(timer);
    if (!paused && !hovered && !focused && !document.hidden) {
      timer = setTimeout(() => show(current + 1), controls.closest('.home-more') ? 14500 : 10500);
    }
  }

  function show(index) {
    current = (index + panels.length) % panels.length;
    panels.forEach((panel, index) => { panel.hidden = index !== current; });
    position.textContent = `${current + 1} of ${panels.length}`;
    schedule();
  }

  function setPaused(value) {
    paused = value;
    toggle.textContent = paused ? 'Start rotation' : 'Pause rotation';
    schedule();
  }

  controls.hidden = false;
  group.querySelector('[data-rotation-prev]').addEventListener('click', () => show(current - 1));
  group.querySelector('[data-rotation-next]').addEventListener('click', () => show(current + 1));
  toggle.addEventListener('click', () => setPaused(!paused));
  group.addEventListener('mouseenter', () => { hovered = true; schedule(); });
  group.addEventListener('mouseleave', () => { hovered = false; schedule(); });
  group.addEventListener('focusin', () => { focused = true; schedule(); });
  group.addEventListener('focusout', event => {
    focused = group.contains(event.relatedTarget);
    schedule();
  });
  document.addEventListener('visibilitychange', schedule);
  reducedMotion.addEventListener('change', event => setPaused(event.matches));
  setPaused(paused);
  show(0);
}
