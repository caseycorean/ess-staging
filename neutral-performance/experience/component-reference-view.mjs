import { loadComponentReference } from '../engine/component-reference.mjs';
import { escape } from './ui.mjs';

const label = {
  manufacturer:'Manufacturer', published:'Published', independent_test:'Independent test',
  calculated:'Calculated', estimated:'Estimate',
};
const textValue = value => Array.isArray(value) ? value.join(' · ') : String(value);
const showUnit = unit => !['type', 'label', 'string', 'text', 'enum', ''].includes(unit ?? '') ? ' ' + unit : '';

export function renderComponentReference(reference) {
  if (!reference) return '<p>Choose an indexed factory configuration to see its sourced component details.</p>';
  const details = reference.groups.map(group => '<details><summary>' + escape(group.label) + ' (' + group.facts.length +
    ')</summary><dl>' + group.facts.map(fact => '<dt>' + escape(fact.label) + '</dt><dd><strong>' +
      escape(textValue(fact.value) + showUnit(fact.unit)) + '</strong> · ' +
      escape(label[fact.evidence] ?? fact.evidence) + ' · <a href="' + escape(fact.source) + '">Source</a>' +
      (fact.note ? '<p>' + escape(fact.note) + '</p>' : '') + '</dd>').join('') + '</dl></details>').join('');
  const examples = reference.examples.map(item => '<details><summary>' + escape(item.name) +
    '</summary><p>' + escape(item.application) + '</p><dl>' +
    item.facts.map(([key, value]) => '<dt>' + escape(key) + '</dt><dd>' + escape(value) + '</dd>').join('') +
    '</dl><p><a href="' + escape(item.source.url) + '">Component source</a></p></details>').join('');
  const profile = typeof reference.slug === 'string' && /^[a-z0-9.-]+$/.test(reference.slug)
    ? '<p><a href="../vehicles/' + reference.slug + '/">Open exact vehicle specifications</a></p>' : '';
  return '<p><strong>' + escape(reference.title) + '</strong> · Factory reference. These details leave your setup unchanged.</p>' +
    details + (examples ? '<h3>Related component examples</h3>' + examples : '') + profile;
}

export function bindComponentReference(root) {
  root.addEventListener('toggle', async event => {
    const panel = event.target;
    if (!panel.matches?.('details[data-component-reference]') || !panel.open || panel.dataset.loaded) return;
    const output = panel.querySelector('[data-component-reference-output]');
    if (!output) return;
    const id = panel.dataset.componentReference;
    output.textContent = 'Loading component reference…';
    panel.dataset.loaded = 'pending';
    try {
      output.innerHTML = renderComponentReference(id ? await loadComponentReference(id) : null);
      panel.dataset.loaded = 'yes';
    } catch {
      delete panel.dataset.loaded;
      output.textContent = 'Component reference is unavailable. Close and reopen this section to retry.';
    }
  }, true);
}
