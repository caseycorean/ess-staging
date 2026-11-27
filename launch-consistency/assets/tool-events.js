/* Tool-use events for Google Analytics (GA4).
   Sends at most two events per page view, and never the numbers a visitor types:
     tool_start  — the visitor first changes an input or presses a button in the tool
     tool_result — about 1.5 s after the visitor stops typing, if the tool shows a valid result
   Both carry tool_name (from the script tag's data-tool attribute).
   Usage: <script src="/assets/tool-events.js" data-tool="cg_builder" data-result="oF" defer></script>
   data-result = id of the main result element; '–', '--' or empty means no valid result. */
(function () {
  var me = document.currentScript;
  if (!me) return;
  var tool = me.getAttribute('data-tool') || 'unknown';
  var resultId = me.getAttribute('data-result');
  var started = false, reported = false, timer = null;

  function send(name) {
    if (typeof window.gtag === 'function') window.gtag('event', name, { tool_name: tool });
  }
  function hasValidResult() {
    if (document.querySelector('[aria-invalid="true"]')) return false;
    if (!resultId) return true;
    var el = document.getElementById(resultId);
    if (!el) return false;
    var t = (el.textContent || '').trim();
    return t !== '' && t !== '–' && t !== '--' && t !== '-';
  }
  function onUse(e) {
    if (!e.isTrusted) return;
    var t = e.target;
    if (!t || !t.closest || !t.closest('input, select, textarea, button')) return;
    if (e.type === 'click' && !t.closest('button')) return; // clicking into a box isn't use
    if (t.closest('header, aside, footer, nav')) return; // ignore the site menu
    if (!started) { started = true; send('tool_start'); }
    if (reported) return;
    clearTimeout(timer);
    timer = setTimeout(function () {
      if (!reported && hasValidResult()) { reported = true; send('tool_result'); }
    }, 1500);
  }
  document.addEventListener('input', onUse, true);
  document.addEventListener('change', onUse, true);
  document.addEventListener('click', onUse, true);
})();
