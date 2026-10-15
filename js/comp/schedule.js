// CourtMixer - court queue (Phase 3, v1.11.0), spec §9.9 and §10.2.
// Readiness, the suggested next match for an idle court, reasons when nothing is ready, and the
// greedy time estimate used on Review.

const CompSchedule = (function () {
  // Queue order: stage, then round; the 3rd-place match goes just before the final.
  function stageOrder(D, match) {
    const m = D.meetingById[match.meetingId], st = m && D.stageById[m.stageId];
    return (st ? st.order : 0) * 1000 + (m ? m.round - (m.thirdPlace ? 0.5 : 0) : 0);
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
    if (!D.rubberNeeded(x)) return false;                     // dead rubber / decider not needed
    const pa = D.playerIdsOf(x, "A"), pb = D.playerIdsOf(x, "B");
    if (pa.length < 2 || pb.length < 2) return false;         // lineup still needed
    busy = busy || busyPlayers(D);
    return !pa.concat(pb).some(p => busy[p]);
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

  function readyList(D, divisionFilter, busy) {
    busy = busy || busyPlayers(D);
    const order = {};
    D.comp.matches.forEach((x, i) => { order[x.id] = i; });
    return D.comp.matches.filter(x => isReady(D, x, busy) && (!divisionFilter || x.divisionId === divisionFilter))
      .sort((a, b) => stageOrder(D, a) - stageOrder(D, b) || order[a.id] - order[b.id]);
  }

  // Work shared by every court on one screen: compute once, pass to suggestions().
  function context(D) { return { ready: readyList(D), rest: restInfo(D) }; }

  // Ordered suggestions for one court (§10.2): court mode, lowest round, rest, fixture order.
  function suggestions(D, court, ctx) {
    ctx = ctx || context(D);
    const s = D.comp.settings, mode = s.courtMode || "shared";
    const home = court.homeDivisionIds || [];
    let list = ctx.ready.slice();
    if (mode === "dedicated" && home.length) list = list.filter(x => home.indexOf(x.divisionId) !== -1);
    const rest = ctx.rest, min = s.minRestMatches || 1;
    // sort keys computed once per match, not per comparison
    const key = {};
    list.forEach(function (x, i) {
      const ps = D.playerIdsOf(x, "A").concat(D.playerIdsOf(x, "B"));
      key[x.id] = {
        home: (mode === "homeBorrow" && home.length && home.indexOf(x.divisionId) === -1) ? 1 : 0,
        stage: stageOrder(D, x),
        rest: (s.restRule === "off" || ps.every(p => rest.restMatches(p) >= min)) ? 0 : 1,
        oldest: Math.max.apply(null, ps.map(rest.lastEnd).concat([0])),
        idx: i
      };
    });
    const restRank = (x) => key[x.id].rest;
    list.sort(function (a, b) {
      const A = key[a.id], B = key[b.id];
      return A.home - B.home || A.stage - B.stage || A.rest - B.rest || A.oldest - B.oldest || A.idx - B.idx;
    });
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
        // only a tie that touches the qualifying places holds up the knockout
        if (D.groupComplete(st.id, g.id) && D.table(st.id, g.id).some(r => r.tiedWith.length && r.rank <= (st.config.advance || 0))) {
          return t("courts.tie", { group: g.name });
        }
      }
    }
    // a Swiss / points-league round is drawn when the one before it finishes: if everything left in
    // the current round is already on court, say so
    for (const st of comp.stages) {
      if (!(st.config && st.config.rounds)) continue;
      const ms = comp.meetings.filter(m => m.stageId === st.id), last = Math.max.apply(null, ms.map(m => m.round).concat([0]));
      const left = open.filter(x => D.meetingById[x.meetingId].stageId === st.id);
      if (last < st.config.rounds && left.length && left.every(x => x.status === "onCourt")) return t("courts.nextRoundLater", { next: last + 1, cur: last });
    }
    const waitingKo = open.find(x => { const m = D.meetingById[x.meetingId]; return !D.side(m, "A") || !D.side(m, "B"); });
    const busyOnly = open.find(x => { const m = D.meetingById[x.meetingId]; return x.status === "pending" && D.side(m, "A") && D.side(m, "B"); });
    if (D.isTeams && typeof CompLineups !== "undefined") {
      const need = CompLineups.needed(D)[0];
      if (need) return t("courts.lineupNeeded", { match: D.sideLabel(need.meeting, "A") + " " + t("courts.vs") + " " + D.sideLabel(need.meeting, "B"), team: D.entryLabel(need.teamId) });
    }
    if (busyOnly) return t("courts.playersBusy");
    if (open.every(x => x.status === "onCourt")) return t("courts.lastOnCourt");
    if (waitingKo) return t("courts.waitingFor", { what: D.meetingLabel(D.meetingById[waitingKo.meetingId], false) });
    return t("courts.nothing");
  }

  /* ===== Time estimate (§9.9) ===== */
  // Greedy simulation: courts are servers; each match takes the format's typical minutes; matches go in
  // the default order, after the matches they depend on, never with a player on two courts.
  function estimate(comp, draw) {
    const s = comp.settings;
    // Minutes come from each stage's score format (typical length incl. getting on and off court).
    const fs = s.matchFormats || {};
    const perOf = (st) => { const f = st && (fs[st.matchFormatId] || fs.main); return f ? CompFormat.minutesFor(f) : 20; };
    const courts = Math.max(1, s.courtsCount || 1);
    const meetings = {}, matchesOf = {};
    draw.meetings.forEach(m => { meetings[m.id] = m; });
    draw.matches.forEach(x => { (matchesOf[x.meetingId] = matchesOf[x.meetingId] || []).push(x); });
    const teams = comp.kind === "teams";
    const stageOf = {}; draw.stages.forEach(st => { stageOf[st.id] = st; });
    const entry = {}; comp.entries.forEach(e => { entry[e.id] = e; });
    const groupMatches = {};
    draw.meetings.forEach(function (m) {
      if (!m.groupId || !matchesOf[m.id]) return;
      const list = groupMatches[m.groupId] = groupMatches[m.groupId] || [];
      matchesOf[m.id].forEach(x => list.push(x.id));
    });
    // dependencies: knockout sources (skipping byes), group completion
    function depsOf(m, seen) {
      const out = [];
      [m.sideA, m.sideB].forEach(function (sd) {
        const src = sd.source;
        if (!src) return;
        if (src.kind === "groupRank") out.push.apply(out, groupMatches[src.groupId] || []);
        else if (src.meetingId) {
          const m2 = meetings[src.meetingId];
          if (m2 && matchesOf[m2.id]) out.push.apply(out, matchesOf[m2.id].map(x => x.id)); // every rubber of it
          else if (m2 && !seen[m2.id]) { seen[m2.id] = true; out.push.apply(out, depsOf(m2, seen)); }
        }
      });
      return out;
    }
    const tasks = draw.matches.map((x, i) => {
      const m = meetings[x.meetingId], st = stageOf[m.stageId];
      const ids = [m.sideA.id, m.sideB.id].filter(Boolean);
      let players = [].concat.apply([], ids.map(id => (entry[id] && entry[id].playerIds) || []));
      if (teams) {
        // registered pair for the slot, or a stand-in token so a team's slot can't be on two courts
        players = [];
        [["A", m.sideA.id], ["B", m.sideB.id]].forEach(function (sd) {
          if (!sd[1]) return;
          const ps = CompLineups.playersFor(comp, m, x, sd[0], sd[1]);
          players.push.apply(players, ps.length ? ps : [sd[1] + ":" + x.rubberId]);
        });
      }
      const allowed = s.courtMode === "dedicated" ? (s.courtAssign && s.courtAssign[x.divisionId]) || null : null;
      return { id: x.id, key: (st ? st.order : 0) * 1000 + m.round - (m.thirdPlace ? 0.5 : 0), idx: i, deps: depsOf(m, {}), players, per: perOf(st), allowed: allowed && allowed.length ? allowed : null };
    });
    // Swiss / points-league rounds not drawn yet: about n/2 matches each, after the round before.
    let laterMeetings = 0;
    draw.stages.filter(st => st.config && st.config.rounds).forEach(function (st) {
      const g = st.groups[0], n = g ? g.entryIds.length : 0, perRound = Math.floor(n / 2) * (teams ? (comp.settings.meetingTemplate || []).length || 1 : 1);
      let prev = tasks.filter(tk => { const x = draw.matches.find(m => m.id === tk.id), m = x && meetings[x.meetingId]; return m && m.stageId === st.id; }).map(tk => tk.id);
      const drawn = Math.max.apply(null, draw.meetings.filter(m => m.stageId === st.id).map(m => m.round).concat([0]));
      for (let r = drawn + 1; r <= st.config.rounds; r++) {
        const ids = [];
        laterMeetings += Math.floor(n / 2);
        for (let k = 0; k < perRound; k++) {
          const id = "v:" + st.id + ":" + r + ":" + k;
          tasks.push({ id, key: st.order * 1000 + r, idx: tasks.length, deps: prev.slice(), players: [], per: perOf(st), allowed: null });
          ids.push(id);
        }
        prev = ids;
      }
    });
    tasks.sort((a, b) => a.key - b.key || a.idx - b.idx);
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
      const fin = now + pick.per;
      end[pick.id] = fin; courtFree[c] = fin; pick.players.forEach(p => { playerFree[p] = fin; });
      makespan = Math.max(makespan, fin);
      remaining.splice(remaining.indexOf(pick), 1);
    }
    const minutes = Math.max(0, makespan);
    // counts include the Swiss / points-league rounds that are drawn later
    return { minutes: Math.round(minutes / 5) * 5, matches: draw.matches.length + tasks.filter(tk => String(tk.id).indexOf("v:") === 0).length,
      meetings: draw.meetings.filter(m => !(m.sideA.source && m.sideA.source.kind === "bye") && !(m.sideB.source && m.sideB.source.kind === "bye")).length + laterMeetings, complete: remaining.length === 0 };
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

  return { isReady, readyList, context, suggestions, whyNothing, estimate, minutesDefault, fmtDuration, finishTime, busyPlayers };
})();
