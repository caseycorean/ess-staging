// Keep the current card in place while someone is reading. Rotation is visitor-driven.
const phone = matchMedia('(max-width: 670px)');

for (const group of document.querySelectorAll('[data-showcase]')) {
  const items = [...group.querySelectorAll('[data-showcase-item]')];
  const controls = group.querySelector('[data-showcase-controls]');
  const defaultSize = Number(group.dataset.showcase);
  let first = 0;
  const show = () => {
    const count = phone.matches ? 1 : defaultSize;
    items.forEach((item, index) => { item.hidden = (index - first + items.length) % items.length >= count; });
    // Move the visible items into the same visual and keyboard reading order.
    for (let index = 0; index < items.length; index++) {
      items[0].parentElement.append(items[(first + index) % items.length]);
    }
  };
  controls.hidden = false;
  controls.addEventListener('click', event => {
    const step = event.target.closest('[data-showcase-step]');
    if (!step) return;
    first = (first + Number(step.dataset.showcaseStep) + items.length) % items.length;
    show();
  });
  phone.addEventListener('change', show);
  show();
}
