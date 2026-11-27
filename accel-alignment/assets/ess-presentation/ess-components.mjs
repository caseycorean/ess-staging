/** Presentation helpers. The host supplies labels, model values, and actions. */
const evidenceText = {
  measured: 'Measured',
  reference: 'Published reference',
  estimate: 'Model estimate',
  assumption: 'User assumption',
  missing: 'Missing input',
};

function textElement(doc, tag, text, className) {
  const element = doc.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

export function evidenceBadge(doc, evidence) {
  if (!Object.hasOwn(evidenceText, evidence)) throw new RangeError('Unknown evidence type');
  const badge = textElement(doc, 'span', evidenceText[evidence]);
  badge.dataset.essEvidence = evidence;
  return badge;
}

export function metric(doc, { label, value, unit, evidence, detail }) {
  const group = textElement(doc, 'dl', '', 'ess-system-metric');
  group.append(textElement(doc, 'dt', label));
  const readout = doc.createElement('dd');
  const text = value == null ? 'Unavailable' : [value, unit].filter(part => part != null && part !== '').join(' ');
  readout.append(textElement(doc, 'span', text, 'ess-system-metric-value'));
  if (evidence) readout.append(evidenceBadge(doc, evidence));
  group.append(readout);
  if (detail) group.append(textElement(doc, 'dd', detail));
  return group;
}

export function recommendation(doc, { title, delta, conditions, actionLabel }, onApply) {
  const card = textElement(doc, 'section', '', 'ess-system-recommendation');
  card.append(textElement(doc, 'h3', title));
  if (delta) card.append(textElement(doc, 'strong', delta, 'ess-system-delta'));
  if (conditions) card.append(textElement(doc, 'p', conditions));
  if (actionLabel && typeof onApply === 'function') {
    const button = textElement(doc, 'button', actionLabel, 'ess-system-button');
    button.type = 'button';
    button.addEventListener('click', onApply);
    card.append(button);
  }
  return card;
}
