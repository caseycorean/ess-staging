import { loadStore, planHref, projectsForVehicle, summary } from './plan/plan-store.mjs';
import { OBJECTIVES } from './plan/objectives.mjs';
import { resolve } from './models.mjs';
import { setupName } from './matchup.mjs';
import { escape, fmt, vehicleSelector } from './ui.mjs';
import { getWorkspace, palettes, vehicleRoles, workspaceHref } from './garage-workspace.mjs';

function garageName(workspace) {
  if (workspace.name !== null) return workspace.name;
  try { return (localStorage.getItem('ess.garage-name.v1') || '').trim().slice(0,44); }
  catch { return ''; }
}
const activityNames = {replay:'Simulation', comparison:'Comparison', component:'Component evidence', question:'Engineering question'};
function activities(items, editable = false) {
  return '<ul class="garage-activities">' + items.map(item => `<li><div>
      <span class="quiet">${activityNames[item.kind]}</span><strong>${escape(item.title)}</strong></div>
      <div class="garage-activity-actions"><a href="${escape(workspaceHref(item.path))}">Resume<span class="garage-sr"> ${escape(item.title)}</span></a>
      ${editable && ['replay','comparison'].includes(item.kind) ? `<button type="button" class="button plain" data-share-activity="${item.id}">Share</button>` : ''}
      ${editable ? `<button type="button" class="button plain" data-remove-activity="${item.id}" aria-label="Remove ${escape(item.title)}">Remove</button>` : ''}</div></li>`).join('') + '</ul>';
}

function options(values, selected) {
  return Object.entries(values).map(([value,label]) => `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`).join('');
}

function preferences(workspace, name) {
  return `<details class="ess-garage-custom"><summary>Customize</summary>
    <form data-garage-name>
      <div class="garage-fields">
        <label>Garage name<input name="name" maxlength="44" value="${escape(name)}" placeholder="My Garage"></label>
        <label>Garage palette<select name="palette">${options(palettes,workspace.palette)}</select></label>
      </div>
      <label>Garage photo <small>Optional · JPEG, PNG or WebP</small><input type="file" name="photo" accept="image/jpeg,image/png,image/webp"></label>
      ${workspace.photo ? '<label class="garage-checkbox"><input type="checkbox" name="removePhoto"> Remove photo</label>' : ''}
      <label class="garage-checkbox"><input type="checkbox" name="recent"${workspace.showRecent ? ' checked' : ''}> Show recently explored</label>
      <p class="quiet">Your photo, preferences and activities stay in this browser.</p>
      <button type="submit" class="button secondary">Save Garage settings</button>
      <p data-garage-settings-status role="status"></p>
    </form></details>`;
}

function savedConfiguration(item, project = {}, plans = []) {
  const {key,setup,mode} = item;
  const vehicle = setupName(setup);
  const v = resolve(setup, mode === 'after');
  const name = project.title || vehicle;
  return `<article class="panel content-panel garage-card">
    <span class="garage-role">${vehicleRoles[project.role] || 'Saved configuration'}</span>
    <h3>${escape(name)}</h3>${name !== vehicle ? `<p>${escape(vehicle)}</p>` : ''}
    <p>${mode === 'after' ? 'Modified' : 'Original'} · ${fmt(v.weight)} lb · ${fmt(v.hp)} hp</p>
    ${project.note ? `<p class="garage-objective">${escape(project.note)}</p>` : ''}
    ${plans.length ? `<p class="garage-objective">Development plans: ${plans.map(plan =>
      `<a href="${planHref(plan.id)}">${escape(planName(plan))}</a>`).join(' · ')}</p>` :
      `<p><a href="../plan/?garage=${encodeURIComponent(key)}">Plan a build with this setup</a></p>`}
    <div class="actions"><button class="button primary" data-garage-use="${key}">Use this configuration</button>
      <button class="button secondary" data-garage-open="${key}">Open to edit</button></div>
    <details class="garage-project" data-details="project-${key}"><summary>Vehicle details</summary>
      <form data-garage-project="${key}">
        <label>Vehicle role<select name="role">${options(vehicleRoles,project.role || 'reference')}</select></label>
        <label>Vehicle nickname<input name="title" maxlength="60" value="${escape(project.title || '')}"></label>
        <label>Vehicle notes<textarea name="note" rows="3" maxlength="220">${escape(project.note || '')}</textarea></label>
        <div class="actions"><button type="submit" class="button secondary">Save vehicle details</button>
          <button type="button" class="button plain" data-garage-remove="${key}">Remove configuration</button></div>
        <p data-garage-project-status role="status"></p>
      </form></details></article>`;
}

function planName(plan) {
  return plan.name || (plan.vehicle?.setup ? setupName(plan.vehicle.setup) :
    plan.vehicle ? setupName({id:plan.vehicle.id}) : 'Untitled plan');
}

