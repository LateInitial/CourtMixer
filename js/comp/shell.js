// CourtMixer - Competition mode shell (Phase 2, v1.10.0), spec §4 and §10.6-10.7.
// Header chip, mode switching, amber band, welcome card, competition tabs, the Competition
// menu (switch / start new / archive / delete) and in-memory undo for competitions.
// Social mode's markup and data are never touched: its views are only hidden.

const CompShell = (function () {
  // Phase 2 gate: the chip only appears when the URL contains ?comp (or #comp).
  function gateOpen() { return /[?&#]comp(=|&|#|$)/.test(location.search + location.hash); }

  let enabled = false;
  let tab = "entries";

  /* ===== Undo: last 10 snapshots, in memory only (§10.7) ===== */
  const undoStack = [];
  function snapshot(label, comp, wasActive) {
    undoStack.push({ label: label, doc: JSON.parse(JSON.stringify(comp)), wasActive: !!wasActive });
    if (undoStack.length > 10) undoStack.shift();
  }
  function undo() {
    const s = undoStack.pop();
    if (!s) return;
    CompStore.restore(s.doc);
    if (s.wasActive) CompStore.setActive(s.doc.id);
    render();
    showToast(esc(t("undo.done", { what: s.label })));
  }
  // The shared toast, with its Undo button wired to competition undo instead of social undo.
  function toastUndo(html) {
    showToast(html, true);
    const b = document.getElementById("toastUndoBtn");
    if (b) b.onclick = function () { dismissToast(); undo(); };
  }

  /* ===== Pieces ===== */
  function el(id) { return document.getElementById(id); }

  function statusLine(comp) {
    if (!comp) return "";
    return t("status." + comp.status);
  }

  function renderChip() {
    const chip = el("modeChip");
    if (!chip) return;
    chip.style.display = enabled ? "" : "none";
    const comp = CompStore.getMode() === "competition";
    chip.classList.toggle("on", comp);
    chip.innerHTML = comp ? esc(t("chip.toSocial")) : '<span aria-hidden="true">🏆</span> ' + esc(t("chip.toComp"));
    chip.setAttribute("aria-label", comp ? t("chip.toSocial.aria") : t("chip.toComp.aria"));
  }

  function renderBand() {
    const band = el("compBand");
    if (!band) return;
    const comp = CompStore.getActive();
    const name = comp ? (comp.name || t("comp.untitled")) : t("comp.mode");
    const left = '<span class="band-left"><span aria-hidden="true">🏆</span> <b>' + esc(name) + "</b>" +
      (comp ? " · " + esc(statusLine(comp)) : "") + "</span>";
    const n = comp ? comp.settings.courtsCount : 0;
    band.innerHTML = left + (comp ? '<span class="band-right">' + esc(t(n === 1 ? "band.court" : "band.courts", { n: n })) + "</span>" : "") +
      '<span class="band-menu" aria-hidden="true">☰</span>';
  }

  function renderWelcome(root) {
    const saved = CompStore.list().filter(e => e.status !== "archived");
    let h = '<div class="card comp-welcome"><h3 class="empty-title">' + esc(t("welcome.title")) + "</h3>" +
      '<p class="muted">' + esc(t("welcome.text")) + "</p>" +
      '<div class="comp-actions"><button type="button" class="primary" data-act="new">' + esc(t("welcome.start")) + "</button>" +
      '<button type="button" class="secondary" data-act="import">' + esc(t("welcome.import")) + "</button></div></div>";
    if (saved.length) {
      h += '<div class="card"><div class="wiz-label">' + esc(t("welcome.saved")) + "</div>" + compListHtml(saved) + "</div>";
    }
    root.innerHTML = h;
  }

  function compListHtml(entries) {
    return '<div class="comp-list">' + entries.map(e =>
      '<button type="button" class="comp-list-item" data-act="open" data-id="' + esc(e.id) + '">' +
      '<span class="comp-list-name">' + esc(e.name || t("comp.untitled")) + "</span>" +
      '<span class="muted">' + esc((e.dateISO || "") + " · " + t("status." + e.status)) + "</span></button>").join("") + "</div>";
  }

  const TABS = ["entries", "courts", "standings", "results"];
  function renderTabs(show) {
    const bar = el("compTabs");
    if (!bar) return;
    bar.style.display = show ? "" : "none";
    if (!show) return;
    bar.innerHTML = TABS.map(id => '<button type="button" class="ctab' + (id === tab ? " active" : "") + '" data-tab="' + id + '">' + esc(t("tab." + id)) + "</button>").join("");
  }

  function renderLive(root, comp) {
    root.innerHTML = '<div class="card"><h3 class="empty-title">' + esc(t("tab." + tab)) + "</h3>" +
      '<p class="muted">' + esc(t("tab.placeholder")) + "</p></div>";
  }

  function renderFinished(root, comp) {
    root.innerHTML = '<div class="card"><h3 class="empty-title">' + esc(t("finished.title", { name: comp.name || t("comp.untitled") })) + "</h3>" +
      '<p class="muted">' + esc(t("finished.text")) + "</p>" +
      '<div class="comp-actions"><button type="button" class="primary" data-act="new">' + esc(t("menu.new")) + "</button></div></div>";
  }

  function render() {
    renderChip();
    const on = enabled && CompStore.getMode() === "competition";
    const screen = document.querySelector(".screen");
    if (screen) screen.classList.toggle("comp-mode", on);
    const root = el("compRoot");
    if (!on || !root) { renderTabs(false); return; }
    renderBand();
    const comp = CompStore.getActive();
    if (!comp) { renderTabs(false); renderWelcome(root); return; }
    if (comp.status === "setup") { renderTabs(false); Wizard.mount(root, comp); return; }
    if (comp.status === "finished") { renderTabs(false); renderFinished(root, comp); return; }
    renderTabs(true); renderLive(root, comp);
  }

  /* ===== Actions ===== */
  function startNew() {
    const comp = CompModel.newCompetition();
    CompModel.applyPreset(comp, CompModel.RECOMMENDED_PRESET);
    CompStore.save(comp); CompStore.setActive(comp.id);
    render();
  }

  function open(id) {
    const comp = CompStore.load(id);
    if (!comp) return;
    if (comp.status === "archived") { comp.status = comp.statusBeforeArchive || "setup"; delete comp.statusBeforeArchive; CompStore.save(comp); }
    CompStore.setActive(id);
    render();
  }

  function archive() {
    const comp = CompStore.getActive();
    if (!comp) return;
    cmxConfirm({ title: t("menu.archive"), yes: t("menu.archive"), message: t("archive.confirm", { name: comp.name || t("comp.untitled") }) }, function () {
      snapshot(t("menu.archive"), comp, true);
      comp.statusBeforeArchive = comp.status; comp.status = "archived";
      CompStore.save(comp); CompStore.setActive(null); CompStore.flush();
      render();
      toastUndo(esc(t("archive.done", { name: comp.name || t("comp.untitled") })));
    });
  }

  function remove() {
    const comp = CompStore.getActive();
    if (!comp) return;
    cmxConfirm({ title: t("menu.delete"), yes: t("delete.yes"), danger: true, message: t("delete.confirm", { name: comp.name || t("comp.untitled") }) }, function () {
      snapshot(t("menu.delete"), comp, true);
      CompStore.remove(comp.id);
      render();
      toastUndo(esc(t("delete.done", { name: comp.name || t("comp.untitled") })));
    });
  }

  function showSwitch() {
    const entries = CompStore.list().slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    cmxShowModal({ title: t("menu.switch"), bodyHTML: entries.length ? compListHtml(entries) : cmxMsgHtml(t("switch.none")),
      buttons: [{ label: t("wiz.close"), cls: "ghost", onClick: function () {} }],
      onOpen: function (box) { box.querySelectorAll('[data-act="open"]').forEach(b => { b.onclick = function () { cmxCloseModal(); open(b.dataset.id); }; }); } });
  }

  function showMenu() {
    const comp = CompStore.getActive();
    const items = [];
    if (CompStore.list().length) items.push({ label: t("menu.switch"), cls: "secondary", onClick: showSwitch });
    items.push({ label: t("menu.new"), cls: "secondary", onClick: startNew });
    if (comp) items.push({ label: t("menu.archive"), cls: "secondary", onClick: archive });
    if (comp) items.push({ label: t("menu.delete"), cls: "danger", onClick: remove });
    items.push({ label: t("wiz.close"), cls: "ghost", onClick: function () {} });
    cmxShowModal({ title: t("menu.title"), bodyHTML: comp ? cmxMsgHtml((comp.name || t("comp.untitled")) + " · " + statusLine(comp)) : "", buttons: items });
  }

  function setMode(m) {
    CompStore.setMode(m);
    render();
    try { window.scrollTo(0, 0); } catch (e) {}
  }

  function onRootClick(e) {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "new") startNew();
    else if (act === "import") cmxAlert(t("import.later"));
    else if (act === "open") open(b.dataset.id);
  }

  function init() {
    enabled = gateOpen();
    const chip = el("modeChip"), band = el("compBand"), root = el("compRoot"), bar = el("compTabs");
    if (chip) chip.onclick = function () { setMode(CompStore.getMode() === "competition" ? "social" : "competition"); };
    if (band) {
      band.onclick = showMenu;
      band.onkeydown = function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); showMenu(); } };
    }
    if (root) root.addEventListener("click", function (e) { if (!root.querySelector(".wiz")) onRootClick(e); });
    if (bar) bar.addEventListener("click", function (e) { const b = e.target.closest(".ctab"); if (b) { tab = b.dataset.tab; render(); } });
    render();
  }

  return { init, render, renderBand, setMode, startNew, open, gateOpen, _undoStack: undoStack };
})();
