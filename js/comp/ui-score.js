// CourtMixer - score entry sheet (Phase 3, v1.11.0), spec §7.5 and §10.5.
// Its own overlay (below the shared modal), so the number picker and confirms can open on top.
// Saving goes through CompResults.save, which handles edits and the knockout cascade.

const CompResults = (function () {
  // Records a result. Returns false if the user still has to confirm a cascade (handled here).
  function save(comp, matchId, result, done) {
    const trialComp = JSON.parse(JSON.stringify(comp));
    apply(trialComp, matchId, result);
    const stale = CompStandings.staleMatches(trialComp);
    const go = function () {
      const before = completedGroups(comp);
      if (stale.length) CompShell.snapshot(t("results.edit"), comp);
      apply(comp, matchId, result);
      const cleared = CompStandings.clearStale(comp);
      CompStore.save(comp);
      const after = completedGroups(comp).filter(k => before.indexOf(k) === -1);
      if (done) done();
      if (cleared.length) CompShell.toastUndo(esc(t("results.cleared", { n: cleared.length })));
      else if (after.length) showToast(esc(t("results.groupDone", { group: after.join(", ") })));
    };
    if (!stale.length) { go(); return true; }
    const D = CompStandings.derive(comp);
    const list = stale.map(x => "• " + D.meetingLabel(D.meetingById[x.meetingId], false) + ": " + D.sideLabel(D.meetingById[x.meetingId], "A") + " v " + D.sideLabel(D.meetingById[x.meetingId], "B")).join("\n");
    cmxConfirm({ title: t("results.cascade.title"), yes: t("results.cascade.yes"), danger: true, message: t("results.cascade", { list: list }) }, go);
    return false;
  }

  function apply(comp, matchId, r) {
    const x = comp.matches.find(m => m.id === matchId);
    if (!x) return;
    const D = CompStandings.derive(comp), m = D.meetingById[x.meetingId];
    if (x.status === "done") x.history.push({ at: Date.now(), sets: x.sets, winner: x.winner, outcome: x.outcome });
    if (!x.sideA.playerIds.length) x.sideA.playerIds = D.playerIdsOf(x, "A");
    if (!x.sideB.playerIds.length) x.sideB.playerIds = D.playerIdsOf(x, "B");
    x.entryIds = { A: D.side(m, "A"), B: D.side(m, "B") };
    const wasDone = x.status === "done";
    x.sets = r.sets || []; x.outcome = r.outcome || "normal"; x.winner = r.winner;
    x.status = "done";
    if (!x.startedAt) x.startedAt = Date.now();
    if (!wasDone) x.endedAt = Date.now(); else x.editedAt = Date.now();
  }

  function completedGroups(comp) {
    const D = CompStandings.derive(comp), out = [];
    comp.stages.forEach(st => { if (st.type === "groups") st.groups.forEach(g => { if (D.groupComplete(st.id, g.id)) out.push(t("standings.group", { g: g.name })); }); });
    return out;
  }

  // Clears a result (keeps it in history). Undo-able.
  function clear(comp, matchId) {
    const x = comp.matches.find(m => m.id === matchId);
    if (!x || x.status !== "done") return;
    CompShell.snapshot(t("results.delete"), comp);
    CompStandings.resetMatch(x);
    const cleared = CompStandings.clearStale(comp);
    CompStore.save(comp);
    CompShell.toastUndo(esc(t(cleared.length ? "results.deletedCleared" : "results.deleted", { n: cleared.length })));
  }

  return { save, clear, apply };
})();

