// CourtMixer - derived competition state (Phase 3, v1.11.0), spec §8.
// Everything here is computed from match records; nothing is stored as a running total.
// CompStandings.derive(comp) returns a view with caches that are valid for that snapshot only.

const CompStandings = (function () {
  function derive(comp) {
    const meetingById = {}, matchByMeeting = {}, stageById = {}, entryById = {}, divisionById = {};
    comp.meetings.forEach(m => { meetingById[m.id] = m; });
    comp.matches.forEach(x => { if (!matchByMeeting[x.meetingId]) matchByMeeting[x.meetingId] = x; });
    comp.stages.forEach(s => { stageById[s.id] = s; });
    comp.entries.forEach(e => { entryById[e.id] = e; });
    comp.divisions.forEach(d => { divisionById[d.id] = d; });
    const isTeams = comp.kind === "teams", teamById = {}, matchesOfMeeting = {}, rubberById = {};
    (comp.teams || []).forEach(tm => { teamById[tm.id] = tm; });
    ((comp.settings || {}).meetingTemplate || []).forEach(r => { rubberById[r.id] = r; });
    comp.matches.forEach(x => { (matchesOfMeeting[x.meetingId] = matchesOfMeeting[x.meetingId] || []).push(x); });
    const sideCache = {}, outCache = {}, tableCache = {}, teamCache = {};
    const resolving = {};

    function formatFor(stage) {
      const fs = comp.settings.matchFormats || {};
      return (stage && fs[stage.matchFormatId]) || fs.main || CompFormat.recommendedFor(comp.sport || "other");
    }

    // An entry id, "BYE", or null (not known yet).
    function side(meeting, which) {
      const key = meeting.id + which;
      if (key in sideCache) return sideCache[key];
      const s = which === "A" ? meeting.sideA : meeting.sideB;
      let v = null;
      if (s.id) v = s.id;
      else if (s.source) {
        const src = s.source;
        if (src.kind === "bye") v = "BYE";
        else if (src.kind === "meetingWinner" || src.kind === "meetingLoser") {
          const m2 = meetingById[src.meetingId];
          if (m2 && !resolving[m2.id]) {
            resolving[m2.id] = true;
            const o = outcome(m2);
            delete resolving[m2.id];
            if (o.winner === "A" || o.winner === "B") {
              const w = src.kind === "meetingWinner" ? o.winner : (o.winner === "A" ? "B" : "A");
              v = side(m2, w);
            }
          }
        } else if (src.kind === "firstMatchLoser") {
          // the loser of a round-2 meeting, but only when it was their first match (the side that had a bye)
          const m2 = meetingById[src.meetingId];
          if (m2 && !resolving[m2.id]) {
            resolving[m2.id] = true;
            const o = outcome(m2);
            delete resolving[m2.id];
            if (o.winner === "A" || o.winner === "B") v = o.winner === src.which ? "BYE" : side(m2, src.which);
          }
        } else if (src.kind === "groupRank") {
          v = groupRankEntry(src.groupId, src.rank);
        }
      }
      sideCache[key] = v;
      return v;
    }

    function withdrawn(id) { const e = entryById[id] || teamById[id]; return !!(e && e.withdrawn); }

    // { winner: 'A'|'B'|'draw'|null, done, kind: 'bye'|'override'|'walkover'|'result'|'void'|null, match }
    function outcome(meeting) {
      if (outCache[meeting.id]) return outCache[meeting.id];
      const match = matchByMeeting[meeting.id] || null;
      let r = { winner: null, done: false, kind: null, match };
      if (meeting.status === "void") r = { winner: null, done: true, kind: "void", match };
      else if (meeting.resultOverride) r = { winner: meeting.resultOverride.winner, done: true, kind: "override", match };
      else {
        const a = side(meeting, "A"), b = side(meeting, "B");
        if (a === "BYE" && b === "BYE") r = { winner: "A", done: true, kind: "bye", match }; // nothing to play: the bye moves on
        else if (a === "BYE" && b && b !== "BYE") r = { winner: "B", done: true, kind: "bye", match };
        else if (b === "BYE" && a && a !== "BYE") r = { winner: "A", done: true, kind: "bye", match };
        else if (!isTeams && match && match.status === "done" && match.winner) r = { winner: match.winner, done: true, kind: match.outcome === "walkover" ? "walkover" : "result", match };
        else if (isTeams && a && b && a !== "BYE" && b !== "BYE" && !(withdrawn(a) && withdrawn(b)) &&
          !((withdrawn(a) || withdrawn(b)) && (teamById[withdrawn(a) ? a : b] || {}).withdrawMode === "void" && meeting.groupId)) {
          // Teams: played rubbers keep their results; a withdrawn team gives up only what's left.
          const tr = teamResult(meeting);
          r = { winner: tr.done ? tr.winner : null, done: tr.done, kind: tr.allWalkover ? "walkover" : "result", match: null, team: tr };
        }
        else if (a && b && a !== "BYE" && b !== "BYE" && withdrawn(a) && withdrawn(b)) {
          // Both pairs withdrew: nothing to play. In a group it simply doesn't count; in a knockout
          // side A goes through on paper, so the next opponent then gets a walkover.
          r = meeting.groupId ? { winner: null, done: true, kind: "void", match } : { winner: "A", done: true, kind: "walkover", match };
        }
        else if (a && b && a !== "BYE" && b !== "BYE" && (withdrawn(a) || withdrawn(b))) {
          const e = entryById[withdrawn(a) ? a : b] || teamById[withdrawn(a) ? a : b];
          if (e.withdrawMode === "void" && meeting.groupId) r = { winner: null, done: true, kind: "void", match };
          else r = { winner: withdrawn(a) ? "B" : "A", done: true, kind: "walkover", match };
        }
      }
      outCache[meeting.id] = r;
      return r;
    }

    /* ===== Teams: a meeting is decided by its rubbers (§11) ===== */
    function rubberOf(x) { return rubberById[x.rubberId] || {}; }
    // One finished rubber oriented A/B: matches, sets, games (walkovers per walkoverScore).
    function rubberTally(x, f) {
      const out = { mA: x.winner === "A" ? 1 : 0, mB: x.winner === "B" ? 1 : 0, sA: 0, sB: 0, gA: 0, gB: 0 };
      let tl;
      if (x.outcome === "walkover") {
        if (comp.settings.walkoverScore === "winOnly") return out;
        tl = CompFormat.tally(f, CompFormat.walkoverSets(f));
        if (x.winner === "B") tl = { setsA: tl.setsB, setsB: tl.setsA, gamesA: tl.gamesB, gamesB: tl.gamesA };
      } else tl = CompFormat.tally(f, x.sets, x.outcome);
      out.sA = tl.setsA; out.sB = tl.setsB; out.gA = tl.gamesA; out.gB = tl.gamesB;
      return out;
    }
    // { matchesA, matchesB, setsA, setsB, gamesA, gamesB, winner, decided, done, deadIds, needDecider, needsDecision }
    function teamResult(meeting) {
      if (teamCache[meeting.id]) return teamCache[meeting.id];
      const st = stageById[meeting.stageId], f = formatFor(st), ko = isKO(st);
      const ts = comp.settings.standings.teams, tally = ts.resultMode === "tally";
      const ms = matchesOfMeeting[meeting.id] || [];
      const regular = ms.filter(x => !rubberOf(x).isDecider), dec = ms.find(x => rubberOf(x).isDecider) || null;
      const r = { matchesA: 0, matchesB: 0, setsA: 0, setsB: 0, gamesA: 0, gamesB: 0, winner: null, decided: false, done: false,
        deadIds: {}, needDecider: false, needsDecision: false };
      const add = (x) => { const v = rubberTally(x, f); r.matchesA += v.mA; r.matchesB += v.mB; r.setsA += v.sA; r.setsB += v.sB; r.gamesA += v.gA; r.gamesB += v.gB; };
      regular.filter(x => x.status === "done").forEach(add);
      // A withdrawn team gives up every rubber not played yet (walkovers to the other side).
      const wA = withdrawn(side(meeting, "A")), wB = withdrawn(side(meeting, "B"));
      const forfeit = (wA !== wB) ? regular.filter(x => x.status !== "done") : [];
      forfeit.forEach(x => add({ winner: wA ? "B" : "A", outcome: "walkover", sets: [] }));
      r.allWalkover = forfeit.length > 0 && forfeit.length === regular.length;
      const pending = regular.filter(x => x.status !== "done" && forfeit.indexOf(x) === -1);
      if (!tally) {
        const lead = r.matchesA - r.matchesB;
        if (Math.abs(lead) > pending.length) { r.decided = true; r.winner = lead > 0 ? "A" : "B"; }
        // dead rubbers: decided early and the stage stops when decided; a started one still counts
        if (r.decided && (comp.settings.deadRubbers || {})[ko ? "knockout" : "groupStage"] === "stopWhenDecided") {
          pending.filter(x => x.status === "pending").forEach(x => { r.deadIds[x.id] = true; });
        }
      }
      const open = pending.filter(x => !r.deadIds[x.id]);
      const level = () => r.matchesA === r.matchesB;
      const byGames = () => r.gamesA > r.gamesB ? "A" : r.gamesB > r.gamesA ? "B" : null;
      if (!open.length) {
        if (r.decided) r.done = true;
        else if (!level()) { r.winner = r.matchesA > r.matchesB ? "A" : "B"; r.done = true; }
        else if (tally) { r.winner = ko ? byGames() : "draw"; r.done = !!r.winner; r.needsDecision = !r.winner; }
        else if (ts.splitRule === "decider" && dec) {
          if (dec.status === "done") { r.winner = dec.winner; r.done = true; } else r.needDecider = true;
        }
        else if (ts.splitRule === "draw" && !ko) { r.winner = "draw"; r.done = true; }
        else { r.winner = byGames() || (ko ? null : "draw"); r.done = !!r.winner; r.needsDecision = !r.winner; }
      }
      if (dec && dec.status === "done") add(dec);                                  // a played decider always counts
      else if (dec && dec.status === "pending" && !r.needDecider) r.deadIds[dec.id] = true; // otherwise it isn't needed
      teamCache[meeting.id] = r;
      return r;
    }
    // Matches / sets / games for a finished team meeting, oriented A/B.
    function teamScore(meeting) {
      const o = outcome(meeting);
      if (!o.done || !o.winner || o.kind === "void" || o.kind === "bye") return null;
      if (o.team) { const r = o.team; return { mA: r.matchesA, mB: r.matchesB, sA: r.setsA, sB: r.setsB, gA: r.gamesA, gB: r.gamesB }; }
      if (o.kind === "override") return { mA: 0, mB: 0, sA: 0, sB: 0, gA: 0, gB: 0 };
      // walkover (withdrawn team): every regular rubber goes to the other side
      const st = stageById[meeting.stageId], f = formatFor(st);
      const n = (matchesOfMeeting[meeting.id] || []).filter(x => !rubberOf(x).isDecider).length;
      const one = comp.settings.walkoverScore === "winOnly" ? { setsA: 0, setsB: 0, gamesA: 0, gamesB: 0 } : CompFormat.tally(f, CompFormat.walkoverSets(f));
      const w = { mA: n, mB: 0, sA: n * one.setsA, sB: 0, gA: n * one.gamesA, gB: 0 };
      return o.winner === "A" ? w : { mA: 0, mB: w.mA, sA: 0, sB: w.sA, gA: 0, gB: w.gA };
    }
    // Is this rubber still to be played (not a dead rubber, not an unneeded decider)?
    function rubberNeeded(x) {
      if (!isTeams || x.status !== "pending") return true;
      const tr = teamResult(meetingById[x.meetingId]);
      return !tr.deadIds[x.id];
    }

    // Sets / games for one finished meeting, oriented A/B, honouring walkoverScore.
    function score(meeting) {
      const o = outcome(meeting), stage = stageById[meeting.stageId], f = formatFor(stage);
      if (!o.done || !o.winner || o.kind === "void" || o.kind === "bye") return null;
      if (o.kind === "override" || (o.kind === "walkover" && comp.settings.walkoverScore === "winOnly")) {
        return { setsA: 0, setsB: 0, gamesA: 0, gamesB: 0, counted: false };
      }
      if (o.kind === "walkover") {
        const t2 = CompFormat.tally(f, CompFormat.walkoverSets(f));
        // points league (D-055): a walkover is worth what a round off is, half the full score
        if (stage && stage.type === "pointsLeague") { t2.gamesA = leagueRest(f); t2.gamesB = 0; }
        return o.winner === "A" ? Object.assign(t2, { counted: true }) : { setsA: t2.setsB, setsB: t2.setsA, gamesA: t2.gamesB, gamesB: t2.gamesA, counted: true };
      }
      return Object.assign(CompFormat.tally(f, o.match.sets, o.match.outcome), { counted: true, retired: o.match.outcome === "retired" });
    }

    function primaryPoints(row) {
      const p = comp.settings.standings.pairs, mode = p.rankBy || "wins";
      if (mode === "league") return row.won * (p.league ? p.league.win : 3) + row.lost * (p.league ? p.league.loss : 0) + row.drawn * (p.league && p.league.draw || 0);
      if (mode === "score") return row.scorePoints;
      return row.won;
    }

    function addTeamResult(row, meeting, asSide) {
      const o = outcome(meeting);
      if (!o.done || o.kind === "void" || o.kind === "bye" || !o.winner) return;
      const ts = comp.settings.standings.teams, sc = teamScore(meeting);
      row.played++;
      if (o.winner === "draw") row.drawn++; else if (o.winner === asSide) row.won++; else row.lost++;
      const mine = asSide === "A" ? [sc.mA, sc.sA, sc.gA] : [sc.mB, sc.sB, sc.gB], theirs = asSide === "A" ? [sc.mB, sc.sB, sc.gB] : [sc.mA, sc.sA, sc.gA];
      row.matchesFor += mine[0]; row.matchesAgainst += theirs[0];
      row.setsFor += mine[1]; row.setsAgainst += theirs[1];
      row.gamesFor += mine[2]; row.gamesAgainst += theirs[2];
      if (ts.resultMode === "tally") row.teamPoints += mine[0];
      else { const mp = ts.meetingPoints || { win: 2, draw: 1, loss: 0 }; row.teamPoints += o.winner === "draw" ? mp.draw : o.winner === asSide ? mp.win : mp.loss; }
    }

    // Swiss / points league: sitting out a round (odd numbers) counts as a walkover win (§9.7).
    function byeWin(row, meeting, asSide) {
      const st = stageById[meeting.stageId], f = formatFor(st);
      row.byes = (row.byes || 0) + 1;
      // Points league (D-055): a round off is a rest, not a win; it earns half a walkover's points,
      // so sitting out costs about what an average match would have earned (nothing with "win only").
      if (st && st.type === "pointsLeague") { if (comp.settings.walkoverScore !== "winOnly") row.gamesFor += leagueRest(f); return; }
      row.played++; row.won++;
      // a bye is a walkover win, so it scores like one when ranking by score
      if (!isTeams) { const n = CompFormat.needed(f); row.scorePoints += Number((comp.settings.standings.pairs.pointsByScore || {})[n + "-0"]) || 0; }
      if (isTeams) {
        const n = (comp.settings.meetingTemplate || []).filter(r => !r.isDecider).length;
        if (comp.settings.standings.teams.resultMode === "tally") row.teamPoints += n;
        else row.teamPoints += (comp.settings.standings.teams.meetingPoints || { win: 2 }).win;
        row.matchesFor += n;
      }
      if (comp.settings.walkoverScore === "winOnly") return;
      const tl = CompFormat.tally(f, CompFormat.walkoverSets(f)), k = isTeams ? (comp.settings.meetingTemplate || []).filter(r => !r.isDecider).length : 1;
      row.setsFor += k * tl.setsA; row.gamesFor += k * tl.gamesA;
    }
    function leagueRest(f) { return Math.ceil(CompFormat.tally(f, CompFormat.walkoverSets(f)).gamesA / 2); }

    function addResult(row, meeting, asSide) {
      const o0 = outcome(meeting), st0 = stageById[meeting.stageId];
      if (o0.kind === "bye" && o0.winner === asSide && st0 && (st0.type === "swiss" || st0.type === "pointsLeague")) return byeWin(row, meeting, asSide);
      if (isTeams) return addTeamResult(row, meeting, asSide);
      const o = outcome(meeting), sc = score(meeting);
      if (!o.done || o.kind === "void" || o.kind === "bye" || !o.winner) return;
      row.played++;
      if (o.winner === "draw") row.drawn++;
      else if (o.winner === asSide) row.won++; else row.lost++;
      if (sc) {
        const mine = asSide === "A" ? [sc.setsA, sc.gamesA] : [sc.setsB, sc.gamesB];
        const theirs = asSide === "A" ? [sc.setsB, sc.gamesB] : [sc.setsA, sc.gamesA];
        row.setsFor += mine[0]; row.setsAgainst += theirs[0];
        row.gamesFor += mine[1]; row.gamesAgainst += theirs[1];
        const table = comp.settings.standings.pairs.pointsByScore || {};
        let key = mine[0] + "-" + theirs[0];
        const n = CompFormat.needed(formatFor(stageById[meeting.stageId]));
        if (!sc.counted) key = o.winner === asSide ? n + "-0" : "0-" + n;
        else if (sc.retired) { // a retirement scores like a full win for the other side
          const loserSets = Math.min(o.winner === asSide ? theirs[0] : mine[0], n - 1);
          key = o.winner === asSide ? n + "-" + loserSets : loserSets + "-" + n;
        }
        row.scorePoints += Number(table[key]) || 0;
      }
    }

    function emptyRow(id) {
      return { id, played: 0, won: 0, drawn: 0, lost: 0, points: 0, scorePoints: 0, teamPoints: 0, matchesFor: 0, matchesAgainst: 0,
        setsFor: 0, setsAgainst: 0, gamesFor: 0, gamesAgainst: 0, matchDiff: 0, setDiff: 0, gameDiff: 0, rank: 0, tiedWith: [], qualifies: false };
    }

    function groupMeetings(stageId, groupId) { return comp.meetings.filter(m => m.stageId === stageId && m.groupId === groupId); }

    function rowsFor(stage, group, ids, onlyAmong) {
      const rows = {};
      ids.forEach(id => { rows[id] = emptyRow(id); });
      groupMeetings(stage.id, group.id).forEach(function (m) {
        const a = side(m, "A"), b = side(m, "B");
        if (onlyAmong) { if (!rows[a] || !rows[b] || onlyAmong.indexOf(a) === -1 || onlyAmong.indexOf(b) === -1) return; } // head-to-head ignores byes
        else if (b === "BYE" && rows[a]) { addResult(rows[a], m, "A"); return; }
        else if (a === "BYE" && rows[b]) { addResult(rows[b], m, "B"); return; }
        if (!rows[a] || !rows[b]) return;
        addResult(rows[a], m, "A"); addResult(rows[b], m, "B");
      });
      Object.keys(rows).forEach(id => {
        const r = rows[id];
        r.setDiff = r.setsFor - r.setsAgainst; r.gameDiff = r.gamesFor - r.gamesAgainst; r.matchDiff = r.matchesFor - r.matchesAgainst;
        // points league: ranked by total points scored, then wins (§9.8)
        r.points = stage.type === "pointsLeague" ? r.gamesFor : isTeams ? r.teamPoints : primaryPoints(r);
      });
      return rows;
    }

    function metric(tb, row) {
      if (tb === "matchDiff") return row.matchDiff;
      if (tb === "won") return row.won;
      if (tb === "setDiff") return row.setDiff;
      if (tb === "gameDiff") return row.gameDiff;
      if (tb === "gamesWon") return row.gamesFor;
      if (tb === "setsWon") return row.setsFor;
      return 0;
    }
    function bucket(rows, valueOf) {
      const map = {};
      rows.forEach(r => { const v = valueOf(r); (map[v] = map[v] || []).push(r); });
      return Object.keys(map).map(Number).sort((x, y) => y - x).map(k => map[k]);
    }

    // §8.3: split a tied set with each tiebreaker in order; whenever a tiebreaker separates some
    // rows, re-apply the whole list to each still-tied subset (head-to-head recomputed among them).
    function breakTie(stage, group, rows, tbs) {
      if (rows.length < 2) return rows;
      for (let i = 0; i < tbs.length; i++) {
        const tb = tbs[i];
        let parts;
        if (tb === "headToHead") {
          const ids = rows.map(r => r.id), mini = rowsFor(stage, group, ids, ids);
          parts = bucket(rows, r => mini[r.id].points);
        } else if (tb === "manual") {
          const order = ((stage.config.manualOrder || {})[group.id]) || [];
          if (rows.every(r => order.indexOf(r.id) !== -1)) return rows.slice().sort((x, y) => order.indexOf(x.id) - order.indexOf(y.id));
          continue;
        } else parts = bucket(rows, r => metric(tb, r));
        if (parts.length > 1) return [].concat.apply([], parts.map(p => breakTie(stage, group, p, tbs)));
      }
      // An order the organiser chose with "Tie — decide" always settles what's left.
      const manual = ((stage.config.manualOrder || {})[group.id]) || [];
      if (rows.every(r => manual.indexOf(r.id) !== -1)) return rows.slice().sort((x, y) => manual.indexOf(x.id) - manual.indexOf(y.id));
      const ids = rows.map(r => r.id);
      rows.forEach(r => { r.tiedWith = ids.filter(id => id !== r.id); });
      return rows;
    }

    function table(stageId, groupId) {
      const key = stageId + ":" + groupId;
      if (tableCache[key]) return tableCache[key];
      const stage = stageById[stageId], group = stage && stage.groups.find(g => g.id === groupId);
      if (!group) return [];
      const ids = group.entryIds.filter(id => { const e = entryById[id] || teamById[id]; return !(e && e.withdrawn && e.withdrawMode === "void"); });
      const rows = rowsFor(stage, group, ids, null);
      let tbs = (isTeams ? comp.settings.standings.teams.tiebreakers : comp.settings.standings.pairs.tiebreakers) || [];
      if (stage.type === "pointsLeague") tbs = ["won"].concat(tbs);
      const ordered = [].concat.apply([], bucket(ids.map(id => rows[id]), r => r.points).map(p => breakTie(stage, group, p, tbs)));
      const adv = stage.type === "groups" ? (stage.config.advance || 0) : 0;
      ordered.forEach((r, i) => { r.rank = i + 1; r.qualifies = adv > 0 && i < adv; });
      tableCache[key] = ordered;
      return ordered;
    }

    function groupComplete(stageId, groupId) {
      return groupMeetings(stageId, groupId).every(m => outcome(m).done);
    }
    function groupRankEntry(groupId, rank) {
      const stage = comp.stages.find(s => s.groups.some(g => g.id === groupId));
      if (!stage || !groupComplete(stage.id, groupId)) return null;
      const rows = table(stage.id, groupId), row = rows[rank - 1];
      if (!row) return "BYE"; // fewer pairs left than places (a void withdrawal): that slot is a bye
      return !row.tiedWith.length ? row.id : null;
    }

    function entryLabel(id) {
      if (id === "BYE") return t("ko.bye");
      if (teamById[id]) return teamById[id].name;
      const e = entryById[id];
      return e ? e.label : "";
    }
    // Text for a side that isn't known yet: "Winner QF1", "Group A #1".
    function pendingLabel(meeting, which) {
      const s = which === "A" ? meeting.sideA : meeting.sideB, src = s.source;
      if (!src) return "?";
      if (src.kind === "groupRank") {
        const st = comp.stages.find(x => x.groups.some(g => g.id === src.groupId));
        const g = st && st.groups.find(x => x.id === src.groupId);
        return t("ko.groupRank", { group: g ? g.name : "?", rank: src.rank });
      }
      if (src.kind === "meetingWinner" || src.kind === "meetingLoser" || src.kind === "firstMatchLoser") {
        const m2 = meetingById[src.meetingId];
        return t(src.kind === "meetingWinner" ? "ko.winnerOf" : "ko.loserOf", { m: m2 ? meetingLabel(m2, true) : "?" });
      }
      return "?";
    }
    function sideLabel(meeting, which) { const id = side(meeting, which); return id ? entryLabel(id) : pendingLabel(meeting, which); }

    function meetingLabel(meeting, short) {
      const st = stageById[meeting.stageId];
      if (!st) return "";
      if (isKO(st)) {
        if (meeting.thirdPlace) return t("ko.third");
        if (st.type === "plate") {
          const k = CompGenerate.roundLabelKey(st.config.size || 2, meeting.round), cnt = (st.config.size || 2) / Math.pow(2, meeting.round);
          return t("ko.plate", { round: t(k + (short ? ".short" : ""), { n: (st.config.size || 2) / Math.pow(2, meeting.round - 1) }) }) + (cnt > 1 ? " " + (meeting.slot + 1) : "");
        }
        const key = CompGenerate.roundLabelKey(st.config.size || 2, meeting.round);
        const name = t(key + (short ? ".short" : ""), { n: (st.config.size || 2) / Math.pow(2, meeting.round - 1) });
        const count = (st.config.size || 2) / Math.pow(2, meeting.round);
        return count > 1 ? name + " " + (meeting.slot + 1) : name;
      }
      const g = st.groups.find(x => x.id === meeting.groupId);
      if (st.type === "groups") return t("stage.groupRound", { group: g ? g.name : "", n: meeting.round });
      return t("stage.round", { n: meeting.round });
    }

    // Entry records for players actually on a match: stored once started, else from the entry.
    function playerIdsOf(match, which) {
      const stored = (which === "A" ? match.sideA : match.sideB).playerIds;
      if (stored && stored.length) return stored;
      const m = meetingById[match.meetingId], id = m && side(m, which);
      if (isTeams) return m && typeof CompLineups !== "undefined" ? CompLineups.playersFor(comp, m, match, which, id && id !== "BYE" ? id : null) : [];
      const e = id && entryById[id];
      return e ? e.playerIds.slice() : [];
    }
    // "Group A · Round 2 · A1" for a team rubber; the meeting label otherwise.
    function matchLabel(match, short) {
      const m = meetingById[match.meetingId], rb = isTeams ? rubberOf(match) : null;
      return meetingLabel(m, short) + (rb && rb.label ? " \u00b7 " + rb.label : "");
    }

    return { comp, isTeams, meetingById, matchByMeeting, matchesOfMeeting, stageById, entryById, teamById, divisionById, formatFor, side, outcome, score,
      teamResult, teamScore, rubberNeeded, rubberOf, table, groupComplete, groupRankEntry, entryLabel, sideLabel, meetingLabel, matchLabel, playerIdsOf, groupMeetings };
  }

  // Finished or on-court matches whose sides no longer match who was recorded as playing them
  // (e.g. a quarter-final result changed after the semi-final was played). §10.5 cascade.
  function staleMatches(comp) {
    const D = derive(comp);
    return comp.matches.filter(function (x) {
      if (x.status !== "done" && x.status !== "onCourt") return false;
      const m = D.meetingById[x.meetingId], snap = x.entryIds;
      if (!m || !snap) return false;
      return D.side(m, "A") !== snap.A || D.side(m, "B") !== snap.B;
    });
  }
  // Clears stale results repeatedly until the draw is consistent. Returns the cleared matches.
  function clearStale(comp) {
    const cleared = [];
    for (let guard = 0; guard < 50; guard++) {
      const stale = staleMatches(comp);
      if (!stale.length) break;
      stale.forEach(function (x) { resetMatch(x); cleared.push(x); });
    }
    return cleared;
  }

  // Back to "not started": a finished result goes into the match history first.
  function resetMatch(x) {
    if (x.status === "done") x.history.push({ at: Date.now(), sets: x.sets, winner: x.winner, outcome: x.outcome, cleared: true });
    x.status = "pending"; x.sets = []; x.winner = null; x.outcome = null; x.courtId = null;
    x.startedAt = null; x.endedAt = null; x.entryIds = null; x.sideA.playerIds = []; x.sideB.playerIds = [];
  }

  // Knockout-style stages (the main bracket and a plate): no draws, knockout dead-rubber rule.
  function isKO(st) { return !!st && (st.type === "knockout" || st.type === "plate"); }

  return { derive, staleMatches, clearStale, resetMatch, isKO };
})();
