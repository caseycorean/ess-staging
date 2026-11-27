import { vehicles, fields, customEstimates, architectureLabel } from './vehicles.mjs';
import { modified } from './configuration.mjs';

export const escape = s => String(s).replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

export const fmt = (n, places = 0) => Number.isFinite(n) ?
  n.toLocaleString('en-US', { minimumFractionDigits: places, maximumFractionDigits: places }) : '—';
export const delta = (n, places = 0) => Math.abs(n) < .5 * 10 ** -places ? fmt(0, places) :
  (n > 0 ? '+' : '−') + fmt(Math.abs(n), places);

export function vehicleSelector(label, id, options = {}) {
  return `<div class="vehicle-select"><span>${escape(label)}</span>
    <button type="button" class="vehicle-choose" data-open-catalog data-vehicle-key="${escape(options.key ?? 'vehicle')}"
    aria-haspopup="dialog" aria-label="Choose vehicle for ${escape(label)}">${escape(options.name || vehicles[id].name)}</button></div>`;
}

export function metricTable(rows, labels = ['Original', 'Modified'], compare = false) {
  return `<table class="metric-table">
    <thead><tr><th scope="col">Metric</th><th scope="col">${escape(labels[0])}</th>
    <th scope="col">${escape(labels[1])}</th><th scope="col">${compare ? 'B vs. A' : 'Change'}</th></tr></thead>
    <tbody>${rows.map(([label, before, after, unit, digits = 0, diffUnit = unit]) => {
      const valid = Number.isFinite(before) && Number.isFinite(after);
      const diff = after - before;
      return `<tr><th scope="row">${escape(label)}</th><td>${fmt(before, digits)} <span>${Number.isFinite(before) ? unit : ''}</span></td>
      <td>${fmt(after, digits)} <span>${Number.isFinite(after) ? unit : ''}</span></td>
      <td>${valid ? `${delta(diff, digits)} <span>${diffUnit}</span>` : '—'}
      ${valid && before !== 0 && diffUnit !== 'pp' ? `<small>${delta(diff / Math.abs(before) * 100, 1)}%</small>` : ''}</td></tr>`;
    }).join('')}</tbody></table>`;
}

export const evidenceNames = {
  manufacturer: 'Manufacturer', published: 'Published', independent_test: 'Independent test',
  missing: 'Missing', estimated: 'Estimated', measured: 'ESS measured', calculated: 'Calculated', user: 'User-entered', historical: 'Historical archive', component: 'Component preset',
};

export function evidence(setup, custom = true) {
  const v = vehicles[setup.id];
  return `<details class="explain"><summary>Input values and sources</summary>
    <p>${escape(v.trim)}. ${v.ref ? 'Based on an ESS Vehicle Reference record.' : 'Supplemental reference for this prototype.'}
    Stock inputs use published figures where available. Estimates are editable.</p>
    <dl class="evidence">${Object.entries(v.data).map(([key, data]) => {
      const opted = setup.id === 'custom' && (setup.estimates ?? Object.keys(customEstimates)).includes(key);
      const [value, kind, note, link, conditions] = opted ? customEstimates[key] : data;
      const fieldValue = value === null ? '—' : Array.isArray(value) ? value.join(' / ') : key === 'front' ? fmt(value * 100, 1) : key === 'archFront' || key === 'archRear' ? architectureLabel(key, value) : value;
      const original = setup.base[key];
      const override = custom ? setup.tune[key] : undefined;
      const displayOverride = n => escape(key === 'front' ? fmt(n * 100, 1) : n);
      return `<div><dt>${fields[key] ?? key}</dt><dd>${escape(fieldValue)} <b>${evidenceNames[kind] ?? escape(kind)}</b>
      ${original !== undefined ? `<br><strong>${displayOverride(original)}</strong> <b>Original override</b>` : ''}
      ${override !== undefined ? `<br><strong>${displayOverride(override)}</strong> <b>Experiment override</b>` : ''}
      <small>${escape(note ?? '')}${conditions ? ' ' + escape(conditions) : ''}
        ${link?.startsWith('https://') ? ` <a href="${escape(link)}" target="_blank" rel="noreferrer">Source</a>` : ''}</small></dd></div>`;
    }).join('')}</dl></details>`;
}

export function explanation(title, text, more = '') {
  return `<details class="explain"><summary>${title}</summary><p>${text}</p>${more}</details>`;
}

export function numberField(name, label, value, options = {}) {
  return `<label class="number-field"><span>${escape(label)}</span><input type="number"
    name="${escape(name)}" value="${escape(value ?? '')}" step="${options.step ?? 'any'}"
    ${options.min !== undefined ? `min="${options.min}"` : ''}
    ${options.max !== undefined ? `max="${options.max}"` : ''}
    ${options.required ? 'required' : ''}></label>`;
}

export function configModes(setup, key, selected) {
  const firstLabel = Object.keys(setup.base).length ? 'Original' : 'Stock';
  return `<label><span>Configuration</span><select data-mode="${key}">
    <option value="before" ${selected === 'before' ? 'selected' : ''}>${firstLabel}</option>
    <option value="after" ${selected === 'after' ? 'selected' : ''} ${modified(setup) ? '' : 'disabled'}>Modified</option>
  </select></label>`;
}
