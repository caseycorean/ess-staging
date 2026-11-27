// The only dynamic measurement values are bounded enums. Never pass vehicle or URL data.
const names = new Set(['reference_entrance', 'capability_navigation', 'experiment_start',
  'experiment_result', 'experiment_exit', 'simulator_discovery', 'simulator_start', 'simulator_result',
  'configuration_save', 'return_visit', 'share_attempt', 'share_outcome', 'share_open', 'invalid_setup',
  'missing_inputs']);
const values = {
  capability: new Set(['reference', 'build', 'strip', 'oval', 'performance', 'load-transfer',
    'spring-rate', 'balance', 'suspension', 'discovery', 'compare', 'tools', 'garage']),
  outcome: new Set(['ready', 'blocked', 'no_result', 'saved', 'unavailable', 'shared', 'copied', 'cancelled', 'manual']),
  entrance: new Set(['external', 'internal', 'direct']),
};
export function eventParameters(params = {}) {
  return Object.fromEntries(Object.entries(params).filter(([key, value]) => values[key]?.has(value)));
}
export function track(name, params) {
  if (!names.has(name) || typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  window.gtag('event', 'ess_' + name, {
    ...eventParameters(params), page_location: window.location.origin + window.location.pathname, page_referrer: '',
  });
}
if (typeof document !== 'undefined') {
  const page = document.querySelector('[data-ess-page="reference"]');
  if (page) {
    let entrance = 'direct';
    if (document.referrer) {
      try { entrance = new URL(document.referrer).origin === location.origin ? 'internal' : 'external'; }
      catch { /* unavailable referrer */ }
    }
    track('reference_entrance', {capability:'reference', entrance});
  }
  document.addEventListener('click', event => {
    const capability = event.target.closest('[data-ess-capability]')?.dataset.essCapability;
    if (!values.capability.has(capability)) return;
    track('capability_navigation', {capability});
    if (capability === 'strip' || capability === 'oval') track('simulator_discovery', {capability});
  });
}
