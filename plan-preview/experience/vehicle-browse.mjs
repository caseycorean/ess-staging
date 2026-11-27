// A same-tab comparison basket. Factory reference choices do not change the active vehicle.
const basket = document.querySelector('[data-vehicle-compare-tray]');
if (basket) {
  const picks = new Map([...document.querySelectorAll('[data-vehicle-compare]')].map(button => [
    button.dataset.vehicleCompare, {button, title: button.previousElementSibling.querySelector('strong').textContent}
  ]));
  const storage = 'ess.reference-comparison.v1';
  let chosen = [];
  try {
    const saved = JSON.parse(sessionStorage.getItem(storage));
    if (Array.isArray(saved)) chosen = [...new Set(saved)].filter(slug => picks.has(slug)).slice(0, 2);
  } catch { /* Selection is still available until navigation. */ }

  const list = basket.querySelector('[data-vehicle-compare-selection]');
  const open = basket.querySelector('[data-vehicle-compare-link]');
  const message = basket.querySelector('[data-vehicle-compare-message]');
  function render() {
    for (const [slug, {button, title}] of picks) {
      const included = chosen.includes(slug);
      button.hidden = false;
      button.textContent = included ? 'Selected' : 'Compare';
      button.setAttribute('aria-pressed', String(included));
      button.setAttribute('aria-label', (included ? 'Remove ' : 'Add ') + title + (included ? ' from comparison' : ' to comparison'));
    }
    basket.hidden = !chosen.length;
    list.replaceChildren(...chosen.map(slug => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.dataset.removeVehicle = slug;
      chip.textContent = picks.get(slug).title + ' ×';
      chip.setAttribute('aria-label', 'Remove ' + picks.get(slug).title);
      return chip;
    }));
    open.hidden = chosen.length < 2;
    if (chosen.length === 2) open.href = 'compare/?' + new URLSearchParams({a:chosen[0], b:chosen[1]});
    message.textContent = chosen.length === 1 ? 'Choose one more vehicle.' : '';
    try { sessionStorage.setItem(storage, JSON.stringify(chosen)); } catch { /* Keep the current selection. */ }
  }
  document.querySelector('.ess-vehicle-main').addEventListener('click', event => {
    const button = event.target.closest('[data-vehicle-compare], [data-remove-vehicle]');
    if (!button) return;
    const slug = button.dataset.vehicleCompare ?? button.dataset.removeVehicle;
    if (!picks.has(slug)) return;
    if (chosen.includes(slug)) {
      chosen = chosen.filter(id => id !== slug);
    } else if (chosen.length === 2) {
      message.textContent = 'Remove a selection to add a different vehicle.';
      return;
    } else {
      chosen = [...chosen, slug];
    }
    render();
    if (button.dataset.removeVehicle) {
      const original = picks.get(slug).button;
      if (original.getClientRects().length) original.focus();
      else document.querySelector('[data-reference-filter]').focus();
    }
  });
  const categoryBox = document.querySelector('[data-vehicle-category-box]');
  const wide = matchMedia('(min-width: 800px)');
  const sync = () => { categoryBox.open = wide.matches || location.hash === "#browse-categories"; };
  sync();
  wide.addEventListener('change', sync);
  window.addEventListener('hashchange', () => {
    if (location.hash === '#browse-categories') categoryBox.open = true;
  });
  categoryBox.addEventListener('click', event => {
    if (!wide.matches && event.target.closest('[data-reference-category]')) {
      categoryBox.open = false;
      categoryBox.querySelector('summary').focus();
    }
  });
  render();
}
