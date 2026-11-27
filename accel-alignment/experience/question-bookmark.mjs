import { saveActivity } from './garage-workspace.mjs';

const button = document.querySelector('[data-save-question]');
const title = 'Why does braking into a corner use up grip?';
const url = new URL('#try-it',location.href).href;
if (button) {
  button.hidden = false;
  saveActivity('question',title,url,true);
  button.addEventListener('click', () => {
    const result = saveActivity('question',title,url);
    document.querySelector('[data-question-status]').textContent = result.ok ? 'Question saved in My Garage.' : result.issue;
  });
}
