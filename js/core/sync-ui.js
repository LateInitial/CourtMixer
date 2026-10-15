// CourtMixer - cloud sync screens (spec §16.2, §16.5) and the move from GitHub Pages (§16.6).
// Loaded after the competition scripts; everything here is hidden when the sync server isn't
// reachable and sync is off (GitHub Pages, a downloaded copy of the app).

const SyncUI = (function () {
  "use strict";
  // The Cloudflare address. Set once the new site is live; until then the old site shows no banner.
  const NEW_SITE = "";
  const OLD_HOST = "lateinitial.github.io";
  const MOVED_KEY = "courtmixer_moved_dismissed";
  const QR_SRC = "js/vendor/qrcode.js";

  const box = (html) => '<div class="sync-box">' + html + "</div>";
  const p = (text) => '<p class="cmx-modal-text">' + esc(text) + "</p>";
  const link = (c) => location.origin + location.pathname + "#sync=" + Sync.format(c);

  /* ===== The Cloud sync screen ===== */
  function open() {
    if (!Sync.isOn()) {
      cmxShowModal({ title: t("sync.title"), bodyHTML: p(t("sync.intro")) + p(t("sync.introPrivacy")), buttons: [
        { label: t("sync.turnOn"), cls: "primary", onClick: function () { const c = Sync.turnOn(); setTimeout(() => showCode(c, true), 0); } },
        { label: t("sync.useCode"), cls: "secondary", onClick: function () { setTimeout(enterCode, 0); } },
        { label: t("wiz.close"), cls: "ghost", onClick: function () {} }
      ] });
      return;
    }
    cmxShowModal({ title: t("sync.title"), bodyHTML: '<p class="cmx-modal-text"><strong id="syncStatusLine">' + esc(Sync.statusText()) + "</strong></p>" + p(t("sync.onText")), buttons: [
      { label: t("sync.syncNow"), cls: "primary", keepOpen: true, onClick: function (b) { Sync.pull().then(() => { const el = b.querySelector("#syncStatusLine"); if (el) el.textContent = Sync.statusText(); }); return false; } },
      { label: t("sync.showCode"), cls: "secondary", onClick: function () { setTimeout(() => showCode(Sync.code(), false), 0); } },
      { label: t("sync.turnOff"), cls: "secondary", onClick: function () {
        setTimeout(() => cmxConfirm({ title: t("sync.turnOff"), yes: t("sync.turnOff"), message: t("sync.turnOffText") }, function () { Sync.turnOff(); rerender(); }), 0);
      } },
      { label: t("sync.deleteCloud"), cls: "danger", onClick: function () {
        setTimeout(() => cmxConfirm({ title: t("sync.deleteCloud"), yes: t("sync.deleteYes"), danger: true, message: t("sync.deleteText") }, function () {
          Sync.deleteCloud().then(ok => { if (ok) { showToast(esc(t("sync.deleted"))); rerender(); } else cmxAlert(t("sync.deleteFailed")); });
        }), 0);
      } },
      { label: t("wiz.close"), cls: "ghost", onClick: function () {} }
    ] });
  }

  // The code, a QR code and a link for the other phone. A new code must be confirmed as saved.
  function showCode(c, isNew) {
    const url = link(c);
    let body = p(t(isNew ? "sync.newCode" : "sync.yourCode")) + '<div class="sync-code">' + esc(Sync.format(c)) + "</div>" +
      '<div class="sync-qr" id="syncQr"></div>' + p(t("sync.linkText")) + '<div class="sync-link">' + esc(url) + '</div><div id="cmxCopyMsg" class="cmx-copymsg"></div>';
    if (isNew) body += '<label class="sync-tick"><input type="checkbox" id="syncSaved"> ' + esc(t("sync.savedTick")) + '</label><div class="muted sync-hint">' + esc(t("sync.savedHint")) + "</div>";
    cmxShowModal({ title: t("sync.codeTitle"), bodyHTML: body, buttons: [
      { label: t("sync.copyLink"), cls: "primary", keepOpen: true, onClick: function (b) { copy(url, b); return false; } },
      { label: t("sync.copyCode"), cls: "secondary", keepOpen: true, onClick: function (b) { copy(Sync.format(c), b); return false; } },
      { label: t("wiz.close"), cls: "ghost", keepOpen: !!isNew, onClick: function (b) {
        if (isNew && !(b.querySelector("#syncSaved") || {}).checked) { const m = b.querySelector("#cmxCopyMsg"); if (m) { m.textContent = t("sync.tickFirst"); m.className = "cmx-copymsg err"; } return false; }
        if (isNew) cmxCloseModal();
        rerender();
      } }
    ], onOpen: function (b) {
      drawQr(b.querySelector("#syncQr"), url);
      // a new code: the × and a tap outside need the tick too
      if (isNew) {
        const tryClose = function () {
          if ((b.querySelector("#syncSaved") || {}).checked) { cmxCloseModal(); rerender(); return; }
          const m = b.querySelector("#cmxCopyMsg"); if (m) { m.textContent = t("sync.tickFirst"); m.className = "cmx-copymsg err"; }
        };
        const x = b.querySelector(".cmx-modal-x"), o = document.getElementById("cmxModal");
        if (x) x.onclick = tryClose;
        if (o) o.onclick = function (e) { if (e.target === o) tryClose(); };
      }
    } });
  }
  function copy(text, b) {
    const msg = b && b.querySelector("#cmxCopyMsg");
    const say = (k, err) => { if (msg) { msg.textContent = t(k); msg.className = "cmx-copymsg" + (err ? " err" : ""); } };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => say("code.copied"), () => say("code.holdToCopy", true));
    else say("code.holdToCopy", true);
  }
  // The QR library is only loaded when a QR code is shown; without it the link still works.
  function drawQr(el, url) {
    if (!el) return;
    const draw = () => {
      try { const q = qrcode(0, "M"); q.addData(url); q.make(); el.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); }
      catch (e) { el.innerHTML = ""; }
    };
    if (typeof qrcode === "function") { draw(); return; }
    const s = document.createElement("script");
    s.src = QR_SRC; s.onload = draw; s.onerror = function () { el.innerHTML = ""; };
    document.head.appendChild(s);
  }
  function enterCode() {
    cmxShowModal({ title: t("sync.useCode"), bodyHTML: p(t("sync.enterText")) + '<input type="text" id="syncCodeIn" class="wiz-input" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"><div id="syncCodeMsg" class="cmx-copymsg"></div>', buttons: [
      { label: t("sync.link"), cls: "primary", keepOpen: true, onClick: function (b) {
        const v = (b.querySelector("#syncCodeIn") || {}).value || "";
        if (!Sync.valid(Sync.normalise(v))) { const m = b.querySelector("#syncCodeMsg"); if (m) { m.textContent = t("sync.badCode"); m.className = "cmx-copymsg err"; } return false; }
        cmxCloseModal(); Sync.useCode(v); showToast(esc(t("sync.linked"))); rerender(); return false;
      } },
      { label: t("wiz.cancel"), cls: "ghost", onClick: function () {} }
    ] });
  }

  /* ===== Links: #sync=CODE and #transfer=CMXT1 ===== */
  function clearHash() { try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { location.hash = ""; } }
  function checkLinks() {
    const h = location.hash || "";
    if (h.indexOf("#sync=") === 0) {
      const c = Sync.normalise(decodeURIComponent(h.slice(6)));
      clearHash();
      if (!Sync.valid(c)) { cmxAlert(t("sync.badCode")); return; }
      if (Sync.isOn() && Sync.code() === c) return;
      cmxConfirm({ title: t("sync.title"), yes: t("sync.link"), message: t(Sync.isOn() ? "sync.linkSwitch" : "sync.linkAsk") }, function () {
        Sync.useCode(c); showToast(esc(t("sync.linked"))); rerender();
      });
    } else if (h.indexOf("#transfer=") === 0) {
      const code = h.slice(10);
      clearHash();
      receiveTransfer(code);
    }
  }

  /* ===== Moving from GitHub Pages (§16.6) ===== */
  // One CMXT1 code with the social session and every competition (short internal ids, as CMXC1).
  function buildTransfer() {
    const comps = CompStore.list().map(e => CompStore.load(e.id)).filter(Boolean).map(c => CompShare.payload(c).competition);
    return _cmxEncode({ app: "CourtMixer", type: "transfer", version: 1, appVersion: APP_VERSION, social: Docs.get("social"), competitions: comps }, "CMXT1:");
  }
  function receiveTransfer(raw) {
    let data = null;
    try { const m = /CMXT1:([A-Za-z0-9+\-$]+)/.exec(decodeURIComponent(raw)); data = m ? JSON.parse(LZString.decompressFromEncodedURIComponent(m[1])) : null; } catch (e) { data = null; }
    if (!data || data.app !== "CourtMixer" || data.type !== "transfer") { cmxAlert(t("move.bad")); return; }
    const comps = (Array.isArray(data.competitions) ? data.competitions : []).filter(d => d && d.id && CompShare.safe(d));
    const hasSocialHere = typeof players !== "undefined" && (players.length || (matchHistory || []).length);
    const msg = t("move.ask", { n: comps.length }) + (hasSocialHere && data.social ? "\n\n" + t("move.replaceWarn") : "");
    cmxConfirm({ title: t("move.title"), yes: t("move.import"), message: msg }, function () {
      if (data.social && data.social.app === "CourtMixer") { Docs.put("social", data.social); Sync.markDirty("social"); }
      comps.forEach(function (d) {
        const doc = CompModel.migrate(d);
        if (CompStore.list().some(e => e.id === doc.id)) { doc.id = uid(); doc.name = t("code.copyName", { name: doc.name || t("comp.untitled") }); }
        CompStore.save(doc);
      });
      CompStore.flush();
      showToast(esc(t("move.done", { n: comps.length })));
      rerender();
    });
  }
  function banner(site) {
    site = site || NEW_SITE;   // (tests pass a site; the app uses NEW_SITE)
    if (!site || location.hostname !== OLD_HOST || Store.get(MOVED_KEY) === "1" || document.querySelector(".move-banner")) return;
    const el = document.createElement("div");
    el.className = "session-stale move-banner";
    el.innerHTML = "<span>" + esc(t("move.banner")) + '</span><button type="button" class="move-go">' + esc(t("move.go")) + '</button><button type="button" class="move-x" aria-label="' + esc(t("wiz.close")) + '">×</button>';
    el.querySelector(".move-go").onclick = function () {
      let code;
      try { code = buildTransfer(); } catch (e) { cmxAlert(t("share.failed")); return; }
      location.href = site.replace(/\/?$/, "/") + "#transfer=" + code;
    };
    el.querySelector(".move-x").onclick = function () { Store.set(MOVED_KEY, "1"); el.remove(); };
    const host = document.querySelector(".screen") || document.body;
    host.insertBefore(el, host.firstChild);
  }

  /* ===== Status in both modes ===== */
  function rerender() {
    if (typeof CompShell !== "undefined" && CompStore.getMode() === "competition") CompShell.render();
    else if (typeof renderHistory === "function") renderHistory();
    updateStatus();
  }
  function updateStatus() {
    const b = document.getElementById("histSyncBtn");
    if (b) b.textContent = Sync.statusText();
    const s = document.getElementById("syncStatusLine");
    if (s) s.textContent = Sync.statusText();
  }

  function init() {
    Sync.onChange(updateStatus);
    banner();
    setTimeout(checkLinks, 0);
    window.addEventListener("hashchange", checkLinks); // a link opened while the app is already open
    // availability is known after the health check: show or hide the entry points
    return Sync.init().then(function () { if (Sync.visible() && typeof renderHistory === "function") renderHistory(); updateStatus(); });
  }

  return { init, open, showCode, buildTransfer, receiveTransfer, banner, NEW_SITE };
})();
