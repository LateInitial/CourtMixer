// CourtMixer - court queue (Phase 3, v1.11.0), spec §9.9 and §10.2.
// Readiness, the suggested next match for an idle court, reasons when nothing is ready, and the
// greedy time estimate used on Review.

const CompSchedule = (function () {
  function stageOrder(D, match) {
    const m = D.meetingById[match.meetingId], st = m && D.stageById[m.stageId];
    return (st ? st.order : 0) * 1000 + (m ? m.round : 0);
  }

  function busyPlayers(D) {
    const busy = {};
    D.comp.matches.forEach(x => { if (x.status === "onCourt") D.playerIdsOf(x, "A").concat(D.playerIdsOf(x, "B")).forEach(p => { busy[p] = true; }); });
    return busy;
  }

  // A match is ready when its sides are known, nobody in it is on another court, and the
  // meeting isn't already decided (bye, walkover from a withdrawal, void, override).
  function isReady(D, x, busy) {
    if (x.status !== "pending") return false;
    const m = D.meetingById[x.meetingId];
    if (!m || m.status === "void") return false;
    const o = D.outcome(m);
    if (o.done) return false;
    const a = D.side(m, "A"), b = D.side(m, "B");
    if (!a || !b || a === "BYE" || b === "BYE") return false;
    busy = busy || busyPlayers(D);
    return !D.playerIdsOf(x, "A").concat(D.playerIdsOf(x, "B")).some(p => busy[p]);
  }

  // How long each player has rested: matches finished (anywhere) since their last one ended.
  function restInfo(D) {
    const ends = D.comp.matches.filter(x => x.status === "done" && x.endedAt).map(x => x.endedAt).sort((a, b) => a - b);
    const last = {};
    D.comp.matches.forEach(x => {
      if (x.status !== "done" || !x.endedAt) return;
      D.playerIdsOf(x, "A").concat(D.playerIdsOf(x, "B")).forEach(p => { if (!last[p] || x.endedAt > last[p]) last[p] = x.endedAt; });
    });
    return {
      lastEnd: (p) => last[p] || 0,
      restMatches: (p) => last[p] ? ends.filter(e => e > last[p]).length : Infinity
    };
  }

  function readyList(D, divisionFilter) {
    const busy = busyPlayers(D);
    const order = {};
    D.comp.matches.forEach((x, i) => { order[x.id] = i; });
    return D.comp.matches.filter(x => isReady(D, x, busy) && (!divisionFilter || x.divisionId === divisionFilter))
      .sort((a, b) => stageOrder(D, a) - stageOrder(D, b) || order[a.id] - order[b.id]);
  }

  // Ordered suggestions for one court (§10.2): court mode, lowest round, rest, fixture order.
  function suggestions(D, court) {
    const s = D.comp.settings, mode = s.courtMode || "shared";
    const home = court.homeDivisionIds || [];
    let list = readyList(D);
    if (mode === "dedicated" && home.length) list = list.filter(x => home.indexOf(x.divisionId) !== -1);
    const rest = restInfo(D), min = s.minRestMatches || 1;
    const rested = (x) => D.playerIdsOf(x, "A").concat(D.playerIdsOf(x, "B")).every(p => rest.restMatches(p) >= min);
    const oldest = (x) => Math.max.apply(null, D.playerIdsOf(x, "A").concat(D.playerIdsOf(x, "B")).map(rest.lastEnd).concat([0]));
    const idx = {};
    list.forEach((x, i) => { idx[x.id] = i; });
    const homeRank = (x) => (mode === "homeBorrow" && home.length && home.indexOf(x.divisionId) === -1) ? 1 : 0;
    const restRank = (x) => (s.restRule === "off" || rested(x)) ? 0 : 1;
    list.sort((a, b) => homeRank(a) - homeRank(b) || stageOrder(D, a) - stageOrder(D, b) || restRank(a) - restRank(b) || oldest(a) - oldest(b) || idx[a.id] - idx[b.id]);
    if (s.restRule === "strict") {
      const ok = list.filter(x => restRank(x) === 0);
      if (ok.length) return { list: ok, needsConfirm: false };
      return { list, needsConfirm: list.length > 0 };
    }
    return { list, needsConfirm: false };
  }

  // Plain reason when a court has nothing to start.
  function whyNothing(D, court) {
    const comp = D.comp;
    const open = comp.matches.filter(x => x.status !== "done" && !D.outcome(D.meetingById[x.meetingId]).done);
    if (!open.length) return t("courts.allDone");
    const mode = comp.settings.courtMode, home = court.homeDivisionIds || [];
    if (mode === "dedicated" && home.length && !open.some(x => home.indexOf(x.divisionId) !== -1)) return t("courts.noneForCourt");
    // a tie blocking a knockout slot
    for (const st of comp.stages) {
      if (st.type !== "groups") continue;
      for (const g of st.groups) {
        if (D.groupComplete(st.id, g.id) && D.table(st.id, g.id).some(r => r.tiedWith.length && r.rank <= (st.config.advance || 0) + 1)) {
          return t("courts.tie", { group: g.name });
        }
      }
    }
    const waitingKo = open.find(x => { const m = D.meetingById[x.meetingId]; return !D.side(m, "A") || !D.side(m, "B"); });
    const busyOnly = open.find(x => { const m = D.meetingById[x.meetingId]; return x.status === "pending" && D.side(m, "A") && D.side(m, "B"); });
    if (busyOnly) return t("courts.playersBusy");
    if (waitingKo) return t("courts.waitingFor", { what: D.meetingLabel(D.meetingById[waitingKo.meetingId], false) });
    return t("courts.nothing");
  }

  /* ===== Time estimate (§9.9) ===== */
  // Greedy simulation: courts are servers; each match takes minutes + changeover; matches go in
  // the default order, after the matches they depend on, never with a player on two courts.
  function estimate(comp, draw) {
    const s = comp.settings;
    const per = (s.minutesPerMatch || minutesDefault(comp)) + (s.changeoverMinutes || 0);
    const courts = Math.max(1, s.courtsCount || 1);
    const meetings = {}, matchOf = {};
    draw.meetings.forEach(m => { meetings[m.id] = m; });
    draw.matches.forEach(x => { matchOf[x.meetingId] = x; });
    const stageOf = {}; draw.stages.forEach(st => { stageOf[st.id] = st; });
    const entry = {}; comp.entries.forEach(e => { entry[e.id] = e; });
    const groupMatches = {};
    draw.meetings.forEach(m => { if (m.groupId && matchOf[m.id]) (groupMatches[m.groupId] = groupMatches[m.groupId] || []).push(matchOf[m.id].id); });
    // dependencies: knockout sources (skipping byes), group completion
    function depsOf(m, seen) {
      const out = [];
      [m.sideA, m.sideB].forEach(function (sd) {
        const src = sd.source;
        if (!src) return;
        if (src.kind === "groupRank") out.push.apply(out, groupMatches[src.groupId] || []);
        else if (src.meetingId) {
          const m2 = meetings[src.meetingId];
          if (m2 && matchOf[m2.id]) out.push(matchOf[m2.id].id);
          else if (m2 && !seen[m2.id]) { seen[m2.id] = true; out.push.apply(out, depsOf(m2, seen)); }
        }
      });
      return out;
    }
    const tasks = draw.matches.map((x, i) => {
      const m = meetings[x.meetingId], st = stageOf[m.stageId];
      const ids = [m.sideA.id, m.sideB.id].filter(Boolean);
      const players = [].concat.apply([], ids.map(id => (entry[id] && entry[id].playerIds) || []));
      const allowed = s.courtMode === "dedicated" ? (s.courtAssign && s.courtAssign[x.divisionId]) || null : null;
      return { id: x.id, key: (st ? st.order : 0) * 1000 + m.round, idx: i, deps: depsOf(m, {}), players, allowed: allowed && allowed.length ? allowed : null };
    }).sort((a, b) => a.key - b.key || a.idx - b.idx);
    const end = {}, playerFree = {}, courtFree = new Array(courts).fill(0);
    let remaining = tasks.slice(), guard = 0, makespan = 0;
    while (remaining.length && guard++ < 100000) {
      // earliest free court
      let c = 0;
      for (let i = 1; i < courts; i++) if (courtFree[i] < courtFree[c]) c = i;
      const now = courtFree[c];
      const pick = remaining.find(tk => (!tk.allowed || tk.allowed.indexOf(c) !== -1) &&
        tk.deps.every(d => end[d] !== undefined && end[d] <= now) && tk.players.every(p => (playerFree[p] || 0) <= now));
      if (!pick) {
        // jump to the next moment something finishes (or give the court up if it can never be used)
        const future = Object.keys(end).map(k => end[k]).concat(Object.keys(playerFree).map(k => playerFree[k])).concat(courtFree).filter(v => v > now);
        if (!future.length) { courtFree[c] = Infinity; if (courtFree.every(v => v === Infinity)) break; continue; }
        courtFree[c] = Math.min.apply(null, future);
        continue;
      }
      const fin = now + per;
      end[pick.id] = fin; courtFree[c] = fin; pick.players.forEach(p => { playerFree[p] = fin; });
      makespan = Math.max(makespan, fin);
      remaining.splice(remaining.indexOf(pick), 1);
    }
    const minutes = Math.max(0, makespan - (s.changeoverMinutes || 0));
    return { minutes: Math.round(minutes / 5) * 5, matches: draw.matches.length, complete: remaining.length === 0 };
  }

  function minutesDefault(comp) {
    const f = (comp.settings.matchFormats || {}).main;
    return f ? CompFormat.minutesFor(f) : 20;
  }

  function fmtDuration(min) {
    const h = Math.floor(min / 60), m = min % 60;
    return h ? (m ? t("time.hm", { h, m }) : t("time.h", { h })) : t("time.m", { m });
  }
  function finishTime(start, min) {
    const mt = /^(\d{1,2}):(\d{2})$/.exec(start || "");
    if (!mt) return null;
    const total = (+mt[1]) * 60 + (+mt[2]) + min;
    return String(Math.floor(total / 60) % 24).padStart(2, "0") + ":" + String(total % 60).padStart(2, "0");
  }

  return { isReady, readyList, suggestions, whyNothing, estimate, minutesDefault, fmtDuration, finishTime, busyPlayers };
})();
