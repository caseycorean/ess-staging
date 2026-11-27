// Local companion to the existing configuration store. Activities reference the same share codecs.
const key = 'ess.workspace.v1';
const root = new URL('../', import.meta.url);
const maxStorage = 245000;
const maxPhoto = 150000;
const maxSaved = 20;
const maxRecent = 6;
export const palettes = {neutral:'Neutral', sage:'Sage', graphite:'Graphite blue'};
export const vehicleRoles = {owned:'Owned vehicle', reference:'Reference vehicle', aspirational:'Wish list'};
const study = 'articles/traction-circle/';
const blank = () => ({version:1, saved:[], recent:[], projects:{}, name:null, palette:'neutral', showRecent:true, photo:''});

function short(value, limit) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function reference(kind, href) {
  try {
    const url = new URL(href, root);
    if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname) || url.hash.length > 32768) return '';
    const route = url.pathname.slice(root.pathname.length);
    if (kind === 'replay' && route === 'replay/' && /^#r=[A-Za-z0-9_-]+$/.test(url.hash)) return route + url.hash;
    if (kind === 'comparison' && route === 'experience/' && /^#v2\/compare\/[A-Za-z0-9_-]+$/.test(url.hash)) return route + url.hash;
    if (kind === 'component' && route === 'experience/' && /^#v2\/build\/[A-Za-z0-9_-]+$/.test(url.hash)) {
      return route + '?inspect=components' + url.hash;
    }
    if (kind === 'question' && route === study) return study + '#try-it';
  } catch { /* A saved reference can only point at supported ESS experiences. */ }
  return '';
}

function cleanItems(rows, limit) {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, limit).flatMap(row => {
    const path = reference(row?.kind, row?.path);
    const title = short(row?.title, 110);
    const id = short(row?.id, 80);
    return path && title && /^[a-zA-Z0-9-]+$/.test(id) ? [{id, path, title, kind:row.kind}] : [];
  });
}
const validKey = id => typeof id === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(id);
const validPhoto = uri => typeof uri === 'string' && uri.length <= maxPhoto && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(uri);
function read() {
  const raw = localStorage.getItem(key);
  if (raw === null) return blank();
  const data = JSON.parse(raw);
  if (data?.version !== 1) throw new Error('Unsupported workspace');
  const projects = Object.fromEntries(Object.entries(data.projects ?? {}).slice(0,50).filter(([id]) => validKey(id)).map(([id, p]) => [
    id, {role:Object.hasOwn(vehicleRoles,p?.role) ? p.role : 'reference', title:short(p?.title,60), note:short(p?.note,220)}
  ]));
  return {version:1, name:data.name == null ? null : short(data.name,44), saved:cleanItems(data.saved,maxSaved), recent:cleanItems(data.recent,maxRecent), projects,
    palette:Object.hasOwn(palettes,data.palette) ? data.palette : 'neutral', showRecent:data.showRecent !== false,
    photo:validPhoto(data.photo) ? data.photo : ''};
}

export function getWorkspace() {
  try { return read(); } catch { return blank(); }
}

function update(fn) {
  try {
    const data = read();
    const issue = fn(data);
    if (issue === false) return {ok:true};
    if (issue) return {ok:false, issue};
    const json = JSON.stringify(data);
    if (json.length > maxStorage) return {ok:false, issue:'Garage storage limit reached. Remove an activity or the photo and try again.'};
    localStorage.setItem(key,json);
    return {ok:true};
  } catch {
    return {ok:false, issue:'This browser could not save to My Garage. Your current work is still open.'};
  }
}

export function workspaceHref(path) { return new URL(path,root).href; }

export function saveActivity(kind, title, href, recent = false) {
  const path = reference(kind,href);
  const label = short(title,110);
  if (!path || !label) return {ok:false, issue:'This activity could not be saved.'};
  const list = recent ? 'recent' : 'saved';
  return update(data => {
    if (recent && !data.showRecent) return false;
    const existing = data[list].find(item => item.path === path);
    if (!recent && !existing && data.saved.length >= maxSaved) return '20 activities saved. Remove one in My Garage to make room.';
    const rows = data[list].filter(item => item.path !== path);
    const id = existing?.id ?? globalThis.crypto?.randomUUID?.() ?? Date.now() + '-' + Math.random().toString(36).slice(2);
    data[list] = [{id, path, title:label, kind}, ...rows].slice(0,recent ? maxRecent : maxSaved);
  });
}

export function removeActivity(id) {
  return update(data => { data.saved = data.saved.filter(item => item.id !== id); });
}

export function saveProject(id, project) {
  if (!validKey(id) || !Object.hasOwn(vehicleRoles,project.role)) return {ok:false, issue:'Choose a vehicle role.'};
  return update(data => {
    if (!Object.hasOwn(data.projects,id) && Object.keys(data.projects).length >= 50) return 'The project note limit is reached.';
    data.projects[id] = {role:project.role, title:short(project.title,60), note:short(project.note,220)};
  });
}

export function forgetProject(id) {
  return update(data => { delete data.projects[id]; });
}

export function updatePreferences({name, palette, showRecent, photo}) {
  if (!Object.hasOwn(palettes,palette) || (photo !== undefined && photo !== '' && !validPhoto(photo))) {
    return {ok:false, issue:'The Garage preferences could not be used.'};
  }
  return update(data => {
    data.name = short(name,44);
    data.palette = palette;
    data.showRecent = showRecent;
    if (photo !== undefined) data.photo = photo;
  });
}

export async function localPhoto(file) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
    throw new Error('Choose a JPEG, PNG or WebP up to 10 MB.');
  }
  const url = URL.createObjectURL(file);
  try {
    const photo = new Image();
    photo.src = url;
    try { await photo.decode(); }
    catch { throw new Error('This image could not be opened. Try another photo.'); }
    if (!photo.naturalWidth || !photo.naturalHeight) throw new Error('This photo has no usable dimensions.');
    if (photo.naturalWidth * photo.naturalHeight > 32000000) throw new Error('Choose a photo under 32 megapixels.');
    const scale = Math.min(1,720 / Math.max(photo.naturalWidth,photo.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1,Math.round(photo.naturalWidth * scale));
    canvas.height = Math.max(1,Math.round(photo.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser could not resize the photo.');
    context.fillStyle = '#fff';
    context.fillRect(0,0,canvas.width,canvas.height);
    context.drawImage(photo,0,0,canvas.width,canvas.height);
    let result;
    for (const quality of [.78,.6,.45,.3]) {
      result = canvas.toDataURL('image/jpeg',quality);
      if (validPhoto(result)) return result;
    }
    throw new Error('This photo is too large after resizing. Try a smaller image.');
  } finally {
    URL.revokeObjectURL(url);
  }
}
