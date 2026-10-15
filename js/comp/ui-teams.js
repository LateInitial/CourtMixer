// CourtMixer - team competition views (Phase 4, v1.12.0), spec §10.3-10.5 and §11.
// Lineups card on Courts, team standings, meeting cards on Results, team rosters on Entries, the
// team detail (record per division, players' records — stats follow the person) and deciding a
// level knockout meeting.

const CompTeamsUI = (function () {
  const ui = { resTeam: "", open: {}, showAllLineups: false };
  const H = () => CompUI.helpers;
  const sign = (n) => (n > 0 ? "+" : "") + n;

  // "4–2" once a meeting has any result, or what it's waiting for.
  function meetingNote(D, m) {
    const o = D.outcome(m);
    if (o.kind === "walkover") return t("results.wo");
    if (o.kind === "override") return t("teams.decided");
    const r = o.team || (D.isTeams && D.side(m, "A") && D.side(m, "B") ? D.teamResult(m) : null);
    if (!r) return "";
    const any = (D.matchesOfMeeting[m.id] || []).some(x => x.status === "done" || x.status === "onCourt");
    if (!any) return "";
    let s = r.matchesA + "–" + r.matchesB;
    if (!o.done) s += " · " + (r.needDecider ? t("teams.deciderNeeded") : r.needsDecision ? t("teams.needsDecision") : t("teams.inProgress"));
    return s;
  }

  /* ===== Courts: lineups ===== */
  function lineupsCard(D) {
    const comp = D.comp;
    const meetings = comp.meetings.filter(m => { const a = D.side(m, "A"), b = D.side(m, "B"); return a && b && a !== "BYE" && b !== "BYE" && !D.outcome(m).done &&
      (D.matchesOfMeeting[m.id] || []).some(x => x.status === "pending"); })
      .sort((a, b) => (D.stageById[a.stageId].order - D.stageById[b.stageId].order) || a.round - b.round);
    if (!meetings.length) return "";
    const need = CompLineups.needed(D);
    const isNeeded = (m, sd) => need.some(n => n.meeting.id === m.id && n.side === sd);
    const shown = ui.showAllLineups ? meetings : meetings.slice(0, 4);
    let h = '<div class="card"><div class="wiz-label">' + esc(t("teams.lineups")) + '</div><div class="muted">' + esc(t("teams.lineups.hint")) + "</div>";
    shown.forEach(function (m) {
      h += '<div class="cc-next"><span class="muted">' + esc(D.meetingLabel(m, false) + (meetingNote(D, m) ? " · " + meetingNote(D, m) : "")) + '</span><div class="comp-actions">' +
        ["A", "B"].map(sd => '<button type="button" class="' + (isNeeded(m, sd) ? "primary" : "secondary") + ' small" data-act="lineup" data-meeting="' + m.id + '" data-side="' + sd + '">' +
          esc(D.sideLabel(m, sd)) + (isNeeded(m, sd) ? " • " + esc(t("teams.needed")) : "") + "</button>").join("") + "</div></div>";
    });
    if (meetings.length > 4) h += '<button type="button" class="wiz-link" data-act="lineupsAll">' + esc(ui.showAllLineups ? t("courts.showLess") : t("courts.showAll", { n: meetings.length })) + "</button>";
    return h + "</div>";
  }

  /* ===== Standings ===== */
  function tableHtml(D, st, g) {
    const comp = D.comp, rows = D.table(st.id, g.id), f = D.formatFor(st), unit = f.setType === "games" ? "games" : "points";
    let h = '<div class="card st-card"><div class="st-row st-row-teams st-head"><span>#</span><span class="st-name">' + esc(t("teams.team")) + "</span>" +
      '<span class="st-x">' + esc(t("standings.p")) + "</span><span>" + esc(t("standings.w")) + '</span><span class="st-x">' + esc(t("teams.d")) + '</span><span class="st-x">' + esc(t("standings.l")) + "</span>" +
      "<span>" + esc(t("standings.pts")) + '</span><span class="st-x">' + esc(t("teams.matchDiff")) + '</span><span class="st-x">' + esc(t("standings.diff." + unit)) + "</span></div>";
    const adv = st.type === "groups" ? st.config.advance : 0, complete = D.groupComplete(st.id, g.id);
    rows.forEach(function (r, i) {
      const sub = [t("standings.p") + " " + r.played, t("teams.d") + " " + r.drawn, t("standings.l") + " " + r.lost, t("teams.matchDiff") + " " + sign(r.matchDiff), t("standings.diff." + unit) + " " + sign(r.gameDiff)];
      h += '<div class="st-row st-row-teams' + (adv && i === adv - 1 && rows.length > adv ? " st-line" : "") + (r.tiedWith.length && complete ? " st-tied" : "") + '">' +
        "<span>" + r.rank + (r.qualifies && complete && !r.tiedWith.length ? '<span class="st-q">Q</span>' : "") + "</span>" +
        '<span class="st-name"><button type="button" class="st-link" data-act="entry" data-id="' + esc(r.id) + '">' + esc(D.entryLabel(r.id)) + '</button><span class="st-sub">' + esc(sub.join(" · ")) + "</span></span>" +
        '<span class="st-x">' + r.played + "</span><span>" + r.won + '</span><span class="st-x">' + r.drawn + '</span><span class="st-x">' + r.lost + "</span>" +
        "<span><b>" + r.points + '</b></span><span class="st-x">' + sign(r.matchDiff) + '</span><span class="st-x">' + sign(r.gameDiff) + "</span></div>";
    });
    h += "</div>";
    if (rows.some(r => r.tiedWith.length) && complete) {
      h += '<div class="wiz-warn">' + esc(t("standings.tie")) + '<div class="comp-actions"><button type="button" class="secondary small" data-act="decideTie" data-stage="' + st.id + '" data-group="' + g.id + '">' + esc(t("standings.decide")) + "</button></div></div>";
    }
    return h;
  }

  // Team detail: meetings, record per division, and every player's own record (§11).
  function teamDetail(comp, teamId) {
    const D = CompStandings.derive(comp), tm = D.teamById[teamId];
    if (!tm) return;
    const perDiv = {}, perPlayer = {};
    comp.divisions.forEach(d => { perDiv[d.id] = { w: 0, l: 0 }; });
    const lines = [];
    comp.meetings.forEach(function (m) {
      const as = D.side(m, "A") === teamId ? "A" : D.side(m, "B") === teamId ? "B" : null;
      if (!as) return;
      const o = D.outcome(m), opp = D.sideLabel(m, as === "A" ? "B" : "A");
      const res = o.done && o.winner ? (o.winner === "draw" ? t("teams.drew") : o.winner === as ? t("detail.won") : t("detail.lost")) : "";
      lines.push('<div class="detail-line"><span class="muted">' + esc(D.meetingLabel(m, true)) + "</span><span>" + esc(t("detail.vs", { opp })) + "</span><span>" + esc((res + " " + meetingNote(D, m)).trim()) + "</span></div>");
      (D.matchesOfMeeting[m.id] || []).filter(x => x.status === "done" && x.winner).forEach(function (x) {
        const won = x.winner === as;
        if (perDiv[x.divisionId]) perDiv[x.divisionId][won ? "w" : "l"]++;
        D.playerIdsOf(x, as).forEach(pid => { const p = perPlayer[pid] = perPlayer[pid] || { w: 0, l: 0 }; p[won ? "w" : "l"]++; });
      });
    });
    const divLine = comp.divisions.map(d => d.name + ": " + perDiv[d.id].w + "–" + perDiv[d.id].l).join(", ");
    const players = comp.players.filter(p => p.teamId === teamId).map(p => {
      const r = perPlayer[p.id] || { w: 0, l: 0 };
      return '<div class="detail-line"><span>' + esc(p.name + (p.role === "reserve" ? " (" + t("lineup.reserve") + ")" : "")) + '</span><span class="muted">' + esc(t("teams.playerRecord", { w: r.w, l: r.l })) + "</span></div>";
    });
    cmxShowModal({ title: tm.name, bodyHTML: '<p class="cmx-modal-text">' + esc(t("teams.byDivision", { list: divLine })) + "</p>" + lines.join("") +
      '<div class="wiz-label" style="margin-top:10px">' + esc(t("teams.players")) + "</div>" + players.join(""),
      buttons: [{ label: t("wiz.close"), cls: "ghost", onClick: function () {} }] });
  }

  /* ===== Results: meeting cards ===== */
  function renderResults(root, comp) {
    const D = CompStandings.derive(comp);
    let h = '<div class="card">' + H().chips("resTeam", [{ value: "", label: t("filter.all") }].concat(comp.teams.map(tm => ({ value: tm.id, label: tm.name }))), ui.resTeam) + "</div>";
    const activity = (m) => Math.max.apply(null, (D.matchesOfMeeting[m.id] || []).map(x => x.endedAt || x.startedAt || 0).concat([0]));
    const list = comp.meetings.filter(m => (D.matchesOfMeeting[m.id] || []).some(x => x.status === "done" || x.status === "onCourt") || D.outcome(m).kind === "walkover")
      .filter(m => !ui.resTeam || D.side(m, "A") === ui.resTeam || D.side(m, "B") === ui.resTeam)
      .sort((a, b) => activity(b) - activity(a));
    if (!list.length) h += '<div class="card muted">' + esc(t("results.none")) + "</div>";
    list.forEach(function (m) {
      const o = D.outcome(m), open = ui.open[m.id] !== false;
      const side = (sd) => '<span class="' + (o.winner === sd ? "win" : "") + '">' + esc(D.sideLabel(m, sd)) + "</span>";
      h += '<div class="card res-meeting"><button type="button" class="res-meeting-head" data-act="meetingToggle" data-id="' + m.id + '"><span class="muted">' + esc(D.meetingLabel(m, false)) + "</span>" +
        '<span class="res-score">' + side("A") + " <b>" + esc(meetingNote(D, m) || "–") + "</b> " + side("B") + "</span></button>";
      if (open) {
        (D.matchesOfMeeting[m.id] || []).slice().sort((a, b) => a.order - b.order).forEach(function (x) {
          const rb = D.rubberOf(x), dead = !D.rubberNeeded(x);
          const status = x.status === "done" ? H().setsText(x) : x.status === "onCourt" ? t("results.onCourt") : dead ? t("teams.notNeeded") : t("teams.toPlay");
          const ps = (sd) => H().playerNames(comp, D.playerIdsOf(x, sd)) || t("teams.lineupTbc");
          h += '<button type="button" class="res-rubber' + (dead ? " dead" : "") + '" data-act="' + (x.status === "done" ? "editResult" : "noop") + '" data-id="' + x.id + '">' +
            '<span class="res-rubber-label">' + esc(rb.label || "") + "</span>" +
            '<span class="' + (x.winner === "A" ? "win" : "") + '">' + esc(ps("A")) + '</span><span class="' + (x.winner === "B" ? "win" : "") + '">' + esc(ps("B")) + "</span>" +
            '<span class="res-sets">' + esc(status) + "</span></button>";
        });
        if (o.team && o.team.needsDecision) h += '<button type="button" class="secondary small" data-act="decideMeeting" data-id="' + m.id + '">' + esc(t("teams.decideWinner")) + "</button>";
      }
      h += "</div>";
    });
    root.innerHTML = '<div class="comp-results">' + h + "</div>";
  }

  /* ===== Entries: rosters ===== */
  function renderEntries(root, comp) {
    let h = "";
    comp.teams.forEach(function (tm) {
      h += '<div class="card"><div class="cc-head"><b>' + esc(tm.name) + "</b>" + (tm.withdrawn ? '<span class="wiz-rec amber">' + esc(t("entries.withdrawn")) + "</span>" : "") + "</div>";
      comp.divisions.forEach(function (d) {
        const ps = comp.players.filter(p => p.teamId === tm.id && p.divisionId === d.id);
        if (!ps.length) return;
        const pairs = comp.entries.filter(e => e.teamId === tm.id && e.divisionId === d.id).map(e => e.label + ": " + H().playerNames(comp, e.playerIds));
        h += '<div class="wiz-label">' + esc(d.name) + '</div><div class="muted">' + esc(pairs.join(" · ")) + "</div>" +
          '<div class="team-roster">' + ps.map(p => esc(p.name) + (p.role === "reserve" ? ' <span class="muted">(' + esc(t("lineup.reserve")) + ")</span>" : "")).join(", ") + "</div>";
      });
      if (!tm.withdrawn) h += '<div class="comp-actions"><button type="button" class="secondary small" data-act="addReserve" data-id="' + tm.id + '">' + esc(t("teams.addReserve")) + "</button>" +
        '<button type="button" class="secondary small" data-act="entry" data-id="' + tm.id + '">' + esc(t("teams.details")) + "</button>" +
        '<button type="button" class="secondary small" data-act="withdraw" data-id="' + tm.id + '">' + esc(t("teams.withdraw")) + "</button></div>";
      h += "</div>";
    });
    h += '<div class="muted">' + esc(t("teams.entriesHelp")) + "</div>";
    root.innerHTML = h;
  }

  function addReserve(comp, teamId) {
    const tm = comp.teams.find(x => x.id === teamId);
    if (!tm) return;
    const d0 = comp.divisions[0];
    H().peopleDialog(t("teams.addReserve"), t("teams.addReserve.hint", { team: tm.name }), [""], [d0 && d0.category === "WD" ? "F" : "M"], t("entries.add"), function (names, g) {
      // A reserve is listed under the first division; with "reserves may play any division" they can play anywhere.
      CompShell.snapshot(t("teams.addReserve"), comp);
      comp.players.push({ id: uid(), name: names[0], gender: g[0], teamId: tm.id, divisionId: d0 ? d0.id : null, role: "reserve", withdrawn: false });
      CompStore.save(comp); CompShell.render();
      showToast(esc(t("teams.reserveAdded", { name: names[0], team: tm.name })));
    });
  }

  // A knockout meeting level on matches and points/games: the organiser picks who goes through.
  function decideMeeting(comp, meetingId) {
    const D = CompStandings.derive(comp), m = D.meetingById[meetingId];
    if (!m) return;
    const pick = function (sd) {
      const before = JSON.parse(JSON.stringify(comp));
      CompShell.snapshot(t("teams.decideWinner"), comp);
      const live = comp.meetings.find(x => x.id === meetingId);
      live.resultOverride = { winner: sd, reason: "organiser" };
      setTimeout(function () { CompShell.settle(comp, before, t("teams.decideWinner")); }, 0);
    };
    cmxShowModal({ title: t("teams.decideWinner"), bodyHTML: cmxMsgHtml(t("teams.decide.hint")), buttons: [
      { label: D.sideLabel(m, "A"), cls: "secondary", onClick: function () { pick("A"); } },
      { label: D.sideLabel(m, "B"), cls: "secondary", onClick: function () { pick("B"); } },
      { label: t("wiz.cancel"), cls: "ghost", onClick: function () {} }] });
  }

  function onClick(comp, act, el) {
    if (act === "lineup") { CompLineups.edit(comp, el.dataset.meeting, el.dataset.side); return true; }
    if (act === "lineupsAll") { ui.showAllLineups = !ui.showAllLineups; CompShell.render(); return true; }
    if (act === "decideMeeting") { decideMeeting(comp, el.dataset.id); return true; }
    if (act === "addReserve") { addReserve(comp, el.dataset.id); return true; }
    if (act === "resTeam") { ui.resTeam = el.dataset.value; CompShell.render(); return true; }
    if (act === "meetingToggle") { ui.open[el.dataset.id] = ui.open[el.dataset.id] === false; CompShell.render(); return true; }
    if (act === "noop") return true;
    return false;
  }

  return { lineupsCard, tableHtml, meetingNote, teamDetail, renderResults, renderEntries, onClick };
})();
