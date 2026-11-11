// Local persistence. Everything stays in this browser (localStorage); nothing
// is ever sent to a server. If storage is unavailable (private mode, blocked
// site data) the game keeps working in memory for the session.

const PREFIX = 'esl-social-life.v1';
const memory = new Map();
let storageOk = true;

function raw() {
  try {
    const t = '__esl_probe__';
    window.localStorage.setItem(t, '1');
    window.localStorage.removeItem(t);
    return window.localStorage;
  } catch {
    storageOk = false;
    return null;
  }
}
const ls = typeof window !== 'undefined' ? raw() : null;

export function storageAvailable() { return storageOk && !!ls; }

function get(key) {
  try {
    const v = ls ? ls.getItem(`${PREFIX}.${key}`) : memory.get(key);
    return v ? JSON.parse(v) : null;
  } catch (err) {
    console.warn('[store] read failed', key, err);
    return null;
  }
}

function set(key, value) {
  const text = JSON.stringify(value);
  try {
    if (ls) ls.setItem(`${PREFIX}.${key}`, text);
    else memory.set(key, text);
    return true;
  } catch (err) {
    console.warn('[store] write failed', key, err);
    memory.set(key, text);
    return false;
  }
}

function del(key) {
  try { if (ls) ls.removeItem(`${PREFIX}.${key}`); } catch { /* ignore */ }
  memory.delete(key);
}

// Class (teacher roster + generated fictional NPC profiles + settings).
export const loadClass = () => get('class');
export const saveClass = (cls) => set('class', cls);

// Player profiles on this device.
export const listProfiles = () => get('profiles') || [];
export const saveProfiles = (list) => set('profiles', list);

export function upsertProfile(meta) {
  const list = listProfiles().filter((p) => p.id !== meta.id);
  list.unshift(meta);
  saveProfiles(list);
}

export const loadSave = (id) => get(`save.${id}`);
export function writeSave(save) {
  save.updatedAt = Date.now();
  const ok = set(`save.${save.id}`, save);
  return ok;
}

export function deleteProfile(id) {
  del(`save.${id}`);
  del(`photos.${id}`);
  saveProfiles(listProfiles().filter((p) => p.id !== id));
}

// Memory photos are small JPEG data URLs, capped so they never crowd out saves.
const MAX_PHOTOS = 36;
export const loadPhotos = (id) => get(`photos.${id}`) || [];
export function addPhoto(id, photo) {
  let photos = [photo, ...loadPhotos(id)].slice(0, MAX_PHOTOS);
  while (photos.length && !set(`photos.${id}`, photos)) photos = photos.slice(0, Math.floor(photos.length * 0.7));
  return photos;
}

export function exportAll() {
  const out = { app: 'esl-social-life', version: 1, class: loadClass(), profiles: listProfiles(), saves: {} };
  for (const p of out.profiles) out.saves[p.id] = loadSave(p.id);
  return out;
}

export function importAll(data) {
  if (!data || data.app !== 'esl-social-life') throw new Error('Not an ESL Social Life file');
  if (data.class) saveClass(data.class);
  if (Array.isArray(data.profiles)) saveProfiles(data.profiles);
  for (const [id, s] of Object.entries(data.saves || {})) if (s) set(`save.${id}`, s);
}

export function resetEverything() {
  for (const p of listProfiles()) deleteProfile(p.id);
  del('class');
  del('profiles');
}
