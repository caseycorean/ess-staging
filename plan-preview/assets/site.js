(function(){var t=document.getElementById('menuToggle'),s=document.getElementById('sidebar'),c=document.getElementById('closeBtn');if(!t)return;
function o(){s.classList.add('open');t.setAttribute('aria-expanded','true');c.focus()}function x(){if(!s.classList.contains('open'))return;s.classList.remove('open');t.setAttribute('aria-expanded','false');t.focus()}
t.addEventListener('click',o);c.addEventListener('click',x);document.addEventListener('keydown',function(e){if(e.key==='Escape')x()});})();

(() => {
  const directory = document.querySelector('#ess-site-directory');
  if (!directory || typeof directory.showModal !== 'function') return;
  const header = document.querySelector('.ess-global');
  const trigger = header.querySelector('[data-directory-open]');
  const closer = directory.querySelector('[data-directory-close]');
  const body = directory.querySelector('.ess-directory-body');
  const groups = [...directory.querySelectorAll('[data-directory-expand]')];
  const root = document.documentElement;
  const sectionLinks = [...header.querySelectorAll('[data-ess-section]'), ...directory.querySelectorAll('[data-ess-section]')];
  let scroll;

  function syncSection() {
    const view = document.body.dataset.labView;
    const current = view === 'garage' ? 'My Garage' : view === 'learn' ? 'Learn' : header.dataset.essCurrent;
    for (const link of sectionLinks) {
      if (link.dataset.essSection === current) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
  }
  syncSection();
  new MutationObserver(syncSection).observe(document.body, {attributes: true, attributeFilter: ['data-lab-view']});

  function expand(selected = null) {
    for (const button of groups) {
      const open = button === selected;
      button.setAttribute('aria-expanded', String(open));
      document.getElementById(button.getAttribute('aria-controls')).hidden = !open;
    }
  }
  header.dataset.directoryReady = '';
  trigger.hidden = false;
  trigger.addEventListener('click', () => {
    if (directory.open) return;
    expand();
    scroll = {left: window.scrollX, top: window.scrollY};
    directory.showModal();
    root.classList.add('ess-directory-lock');
    body.scrollTop = 0;
    closer.focus({preventScroll: true});
    trigger.setAttribute('aria-expanded', 'true');
  });
  function closeDirectory(restore = true) {
    root.classList.remove('ess-directory-lock');
    trigger.setAttribute('aria-expanded', 'false');
    directory.close();
    if (restore) {
      trigger.focus({preventScroll: true});
      window.scrollTo({...scroll, behavior: 'instant'});
    }
  }
  closer.addEventListener('click', () => closeDirectory());
  directory.addEventListener('cancel', event => {
    event.preventDefault();
    closeDirectory();
  });
  directory.addEventListener('click', event => {
    const toggle = event.target.closest('[data-directory-expand]');
    if (toggle) {
      expand(toggle.getAttribute('aria-expanded') === 'true' ? null : toggle);
      return;
    }
    const link = event.target.closest('a[href]');
    if (link && !event.defaultPrevented && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
      // Leave anchor scrolling to the browser for navigation.
      closeDirectory(false);
      return;
    }
    if (event.target === directory) {
      const bounds = directory.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right ||
          event.clientY < bounds.top || event.clientY > bounds.bottom) closeDirectory();
    }
  });
})();
