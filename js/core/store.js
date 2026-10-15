// CourtMixer - storage layer (Phase 1, v1.9.1): Store (raw key/value) and Docs (sync-ready documents)
// Every localStorage access in the app goes through Store. Keys and value formats are the
// ones social mode has always used, so existing users need no migration.

/* ===== Store: low-level key/value access ===== */
// localStorage can THROW on read as well as write (data: URLs, sandboxed frames, some
// privacy modes). An unguarded read at the top of the script used to abort the whole file
// and leave a blank shell, so every method here catches and degrades instead.
const Store = (function () {
  let backend = null; // null = the real localStorage; self-tests swap in a mock
  function ls() { return backend || window.localStorage; }
  function get(key) { try { return ls().getItem(key); } catch (e) { return null; } }
  function set(key, val) { try { ls().setItem(key, String(val)); return true; } catch (e) { return false; } }
  function remove(key) { try { ls().removeItem(key); return true; } catch (e) { return false; } }
  function getJSON(key, fallback) {
    const s = get(key);
    if (s === null || s === undefined) return fallback;
    try { return JSON.parse(s); } catch (e) { return fallback; }
  }
  function setJSON(key, value) {
    let s;
    try { s = JSON.stringify(value); } catch (e) { return false; }
    return s === undefined ? false : set(key, s);
  }
  function keys(prefix) {
    const out = [];
    try {
      const s = ls();
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (k !== null && (!prefix || k.indexOf(prefix) === 0)) out.push(k);
      }
    } catch (e) { return []; }
    return out.sort();
  }
  function available() {
    try { const s = ls(), k = "courtmixer__probe"; s.setItem(k, "1"); s.removeItem(k); return true; } catch (e) { return false; }
  }
  // Test hook: swap the backing storage, returns the previous one (null = real localStorage).
  function _useBackend(b) { const prev = backend; backend = b || null; return prev; }
  return { get, set, remove, getJSON, setJSON, keys, available, _useBackend };
})();

