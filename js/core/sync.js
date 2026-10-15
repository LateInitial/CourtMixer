// CourtMixer - cloud sync client (spec §16.5). Offline-first: everything is saved on the device
// first and the cloud is a background copy. Documents are "social" and "comp:<id>"; their sync
// state lives in Docs meta (serverVersion, dirty, deleted). The sync code is the only credential.

const Sync = (function () {
  "use strict";
  const CFG_KEY = "courtmixer_sync";
  const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";   // Crockford Base32
  const PUSH_QUIET_MS = 4000, PUSH_GAP_MS = 10000, POLL_MS = 120000;
  const BACKOFF = [10000, 30000, 120000, 300000];
  const MAX_DATA = 256 * 1024;

  let available = null;          // /api/health answered (null = not checked yet)
  let applying = false;          // applying a cloud copy: its saves are not changes to push
  let state = "off";             // off | syncing | ok | offline | paused | full | error
  let lastSync = 0, failures = 0, retryTimer = null, pollTimer = null, pulling = null;
  const timers = {}, lastPush = {}, inflight = {}, listeners = [];
  const conflicts = [];
  let conflictOpen = false, openKey = null;
  const deferred = {};   // conflicts left undecided: no uploads for them until the next pull asks again

  /* ===== Codes ===== */
  function normalise(raw) { return String(raw || "").toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1"); }
  function valid(code) { return /^[0-9A-HJKMNP-TV-Z]{20}$/.test(code); }
  function format(code) { return (code.match(/.{1,4}/g) || []).join("-"); }
  // 100 random bits -> 20 Crockford characters
  function generate() {
    const bytes = new Uint8Array(13);
    crypto.getRandomValues(bytes);
    let bits = "";
    bytes.forEach(b => { bits += b.toString(2).padStart(8, "0"); });
    let out = "";
    for (let i = 0; i < 20; i++) out += ALPHABET[parseInt(bits.slice(i * 5, i * 5 + 5), 2)];
    return out;
  }

  /* ===== Settings ===== */
  function cfg() { const c = Store.getJSON(CFG_KEY, null); return c && typeof c === "object" && valid(c.code) ? c : null; }
  function code() { const c = cfg(); return c && c.on ? c.code : null; }
  function isOn() { return !!code(); }

  /* ===== Status ===== */
  function setState(s) { state = s; listeners.forEach(fn => { try { fn(); } catch (e) { /* a listener's problem */ } }); }
  function onChange(fn) { listeners.push(fn); }
  function ago(ms) {
    const m = Math.round((Date.now() - ms) / 60000);
    return m < 1 ? t("sync.justNow") : m < 60 ? t("sync.minAgo", { n: m }) : t("sync.hAgo", { n: Math.round(m / 60) });
  }
  function statusText() {
    if (!isOn()) return t("sync.statusOff");
    if (state === "syncing") return t("sync.syncing");
    if (state === "offline") return t("sync.offline");
    if (state === "paused") return t("sync.paused");
    if (state === "full") return t("sync.full");
    if (state === "error") return t("sync.error");
    return lastSync ? t("sync.synced", { ago: ago(lastSync) }) : t("sync.waiting");
  }
  // Shown at all? Off and no server (GitHub Pages, a downloaded file): nothing to offer.
  function visible() { return available === true || isOn(); }

  /* ===== Network ===== */
  function request(method, path, body) {
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = setTimeout(() => { if (ctl) ctl.abort(); }, 15000);
    const opts = { method, headers: { Authorization: "Bearer " + code() }, cache: "no-store", signal: ctl ? ctl.signal : undefined };
    if (body !== undefined) { opts.headers["content-type"] = "application/json"; opts.body = JSON.stringify(body); }
    return fetch("/api" + path, opts).then(function (r) {
      clearTimeout(timer);
      return r.json().catch(() => null).then(b => ({ status: r.status, body: b }));
    }, function (e) { clearTimeout(timer); throw e; });
  }
  const docPath = (k) => "/docs/" + encodeURIComponent(k);
  function health() {
    if (typeof location === "undefined" || !/^https?:$/.test(location.protocol) || typeof fetch !== "function") { available = false; return Promise.resolve(false); }
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    setTimeout(() => { if (ctl) ctl.abort(); }, 6000);
    return fetch("/api/health", { cache: "no-store", signal: ctl ? ctl.signal : undefined })
      .then(r => r.ok ? r.json() : null).then(b => { available = !!(b && b.ok); return available; }, () => { available = false; return false; });
  }

  // Network trouble: try again after 10 s, 30 s, 2 min, then every 5 min.
  function retryLater(kind) {
    setState(kind || "offline");
    clearTimeout(retryTimer);
    retryTimer = setTimeout(pull, BACKOFF[Math.min(failures, BACKOFF.length - 1)]);
    failures++;
  }
  function handleStatus(r) {
    if (r.status === 429) { retryLater(r.body && r.body.error === "daily_limit" ? "paused" : "offline"); return true; }
    if (r.status === 401 || r.status === 503 || r.status >= 500) { retryLater("error"); return true; }
    return false;
  }

  /* ===== Local documents ===== */
  function localKeys() {
    const keys = ["social"];
    if (typeof CompStore !== "undefined") CompStore.list().forEach(e => { const k = "comp:" + e.id; if (Docs.valid(k)) keys.push(k); });
    return keys;
  }
  function getLocal(k) {
    if (k === "social") return Docs.get("social");
    const d = CompStore.load(k.slice(5));
    return d ? JSON.parse(JSON.stringify(d)) : null;
  }
  // Compared without the fields that change on every save, to spot copies that are really the same.
  const strip = (x) => { const c = JSON.parse(JSON.stringify(x || {})); delete c.exportedAt; delete c.updatedAt; return JSON.stringify(c); };
  function sameContent(a, b) { return strip(a) === strip(b); }
  // Fingerprint of a document as last synced: a save that changes nothing is not a change.
  function fp(doc) { return doc ? String(hashString(strip(doc))) : ""; }
  function changed(k) {
    const m = Docs.meta(k);
    if (!m.dirty) return false;
    if (m.deleted || !m.hash || !m.serverVersion) return true;   // a fingerprint only counts against a known cloud copy
    const doc = getLocal(k);
    if (doc && fp(doc) === m.hash) { Docs.setMeta(k, { dirty: false }); return false; }
    return true;
  }
  function unpack(data) {
    try { return JSON.parse(LZString.decompressFromBase64(data)); } catch (e) { return null; }
  }
  // A cloud copy is applied quietly: nothing it saves is pushed back.
  function applyLocal(k, doc) {
    applying = true;
    try {
      if (k === "social") {
        const ok = Docs.put("social", doc);
        if (ok && typeof _undo !== "undefined") _undo = null;   // an undo would bring back the old copy
        return ok;
      }
      if (!doc || doc.id !== k.slice(5) || (typeof CompShare !== "undefined" && CompShare.safe && !CompShare.safe(doc))) return false;
      CompStore.putSynced(CompModel.migrate(doc));
      if (typeof CompShell !== "undefined" && CompShell.syncedFromCloud) CompShell.syncedFromCloud(doc.id);
      return true;
    } finally { applying = false; }
  }
  function removeLocal(k) {
    applying = true;
    try { CompStore.remove(k.slice(5)); } finally { applying = false; }
    Docs.dropMeta(k);
  }
  function refreshUI() { if (typeof CompShell !== "undefined" && CompStore.getMode() === "competition") CompShell.render(); }

  /* ===== Changes on this device ===== */
  // Nothing is recorded while sync is off (social storage stays exactly as before); turning it on
  // marks every document for upload.
  function markDirty(docKey) {
    if (applying || !isOn() || !Docs.valid(docKey)) return;
    const m = Docs.meta(docKey);
    Docs.setMeta(docKey, { dirty: true, deleted: false, updatedAt: Date.now(), localVersion: m.localVersion + 1 });
    schedule(docKey);
  }
  function markDeleted(docKey, serverVersion, localVersion) {
    if (applying || !isOn() || !Docs.valid(docKey)) return;
    Docs.setMeta(docKey, { dirty: true, deleted: true, updatedAt: Date.now(), serverVersion: Number(serverVersion) || 0, localVersion: (Number(localVersion) || 0) + 1 });
    schedule(docKey);
  }
  // 4 s after the last change, and at most one push per document every 10 s.
  function schedule(k) {
    if (!isOn()) return;
    clearTimeout(timers[k]);
    const wait = Math.max(PUSH_QUIET_MS, (lastPush[k] || 0) + PUSH_GAP_MS - Date.now());
    timers[k] = setTimeout(() => push(k), wait);
  }

  function push(k) {
    if (!isOn() || inflight[k] || deferred[k]) return Promise.resolve();
    if (!changed(k)) return Promise.resolve();
    const m = Docs.meta(k);
    lastPush[k] = Date.now();
    inflight[k] = true;
    const done = () => { inflight[k] = false; };
    if (m.deleted) {
      if (!m.serverVersion) { Docs.dropMeta(k); done(); return Promise.resolve(); }
      // deleted only if nobody changed it since this device last saw it; otherwise ask
      return request("DELETE", docPath(k) + "?baseVersion=" + m.serverVersion).then(function (r) {
        done();
        if (r.status === 409 && r.body) return queueConflict(k, r.body, "deletedHere");
        if (handleStatus(r)) return;
        Docs.dropMeta(k); synced();
      }, function () { done(); retryLater(); });
    }
    const doc = getLocal(k);
    if (!doc) { Docs.dropMeta(k); done(); return Promise.resolve(); }
    const data = LZString.compressToBase64(JSON.stringify(doc));
    if (data.length > MAX_DATA) { done(); setState("full"); return Promise.resolve(); }
    setState("syncing");
    return request("PUT", docPath(k), { data, baseVersion: m.serverVersion }).then(function (r) {
      done();
      if (r.status === 200 && r.body) {
        const now = Docs.meta(k);
        // changed again while this was on its way: stays dirty and goes again
        const again = now.localVersion !== m.localVersion || now.deleted;   // changed or deleted while on its way
        Docs.setMeta(k, { serverVersion: r.body.version, dirty: again, hash: fp(doc) });
        if (again) schedule(k);
        synced();
        return;
      }
      if (r.status === 409 && r.body) return conflict(k, r.body);
      if (r.status === 413) { setState("full"); return; }
      handleStatus(r) || retryLater("error");
    }, function () { done(); retryLater(); });
  }
  function synced() { failures = 0; lastSync = Date.now(); setState("ok"); }

  /* ===== Changes from the cloud ===== */
  function pull() {
    if (!isOn()) { setState("off"); return Promise.resolve(); }
    if (pulling) return pulling;
    clearTimeout(retryTimer);
    if (typeof CompStore !== "undefined") CompStore.flush();   // edits still waiting to be written count as changes
    Object.keys(deferred).forEach(k => { delete deferred[k]; });  // undecided conflicts are asked again
    setState("syncing");
    pulling = request("GET", "/docs").then(function (r) {
      if (handleStatus(r)) return;
      if (r.status !== 200 || !Array.isArray(r.body)) { retryLater("error"); return; }
      const server = {};
      r.body.forEach(d => { if (d && Docs.valid(d.docKey)) server[d.docKey] = d; });
      const local = localKeys(), metaAll = Docs.allMeta();
      const jobs = [];
      // The whole cloud copy is gone (deleted from another device): keep everything here, stop syncing.
      const hadCloud = Object.keys(metaAll).some(k => (Number(metaAll[k].serverVersion) || 0) > 0);
      if (!r.body.length && hadCloud) { cloudGone(); return; }
      Object.keys(server).forEach(function (k) {
        if (inflight[k]) return;   // our own upload is on its way: its answer settles it
        const s = server[k], exists = k === "social" || local.indexOf(k) !== -1;
        const dirty = changed(k), m = Docs.meta(k);
        if (s.version <= m.serverVersion) return;
        if (m.deleted && m.dirty) { jobs.push(fetchDoc(k).then(cloud => cloud && queueConflict(k, { version: s.version, updatedAt: s.updatedAt, data: cloud.data }, "deletedHere"))); return; }
        if (!dirty || !exists) { const lv = m.localVersion; jobs.push(fetchDoc(k).then(cloud => cloud && takeCloud(k, cloud, lv))); }
        else jobs.push(fetchDoc(k).then(cloud => cloud && conflict(k, cloud)));
      });
      local.forEach(function (k) {
        const m = Docs.meta(k);
        if (server[k] || inflight[k]) return;
        if (m.serverVersion > 0 && !m.dirty && k !== "social") { removeLocal(k); refreshUI(); toast(t("sync.deletedElsewhere")); return; }
        if (!m.serverVersion && !m.dirty) Docs.setMeta(k, { dirty: true });   // made while sync was off
      });
      return Promise.all(jobs).then(function () {
        localKeys().concat(Object.keys(Docs.allMeta())).forEach(k => { if (Docs.meta(k).dirty && !inflight[k]) jobs.push(push(k)); });
        return Promise.all(jobs);
      }).then(function () { if (state === "syncing") synced(); });
    }, function () { retryLater(); }).then(function () { pulling = null; }, function () { pulling = null; });
    return pulling;
  }
  function fetchDoc(k) {
    return request("GET", docPath(k)).then(r => r.status === 200 && r.body && typeof r.body.data === "string" ? r.body : null, () => null);
  }
  // lv: this device's change counter when the download started; an edit made since then is not
  // overwritten but becomes a conflict.
  function takeCloud(k, cloud, lv) {
    if (typeof CompStore !== "undefined") CompStore.flush();
    if (lv !== undefined && (Docs.meta(k).localVersion !== lv || changed(k))) return conflict(k, cloud);
    if (k === "social" && socialBusy()) { setTimeout(pull, 15000); return; }   // later: don't wipe scores being typed
    const doc = unpack(cloud.data);
    if (!doc || !applyLocal(k, doc)) return;
    Docs.setMeta(k, { serverVersion: cloud.version, dirty: false, deleted: false, hash: fp(getLocal(k)) });
    refreshUI();
  }
  // Social mode has unsaved input on screen: a picked score, an edited result, a player being edited.
  function socialBusy() {
    if (typeof document === "undefined") return false;
    if (typeof editingId !== "undefined" && editingId) return true;
    if (document.querySelector(".history-item.dirty")) return true;
    return Array.prototype.some.call(document.querySelectorAll("input.pair-score, .score-entry input.score-pick"), el => el.value !== "");
  }
  function cloudGone() {
    turnOff(true);
    if (typeof cmxAlert === "function") cmxAlert(t("sync.cloudGone"));
  }

  /* ===== Conflicts (§16.5) ===== */
  function conflict(k, cloud) {
    // an identical copy is no conflict at all
    if (cloud.data) {
      const doc = unpack(cloud.data), mine = getLocal(k);
      if (doc && mine && sameContent(doc, mine)) { Docs.setMeta(k, { serverVersion: cloud.version, dirty: false, hash: fp(mine) }); if (state === "syncing") synced(); return; }
    }
    queueConflict(k, cloud, cloud.data ? "both" : "deletedCloud");
  }
  function queueConflict(k, cloud, kind) {
    if (state === "syncing") setState("ok");   // waiting on a decision, not on the network
    if (openKey === k || conflicts.some(c => c.k === k)) return;  // already asked
    conflicts.push({ k, cloud, kind });
    nextConflict();
  }
  function describe(k, doc, otherDoc) {
    if (!doc) return "";
    if (k === "social") return t("sync.socialCount", { n: (doc.history || []).length, p: (doc.players || []).length });
    const n = t("sync.compCount", { n: (doc.matches || []).filter(x => x.status === "done").length });
    return otherDoc && otherDoc.name !== doc.name ? "“" + (doc.name || "") + "” · " + n : n;   // renamed on one side
  }
  function nextConflict() {
    if (conflictOpen || !conflicts.length || typeof cmxShowModal !== "function") return;
    const c = conflicts.shift(), k = c.k;
    conflictOpen = true; openKey = k;
    const mine = getLocal(k), cloudDoc = c.cloud.data ? unpack(c.cloud.data) : null, meta = Docs.meta(k);
    const name = k === "social" ? t("sync.socialName") : ((mine || cloudDoc || {}).name || t("comp.untitled"));
    const when = (ms) => ms ? new Date(ms).toLocaleString() : t("sync.notSynced");
    const lines = c.kind === "deletedCloud" ? [t("sync.conflict.deletedCloud", { name })]
      : c.kind === "deletedHere" ? [t("sync.conflict.deletedHere", { name })]
      : [t("sync.conflict.text", { name }), t("sync.conflict.mine", { when: when(meta.updatedAt), what: describe(k, mine, cloudDoc) }), t("sync.conflict.cloud", { when: when(c.cloud.updatedAt), what: describe(k, cloudDoc, mine) })];
    const close = () => { conflictOpen = false; openKey = null; setTimeout(nextConflict, 0); };
    const buttons = [];
    if (c.kind === "deletedHere") {
      buttons.push({ label: t("sync.conflict.deleteIt"), cls: "danger", onClick: function () { Docs.setMeta(k, { serverVersion: c.cloud.version }); push(k); close(); } });
      buttons.push({ label: t("sync.conflict.keepCloud"), cls: "primary", onClick: function () { takeCloud(k, c.cloud); close(); } });
    } else {
      buttons.push({ label: t("sync.conflict.useMine"), cls: "primary", onClick: function () { Docs.setMeta(k, { serverVersion: c.cloud.version || 0, dirty: true, deleted: false }); push(k); close(); } });
      if (c.kind === "deletedCloud") buttons.push({ label: t("sync.conflict.deleteHere"), cls: "danger", onClick: function () { if (k === "social") return close(); removeLocal(k); refreshUI(); close(); } });
      else {
        buttons.push({ label: t("sync.conflict.useCloud"), cls: "secondary", onClick: function () { takeCloud(k, c.cloud); close(); } });
        if (k !== "social") buttons.push({ label: t("sync.conflict.keepBoth"), cls: "secondary", onClick: function () {
          // this device's copy becomes a new competition; the cloud copy takes the original id
          const copy = getLocal(k);
          if (copy) { copy.id = uid(); copy.name = t("sync.thisDeviceName", { name: copy.name || t("comp.untitled") }); CompStore.save(copy); CompStore.flush(); }
          takeCloud(k, c.cloud); close();
        } });
      }
    }
    cmxShowModal({ title: t("sync.conflict.title"), bodyHTML: lines.map(l => '<p class="cmx-modal-text">' + esc(l) + "</p>").join(""), buttons,
      onOpen: function (box) {
        // closed without choosing: decide later (it comes back at the next sync)
        const later = function () { cmxCloseModal(); deferred[k] = true; conflictOpen = false; openKey = null; setTimeout(nextConflict, 0); };
        const x = box.querySelector(".cmx-modal-x"), o = document.getElementById("cmxModal");
        if (x) x.onclick = later;
        if (o) o.onclick = function (e) { if (e.target === o) later(); };
      } });
  }

  /* ===== Turning it on and off ===== */
  // New code: everything on this device is uploaded.
  function turnOn() {
    const c = generate();
    Store.setJSON(CFG_KEY, { code: c, on: true });
    localKeys().forEach(k => Docs.setMeta(k, { serverVersion: 0, dirty: true, deleted: false, hash: "" }));
    failures = 0; startPolling(); pull();
    return c;
  }
  // An existing code: cloud copies come down, this device's competitions go up. A social session
  // that is still empty here simply takes the cloud copy; otherwise the conflict dialog asks.
  function useCode(raw) {
    const c = normalise(raw);
    if (!valid(c)) return false;
    Store.setJSON(CFG_KEY, { code: c, on: true });
    const emptySocial = typeof players !== "undefined" && !players.length && !(matchHistory || []).length;
    localKeys().forEach(k => Docs.setMeta(k, { serverVersion: 0, dirty: !(k === "social" && emptySocial), deleted: false, hash: "" }));
    failures = 0; startPolling(); pull();
    return true;
  }
  // Off on this device only; the cloud copy stays for the other devices.
  function turnOff(quiet) {
    Store.remove(CFG_KEY);
    Object.keys(timers).forEach(k => clearTimeout(timers[k]));
    clearTimeout(retryTimer); clearInterval(pollTimer); pollTimer = null;
    Object.keys(Docs.allMeta()).forEach(k => Docs.setMeta(k, { serverVersion: 0, deleted: false, hash: "" }));
    setState("off");
    if (!quiet) toast(t("sync.turnedOff"));
  }
  function deleteCloud() {
    if (!isOn()) return Promise.resolve(false);
    return request("DELETE", "/account").then(function (r) {
      if (r.status !== 200) return false;
      turnOff(true);
      return true;
    }, () => false);
  }
  function toast(msg) { if (typeof showToast === "function") showToast(esc(msg)); }

  /* ===== Start-up and polling ===== */
  function startPolling() {
    clearInterval(pollTimer);
    pollTimer = setInterval(function () { if (document.visibilityState === "visible") pull(); }, POLL_MS);
  }
  function init() {
    return health().then(function () {
      setState(isOn() ? "ok" : "off");
      if (!isOn()) return;
      startPolling();
      return pull();
    });
  }
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible" && isOn()) pull(); });
  }

  return { markDirty, markDeleted, init, pull, push, turnOn, useCode, turnOff, deleteCloud, isOn, code: () => code(), statusText, onChange, visible,
    normalise, valid, format, generate, get available() { return available; }, get state() { return state; },
    _health: health, _setAvailable: function (v) { available = v; } };
})();