function garagePlans(plans) {
  return `<section class="panel content-panel" aria-labelledby="garage-plans">
    <h2 id="garage-plans">Development plans</h2>
    ${plans.length ? `<ul class="garage-activities">${plans.map(plan => {
      const progress = summary(plan);
      const name = planName(plan);
      const goals = plan.objectives.map(o => OBJECTIVES[o.key].short).join(', ');
      return `<li><div><strong>${escape(name)}</strong><span class="quiet">${escape(goals || 'Choose your first objective')}
        ${progress.decisions ? ` · ${progress.decisions} decided` : ''}${progress.blockers ? ` · ${progress.blockers} open` : ''}</span></div>
        <a href="${planHref(plan.id)}">Resume<span class="garage-sr"> ${escape(name)}</span></a></li>`;
    }).join('')}</ul>` : '<p>Choose something to improve, then track your tests and decisions.</p><a href="../plan/">Start a development plan</a>'}
    </section>`;
}

export function garageView(items, active) {
  const workspace = getWorkspace();
  const name = garageName(workspace);
  const plans = loadStore().projects;
  const fresh = !items.length && !workspace.saved.length && !active && !plans.length;
  const canSaveActive = active && !items.some(item => item.mode === active.mode && JSON.stringify(item.setup) === JSON.stringify(active.setup));
  const vehicles = items.length ? '<section><h2>Vehicles and configurations</h2><div class="garage-grid">' +
    items.map(item => savedConfiguration(item, workspace.projects[item.key], projectsForVehicle(plans, item))).join('') + '</div></section>' : '';
  const savedActivities = workspace.saved.length ? `<section class="panel content-panel" aria-labelledby="garage-saved">
    <h2 id="garage-saved" tabindex="-1">Saved activities</h2>${activities(workspace.saved,true)}</section>` : '';
  return `<section class="shell workspace garage-page" data-garage-palette="${workspace.palette}">
    <header class="page-title ess-garage-title">
      <div>${name ? '<p class="eyebrow">My Garage</p>' : ''}<h1>${escape(name || 'My Garage')}</h1>
        <p class="lede">${fresh ? 'Try a car, save a change and pick up where you left off.' : 'Pick up a plan, a saved test or a vehicle build.'}</p>
      </div>${workspace.photo ? `<img class="garage-photo" src="${escape(workspace.photo)}" alt="Your Garage photo">` : ''}
    </header>
    ${plans.length ? garagePlans(plans) : ''}
    ${vehicles}
    ${savedActivities}
    <div class="garage-overview">
      <section class="panel content-panel garage-current"><h2>${active ? 'Active vehicle' : 'Start with a car'}</h2>
      <p>${active ? escape(setupName(active.setup)) + ' · ' + (active.mode === 'after' ? 'Modified' : 'Original') : 'Choose a car you own, a reference or something on your wish list.'}</p>
      <div class="actions">${vehicleSelector('Garage vehicle', active?.setup.id ?? 'custom', {key:'garage', name:'Choose a vehicle'})}
        ${active ? '<a class="button secondary" href="#build">Edit current build</a><a class="button secondary" href="../replay/?mode=single">Test active setup</a>' :
          '<a class="button secondary" href="?custom=1#build">Enter my own vehicle</a>'}
        ${canSaveActive ? '<button class="button secondary" type="button" data-action="save-active-garage">Save active vehicle</button>' : ''}</div></section>
      ${fresh ? '<section class="panel content-panel garage-starter"><h2>See what a change does</h2><p>Brake into a corner and compare two approaches in the same car. Save the test if you want to return to it.</p><a href="../replay/#entry">Try corner-entry braking</a> <a href="?demo=garage#garage">View an ESS example Garage</a></section>' : ''}
    </div>
    ${plans.length ? '' : garagePlans(plans)}
    ${workspace.showRecent && workspace.recent.length ? '<section class="panel content-panel"><h2>Recently explored</h2>' + activities(workspace.recent) + '</section>' : ''}
    ${preferences(workspace,name)}
    ${active ? '<section class="panel content-panel garage-next"><h2>What will you test next?</h2><p>Pick one change and write down what you would measure before and after.</p><a href="../replay/">Try a vehicle experiment</a> <a href="../articles/traction-circle/#try-it">Understand braking and cornering grip</a></section>' : ''}
  </section>`;
}

export function exampleGarage() {
  return `<section class="shell workspace garage-page" data-garage-palette="neutral">
    <header class="page-title"><p class="eyebrow">ESS-created demonstration</p><h1>The corner-entry project</h1>
      <p class="lede">A sample Garage organized around one question. How does the same car behave when you brake later into the turn?</p></header>
    <div class="garage-overview">
      <section class="panel content-panel"><h2>Reference vehicle</h2><p>1990 Mazda MX-5 Miata. Start with the documented factory setup.</p>
        <a href="../vehicles/1990-mazda-mx-5-miata-1-6-base-manual-m5-us/">Explore exact vehicle specifications</a></section>
      <section class="panel content-panel"><h2>Development objective</h2><p>Understand a change in technique before comparing tires or suspension parts.</p>
        <a href="../plan/#model-before-you-spend">Open the build guide</a></section>
    </div>
    <section class="panel content-panel"><h2>Experiment to run</h2><p>Compare straight-line braking with trail braking in a modeled corner. You can save the resulting experiment in your own Garage.</p>
      <a class="button primary" href="../replay/?car=miata#entry">Run the corner-entry comparison</a></section>
    <section class="panel content-panel"><h2>Question to investigate</h2><p>How much grip is still available for steering when the tires are braking?</p>
      <a href="../articles/traction-circle/#try-it">Explore the traction circle</a></section>
    <a class="button secondary" href="./#garage">Open my Garage</a>
  </section>`;
}