const CompScore = (function () {
  let state = null; // { comp, matchId, sets: [{a,b,tbA,tbB}], mode: 'normal'|'walkover'|'retired', side }

  function sheet() {
    let el = document.getElementById("compSheet");
    if (!el) {
      el = document.createElement("div");
      el.id = "compSheet"; el.className = "comp-sheet";
      el.innerHTML = '<div class="comp-sheet-box" role="dialog" aria-modal="true"></div>';
      document.body.appendChild(el);
      el.addEventListener("click", onClick);
      el.addEventListener("input", onInput);
    }
    return el;
  }
  // The competition as stored now, if it's still the one this sheet was opened on.
  function live() {
    const c = CompStore.getActive();
    return c && state && c.id === state.comp.id && c.matches.some(m => m.id === state.matchId) ? c : null;
  }
  function close() { const el = document.getElementById("compSheet"); if (el) el.style.display = "none"; state = null; }

  // opts.mode: open straight in "walkover" or "retired" mode (from a court card).
  function open(comp, matchId, opts) {
    const x = comp.matches.find(m => m.id === matchId);
    if (!x) return;
    const sets = (x.sets || []).map(s => Object.assign({}, s));
    state = { comp, matchId, sets: sets.length ? sets : [{ a: null, b: null }], mode: x.outcome === "walkover" ? "walkover" : x.outcome === "retired" ? "retired" : "normal",
      side: null, editing: x.status === "done" };
    if (state.mode !== "normal") state.side = x.winner === "A" ? "B" : "A"; // the side that gave up
    if (opts && opts.mode && opts.mode !== state.mode) { state.mode = opts.mode; state.side = null; }
    sheet().style.display = "flex";
    render();
  }

  function ctx() {
    if (live()) state.comp = live();
    const D = CompStandings.derive(state.comp), x = state.comp.matches.find(m => m.id === state.matchId);
    const m = D.meetingById[x.meetingId], f = D.formatFor(D.stageById[m.stageId]);
    return { D, x, m, f };
  }
  function filled(s) { return s && Number.isInteger(s.a) && Number.isInteger(s.b); }

  // Rows show progressively: the next row appears once the previous one is complete and the
  // match isn't decided yet.
  function visibleRows(f) {
    const rows = [];
    for (let i = 0; i < f.sets; i++) {
      if (i === 0) { rows.push(0); continue; }
      const prev = state.sets.slice(0, i);
      if (!prev.every(filled)) break;
      const ev = CompFormat.evaluateScore(f, prev, { partial: true });
      if (ev.winner && ev.winner !== "draw" && !state.sets[i]) break;
      if (ev.winner && !filled(state.sets[i])) break;
      rows.push(i);
    }
    return rows;
  }
  function cleanSets(f) {
    return state.sets.filter(filled).map((s, i) => {
      const o = { a: s.a, b: s.b };
      if (CompFormat.needsTiebreak(f, s, i) && Number.isInteger(s.tbA) && Number.isInteger(s.tbB)) { o.tbA = s.tbA; o.tbB = s.tbB; }
      return o;
    });
  }
  function evaluation(f) {
    if (state.mode === "walkover") return { winner: state.side ? (state.side === "A" ? "B" : "A") : null, errors: state.side ? [] : [t("score.chooseSide")], warnings: [] };
    const sets = cleanSets(f);
    if (state.mode === "retired") {
      if (!state.side) return { winner: null, errors: [t("score.chooseSide")], warnings: [] };
      const ev = CompFormat.evaluateScore(f, sets, { partial: true });
      return { winner: state.side === "A" ? "B" : "A", errors: ev.errors, warnings: ev.warnings };
    }
    const ev = CompFormat.evaluateScore(f, sets);
    const ko = (ctx().D.stageById[ctx().m.stageId] || {}).type === "knockout";
    if (ev.winner === "draw" && (f.setType !== "totalPoints" || ko)) { ev.errors.push(t(ko ? "score.noDrawKo" : "score.noDraw")); ev.winner = null; }
    return ev;
  }

  function render() {
    if (!state) return;
    const { D, x, m, f } = ctx();
    const box = sheet().querySelector(".comp-sheet-box");
    const court = state.comp.courts.find(c => c.id === x.courtId);
    const nameA = D.sideLabel(m, "A"), nameB = D.sideLabel(m, "B");
    let h = '<div class="cmx-modal-head"><span class="cmx-modal-title">' + esc((court ? court.name + " · " : "") + D.meetingLabel(m, false)) + '</span><button type="button" class="cmx-modal-x" data-act="close" aria-label="' + esc(t("wiz.close")) + '">×</button></div>' +
      '<div class="muted">' + esc(CompFormat.describe(f)) + "</div>";
    if (state.mode === "walkover") h += '<div class="muted">' + esc(t("score.wo.what")) + "</div>";
    if (state.mode !== "normal") {
      h += '<div class="wiz-label">' + esc(t(state.mode === "walkover" ? "score.woWho" : "score.retWho")) + "</div>" +
        '<div class="comp-actions">' + ["A", "B"].map(sd => '<button type="button" class="wiz-chip ' + (state.side === sd ? "on" : "") + '" data-act="side" data-side="' + sd + '">' + esc(sd === "A" ? nameA : nameB) + "</button>").join("") + "</div>";
    }
    if (state.mode !== "walkover") {
      h += '<div class="score-grid"><span></span><span class="score-head">' + esc(nameA) + '</span><span class="score-head">' + esc(nameB) + "</span>";
      visibleRows(f).forEach(function (i) {
        const s = state.sets[i] || {}, mtb = CompFormat.isMatchTiebreakSet(f, i);
        const label = mtb ? t("score.mtb") : t(f.setType === "games" ? "score.setN" : "score.gameN", { n: i + 1 });
        h += '<span class="score-label">' + esc(label) + "</span>" + ["a", "b"].map(k =>
          '<button type="button" class="score-box" data-act="pickScore" data-idx="' + i + '" data-key="' + k + '">' + (Number.isInteger(s[k]) ? s[k] : "–") + "</button>").join("");
        if (filled(s) && CompFormat.needsTiebreak(f, s, i)) {
          h += '<span class="score-label small">' + esc(t("score.tiebreak")) + "</span>" + ["tbA", "tbB"].map(k =>
            '<input type="number" inputmode="numeric" min="0" class="score-tb" data-idx="' + i + '" data-key="' + k + '" value="' + (Number.isInteger(s[k]) ? s[k] : "") + '" aria-label="' + esc(t("score.tiebreak")) + '">').join("");
        }
      });
      h += "</div>";
    }
    const ev = evaluation(f);
    if (ev.winner && ev.winner !== "draw") h += '<div class="score-winner">' + esc(t("score.winner", { name: ev.winner === "A" ? nameA : nameB })) + "</div>";
    else if (ev.winner === "draw") h += '<div class="score-winner">' + esc(t("score.draw")) + "</div>";
    if (ev.errors.length) h += '<div class="wiz-errors">' + ev.errors.map(e => "<div>" + esc(e) + "</div>").join("") + "</div>";
    if (ev.warnings.length) h += '<div class="wiz-warn">' + ev.warnings.map(e => "<div>" + esc(e) + "</div>").join("") + "</div>";
    h += '<div class="cmx-modal-actions">';
    if (ev.warnings.length) h += '<button type="button" class="cmx-modal-btn primary" data-act="save"' + (ev.errors.length ? " disabled" : "") + ">" + esc(t("score.saveAnyway")) + "</button>";
    else h += '<button type="button" class="cmx-modal-btn primary" data-act="save"' + (ev.errors.length ? " disabled" : "") + ">" + esc(t("score.save")) + "</button>";
    if (state.mode === "normal") h += '<button type="button" class="cmx-modal-btn secondary" data-act="mode" data-mode="walkover">' + esc(t("score.walkover")) + "</button>" +
      '<button type="button" class="cmx-modal-btn secondary" data-act="mode" data-mode="retired">' + esc(t("score.retired")) + "</button>";
    else h += '<button type="button" class="cmx-modal-btn secondary" data-act="mode" data-mode="normal">' + esc(t("score.normal")) + "</button>";
    if (state.editing) h += '<button type="button" class="cmx-modal-btn ghost" data-act="clearResult">' + esc(t("results.delete")) + "</button>";
    h += '<button type="button" class="cmx-modal-btn ghost" data-act="close">' + esc(t("score.cancel")) + "</button></div>";
    box.innerHTML = h;
  }

  function pickScore(i, key) {
    const { D, m, f } = ctx();
    const max = CompFormat.pickerMax(f, i), cur = (state.sets[i] || {})[key];
    let grid = "";
    for (let n = 0; n <= max; n++) grid += '<button type="button" class="sp-n' + (cur === n ? " sel" : "") + '" data-v="' + n + '">' + n + "</button>";
    grid += '<button type="button" class="sp-n sp-custom" data-v="custom">' + esc(t("score.custom")) + "</button>";
    if (Number.isInteger(cur)) grid += '<button type="button" class="sp-n sp-custom" data-v="clear">' + esc(t("score.clear")) + "</button>";
    cmxShowModal({ title: t("score.pick"), bodyHTML: '<div class="sp-team">' + esc(D.sideLabel(m, key === "a" ? "A" : "B")) + '</div><div class="sp-grid">' + grid + "</div>" +
      '<input type="number" inputmode="numeric" min="0" class="wiz-input wiz-num comp-custom-score" style="display:none" aria-label="' + esc(t("score.custom")) + '">',
      buttons: [{ label: t("wiz.close"), cls: "ghost", onClick: function () {} }],
      onOpen: function (box) {
        const inp = box.querySelector(".comp-custom-score");
        box.querySelectorAll(".sp-n").forEach(b => { b.onclick = function () {
          if (b.dataset.v === "custom") { inp.style.display = ""; inp.focus(); return; }
          if (b.dataset.v === "clear") { setScore(i, key, null); cmxCloseModal(); return; }
          setScore(i, key, Number(b.dataset.v)); cmxCloseModal();
        }; });
        inp.onkeydown = function (e) { if (e.key === "Enter") { const v = parseInt(inp.value, 10); if (v >= 0) { setScore(i, key, v); cmxCloseModal(); } } };
        inp.onchange = function () { const v = parseInt(inp.value, 10); if (v >= 0) { setScore(i, key, v); cmxCloseModal(); } };
      } });
  }
  function setScore(i, key, v) {
    while (state.sets.length <= i) state.sets.push({ a: null, b: null });
    state.sets[i][key] = v;
    // Once the first games decide the match, later games are dropped (e.g. game 2 corrected so
    // it's now 2-0): otherwise a stale game 3 would block Save.
    const { f } = ctx();
    for (let j = 1; j < state.sets.length; j++) {
      const first = state.sets.slice(0, j);
      if (!first.every(filled)) break;
      const ev = CompFormat.evaluateScore(f, first, { partial: true });
      if (ev.winner && ev.winner !== "draw" && !ev.errors.length) { state.sets.length = j; break; }
    }
    render();
  }

  function onInput(e) {
    const el = e.target;
    if (!el.classList.contains("score-tb") || !state) return;
    const i = Number(el.dataset.idx), v = parseInt(el.value, 10);
    state.sets[i][el.dataset.key] = v >= 0 ? v : null;
    // re-render only the messages so the keyboard stays open
    const pos = el.selectionStart, key = el.dataset.key;
    render();
    const again = sheet().querySelector('.score-tb[data-idx="' + i + '"][data-key="' + key + '"]');
    if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (err) {} }
  }

  function onClick(e) {
    if (!state) return;
    if (e.target.id === "compSheet") return close();
    const b = e.target.closest("[data-act]");
    if (!b || b.disabled) return;
    const act = b.dataset.act;
    if (act === "close") close();
    else if (act === "pickScore") pickScore(Number(b.dataset.idx), b.dataset.key);
    else if (act === "mode") { state.mode = b.dataset.mode; state.side = null; render(); }
    else if (act === "side") { state.side = b.dataset.side; render(); }
    else if (act === "clearResult") {
      const comp = live(), id = state.matchId;
      if (!comp) { close(); return CompShell.render(); }
      cmxConfirm({ title: t("results.delete"), yes: t("results.delete"), danger: true, message: t("results.deleteConfirm") }, function () { close(); CompResults.clear(comp, id); CompShell.render(); });
    }
    else if (act === "save") {
      const { f } = ctx(), ev = evaluation(f);
      if (ev.errors.length || !ev.winner) return;
      const comp = live(), id = state.matchId;
      if (!comp) { close(); return CompShell.render(); }
      const result = { sets: state.mode === "walkover" ? [] : cleanSets(f), outcome: state.mode, winner: ev.winner };
      CompResults.save(comp, id, result, function () { close(); CompShell.render(); });
    }
  }

  return { open, close };
})();