/* ===== Docs: whole documents with sync metadata, ready for cloud sync (Phase 7) ===== */
// Doc keys: "social" (the social session) and "comp:<id>" (one per competition).
const Docs = (function () {
  const META_KEY = "courtmixer_sync_meta";
  const COMP_PREFIX = "courtmixer_comp_";
  // courtmixer_comp_index and courtmixer_comp_active share the prefix, so those ids are reserved.
  const RESERVED_COMP_IDS = ["index", "active"];
  const KEY_RE = /^(social|comp:[A-Za-z0-9-]{1,64})$/;

  function valid(docKey) {
    return typeof docKey === "string" && KEY_RE.test(docKey) &&
      RESERVED_COMP_IDS.indexOf(docKey.slice(5)) === -1;
  }
  function compStoreKey(docKey) { return COMP_PREFIX + docKey.slice(5); }

  function list() {
    const out = ["social"];
    Store.keys(COMP_PREFIX).forEach(function (k) {
      const dk = "comp:" + k.slice(COMP_PREFIX.length);
      if (valid(dk)) out.push(dk);
    });
    return out;
  }

  // Social: the export payload (unchanged, so codes and backups stay compatible) plus a
  // "local" block with the state an export deliberately leaves out, so a round trip is lossless.
  function getSocial() {
    const data = buildSessionPayload();
    const flags = {};
    players.forEach(function (p) {
      flags[p.id] = { priority: !!p.priority, skip: !!p.skip, priorityLock: !!p.priorityLock, skipLock: !!p.skipLock };
    });
    data.local = {
      courtSlots: JSON.parse(JSON.stringify(courtSlots)),
      courtSlotManual: JSON.parse(JSON.stringify(courtSlotManual)),
      courtMode: JSON.parse(JSON.stringify(courtMode)),
      customDefaults: customDefaults ? JSON.parse(JSON.stringify(customDefaults)) : null,
      flags: flags
    };
    return data;
  }

  // Applies through the tested import path, silently: no confirm, no toast, no alert.
  function putSocial(data) {
    if (!data || data.app !== "CourtMixer" || !Array.isArray(data.players)) return false;
    const _alert = cmxAlert;
    cmxAlert = function () {};
    try { doApplyBackup(data); } finally { cmxAlert = _alert; }
    const loc = data.local;
    if (loc && typeof loc === "object") {
      const slot = (x) => (typeof x === "string" && x) ? x : null;
      const flag = (x) => x === true;
      courtSlots = EMPTY_SLOTS(); courtSlotManual = EMPTY_MANUAL();
      for (let c = 1; c <= MAX_COURTS; c++) {
        const r1 = loc.courtSlots && loc.courtSlots[c], r2 = loc.courtSlotManual && loc.courtSlotManual[c];
        if (Array.isArray(r1) && r1.length === 4) courtSlots[c] = r1.map(slot);
        if (Array.isArray(r2) && r2.length === 4) courtSlotManual[c] = r2.map(flag);
      }
      const cm = loc.courtMode;
      courtMode = (cm && typeof cm === "object") ? { 1: cm[1] || "", 2: cm[2] || "", 3: cm[3] || "", 4: cm[4] || "" } : { 1: "", 2: "", 3: "", 4: "" };
      const f = (loc.flags && typeof loc.flags === "object") ? loc.flags : {};
      players.forEach(function (p) {
        const v = f[p.id];
        if (v) { p.priority = !!v.priority; p.skip = !!v.skip; p.priorityLock = !!v.priorityLock; p.skipLock = !!v.skipLock; }
      });
      customDefaults = Array.isArray(loc.customDefaults)
        ? loc.customDefaults.map(p => ({ name: p.name, gender: p.gender === "F" ? "F" : "M", skill: normSkillData(p.skill) }))
        : null;
      if (customDefaults) Store.setJSON("courtmixer_custom_defaults", customDefaults); else Store.remove("courtmixer_custom_defaults");
      save(); saveCourts();
      updateDefaultButtons(); renderPlayers(); renderMatch();
    }
    return true;
  }

  function get(docKey) {
    if (!valid(docKey)) return null;
    if (docKey === "social") return getSocial();
    return Store.getJSON(compStoreKey(docKey), null);
  }
  function put(docKey, data) {
    if (!valid(docKey)) return false;
    if (docKey === "social") return putSocial(data);
    if (!data || typeof data !== "object") return false;
    return Store.setJSON(compStoreKey(docKey), data);
  }
  function remove(docKey) {
    if (!valid(docKey) || docKey === "social") return false;
    Store.remove(compStoreKey(docKey));
    const all = readMeta();
    if (all[docKey]) { delete all[docKey]; Store.setJSON(META_KEY, all); }
    return true;
  }

  function readMeta() {
    const m = Store.getJSON(META_KEY, {});
    return (m && typeof m === "object" && !Array.isArray(m)) ? m : {};
  }
  function meta(docKey) {
    const m = readMeta()[docKey] || {};
    return {
      updatedAt: Number(m.updatedAt) || 0,
      localVersion: Number(m.localVersion) || 0,
      serverVersion: Number(m.serverVersion) || 0,
      dirty: !!m.dirty,
      deleted: !!m.deleted,
      hash: typeof m.hash === "string" ? m.hash : ""
    };
  }
  // For the sync client (Phase 7): merge fields into a doc's metadata.
  function setMeta(docKey, patch) {
    if (!valid(docKey)) return false;
    const all = readMeta();
    all[docKey] = Object.assign(meta(docKey), patch || {});
    return Store.setJSON(META_KEY, all);
  }

  // For the sync client: forget a doc's metadata (after its cloud copy is deleted).
  function dropMeta(docKey) {
    const all = readMeta();
    if (all[docKey]) { delete all[docKey]; return Store.setJSON(META_KEY, all); }
    return true;
  }
  function allMeta() { return readMeta(); }

  return { list, get, put, remove, meta, setMeta, dropMeta, allMeta, valid };
})();
