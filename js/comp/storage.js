// CourtMixer - competition storage (Phase 2, v1.10.0), spec §12.3.
//   courtmixer_app_mode     "social" | "competition"
//   courtmixer_comp_index   [{ id, name, dateISO, status, updatedAt }]
//   courtmixer_comp_active  id
//   courtmixer_comp_<id>    the Competition document
// Documents live in memory; writes are debounced 300 ms and flushed at once when the page is
// hidden. If storage is blocked, the app warns once (same message as social mode) and keeps
// working in memory.

const CompStore = (function () {
  const MODE_KEY = "courtmixer_app_mode", INDEX_KEY = "courtmixer_comp_index", ACTIVE_KEY = "courtmixer_comp_active";
  const PREFIX = "courtmixer_comp_";
  const DEBOUNCE_MS = 300;

  let cache = {};          // id -> document
  let index = null;        // loaded lazily
  let active;              // undefined = not loaded yet
  let mode;
  const pending = {};      // id -> true (document waiting to be written)
  let indexPending = false, timer = null;

  function warnBlocked() {
    if (_storageWarned) return;
    _storageWarned = true;
    cmxAlert("This browser is blocking local storage (e.g. Private Browsing), so changes can't be saved automatically. Use Edit ▸ Export to back up your data.");
  }

  function loadIndex() {
    if (index) return index;
    const v = Store.getJSON(INDEX_KEY, []);
    index = Array.isArray(v) ? v.filter(e => e && typeof e.id === "string") : [];
    return index;
  }

  function getMode() {
    if (mode === undefined) mode = Store.get(MODE_KEY) === "competition" ? "competition" : "social";
    return mode;
  }
  function setMode(m) {
    mode = m === "competition" ? "competition" : "social";
    if (!Store.set(MODE_KEY, mode)) warnBlocked();
  }

  function list() { return loadIndex().slice(); }

  function load(id) {
    if (!id) return null;
    if (cache[id]) return cache[id];
    const doc = CompModel.migrate(Store.getJSON(PREFIX + id, null));
    if (doc) cache[id] = doc;
    return doc || null;
  }

  function getActiveId() {
    if (active === undefined) active = Store.get(ACTIVE_KEY) || null;
    if (active && !loadIndex().some(e => e.id === active)) active = null;
    return active;
  }
  function getActive() { return load(getActiveId()); }
  function setActive(id) {
    active = id || null;
    const ok = active ? Store.set(ACTIVE_KEY, active) : Store.remove(ACTIVE_KEY);
    if (!ok) warnBlocked();
  }

  // Marks the document changed and schedules a write.
  function save(comp) {
    comp.updatedAt = Date.now();
    cache[comp.id] = comp;
    const idx = loadIndex(), entry = CompModel.indexEntry(comp);
    const i = idx.findIndex(e => e.id === comp.id);
    if (i === -1) idx.push(entry); else idx[i] = entry;
    pending[comp.id] = true; indexPending = true;
    clearTimeout(timer);
    timer = setTimeout(flush, DEBOUNCE_MS);
  }

  function flush() {
    clearTimeout(timer); timer = null;
    let ok = true;
    Object.keys(pending).forEach(function (id) {
      delete pending[id];
      const doc = cache[id];
      if (!doc) return;
      if (!Store.setJSON(PREFIX + id, doc)) ok = false;
      Sync.markDirty("comp:" + id);
    });
    if (indexPending) { indexPending = false; if (!Store.setJSON(INDEX_KEY, loadIndex())) ok = false; }
    if (!ok) warnBlocked();
  }

  function remove(id) {
    delete pending[id]; delete cache[id];
    index = loadIndex().filter(e => e.id !== id);
    // Docs.remove also drops the document's sync metadata.
    if (Docs.valid("comp:" + id)) Docs.remove("comp:" + id); else Store.remove(PREFIX + id);
    if (!Store.setJSON(INDEX_KEY, index)) warnBlocked();
    if (getActiveId() === id) setActive(null);
  }

  // Puts a document back exactly as it was (used by undo).
  function restore(doc) {
    cache[doc.id] = doc;
    const idx = loadIndex(), entry = CompModel.indexEntry(doc);
    const i = idx.findIndex(e => e.id === doc.id);
    if (i === -1) idx.push(entry); else idx[i] = entry;
    pending[doc.id] = true; indexPending = true;
    flush();
  }

  // Forget everything in memory (self-tests use this to simulate a reload).
  function _reset() { clearTimeout(timer); timer = null; cache = {}; index = null; active = undefined; mode = undefined; indexPending = false; Object.keys(pending).forEach(k => delete pending[k]); }

  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") flush(); });
  }

  return { getMode, setMode, list, load, getActiveId, getActive, setActive, save, flush, remove, restore, _reset,
    KEYS: { MODE_KEY, INDEX_KEY, ACTIVE_KEY, PREFIX } };
})();
