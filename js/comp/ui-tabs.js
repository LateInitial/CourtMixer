// CourtMixer - competition tabs (Phase 3, v1.11.0), spec §10.1 and §10.3-10.5.
// Courts (the main screen), Standings (tables + vertical bracket), Results (newest first, tap to
// edit) and Entries (withdraw, late entry). Everything shown is derived from match records.

const CompUI = (function () {
  const ui = { div: null, group: null, resDiv: "", resQuery: "", upNextDiv: "", showAll: false, entDiv: null };
  function D_(comp) { return CompStandings.derive(comp); }
  function seg(act, items, selected) {
    return '<div class="court-segments comp-seg">' + items.map(it => '<button type="button" class="court-segment ' + (it.value === selected ? "active" : "") + '" data-act="' + act + '" data-value="' + esc(it.value) + '">' + esc(it.label) + "</button>").join("") + "</div>";
  }
  function chips(act, items, selected) {
    return '<div class="wiz-chips">' + items.map(it => '<button type="button" class="wiz-chip ' + (it.value === selected ? "on" : "") + '" data-act="' + act + '" data-value="' + esc(it.value) + '">' + esc(it.label) + "</button>").join("") + "</div>";
  }
  function playerNames(comp, ids) { return ids.map(id => (comp.players.find(p => p.id === id) || {}).name || "?").join(" / "); }
  function setsText(x) {
    if (x.outcome === "walkover") return t("results.wo");
    return (x.sets || []).map(s => s.a + "–" + s.b + (Number.isInteger(s.tbA) ? "(" + Math.min(s.tbA, s.tbB) + ")" : "")).join("  ") + (x.outcome === "retired" ? " " + t("results.ret") : "");
  }
  // Whole minutes on court (refreshed every 30 s).
  function elapsed(since) { return t("courts.elapsed", { m: Math.max(0, Math.floor((Date.now() - since) / 60000)) }); }
  function divName(D, id) { const d = D.divisionById[id]; return d ? d.name : ""; }

  /* ===== Courts ===== */
  function renderCourts(root, comp) {
    const D = D_(comp);
    let h = '<div class="comp-courts">';
    // Each idle court gets its own suggestion: a match (or player) offered to an earlier court
    // isn't offered again.
    const takenMatch = {}, takenPlayer = {};
    const ctx = CompSchedule.context(D); // ready list + rest, shared by every court
    comp.courts.filter(c => c.active).forEach(function (c) {
      const x = comp.matches.find(m => m.status === "onCourt" && m.courtId === c.id);
      h += '<div class="card cc-card' + (x ? " busy" : "") + '"><div class="cc-head"><b>' + esc(c.name) + "</b>";
      if (x) {
        const m = D.meetingById[x.meetingId];
        h += '<span class="elapsed" data-since="' + (x.startedAt || Date.now()) + '">' + elapsed(x.startedAt || Date.now()) + "</span></div>" +
          '<div class="muted">' + esc(divName(D, x.divisionId) + " · " + D.meetingLabel(m, false)) + "</div>" +
          '<div class="cc-sides"><div>' + esc(playerNames(comp, D.playerIdsOf(x, "A"))) + '</div><div class="vs">' + esc(t("courts.vs")) + "</div><div>" + esc(playerNames(comp, D.playerIdsOf(x, "B"))) + "</div></div>" +
          '<div class="comp-actions"><button type="button" class="primary" data-act="score" data-id="' + x.id + '">' + esc(t("courts.enterScore")) + "</button>" +
          '<button type="button" class="secondary" data-act="scoreMode" data-mode="walkover" data-id="' + x.id + '">' + esc(t("score.walkover")) + "</button>" +
          '<button type="button" class="secondary" data-act="scoreMode" data-mode="retired" data-id="' + x.id + '">' + esc(t("score.retired")) + "</button>" +
          '<button type="button" class="secondary" data-act="more" data-id="' + x.id + '" aria-label="' + esc(t("courts.more")) + '">⋯</button></div>';
      } else {
        h += '<span class="muted">' + esc(t("courts.free")) + "</span></div>";
        const sg = CompSchedule.suggestions(D, c, ctx);
        const s = sg.list.find(x => !takenMatch[x.id] && !D.playerIdsOf(x, "A").concat(D.playerIdsOf(x, "B")).some(p => takenPlayer[p]));
        if (s) {
          takenMatch[s.id] = true;
          D.playerIdsOf(s, "A").concat(D.playerIdsOf(s, "B")).forEach(p => { takenPlayer[p] = true; });
          const m = D.meetingById[s.meetingId];
          h += '<div class="muted">' + esc(t("courts.suggested") + " · " + divName(D, s.divisionId) + " · " + D.meetingLabel(m, false)) + "</div>" +
            '<div class="cc-sides"><div>' + esc(D.sideLabel(m, "A")) + '</div><div class="vs">' + esc(t("courts.vs")) + "</div><div>" + esc(D.sideLabel(m, "B")) + "</div></div>" +
            '<div class="comp-actions"><button type="button" class="primary" data-act="start" data-id="' + s.id + '" data-court="' + c.id + '"' + (sg.needsConfirm ? ' data-confirm="1"' : "") + ">" + esc(t("courts.start")) + "</button>" +
            '<button type="button" class="secondary" data-act="choose" data-court="' + c.id + '">' + esc(t("courts.choose")) + "</button></div>";
        } else {
          h += '<div class="muted cc-why">' + esc(CompSchedule.whyNothing(D, c)) + "</div>";
          if (ctx.ready.length) h += '<div class="comp-actions"><button type="button" class="secondary" data-act="choose" data-court="' + c.id + '">' + esc(t("courts.choose")) + "</button></div>";
        }
      }
      h += "</div>";
    });
    h += "</div>";
    // Up next
    const ready = ui.upNextDiv ? ctx.ready.filter(x => x.divisionId === ui.upNextDiv) : ctx.ready;
    h += '<div class="card"><div class="wiz-label">' + esc(t("courts.upNext")) + "</div>";
    if (comp.divisions.length > 1) h += chips("upNextDiv", [{ value: "", label: t("filter.all") }].concat(comp.divisions.map(d => ({ value: d.id, label: d.name }))), ui.upNextDiv);
    if (!ready.length) h += '<div class="muted">' + esc(t("courts.noneReady")) + "</div>";
    h += ready.slice(0, ui.showAll ? ready.length : 5).map(x => {
      const m = D.meetingById[x.meetingId];
      return '<div class="cc-next"><span class="muted">' + esc(divName(D, x.divisionId) + " · " + D.meetingLabel(m, true)) + "</span><span>" + esc(D.sideLabel(m, "A") + " " + t("courts.vs") + " " + D.sideLabel(m, "B")) + "</span></div>";
    }).join("");
    if (ready.length > 5) h += '<button type="button" class="wiz-link" data-act="showAll">' + esc(ui.showAll ? t("courts.showLess") : t("courts.showAll", { n: ready.length })) + "</button>";
    h += "</div>";
    root.innerHTML = h;
  }

  function startMatch(comp, matchId, courtId) {
    const D = D_(comp), x = comp.matches.find(m => m.id === matchId);
    if (!x || !CompSchedule.isReady(D, x)) return;
    const m = D.meetingById[x.meetingId];
    x.status = "onCourt"; x.courtId = courtId; x.startedAt = Date.now();
    x.sideA.playerIds = D.playerIdsOf(x, "A"); x.sideB.playerIds = D.playerIdsOf(x, "B");
    x.entryIds = { A: D.side(m, "A"), B: D.side(m, "B") };
    CompStore.save(comp);
    CompShell.render();
  }
  function sendBack(comp, matchId) {
    const x = comp.matches.find(m => m.id === matchId);
    if (!x || x.status !== "onCourt") return;
    CompStandings.resetMatch(x);
    CompStore.save(comp); CompShell.render();
  }
  function chooseMatch(comp, courtId) {
    const D = D_(comp), ready = CompSchedule.readyList(D);
    const groups = {};
    ready.forEach(x => { const k = divName(D, x.divisionId) + " · " + D.meetingLabel(D.meetingById[x.meetingId], true).replace(/ \d+$/, ""); (groups[k] = groups[k] || []).push(x); });
    const body = Object.keys(groups).map(k => '<div class="wiz-label">' + esc(k) + "</div>" + groups[k].map(x => {
      const m = D.meetingById[x.meetingId];
      return '<button type="button" class="comp-list-item" data-id="' + x.id + '"><span class="comp-list-name">' + esc(D.sideLabel(m, "A") + " " + t("courts.vs") + " " + D.sideLabel(m, "B")) + '</span><span class="muted">' + esc(D.meetingLabel(m, false)) + "</span></button>";
    }).join("")).join("") || cmxMsgHtml(t("courts.noneReady"));
    cmxShowModal({ title: t("courts.choose"), bodyHTML: '<div class="comp-list">' + body + "</div>", buttons: [{ label: t("wiz.close"), cls: "ghost", onClick: function () {} }],
      onOpen: function (box) { box.querySelectorAll(".comp-list-item").forEach(b => { b.onclick = function () { cmxCloseModal(); startMatch(comp, b.dataset.id, courtId); }; }); } });
  }
  function moreMenu(comp, matchId) {
    const idle = comp.courts.filter(c => c.active && !comp.matches.some(m => m.status === "onCourt" && m.courtId === c.id));
    const buttons = [{ label: t("courts.subOnce"), cls: "secondary", onClick: function () { substituteOnce(comp, matchId); } },
      { label: t("courts.sendBack"), cls: "secondary", onClick: function () { sendBack(comp, matchId); } }];
    idle.forEach(c => buttons.push({ label: t("courts.moveTo", { court: c.name }), cls: "secondary", onClick: function () {
      const x = comp.matches.find(m => m.id === matchId); if (x) { x.courtId = c.id; CompStore.save(comp); CompShell.render(); } } }));
    buttons.push({ label: t("wiz.close"), cls: "ghost", onClick: function () {} });
    cmxShowModal({ title: t("courts.more"), bodyHTML: "", buttons });
  }

  /* ===== Standings ===== */
  function renderStandings(root, comp) {
    const D = D_(comp);
    if (!ui.div || !D.divisionById[ui.div]) ui.div = comp.divisions[0] && comp.divisions[0].id;
    let h = "";
    if (comp.divisions.length > 1) h += seg("stDiv", comp.divisions.map(d => ({ value: d.id, label: d.name })), ui.div);
    const stages = comp.stages.filter(s => s.divisionId === ui.div).sort((a, b) => a.order - b.order);
    const views = [];
    stages.forEach(st => {
      if (st.type === "knockout") views.push({ value: st.id + ":ko", label: t("standings.knockout"), st });
      else st.groups.forEach(g => views.push({ value: st.id + ":" + g.id, label: st.type === "groups" ? t("standings.group", { g: g.name }) : t("standings.table"), st, g }));
    });
    if (!views.some(v => v.value === ui.group)) ui.group = views.length ? views[0].value : null;
    if (views.length > 1) h += chips("stGroup", views, ui.group);
    const v = views.find(x => x.value === ui.group);
    if (!v) { root.innerHTML = h + '<div class="card muted">' + esc(t("standings.none")) + "</div>"; return; }
    h += v.g ? tableHtml(comp, D, v.st, v.g) : bracketHtml(comp, D, v.st);
    root.innerHTML = h;
  }

  function tableHtml(comp, D, st, g) {
    const rows = D.table(st.id, g.id), f = D.formatFor(st), p = comp.settings.standings.pairs;
    const showPts = p.rankBy !== "wins", showSets = f.sets > 1, unit = f.setType === "games" ? "games" : "points";
    const sign = (n) => (n > 0 ? "+" : "") + n;
    let h = '<div class="card st-card"><div class="st-row st-head"><span>#</span><span class="st-name">' + esc(t("standings.entry")) + "</span>" +
      '<span class="st-x">' + esc(t("standings.p")) + "</span><span>" + esc(t("standings.w")) + '</span><span class="st-x">' + esc(t("standings.l")) + "</span>" +
      (showPts ? "<span>" + esc(t("standings.pts")) + "</span>" : "<span></span>") +
      '<span class="st-x">' + (showSets ? esc(t("standings.setDiff")) : "") + '</span><span class="st-x">' + esc(t("standings.diff." + unit)) + "</span></div>";
    const adv = st.type === "groups" ? st.config.advance : 0, complete = D.groupComplete(st.id, g.id);
    rows.forEach(function (r, i) {
      const sub = [t("standings.p") + " " + r.played, t("standings.l") + " " + r.lost].concat(showSets ? [t("standings.setDiff") + " " + sign(r.setDiff)] : []).concat([t("standings.diff." + unit) + " " + sign(r.gameDiff)]);
      h += '<div class="st-row' + (adv && i === adv - 1 && rows.length > adv ? " st-line" : "") + (r.tiedWith.length ? " st-tied" : "") + '">' +
        "<span>" + r.rank + (r.qualifies && complete && !r.tiedWith.length ? '<span class="st-q">Q</span>' : "") + "</span>" +
        '<span class="st-name"><button type="button" class="st-link" data-act="entry" data-id="' + esc(r.id) + '">' + esc(D.entryLabel(r.id)) + '</button><span class="st-sub">' + esc(sub.join(" · ")) + "</span></span>" +
        '<span class="st-x">' + r.played + "</span><span><b>" + r.won + '</b></span><span class="st-x">' + r.lost + "</span>" +
        (showPts ? "<span><b>" + r.points + "</b></span>" : "<span></span>") +
        '<span class="st-x">' + (showSets ? sign(r.setDiff) : "") + '</span><span class="st-x">' + sign(r.gameDiff) + "</span></div>";
    });
    h += "</div>";
    const tied = rows.filter(r => r.tiedWith.length);
    if (tied.length && D.groupComplete(st.id, g.id)) {
      h += '<div class="wiz-warn">' + esc(t("standings.tie")) + '<div class="comp-actions"><button type="button" class="secondary small" data-act="decideTie" data-stage="' + st.id + '" data-group="' + g.id + '">' + esc(t("standings.decide")) + "</button></div></div>";
    }
    return h;
  }

  function bracketHtml(comp, D, st) {
    const ms = comp.meetings.filter(m => m.stageId === st.id);
    const rounds = {};
    ms.forEach(m => { const k = m.thirdPlace ? 999 : m.round; (rounds[k] = rounds[k] || []).push(m); });
    let h = "";
    Object.keys(rounds).map(Number).sort((a, b) => a - b).forEach(function (r) {
      const list = rounds[r].sort((a, b) => a.slot - b.slot);
      h += '<div class="card ko-round"><div class="wiz-label">' + esc(D.meetingLabel(list[0], false).replace(/ \d+$/, "")) + "</div>";
      list.forEach(function (m) {
        const o = D.outcome(m), x = D.matchByMeeting[m.id];
        const line = (sd) => '<div class="ko-side' + (o.winner === sd ? " win" : "") + '">' + esc(D.sideLabel(m, sd)) + "</div>";
        h += '<div class="ko-meeting">' + line("A") + line("B") +
          '<div class="muted">' + esc(o.kind === "bye" ? t("ko.byeNote") : x && x.status === "done" ? setsText(x) : x && x.status === "onCourt" ? t("results.onCourt") : "") + "</div></div>";
      });
      h += "</div>";
    });
    return h || '<div class="card muted">' + esc(t("standings.none")) + "</div>";
  }

  function decideTie(comp, stageId, groupId) {
    const D = D_(comp), st = D.stageById[stageId];
    const rows = D.table(stageId, groupId), tied = rows.filter(r => r.tiedWith.length);
    let order = tied.map(r => r.id);
    function body() {
      return '<p class="cmx-modal-text">' + esc(t("standings.decide.hint")) + '</p><div class="wiz-list">' + order.map((id, i) =>
        '<div class="wiz-pair"><span class="wiz-pair-n">' + (i + 1) + '.</span><span class="wiz-pair-name">' + esc(D.entryLabel(id)) + "</span>" +
        '<button type="button" class="wiz-icon" data-up="' + i + '"' + (i ? "" : " disabled") + ">↑</button>" +
        '<button type="button" class="wiz-icon" data-down="' + i + '"' + (i < order.length - 1 ? "" : " disabled") + ">↓</button></div>").join("") + "</div>";
    }
    function bind(box) {
      box.querySelectorAll("[data-up],[data-down]").forEach(b => { b.onclick = function () {
        const i = Number(b.dataset.up !== undefined ? b.dataset.up : b.dataset.down), j = b.dataset.up !== undefined ? i - 1 : i + 1;
        const x = order[i]; order[i] = order[j]; order[j] = x;
        box.querySelector(".cmx-modal-body").innerHTML = body(); bind(box);
      }; });
    }
    cmxShowModal({ title: t("standings.decide"), bodyHTML: body(), onOpen: bind, buttons: [
      { label: t("standings.decide.save"), cls: "primary", onClick: function () {
        const before = JSON.parse(JSON.stringify(comp));
        CompShell.snapshot(t("standings.decide"), comp);
        st.config.manualOrder = st.config.manualOrder || {};
        const prev = st.config.manualOrder[groupId] || [];
        st.config.manualOrder[groupId] = order.concat(prev.filter(id => order.indexOf(id) === -1));
        setTimeout(function () { CompShell.settle(comp, before, t("standings.decide")); }, 0);
      } },
      { label: t("wiz.close"), cls: "ghost", onClick: function () {} }] });
  }

  function entryDetail(comp, entryId) {
    const D = D_(comp), e = D.entryById[entryId];
    if (!e) return;
    let w = 0, l = 0, gf = 0, ga = 0;
    const lines = comp.meetings.filter(m => D.side(m, "A") === entryId || D.side(m, "B") === entryId).map(function (m) {
      const as = D.side(m, "A") === entryId ? "A" : "B", o = D.outcome(m), x = D.matchByMeeting[m.id], sc = D.score(m);
      const opp = D.sideLabel(m, as === "A" ? "B" : "A");
      let res = "";
      if (o.done && o.winner && o.kind !== "bye") {
        if (o.winner === as) { w++; res = t("detail.won"); } else { l++; res = t("detail.lost"); }
        if (sc) { gf += as === "A" ? sc.gamesA : sc.gamesB; ga += as === "A" ? sc.gamesB : sc.gamesA; }
      } else if (o.kind === "bye") res = t("ko.byeNote");
      return '<div class="detail-line"><span class="muted">' + esc(D.meetingLabel(m, true)) + "</span><span>" + esc(t("detail.vs", { opp })) + "</span><span>" + esc(res + (x && x.status === "done" ? " " + setsText(x) : "")) + "</span></div>";
    });
    cmxShowModal({ title: e.label, bodyHTML: '<p class="cmx-modal-text">' + esc(t("detail.summary", { div: divName(D, e.divisionId), w, l, diff: (gf - ga > 0 ? "+" : "") + (gf - ga) })) + "</p>" + lines.join(""),
      buttons: [{ label: t("wiz.close"), cls: "ghost", onClick: function () {} }] });
  }

  /* ===== Results ===== */
  function renderResults(root, comp) {
    const D = D_(comp);
    let h = '<div class="card">';
    if (comp.divisions.length > 1) h += chips("resDiv", [{ value: "", label: t("filter.all") }].concat(comp.divisions.map(d => ({ value: d.id, label: d.name }))), ui.resDiv);
    h += '<input type="search" class="wiz-input" data-field="resQuery" placeholder="' + esc(t("results.search")) + '" value="' + esc(ui.resQuery) + '"></div>';
    const q = ui.resQuery.trim().toLowerCase();
    const done = comp.matches.filter(x => x.status === "done" && (!ui.resDiv || x.divisionId === ui.resDiv)).filter(x => {
      if (!q) return true;
      const m = D.meetingById[x.meetingId];
      return (D.sideLabel(m, "A") + " " + D.sideLabel(m, "B") + " " + D.meetingLabel(m, false)).toLowerCase().indexOf(q) !== -1;
    }).sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0));
    h += '<div class="comp-results">';
    if (!done.length) h += '<div class="card muted">' + esc(t("results.none")) + "</div>";
    done.forEach(function (x) {
      const m = D.meetingById[x.meetingId];
      const side = (sd) => '<div class="res-side' + (x.winner === sd ? " win" : "") + '">' + esc(playerNames(comp, D.playerIdsOf(x, sd)) || D.sideLabel(m, sd)) + "</div>";
      h += '<button type="button" class="card res-card" data-act="editResult" data-id="' + x.id + '"><div class="muted">' + esc(divName(D, x.divisionId) + " · " + D.meetingLabel(m, false)) + "</div>" +
        side("A") + side("B") + '<div class="res-sets">' + esc(setsText(x)) + (x.editedAt ? ' <span class="muted">' + esc(t("results.edited")) + "</span>" : "") + "</div></button>";
    });
    h += "</div>";
    root.innerHTML = h;
  }

  /* ===== Entries ===== */
  function renderEntries(root, comp) {
    const D = D_(comp);
    if (!ui.entDiv || !D.divisionById[ui.entDiv]) ui.entDiv = comp.divisions[0] && comp.divisions[0].id;
    let h = "";
    if (comp.divisions.length > 1) h += seg("entDiv", comp.divisions.map(d => ({ value: d.id, label: d.name })), ui.entDiv);
    const list = comp.entries.filter(e => e.divisionId === ui.entDiv);
    const started = divisionStarted(comp, ui.entDiv);
    const genders = (e) => e.playerIds.map(id => (comp.players.find(p => p.id === id) || {}).gender || "M").join("/");
    h += '<div class="card"><div class="wiz-list">' + list.map(e => '<div class="wiz-pair' + (e.withdrawn ? " withdrawn" : "") + '"><span class="wiz-pair-name"><button type="button" class="st-link" data-act="entry" data-id="' + esc(e.id) + '">' + esc(e.label) + "</button>" +
      ' <span class="muted">' + esc(genders(e)) + "</span>" +
      (e.withdrawn ? ' <span class="wiz-rec amber">' + esc(t("entries.withdrawn")) + "</span>" : "") + (e.seed ? ' <span class="muted">' + esc(t("entries.seedN", { n: e.seed })) + "</span>" : "") + "</span>" +
      (e.withdrawn ? "" : '<button type="button" class="wiz-icon" data-act="fixPair" data-id="' + esc(e.id) + '" aria-label="' + esc(t("entries.fix")) + '">\u270e</button>' +
        '<button type="button" class="secondary small" data-act="pairMenu" data-id="' + esc(e.id) + '">' + esc(t("entries.change")) + "</button>") + "</div>").join("") + "</div>";
    if (!started) h += '<div class="comp-actions"><button type="button" class="secondary" data-act="lateEntry">' + esc(t("entries.late")) + "</button>" +
      '<button type="button" class="secondary" data-act="redraw">' + esc(t("entries.redraw")) + "</button></div>";
    else h += '<div class="muted">' + esc(t("entries.lateClosed")) + "</div>";
    h += '<div class="muted">' + esc(t("entries.help")) + "</div></div>";
    root.innerHTML = h;
  }

  function withdraw(comp, entryId) {
    const e = comp.entries.find(x => x.id === entryId);
    if (!e) return;
    const run = (mode) => {
      CompShell.snapshot(t("entries.withdraw"), comp);
      e.withdrawn = true; e.withdrawMode = mode;
      e.playerIds.forEach(id => { const p = comp.players.find(x => x.id === id); if (p) p.withdrawn = true; });
      comp.matches.forEach(x => { // anything on court for them goes back
        const m = comp.meetings.find(mm => mm.id === x.meetingId);
        if (x.status === "onCourt" && x.entryIds && (x.entryIds.A === e.id || x.entryIds.B === e.id)) CompStandings.resetMatch(x);
        if (mode === "void" && m && m.groupId && x.status === "done" && x.entryIds && (x.entryIds.A === e.id || x.entryIds.B === e.id)) m.status = "void";
      });
      comp.log.push({ at: Date.now(), action: "withdraw", entryId: e.id, mode });
      if (comp.log.length > 200) comp.log.shift();
      CompStandings.clearStale(comp);
      CompStore.save(comp); CompShell.render();
      CompShell.toastUndo(esc(t("entries.withdrawnToast", { pair: e.label })));
    };
    cmxShowModal({ title: t("entries.withdraw"), bodyHTML: cmxMsgHtml(t("entries.withdraw.q", { pair: e.label })), buttons: [
      { label: t("entries.withdraw.wo") + " (" + t("wiz.recommended") + ")", cls: "primary", onClick: function () { run("walkover"); } },
      { label: t("entries.withdraw.void"), cls: "secondary", onClick: function () { run("void"); } },
      { label: t("wiz.close"), cls: "ghost", onClick: function () {} }] });
  }

  // A started (on court) or finished match locks a division's draw.
  function divisionStarted(comp, divId) { return comp.matches.some(x => x.divisionId === divId && (x.status === "done" || x.status === "onCourt")); }
  function categoryGenders(comp, divId) { const d = comp.divisions.find(x => x.id === divId); return Wizard.pairsUtil.defaultGenders(d && d.category); }
  const labelOf = (comp, e) => Wizard.pairsUtil.labelOf(comp, e);

  // Name + M/F rows in the shared modal. onSave(names, genders) returns false to keep it open.
  function peopleDialog(title, hint, names, genders, saveLabel, onSave) {
    const g = genders.slice();
    const rows = names.map((n, i) => '<div class="wiz-item"><input type="text" class="wiz-input" maxlength="40" data-i="' + i + '" value="' + esc(n || "") + '" placeholder="' + esc(t("entries.player", { n: i + 1 })) + '">' +
      '<span class="gender-toggle wiz-g">' + ["M", "F"].map(x => '<button type="button" class="gender-seg' + (g[i] === x ? " active" : "") + '" data-gi="' + i + '" data-g="' + x + '">' + x + "</button>").join("") + "</span></div>").join("");
    cmxShowModal({ title: title, bodyHTML: (hint ? '<p class="cmx-modal-text">' + esc(hint) + "</p>" : "") + '<div class="wiz-list">' + rows + "</div>",
      onOpen: function (box) {
        box.querySelectorAll("[data-gi]").forEach(b => { b.onclick = function () {
          g[Number(b.dataset.gi)] = b.dataset.g;
          box.querySelectorAll('[data-gi="' + b.dataset.gi + '"]').forEach(x => x.classList.toggle("active", x === b));
        }; });
        const f = box.querySelector("input[data-i]"); if (f) f.focus();
      },
      buttons: [{ label: saveLabel, cls: "primary", onClick: function (box) {
        const n = names.map((x, i) => box.querySelector('input[data-i="' + i + '"]').value.trim());
        if (n.some(x => !x)) return false;
        return onSave(n, g);
      } }, { label: t("wiz.cancel"), cls: "ghost", onClick: function () {} }] });
  }

  function lateEntry(comp) {
    const divId = ui.entDiv;
    if (divisionStarted(comp, divId)) return;
    peopleDialog(t("entries.late"), t("entries.late.hint"), ["", ""], categoryGenders(comp, divId), t("entries.add"), function (names, g) {
      CompShell.snapshot(t("entries.late"), comp);
      Wizard.pairsUtil.addPair(comp, divId, names, g);
      regenerateDivision(comp, divId);
      CompStore.save(comp); CompShell.render();
      showToast(esc(t("entries.late.done")));
    });
  }
  // Corrects names/genders everywhere, including matches already played (a typo, not a substitution).
  function fixPair(comp, entryId) {
    const e = comp.entries.find(x => x.id === entryId);
    if (!e) return;
    const ps = e.playerIds.map(id => comp.players.find(p => p.id === id) || {});
    peopleDialog(t("entries.fix"), t("entries.fix.hint"), ps.map(p => p.name), ps.map(p => p.gender === "F" ? "F" : "M"), t("wiz.done"), function (names, g) {
      ps.forEach((p, i) => { p.name = names[i]; p.gender = g[i]; });
      e.label = labelOf(comp, e);
      CompStore.save(comp); CompShell.render();
    });
  }
  function newPlayer(comp, divId, name, gender, role, subFor) {
    const p = { id: uid(), name: name, gender: gender === "F" ? "F" : "M", teamId: null, divisionId: divId, role: role, withdrawn: false, subFor: subFor || null };
    comp.players.push(p);
    return p;
  }
  // From now on: the pair keeps its place, results and standings; later matches use the new player.
  function substitute(comp, entryId) {
    const e = comp.entries.find(x => x.id === entryId);
    if (!e) return;
    const ps = e.playerIds.map(id => comp.players.find(p => p.id === id) || {});
    cmxShowModal({ title: t("entries.sub"), bodyHTML: cmxMsgHtml(t("entries.sub.who")), buttons: ps.map((p, i) => ({ label: p.name, cls: "secondary", onClick: function () {
      peopleDialog(t("entries.sub.new", { name: p.name }), t("entries.sub.hint"), [""], [p.gender === "F" ? "F" : "M"], t("entries.sub.save"), function (names, g) {
        CompShell.snapshot(t("entries.sub"), comp);
        const np = newPlayer(comp, e.divisionId, names[0], g[0], "regular", p.id);
        p.replacedBy = np.id;
        e.playerIds[i] = np.id;
        e.label = labelOf(comp, e);
        comp.log.push({ at: Date.now(), action: "substitute", entryId: e.id, out: p.id, in: np.id });
        CompStore.save(comp); CompShell.render();
        CompShell.toastUndo(esc(t("entries.sub.done", { out: p.name, inn: np.name })));
      });
    } })).concat([{ label: t("wiz.cancel"), cls: "ghost", onClick: function () {} }]) });
  }
  // This match only (e.g. an injury mid-session); the pair's own players stay unchanged.
  function substituteOnce(comp, matchId) {
    const x = comp.matches.find(m => m.id === matchId);
    if (!x) return;
    const D = D_(comp);
    const opts = [];
    ["A", "B"].forEach(sd => D.playerIdsOf(x, sd).forEach((pid, i) => opts.push({ sd, i, p: comp.players.find(p => p.id === pid) || { name: "?" } })));
    cmxShowModal({ title: t("courts.subOnce"), bodyHTML: cmxMsgHtml(t("entries.sub.who")), buttons: opts.map(o => ({ label: o.p.name, cls: "secondary", onClick: function () {
      peopleDialog(t("entries.sub.new", { name: o.p.name }), t("courts.subOnce.hint"), [""], [o.p.gender === "F" ? "F" : "M"], t("entries.sub.save"), function (names, g) {
        CompShell.snapshot(t("courts.subOnce"), comp);
        const np = newPlayer(comp, x.divisionId, names[0], g[0], "reserve", o.p.id);
        const side = o.sd === "A" ? x.sideA : x.sideB;
        if (!side.playerIds.length) side.playerIds = D.playerIdsOf(x, o.sd);
        side.playerIds[o.i] = np.id;
        CompStore.save(comp); CompShell.render();
        CompShell.toastUndo(esc(t("entries.sub.done", { out: o.p.name, inn: np.name })));
      });
    } })).concat([{ label: t("wiz.cancel"), cls: "ghost", onClick: function () {} }]) });
  }
  function pairMenu(comp, entryId) {
    const e = comp.entries.find(x => x.id === entryId);
    if (!e) return;
    cmxShowModal({ title: e.label, bodyHTML: "", buttons: [
      { label: t("entries.sub"), cls: "secondary", onClick: function () { substitute(comp, entryId); } },
      { label: t("entries.withdraw"), cls: "secondary", onClick: function () { withdraw(comp, entryId); } },
      { label: t("wiz.close"), cls: "ghost", onClick: function () {} }] });
  }
  function redraw(comp) {
    const divId = ui.entDiv, d = comp.divisions.find(x => x.id === divId);
    if (!d || divisionStarted(comp, divId)) return;
    cmxConfirm({ title: t("entries.redraw"), yes: t("entries.redraw"), message: t("entries.redraw.q", { div: d.name }) }, function () {
      CompShell.snapshot(t("entries.redraw"), comp);
      d.drawSeq = (d.drawSeq || 0) + 1;
      regenerateDivision(comp, divId);
      CompStore.save(comp); CompShell.render();
      CompShell.toastUndo(esc(t("entries.redraw.done", { div: d.name })));
    });
  }
  // Rebuilds one division's draw (only while it has no results).
  function regenerateDivision(comp, divId) {
    const d = comp.divisions.find(x => x.id === divId);
    const oldStages = comp.stages.filter(s => s.divisionId === divId).map(s => s.id);
    const oldMeetings = comp.meetings.filter(m => oldStages.indexOf(m.stageId) !== -1).map(m => m.id);
    comp.stages = comp.stages.filter(s => oldStages.indexOf(s.id) === -1);
    comp.meetings = comp.meetings.filter(m => oldMeetings.indexOf(m.id) === -1);
    comp.matches = comp.matches.filter(x => oldMeetings.indexOf(x.meetingId) === -1);
    const r = CompGenerate.generateDivision(comp, d);
    comp.stages = comp.stages.concat(r.stages); comp.meetings = comp.meetings.concat(r.meetings); comp.matches = comp.matches.concat(r.matches);
  }

  /* ===== Events ===== */
  function onClick(comp, e) {
    const b = e.target.closest("[data-act]");
    if (!b) return false;
    const a = b.dataset.act, v = b.dataset.value;
    if (a === "start") {
      if (b.dataset.confirm) cmxConfirm({ title: t("courts.backToBack"), yes: t("courts.start"), message: t("courts.backToBack.q") }, () => startMatch(comp, b.dataset.id, b.dataset.court));
      else startMatch(comp, b.dataset.id, b.dataset.court);
    }
    else if (a === "choose") chooseMatch(comp, b.dataset.court);
    else if (a === "score" || a === "editResult") CompScore.open(comp, b.dataset.id);
    else if (a === "scoreMode") CompScore.open(comp, b.dataset.id, { mode: b.dataset.mode });
    else if (a === "more") moreMenu(comp, b.dataset.id);
    else if (a === "upNextDiv") { ui.upNextDiv = v; CompShell.render(); }
    else if (a === "showAll") { ui.showAll = !ui.showAll; CompShell.render(); }
    else if (a === "stDiv") { ui.div = v; ui.group = null; CompShell.render(); }
    else if (a === "stGroup") { ui.group = v; CompShell.render(); }
    else if (a === "decideTie") decideTie(comp, b.dataset.stage, b.dataset.group);
    else if (a === "entry") entryDetail(comp, b.dataset.id);
    else if (a === "resDiv") { ui.resDiv = v; CompShell.render(); }
    else if (a === "entDiv") { ui.entDiv = v; CompShell.render(); }
    else if (a === "withdraw") withdraw(comp, b.dataset.id);
    else if (a === "fixPair") fixPair(comp, b.dataset.id);
    else if (a === "pairMenu") pairMenu(comp, b.dataset.id);
    else if (a === "redraw") redraw(comp);
    else if (a === "lateEntry") lateEntry(comp);
    else return false;
    return true;
  }
  function onInput(comp, e) {
    if (e.target.dataset && e.target.dataset.field === "resQuery") {
      ui.resQuery = e.target.value;
      const pos = e.target.selectionStart;
      CompShell.render();
      const f = document.querySelector('[data-field="resQuery"]');
      if (f) { f.focus(); try { f.setSelectionRange(pos, pos); } catch (err) {} }
    }
  }
  function tick() {
    document.querySelectorAll("#compRoot .elapsed").forEach(el => { el.textContent = elapsed(Number(el.dataset.since)); });
  }

  return { renderCourts, renderStandings, renderResults, renderEntries, onClick, onInput, tick, startMatch, sendBack, regenerateDivision, ui };
})();
