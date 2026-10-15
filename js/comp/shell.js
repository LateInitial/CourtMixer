// CourtMixer - Competition mode shell, spec §4 and §10.6-10.7.
// Header chip, mode switching, amber band, welcome card, competition tabs, the Competition
// menu and in-memory undo for competitions. Social mode's markup and data are never touched:
// its views are only hidden. Phase 3 (v1.11.0): visible to everyone, live tabs, settings.

const CompShell = (function () {
  let tab = "courts";
  let settingsOpen = null; // step id while a settings screen is shown

  /* ===== Undo: last 10 snapshots, in memory only (§10.7) ===== */
  const undoStack = [];
  function snapshot(label, comp, wasActive) {
    undoStack.push({ label: label, doc: JSON.parse(JSON.stringify(comp)), wasActive: wasActive !== false });
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

  function el(id) { return document.getElementById(id); }

  /* ===== Status line (§4.1) ===== */
  function statusLine(comp) {
    if (!comp) return "";
    if (comp.status !== "live") return t("status." + comp.status);
    const D = CompStandings.derive(comp);
    const open = comp.matches.filter(x => !D.outcome(D.meetingById[x.meetingId]).done);
    if (!open.length) return t("status.allPlayed");
    const stageOf = (x) => D.stageById[D.meetingById[x.meetingId].stageId];
    if (open.every(x => stageOf(x).type === "knockout")) return t("status.knockouts");
    const rr = comp.matches.filter(x => stageOf(x).type !== "knockout");
    const total = Math.max.apply(null, rr.map(x => D.meetingById[x.meetingId].round).concat([1]));
    const cur = Math.min.apply(null, open.filter(x => stageOf(x).type !== "knockout").map(x => D.meetingById[x.meetingId].round).concat([total]));
    return t("status.round", { n: cur, total: total });
  }

  function renderChip() {
    const chip = el("modeChip");
    if (!chip) return;
    chip.style.display = "";
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

  function compListHtml(entries) {
    return '<div class="comp-list">' + entries.map(e =>
      '<button type="button" class="comp-list-item" data-act="open" data-id="' + esc(e.id) + '">' +
      '<span class="comp-list-name">' + esc(e.name || t("comp.untitled")) + "</span>" +
      '<span class="muted">' + esc((e.dateISO || "") + " · " + t("status." + e.status)) + "</span></button>").join("") + "</div>";
  }

  function renderWelcome(root) {
    const saved = CompStore.list().filter(e => e.status !== "archived");
    let h = '<div class="card comp-welcome"><h3 class="empty-title">' + esc(t("welcome.title")) + "</h3>" +
      '<p class="muted">' + esc(t("welcome.text")) + "</p>" +
      '<div class="comp-actions"><button type="button" class="primary" data-act="new">' + esc(t("welcome.start")) + "</button>" +
      '<button type="button" class="secondary" data-act="import">' + esc(t("welcome.import")) + "</button></div></div>";
    if (saved.length) h += '<div class="card"><div class="wiz-label">' + esc(t("welcome.saved")) + "</div>" + compListHtml(saved) + "</div>";
    root.innerHTML = h;
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
    if (tab === "courts" && comp.status === "finished") tab = "standings";
    const R = { entries: CompUI.renderEntries, courts: CompUI.renderCourts, standings: CompUI.renderStandings, results: CompUI.renderResults };
    (R[tab] || CompUI.renderCourts)(root, comp);
    if (comp.status === "finished") {
      root.insertAdjacentHTML("afterbegin", '<div class="card"><h3 class="empty-title">' + esc(t("finished.title", { name: comp.name || t("comp.untitled") })) + "</h3>" +
        '<div class="comp-actions"><button type="button" class="primary" data-act="new">' + esc(t("menu.new")) + '</button><button type="button" class="secondary" data-act="reopen">' + esc(t("menu.reopen")) + "</button></div></div>");
    }
  }

  function render() {
    renderChip();
    const on = CompStore.getMode() === "competition";
    const screen = document.querySelector(".screen");
    if (screen) screen.classList.toggle("comp-mode", on);
    const root = el("compRoot");
    if (!on || !root) { renderTabs(false); return; }
    renderBand();
    const comp = CompStore.getActive();
    if (!comp) { settingsOpen = null; renderTabs(false); renderWelcome(root); return; }
    if (comp.status === "setup") { settingsOpen = null; renderTabs(false); Wizard.mount(root, comp); return; }
    if (settingsOpen) return; // the settings screen renders itself
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

  // Review -> Generate draw: status becomes live and the Courts tab opens.
  function generate(comp) {
    CompGenerate.applyDraw(comp, CompGenerate.generateDraw(comp));
    comp.status = "live";
    comp.log.push({ at: Date.now(), action: "generate" });
    CompStore.save(comp); CompStore.flush();
    tab = "courts";
    render();
    showToast(esc(t("generate.done", { n: comp.matches.length })));
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

  function finish() {
    const comp = CompStore.getActive();
    const D = CompStandings.derive(comp);
    const open = comp.matches.filter(x => !D.outcome(D.meetingById[x.meetingId]).done).length;
    cmxConfirm({ title: t("menu.finish"), yes: t("menu.finish"), message: open ? t("finish.openMatches", { n: open }) : t("finish.confirm") }, function () {
      snapshot(t("menu.finish"), comp);
      comp.status = "finished"; CompStore.save(comp); render();
    });
  }
  function reopen() {
    const comp = CompStore.getActive();
    if (!comp) return;
    comp.status = "live"; CompStore.save(comp); render();
  }

  function showSwitch() {
    const entries = CompStore.list().slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    cmxShowModal({ title: t("menu.switch"), bodyHTML: entries.length ? compListHtml(entries) : cmxMsgHtml(t("switch.none")),
      buttons: [{ label: t("wiz.close"), cls: "ghost", onClick: function () {} }],
      onOpen: function (box) { box.querySelectorAll('[data-act="open"]').forEach(b => { b.onclick = function () { cmxCloseModal(); open(b.dataset.id); }; }); } });
  }

  /* ===== Settings after generation (§6.3) ===== */
  function openSettingsStep(step, onDone) {
    const comp = CompStore.getActive(), root = el("compRoot");
    const before = JSON.parse(JSON.stringify(comp));
    settingsOpen = step;
    renderTabs(false);
    Wizard.mount(root, comp, { single: step,
      onDone: function (c) { const r = onDone ? onDone(c) : null; if (!r || !r.length) settingsOpen = null; return r; },
      onCancel: function () { settingsOpen = null; CompStore.restore(before); render(); } });
  }
  function courtsDone(comp) {
    const n = comp.settings.courtsCount;
    const busy = comp.matches.filter(x => x.status === "onCourt").map(x => comp.courts.findIndex(c => c.id === x.courtId)).filter(i => i >= n);
    if (busy.length) return ["settings.courtBusy"];
    comp.courts = CompGenerate.buildCourts(comp);
    comp.divisions.forEach(d => { d.courtIds = comp.courts.filter(c => c.homeDivisionIds.indexOf(d.id) !== -1).map(c => c.id); });
    return [];
  }
  function renameAll() {
    const comp = CompStore.getActive();
    const row = (key, id, label, val) => '<label class="wiz-field"><span class="wiz-label">' + esc(label) + '</span><input class="wiz-input" maxlength="80" data-k="' + key + '" data-id="' + esc(id) + '" value="' + esc(val) + '"></label>';
    const body = row("comp", "", t("basics.name"), comp.name) +
      comp.divisions.map((d, i) => row("div", d.id, t("div.name", { n: i + 1 }), d.name)).join("") +
      comp.players.map(p => row("player", p.id, t("settings.player"), p.name)).join("");
    cmxShowModal({ title: t("settings.names"), bodyHTML: body, buttons: [
      { label: t("wiz.done"), cls: "primary", onClick: function (box) {
        box.querySelectorAll("input[data-k]").forEach(function (inp) {
          const v = inp.value.trim(); if (!v) return;
          if (inp.dataset.k === "comp") comp.name = v;
          else if (inp.dataset.k === "div") { const d = comp.divisions.find(x => x.id === inp.dataset.id); if (d) d.name = v; }
          else { const p = comp.players.find(x => x.id === inp.dataset.id); if (p) p.name = v; }
        });
        comp.entries.forEach(e => { e.label = e.playerIds.map(id => (comp.players.find(p => p.id === id) || {}).name || "?").join(" / "); });
        CompStore.save(comp); render();
      } },
      { label: t("wiz.cancel"), cls: "ghost", onClick: function () {} }] });
  }
  function walkoverSetting() {
    const comp = CompStore.getActive();
    cmxShowModal({ title: t("score.walkover.title"), bodyHTML: "", buttons: [
      { label: t("score.wo.max") + (comp.settings.walkoverScore === "formatMax" ? " ✓" : ""), cls: "secondary", onClick: function () { comp.settings.walkoverScore = "formatMax"; CompStore.save(comp); render(); } },
      { label: t("score.wo.win") + (comp.settings.walkoverScore === "winOnly" ? " ✓" : ""), cls: "secondary", onClick: function () { comp.settings.walkoverScore = "winOnly"; CompStore.save(comp); render(); } },
      { label: t("wiz.close"), cls: "ghost", onClick: function () {} }] });
  }
  function backToSetup() {
    const comp = CompStore.getActive();
    if (comp.matches.some(x => x.status === "done" || x.status === "onCourt")) return cmxAlert(t("settings.setupLocked"));
    cmxConfirm({ title: t("settings.setup"), yes: t("settings.setup"), message: t("settings.setup.q") }, function () {
      snapshot(t("settings.setup"), comp);
      comp.status = "setup"; comp.stages = []; comp.meetings = []; comp.matches = [];
      comp.wizard.currentStep = "review";
      CompStore.save(comp); render();
    });
  }
  function showSettings() {
    cmxShowModal({ title: t("menu.settings"), bodyHTML: "", buttons: [
      { label: t("settings.names"), cls: "secondary", onClick: renameAll },
      { label: Wizard.ui.stepName("standings"), cls: "secondary", onClick: function () { openSettingsStep("standings"); } },
      { label: Wizard.ui.stepName("courts"), cls: "secondary", onClick: function () { openSettingsStep("courts", courtsDone); } },
      { label: t("score.walkover.title"), cls: "secondary", onClick: walkoverSetting },
      { label: t("settings.setup"), cls: "secondary", onClick: backToSetup },
      { label: t("wiz.close"), cls: "ghost", onClick: function () {} }] });
  }
  function showSummary() {
    const comp = CompStore.getActive(), s = comp.settings, fs = s.matchFormats || {};
    const sp = s.stagePlan, plan = (p) => p ? t("format." + p.type) + (p.type === "groups" ? " · " + t("review.groups", { size: p.groupSize, adv: p.advance }) : "") : "";
    const lines = [comp.name + " · " + comp.dateISO + " · " + (comp.sport ? t("sport." + comp.sport) : ""),
      comp.divisions.map(d => d.name + " (" + comp.entries.filter(e => e.divisionId === d.id && !e.withdrawn).length + ")").join(", "),
      s.formatPlan === "perDivision" ? comp.divisions.map(d => d.name + ": " + plan(sp[d.id] || sp.all)).join("; ") : plan(sp.all),
      fs.main ? CompFormat.describe(fs.main) : "", fs.ko ? t("review.koFormat", { f: CompFormat.describe(fs.ko) }) : "",
      t("review.courts", { n: s.courtsCount, mode: t("courts." + (s.courtMode === "homeBorrow" ? "home" : s.courtMode)) }),
      t("review.minutes", { n: s.minutesPerMatch || CompSchedule.minutesDefault(comp), c: s.changeoverMinutes })].filter(Boolean);
    cmxShowModal({ title: t("menu.summary"), bodyHTML: lines.map(l => '<p class="cmx-modal-text">' + esc(l) + "</p>").join(""), buttons: [{ label: t("wiz.close"), cls: "ghost", onClick: function () {} }] });
  }

  function showMenu() {
    const comp = CompStore.getActive();
    const items = [];
    const live = comp && (comp.status === "live" || comp.status === "finished");
    if (live) {
      items.push({ label: t("menu.settings"), cls: "secondary", onClick: showSettings });
      items.push({ label: t("menu.summary"), cls: "secondary", onClick: showSummary });
      if (comp.status === "live") items.push({ label: t("menu.finish"), cls: "secondary", onClick: finish });
      else items.push({ label: t("menu.reopen"), cls: "secondary", onClick: reopen });
    }
    if (CompStore.list().length) items.push({ label: t("menu.switch"), cls: "secondary", onClick: showSwitch });
    items.push({ label: t("menu.new"), cls: "secondary", onClick: startNew });
    if (comp) items.push({ label: t("menu.archive"), cls: "secondary", onClick: archive });
    if (comp) items.push({ label: t("menu.delete"), cls: "danger", onClick: remove });
    items.push({ label: t("wiz.close"), cls: "ghost", onClick: function () {} });
    cmxShowModal({ title: t("menu.title"), bodyHTML: comp ? cmxMsgHtml((comp.name || t("comp.untitled")) + " · " + statusLine(comp)) : "", buttons: items });
  }

  function setMode(m) {
    CompStore.setMode(m);
    settingsOpen = null;
    render();
    try { window.scrollTo(0, 0); } catch (e) {}
  }

  function onRootClick(e) {
    const root = el("compRoot");
    if (root.querySelector(".wiz")) return; // the wizard handles its own clicks
    const comp = CompStore.getActive();
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "new") startNew();
    else if (act === "import") cmxAlert(t("import.later"));
    else if (act === "open") open(b.dataset.id);
    else if (act === "reopen") reopen();
    else if (comp) CompUI.onClick(comp, e);
  }

  function init() {
    const chip = el("modeChip"), band = el("compBand"), root = el("compRoot"), bar = el("compTabs");
    if (chip) chip.onclick = function () { setMode(CompStore.getMode() === "competition" ? "social" : "competition"); };
    if (band) {
      band.onclick = showMenu;
      band.onkeydown = function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); showMenu(); } };
    }
    if (root) {
      root.addEventListener("click", onRootClick);
      root.addEventListener("input", function (e) { const comp = CompStore.getActive(); if (comp && !root.querySelector(".wiz")) CompUI.onInput(comp, e); });
    }
    if (bar) bar.addEventListener("click", function (e) { const b = e.target.closest(".ctab"); if (b) { tab = b.dataset.tab; render(); try { window.scrollTo(0, 0); } catch (err) {} } });
    setInterval(function () { if (CompStore.getMode() === "competition") CompUI.tick(); }, 30000);
    render();
  }

  return { init, render, renderBand, setMode, startNew, open, generate, snapshot, toastUndo, statusLine, _undoStack: undoStack,
    setTab: function (x) { tab = x; } };
})();
