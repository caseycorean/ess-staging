(function(){var t=document.getElementById('menuToggle'),s=document.getElementById('sidebar'),c=document.getElementById('closeBtn');if(!t)return;
function o(){s.classList.add('open');t.setAttribute('aria-expanded','true');c.focus()}function x(){if(!s.classList.contains('open'))return;s.classList.remove('open');t.setAttribute('aria-expanded','false');t.focus()}
t.addEventListener('click',o);c.addEventListener('click',x);document.addEventListener('keydown',function(e){if(e.key==='Escape')x()});})();
