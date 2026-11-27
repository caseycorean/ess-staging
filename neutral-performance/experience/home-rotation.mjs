const phone = matchMedia('(max-width: 670px)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

for (const group of document.querySelectorAll('[data-showcase]')) {
  const items = [...group.querySelectorAll('[data-showcase-item]')];
  const controls = group.querySelector('[data-showcase-controls]');
  const pause = group.querySelector('[data-showcase-pause]');
  const position = group.querySelector('[data-showcase-position]');
  const defaultSize = Number(group.dataset.showcase);
  let manuallyPaused = reducedMotion.matches;
  let first = 0;

  function show() {
    const count = phone.matches ? 1 : defaultSize;
    items.forEach((item, index) => { item.hidden = (index - first + items.length) % items.length >= count; });
    for (let index = 0; index < items.length; index++) {
      items[0].parentElement.append(items[(first + index) % items.length]);
    }
    position.textContent = (first + 1) + ' of ' + items.length;
    if (pause) pause.textContent = manuallyPaused ? 'Play slides' : 'Pause slides';
  }
  function step(offset) {
    first = (first + offset + items.length) % items.length;
    show();
  }
  controls.hidden = false;
  controls.addEventListener('click', event => {
    const button = event.target.closest('[data-showcase-step]');
    if (button) step(Number(button.dataset.showcaseStep));
    if (event.target === pause) { manuallyPaused = !manuallyPaused; show(); }
  });
  phone.addEventListener('change', show);
  if (pause) {
    reducedMotion.addEventListener('change', event => {
      if (event.matches) { manuallyPaused = true; show(); }
    });
    setInterval(() => {
      if (!manuallyPaused && !document.hidden && !group.matches(':hover, :focus-within')) step(1);
    }, 9500);
  }
  show();
}
