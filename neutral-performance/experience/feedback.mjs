import { contextPath, kinds, validateFeedback } from './feedback-data.mjs';

const form = document.querySelector('[data-feedback-mode]');
if (form) installFeedback(form);

function installFeedback(form) {
  const params = new URLSearchParams(location.search);
  const route = contextPath(params.get('from'));
  const context = form.querySelector('[data-feedback-context]');
  const status = form.querySelector('[data-feedback-status]');
  const copy = form.querySelector('[data-feedback-copy]');
  const button = form.querySelector('[type=submit]');
  const draft = copy.querySelector('textarea');
  const mode = form.dataset.feedbackMode;
  if (route) {
    context.hidden = false;
    context.querySelector('[data-context-value]').textContent = route;
  }
  if (kinds.has(params.get('type'))) form.elements.kind.value = params.get('type');
  form.hidden = false;
  const report = message => { status.textContent = message; status.focus(); };
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const raw = {kind:form.elements.kind.value, note:form.elements.note.value, website:form.elements.website.value};
    if (route && form.elements.context.checked) raw.page = route;
    const data = validateFeedback(raw);
    if (!data) {
      report('Check the topic and message length, and remove any shared setup links.');
      return;
    }
    copy.hidden = true;
    if (mode !== 'live') {
      draft.value = [data.kind, data.page, data.note].filter(Boolean).join('\n\n');
      copy.hidden = false;
      if (mode === 'local') {
        try {
          sessionStorage.setItem('ess.feedback.preview', JSON.stringify(data));
          report('Test note saved for this session. No feedback was sent.');
        } catch {
          report('This browser could not save a test note. The note is ready to copy.');
        }
      } else {
        report('Your note is ready to copy. No feedback was sent.');
      }
      return;
    }
    if (button.disabled) return;
    button.disabled = true;
    try {
      const response = await fetch('/api/feedback', {
        method:'POST', credentials:'omit', headers:{'Content-Type':'application/json'}, body:JSON.stringify(raw),
        signal:AbortSignal.timeout(12000),
      });
      if (!response.ok) throw new Error(String(response.status));
      form.reset();
      report('Feedback received. Thank you.');
    } catch {
      report('The note could not be delivered. Your text is still here. Please try again later.');
    } finally {
      button.disabled = false;
    }
  });
  copy.querySelector('[data-feedback-copy-button]').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(draft.value); report('Note copied.'); }
    catch { draft.focus(); draft.select(); }
  });
}
