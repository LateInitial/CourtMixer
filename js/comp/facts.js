// CourtMixer - Competition fun facts and awards (§13). Everything is derived from the match
// records, positive only, and seeded from the results so it holds still while browsing and a shared
// file shows the same facts. Text goes through t(); names go through nm() (escaped, bold).
const CompFacts = (function () {
  "use strict";

  /* ===== Match statistics ===== */
  // One record per finished match that was actually played (walkovers and void meetings left out).
  function collect(comp, D) {
    const out = [];
    comp.matches.forEach(function (x) {
      if (x.status !== "done" || !x.winner || x.outcome === "walkover") return;
      const m = D.meetingById[x.meetingId];
      if (!m || D.outcome(m).kind === "void") return;
      const st = D.stageById[m.stageId], f = D.formatFor(st);
      const tl = CompFormat.tally(f, x.sets || [], x.outcome);
      const sets = x.sets || [];
      const first = sets[0] || null;
      const firstW = first ? (first.a > first.b ? "A" : first.b > first.a ? "B" : null) : null;
      out.push({
        x, m, st, f, winner: x.winner,
        division: x.divisionId || (st && st.divisionId) || null,
        sideId: { A: D.side(m, "A"), B: D.side(m, "B") },   // entry id (pairs) or team id (teams)
        players: { A: D.playerIdsOf(x, "A"), B: D.playerIdsOf(x, "B") },
        games: { A: tl.gamesA, B: tl.gamesB }, sets: { A: tl.setsA, B: tl.setsB },
        margin: Math.abs(tl.gamesA - tl.gamesB), total: tl.gamesA + tl.gamesB,
        multi: f.setType !== "totalPoints" && f.sets > 1 && sets.length > 1,
        deciding: f.setType !== "totalPoints" && f.sets > 1 && sets.length === f.sets,
        comeback: f.setType !== "totalPoints" && f.sets > 1 && sets.length > 1 && (x.winner === "A" || x.winner === "B") && firstW && firstW !== x.winner,
        firstDeficit: first ? Math.abs(first.a - first.b) : 0,
        at: x.endedAt || x.startedAt || 0, order: x.order || 0
      });
    });
    // oldest first, so "latest" picks are stable
    out.sort((a, b) => (a.at - b.at) || (a.m.round - b.m.round) || (a.order - b.order));
    return out;
  }
  const decided = (r) => r.winner === "A" || r.winner === "B";
  const other = (s) => (s === "A" ? "B" : "A");
  const pairKey = (ids) => ids.slice().sort().join("+");

  function unitOf(comp) {
    const f = (comp.settings.matchFormats || {}).main;
    return t(f && f.setType === "games" ? "unit.gamesPl" : "unit.pointsPl");
  }
  function playerName(comp, id) { const p = comp.players.find(x => x.id === id); return p ? p.name : "?"; }
  function pairName(comp, ids) { return ids.map(id => playerName(comp, id)).join(" & "); }
  // the score as the given side saw it ("4–2" for the winner, not "2–4")
  function scoreText(r, side) { return (r.x.sets || []).map(s => side === "B" ? s.b + "–" + s.a : s.a + "–" + s.b).join(", "); }
  // "Ann / Ben" (pairs entry), team name, or the two players' names
  function sideName(comp, D, r, s) {
    if (D.isTeams) return pairName(comp, r.players[s]);
    return D.entryLabel(r.sideId[s]);
  }

  // Per player, per pair (the two players who actually played together) and per entry/team.
  function tallies(comp, D, recs) {
    const P = {}, PR = {}, E = {};
    const get = (o, k, init) => (o[k] = o[k] || Object.assign({ played: 0, won: 0, gamesFor: 0, gamesAgainst: 0, clutch: 0 }, init || {}));
    recs.forEach(function (r) {
      ["A", "B"].forEach(function (s) {
        const won = r.winner === s, gf = r.games[s], ga = r.games[other(s)];
        const close = won && (r.deciding || r.margin <= 2);
        r.players[s].forEach(function (id) {
          const p = get(P, id); p.played++; if (won) p.won++; p.gamesFor += gf; p.gamesAgainst += ga; if (close) p.clutch++;
        });
        if (r.players[s].length) {
          const k = pairKey(r.players[s]), pr = get(PR, k, { ids: r.players[s].slice().sort(), division: r.division, team: D.isTeams ? r.sideId[s] : null });
          pr.played++; if (won) pr.won++; pr.gamesFor += gf; pr.gamesAgainst += ga;
        }
        const id = r.sideId[s];
        if (id && id !== "BYE") { const e = get(E, id); e.played++; if (won) e.won++; e.gamesFor += gf; e.gamesAgainst += ga; }
      });
    });
    return { P, PR, E };
  }

  // The single highest item, or null when the top is shared (facts prefer clear leaders).
  function uniqueTop(list, val) {
    let best = null, bv = -Infinity, tie = false;
    list.forEach(it => { const v = val(it); if (v > bv) { bv = v; best = it; tie = false; } else if (v === bv) tie = true; });
    return tie ? null : best;
  }
  function seedOf(comp, D) {
    const key = comp.matches.filter(x => x.status === "done").map(x => x.id + ":" + (x.sets || []).map(s => s.a + "-" + s.b).join(",") + ":" + x.winner).join("|");
    return hashString(comp.id + "|" + (key || "empty"));
  }

  /* ===== Fact catalogue (§13.3) ===== */
  // A fact: { code, kind: 'player'|'pair'|'team'|'match', emoji, html, subjects: player ids, teams: team ids, weight }
  const WEIGHT = { UNBEATEN: 5, TEAM_DIVISION: 5, CLUTCH: 3, COMEBACK: 4, BIG_WIN: 3, CLOSE_MATCH: 3, MARATHON: 2, IRON: 2,
    POINTS_MACHINE: 3, UPSET: 4, RESERVE_HERO: 4, TEAM_SPIRIT: 4, UNBEATEN_PLAYER: 4 };

  function catalogue(comp, D, recs, rnd) {
    const facts = [], unit = unitOf(comp), T = tallies(comp, D, recs);
    const add = (code, kind, emoji, html, subjects, teams) => facts.push({ code, kind, emoji, html, subjects: subjects || [], teams: teams || [], weight: WEIGHT[code] || 1 });
    const pick = (list) => list[Math.floor(rnd() * list.length)];

    // UNBEATEN pairs: won every match, at least 3
    Object.keys(T.PR).forEach(function (k) {
      const pr = T.PR[k];
      if (pr.played >= 3 && pr.won === pr.played) {
        const entry = !D.isTeams && comp.entries.find(e => pairKey(e.playerIds) === k);
        add("UNBEATEN", "pair", "\u{1F6E1}️", t("fact.unbeaten", { name: nm(entry ? entry.label : pairName(comp, pr.ids)), n: pr.won }), pr.ids, pr.team ? [pr.team] : []);
      }
    });
    // teams: a player who won every match (with any partner), at least 3
    if (D.isTeams) Object.keys(T.P).forEach(function (id) {
      const p = T.P[id];
      if (p.played >= 3 && p.won === p.played && !Object.keys(T.PR).some(k => T.PR[k].ids.indexOf(id) !== -1 && T.PR[k].played === p.played)) {
        add("UNBEATEN_PLAYER", "player", "\u{1F6E1}️", t("fact.unbeatenPlayer", { name: nm(playerName(comp, id)), n: p.won }), [id]);
      }
    });
    // CLUTCH: most close or deciding-set wins (2+), clear leader
    const clutch = uniqueTop(Object.keys(T.P).filter(id => T.P[id].clutch >= 2), id => T.P[id].clutch);
    if (clutch) add("CLUTCH", "player", "\u{1F9CA}", t("fact.clutch", { name: nm(playerName(comp, clutch)), n: T.P[clutch].clutch }), [clutch]);
    // COMEBACK: won after losing the first set/game
    const backs = recs.filter(r => r.comeback);
    if (backs.length) {
      const r = backs.slice().sort((a, b) => b.firstDeficit - a.firstDeficit)[0];
      add("COMEBACK", "pair", "\u{1F525}", t("fact.comeback", { name: nm(sideName(comp, D, r, r.winner)), score: scoreText(r, r.winner) }), r.players[r.winner], D.isTeams ? [r.sideId[r.winner]] : []);
    }
    // BIG_WIN: largest margin, at least 40% of the target
    const bigCands = recs.filter(r => decided(r) && r.margin >= 0.4 * (r.f.target || 21));
    const big = uniqueTop(bigCands, r => r.margin);
    if (big) add("BIG_WIN", "pair", "\u{1F4A5}", t("fact.bigWin", { name: nm(sideName(comp, D, big, big.winner)), score: scoreText(big, big.winner), n: big.margin, unit: unit }), big.players[big.winner], D.isTeams ? [big.sideId[big.winner]] : []);
    // CLOSE_MATCH: decided by 2 or fewer (any of the closest; the winner is named)
    const close = recs.filter(r => decided(r) && r.margin <= 2);
    if (close.length) {
      const minM = Math.min.apply(null, close.map(r => r.margin)), r = pick(close.filter(c => c.margin === minM));
      add("CLOSE_MATCH", "match", "\u{1F62C}", t("fact.close", { name: nm(sideName(comp, D, r, r.winner)), score: scoreText(r, r.winner) }), r.players[r.winner], D.isTeams ? [r.sideId[r.winner]] : []);
    }
    // MARATHON: most games/points in one match, clear leader
    const mar = uniqueTop(recs.filter(r => r.total > 0), r => r.total);
    if (mar && recs.length >= 3) add("MARATHON", "match", "⏱️", t("fact.marathon", { a: nm(sideName(comp, D, mar, "A")), b: nm(sideName(comp, D, mar, "B")), n: mar.total, unit: unit }), mar.players.A.concat(mar.players.B));
    // IRON: most matches played, clear leader
    const iron = uniqueTop(Object.keys(T.P), id => T.P[id].played);
    if (iron && T.P[iron].played >= 3) add("IRON", "player", "\u{1F3CB}️", t("fact.iron", { name: nm(playerName(comp, iron)), n: T.P[iron].played }), [iron]);
    // POINTS_MACHINE: most games/points won, clear leader (players, so a pair's two players tie in pairs mode)
    const pmPool = D.isTeams ? Object.keys(T.P).map(id => ({ id, v: T.P[id].gamesFor, ids: [id], name: playerName(comp, id) }))
      : Object.keys(T.E).map(id => ({ id, v: T.E[id].gamesFor, ids: (D.entryById[id] || { playerIds: [] }).playerIds, name: D.entryLabel(id) }));
    const pm = uniqueTop(pmPool.filter(c => c.v > 0), c => c.v);
    if (pm && recs.length >= 3) add("POINTS_MACHINE", D.isTeams ? "player" : "pair", "\u{1F3AF}", t("fact.pointsMachine", { name: nm(pm.name), n: pm.v, unit: unit }), pm.ids);
    // UPSET: a lower seed beat a seed at least 2 places higher
    const ups = upsets(comp, D, recs);
    if (ups.length) {
      const u = ups[0];
      if (u.team) add("UPSET", "team", "⚡", t("fact.upset", { name: nm(D.entryLabel(u.team)), s: u.ws, t: u.ls }), [], [u.team]);
      else add("UPSET", "pair", "⚡", t("fact.upset", { name: nm(D.entryLabel(u.r.sideId[u.r.winner])), s: u.ws, t: u.ls }), u.r.players[u.r.winner]);
    }
    // RESERVE_HERO: a reserve who won a match
    if (D.isTeams) {
      const heroes = comp.players.filter(p => p.role === "reserve" && T.P[p.id] && T.P[p.id].won > 0);
      if (heroes.length) {
        const h = uniqueTop(heroes, p => T.P[p.id].won) || heroes[0];
        add("RESERVE_HERO", "player", "\u{1F9B8}", t("fact.reserveHero", { name: nm(h.name), team: nm(D.entryLabel(h.teamId)), n: T.P[h.id].won }), [h.id], [h.teamId]);
      }
      teamFactsRaw(comp, D, recs, T).forEach(f => { if (f.code === "TEAM_DIVISION" || f.code === "TEAM_SPIRIT") facts.push(f); });
    }
    return facts;
  }

  // Lower seed beats a seed 2+ places higher, biggest gap first. Needs seeds.
  function upsets(comp, D, recs) {
    const seed = (id) => { const e = D.entryById[id] || D.teamById[id]; return e && Number(e.seed) > 0 ? Number(e.seed) : null; };
    const out = [];
    if (D.isTeams) {
      // a team upset is a meeting won, not a single rubber
      comp.meetings.forEach(function (m) {
        const o = D.outcome(m);
        if (!o.done || (o.winner !== "A" && o.winner !== "B") || ["bye", "void", "walkover"].indexOf(o.kind) !== -1) return;
        const w = D.side(m, o.winner), l = D.side(m, other(o.winner)), ws = seed(w), ls = seed(l);
        const r = recs.filter(x => x.m.id === m.id).pop();
        if (r && ws && ls && ws - ls >= 2) out.push({ r, ws, ls, gap: ws - ls, meeting: m, team: w });
      });
      return out.sort((a, b) => b.gap - a.gap || b.r.at - a.r.at);
    }
    recs.forEach(function (r) {
      if (!decided(r)) return;
      const w = r.sideId[r.winner], l = r.sideId[other(r.winner)], ws = seed(w), ls = seed(l);
      if (ws && ls && ws - ls >= 2) out.push({ r, ws, ls, gap: ws - ls });
    });
    // one upset per meeting (team rubbers share a meeting)
    const seen = {};
    return out.sort((a, b) => b.gap - a.gap || b.r.at - a.r.at).filter(u => !seen[u.r.m.id] && (seen[u.r.m.id] = true));
  }

  /* ===== Teams: one fact per team (§13.2) ===== */
  // Every true, positive candidate for every team, in the spec's fallback order.
  function teamFactsRaw(comp, D, recs, T) {
    const out = [], unit = unitOf(comp);
    const champ = championTeam(comp, D);
    const add = (team, code, emoji, html, subjects) => out.push({ code, kind: "team", emoji, html, subjects: subjects || [], teams: [team.id], weight: WEIGHT[code] || 1, team: team.id });
    comp.teams.forEach(function (team) {
      const mine = recs.filter(r => r.sideId.A === team.id || r.sideId.B === team.id);
      const sideOf = (r) => (r.sideId.A === team.id ? "A" : "B");
      const tname = nm(team.name);
      // 1. unbeaten in a division (2+ matches)
      comp.divisions.forEach(function (d) {
        const ms = mine.filter(r => r.division === d.id);
        if (ms.length >= 2 && ms.every(r => r.winner === sideOf(r))) add(team, "TEAM_DIVISION", "\u{1F6E1}️", t("fact.teamDivision", { team: tname, div: esc(d.name), n: ms.length }));
      });
      // 2. best pair: a pair of the team that won all its matches (2+)
      const pairs = Object.keys(T.PR).map(k => T.PR[k]).filter(pr => pr.team === team.id && pr.played >= 2 && pr.won === pr.played).sort((a, b) => b.won - a.won);
      if (pairs.length) add(team, "TEAM_PAIR", "\u{1F91D}", t("fact.teamPair", { team: tname, name: nm(pairName(comp, pairs[0].ids)), n: pairs[0].won }), pairs[0].ids);
      // 3. closest meeting involving the team (won, drawn, or lost by one match at most)
      const meetings = comp.meetings.filter(m => (D.side(m, "A") === team.id || D.side(m, "B") === team.id) && D.outcome(m).done && D.outcome(m).kind !== "bye" && D.outcome(m).kind !== "void" && D.outcome(m).kind !== "walkover");
      const close = meetings.map(m => { const r = D.teamResult(m), s = D.side(m, "A") === team.id ? "A" : "B"; return { m, s, r, diff: Math.abs(r.matchesA - r.matchesB) }; })
        .filter(c => c.r.done && c.diff <= 1).sort((a, b) => a.diff - b.diff);
      if (close.length) {
        const c = close[0], opp = D.entryLabel(D.side(c.m, other(c.s))), mineN = c.s === "A" ? c.r.matchesA : c.r.matchesB, theirs = c.s === "A" ? c.r.matchesB : c.r.matchesA;
        const won = D.outcome(c.m).winner === c.s;
        add(team, "TEAM_CLOSE", "\u{1F62C}", t(won ? "fact.teamCloseWon" : "fact.teamClose", { team: tname, opp: nm(opp), score: mineN + "–" + theirs }));
      }
      // 4. a comeback
      const back = mine.find(r => r.comeback && r.winner === sideOf(r));
      if (back) add(team, "COMEBACK", "\u{1F525}", t("fact.teamComeback", { team: tname, name: nm(pairName(comp, back.players[sideOf(back)])), score: scoreText(back, sideOf(back)) }), back.players[sideOf(back)]);
      // 5. took a set/game off the champions
      if (champ && champ !== team.id) {
        const vs = mine.find(r => r.sideId[other(sideOf(r))] === champ && (r.f.setType === "totalPoints" ? false : r.sets[sideOf(r)] > 0));
        if (vs) add(team, "TEAM_VS_CHAMP", "\u{1F4AA}", t(vs.f.sets > 1 ? "fact.teamVsChampSet" : "fact.teamVsChamp", { team: tname, name: nm(pairName(comp, vs.players[sideOf(vs)])), champ: nm(D.entryLabel(champ)) }), vs.players[sideOf(vs)]);
      }
      // 6. most points/games scored in a meeting they lost
      const lost = meetings.filter(m => { const o = D.outcome(m); return o.winner && o.winner !== "draw" && D.side(m, o.winner) !== team.id; });
      if (lost.length) {
        const sc = lost.map(m => { const s = D.side(m, "A") === team.id ? "A" : "B", r = D.teamResult(m); return { m, n: s === "A" ? r.gamesA : r.gamesB }; }).sort((a, b) => b.n - a.n)[0];
        if (sc.n > 0) add(team, "TEAM_FIGHT", "\u{1F4AA}", t("fact.teamFight", { team: tname, n: sc.n, unit: unit, opp: nm(D.entryLabel(D.side(sc.m, D.side(sc.m, "A") === team.id ? "B" : "A"))) }));
      }
      // 7. every player who played won at least once (2+ players)
      const played = Object.keys(T.P).filter(id => { const p = comp.players.find(x => x.id === id); return p && p.teamId === team.id; });
      if (played.length >= 2 && played.every(id => T.P[id].won > 0)) add(team, "TEAM_SPIRIT", "\u{1F31F}", t("fact.teamSpirit", { team: tname, n: played.length }));
      // 8. reserve hero
      const hero = comp.players.find(p => p.teamId === team.id && p.role === "reserve" && T.P[p.id] && T.P[p.id].won > 0);
      if (hero) add(team, "RESERVE_HERO", "\u{1F9B8}", t("fact.teamReserve", { team: tname, name: nm(hero.name), n: T.P[hero.id].won }), [hero.id]);
      // 9. always true: total points/games scored; 10. a team that hasn't played yet: its squad size
      const total = mine.reduce((a, r) => a + r.games[sideOf(r)], 0);
      if (total > 0) add(team, "TEAM_TOTAL", "\u{1F4CA}", t("fact.teamTotal", { team: tname, n: total, unit: unit }));
      else add(team, "TEAM_SQUAD", "\u{1F465}", t("fact.teamSquad", { team: tname, n: comp.players.filter(p => p.teamId === team.id && !p.subFor).length }));
    });
    return out;
  }

  // Exactly one fact per team, preferring distinct fact types: teams with the fewest options pick first.
  function teamFacts(comp, D) {
    if (!D.isTeams) return [];
    const recs = collect(comp, D), T = tallies(comp, D, recs);
    const raw = teamFactsRaw(comp, D, recs, T);
    const by = {};
    comp.teams.forEach(tm => { by[tm.id] = raw.filter(f => f.team === tm.id); });
    const order = comp.teams.slice().sort((a, b) => by[a.id].length - by[b.id].length || comp.teams.indexOf(a) - comp.teams.indexOf(b));
    const used = {}, chosen = {};
    order.forEach(function (tm) {
      const list = by[tm.id];
      const f = list.find(x => !used[x.code]) || list[0];
      chosen[tm.id] = f; used[f.code] = true;
    });
    return comp.teams.map(tm => chosen[tm.id]);
  }

  /* ===== Highlights ===== */
  function pickFacts(pool, n, rnd, needGroup) {
    const chosen = [], named = {};
    const free = (f) => chosen.indexOf(f) === -1 && f.subjects.every(id => !named[id]) && !chosen.some(c => c.code === f.code);
    const take = (f) => { chosen.push(f); f.subjects.forEach(id => { named[id] = true; }); };
    const weighted = (list) => { const tot = list.reduce((a, f) => a + f.weight, 0); let r = rnd() * tot; for (const f of list) { r -= f.weight; if (r <= 0) return f; } return list[list.length - 1]; };
    if (needGroup) { const g = pool.filter(f => (f.kind === "pair" || f.kind === "team") && free(f)); if (g.length) take(weighted(g)); }
    while (chosen.length < n) { const c = pool.filter(free); if (!c.length) break; take(weighted(c)); }
    return chosen;
  }
  // §13.2 layer 1: three facts, nobody named twice, at least one pair/team fact when there is one.
  function highlights(comp, D) {
    D = D || CompStandings.derive(comp);
    const recs = collect(comp, D);
    if (!recs.length) return [];
    const rnd = mulberry32(seedOf(comp, D));
    return pickFacts(catalogue(comp, D, recs, rnd), 3, rnd, true);
  }
  // §13.2 layer 3 (pairs): one or two facts per division.
  // exclude: facts already shown (the highlights), so a division never repeats them
  function divisionHighlights(comp, D, exclude) {
    D = D || CompStandings.derive(comp);
    const shown = {};
    (exclude || []).forEach(f => { shown[f.html] = true; });
    if (D.isTeams) return [];
    const all = collect(comp, D), rnd = mulberry32(seedOf(comp, D) ^ 0x5bd1e995);
    return comp.divisions.map(function (d) {
      const recs = all.filter(r => r.division === d.id);
      return { division: d, facts: recs.length ? pickFacts(catalogue(comp, D, recs, rnd).filter(f => !shown[f.html]), 2, rnd, true) : [] };
    }).filter(x => x.facts.length);
  }

  /* ===== Awards (§13.2 layer 4) ===== */
  // Placings come from the deciding stage: the main knockout (final, 3rd-place match), or a finished table.
  // Each award: { key, label, who: [{ kind: 'entry'|'team'|'player'|'pair'|'match', id|ids }], note, scope }
  function placings(comp, D, stages) {
    const out = [];
    const ko = stages.filter(st => st.type === "knockout").sort((a, b) => b.order - a.order)[0];
    if (ko) {
      const ms = comp.meetings.filter(m => m.stageId === ko.id);
      const lastRound = Math.max.apply(null, ms.filter(m => !m.thirdPlace).map(m => m.round).concat([0]));
      const fin = ms.find(m => m.round === lastRound && !m.thirdPlace);
      const o = fin && D.outcome(fin);
      if (o && o.done && (o.winner === "A" || o.winner === "B")) {
        out.push({ key: "champion", ids: [D.side(fin, o.winner)] });
        const ru = D.side(fin, other(o.winner));
        if (ru && ru !== "BYE") out.push({ key: "runnerUp", ids: [ru] });
      }
      const third = ms.find(m => m.thirdPlace), o3 = third && D.outcome(third);
      if (o3 && o3.done && (o3.winner === "A" || o3.winner === "B") && D.side(third, o3.winner) !== "BYE") out.push({ key: "third", ids: [D.side(third, o3.winner)] });
      const plate = stages.find(st => st.type === "plate");
      if (plate) {
        const pm = comp.meetings.filter(m => m.stageId === plate.id), pr = Math.max.apply(null, pm.map(m => m.round).concat([0]));
        const pf = pm.find(m => m.round === pr), po = pf && D.outcome(pf);
        if (po && po.done && (po.winner === "A" || po.winner === "B") && D.side(pf, po.winner) !== "BYE") out.push({ key: "plate", ids: [D.side(pf, po.winner)] });
      }
      return { done: out.some(p => p.key === "champion"), list: out };
    }
    // a table (round robin, Swiss, points league): podium once every meeting is done; a leader before that
    const st = stages.slice().sort((a, b) => b.order - a.order)[0];
    if (!st || st.groups.length !== 1) return { done: false, list: out };
    const g = st.groups[0], rows = D.table(st.id, g.id), complete = D.groupComplete(st.id, g.id);
    if (!rows.length || !rows.some(r => r.played > 0)) return { done: false, list: out };
    if (!complete) return { done: false, list: [{ key: "leader", ids: [rows[0].id].concat(rows[0].tiedWith) }] };
    // shared places when still level after every tiebreaker: two co-champions, then third
    const keys = ["champion", "runnerUp", "third"], done = {};
    let place = 0;
    for (let i = 0; i < rows.length && place < 3; i++) {
      const r = rows[i];
      if (done[r.id]) continue;
      const group = [r.id].concat(r.tiedWith.filter(id => !done[id]));
      group.forEach(id => { done[id] = true; });
      out.push({ key: keys[place], ids: group });
      place += group.length;
    }
    return { done: true, list: out };
  }

  // Up to 4 names may share an award; a bigger tie isn't much of an award.
  const MAX_SHARED = 4;
  function bestOf(list, keys, max) {
    if (!list.length) return [];
    const cmp = (a, b) => { for (const k of keys) { const d = k(b) - k(a); if (d) return d; } return 0; };
    const sorted = list.slice().sort(cmp), top = sorted.filter(x => cmp(x, sorted[0]) === 0);
    return top.length <= (max || MAX_SHARED) ? top : [];
  }

  function awards(comp, D) {
    D = D || CompStandings.derive(comp);
    const recs = collect(comp, D), T = tallies(comp, D, recs), out = [];
    // placings: per division (pairs), overall (teams)
    const groups = D.isTeams ? [{ division: null, stages: comp.stages }] : comp.divisions.map(d => ({ division: d, stages: comp.stages.filter(st => st.divisionId === d.id) }));
    groups.forEach(function (gp) {
      if (!gp.stages.length) return;
      const pl = placings(comp, D, gp.stages);
      pl.list.forEach(p => out.push({ key: p.key, scope: gp.division ? gp.division.id : null, who: p.ids.map(id => ({ kind: D.isTeams ? "team" : "entry", id })) }));
    });
    // MVP: most matches won, then win rate, then game/point difference
    // in pairs mode the two partners share every result, so the pair is the MVP
    const src = D.isTeams ? T.P : T.E, kind = D.isTeams ? "player" : "entry";
    const ps = Object.keys(src).map(id => Object.assign({ id }, src[id])).filter(p => p.won > 0);
    const mvp = bestOf(ps, [p => p.won, p => p.won / p.played, p => p.gamesFor - p.gamesAgainst]);
    if (mvp.length) out.push({ key: "mvp", who: mvp.map(p => ({ kind, id: p.id })), note: { n: mvp[0].won, p: mvp[0].played } });
    // Best pair (teams): best record
    if (D.isTeams) {
      const prs = Object.keys(T.PR).map(k => T.PR[k]).filter(pr => pr.won > 0);
      const bp = bestOf(prs, [p => p.won, p => p.won / p.played, p => p.gamesFor - p.gamesAgainst]);
      if (bp.length) out.push({ key: "bestPair", who: bp.map(p => ({ kind: "pair", ids: p.ids, team: p.team })), note: { n: bp[0].won, p: bp[0].played } });
    }
    // Iron player: most matches played
    // Iron player: most matches played (3+, shared by 2 at most — when everyone plays the same, there's no award)
    const iron = bestOf(Object.keys(src).map(id => Object.assign({ id }, src[id])), [p => p.played], 2);
    if (iron.length && iron[0].played >= 3) out.push({ key: "iron", who: iron.map(p => ({ kind, id: p.id })), note: { n: iron[0].played } });
    // Match of the day: closest decided match (more points played breaks a tie, then the latest)
    const dec = recs.filter(decided);
    if (dec.length) {
      const motd = dec.slice().sort((a, b) => a.margin - b.margin || b.total - a.total || b.at - a.at)[0];
      out.push({ key: "matchOfDay", who: [{ kind: "match", id: motd.x.id }] });
    }
    // Comeback of the day: won after losing the first set by the most
    const backs = recs.filter(r => r.comeback);
    if (backs.length) {
      const cb = backs.slice().sort((a, b) => b.firstDeficit - a.firstDeficit || b.at - a.at)[0];
      out.push({ key: "comeback", who: [{ kind: "match", id: cb.x.id }] });
    }
    // Upset of the day: needs seeds
    const ups = upsets(comp, D, recs);
    if (ups.length) out.push(ups[0].meeting ? { key: "upset", who: [{ kind: "meeting", id: ups[0].meeting.id }], note: { s: ups[0].ws, t: ups[0].ls } }
      : { key: "upset", who: [{ kind: "match", id: ups[0].r.x.id }], note: { s: ups[0].ws, t: ups[0].ls } });
    return out;
  }

  // Frozen at "Finish" (§10.6) and shown while finished; live otherwise.
  function awardsFor(comp, D) {
    if (comp.status === "finished" && Array.isArray(comp.awards)) return comp.awards;
    return awards(comp, D);
  }
  function freeze(comp) { comp.awards = awards(comp); }
  function unfreeze(comp) { delete comp.awards; }

  /* ===== Text for awards ===== */
  // Plain-text name of a winner entry (escaped HTML is produced by callers via esc()).
  function whoText(comp, D, w) {
    if (w.kind === "player") return playerName(comp, w.id);
    if (w.kind === "pair") return pairName(comp, w.ids) + (w.team ? " (" + D.entryLabel(w.team) + ")" : "");
    if (w.kind === "meeting") {
      const m = D.meetingById[w.id];
      return m ? D.sideLabel(m, "A") + " " + t("courts.vs") + " " + D.sideLabel(m, "B") : "?";
    }
    if (w.kind === "match") {
      const x = comp.matches.find(m => m.id === w.id);
      if (!x) return "?";
      const a = D.isTeams ? pairName(comp, D.playerIdsOf(x, "A")) : D.sideLabel(D.meetingById[x.meetingId], "A");
      const b = D.isTeams ? pairName(comp, D.playerIdsOf(x, "B")) : D.sideLabel(D.meetingById[x.meetingId], "B");
      return a + " " + t("courts.vs") + " " + b;
    }
    return D.entryLabel(w.id);
  }
  function matchScore(comp, w, D) {
    if (w.kind === "meeting" && D) { const m = D.meetingById[w.id], r = m && D.teamResult(m); return r ? r.matchesA + "–" + r.matchesB : ""; }
    const x = w.kind === "match" && comp.matches.find(m => m.id === w.id);
    return x ? (x.sets || []).map(s => s.a + "–" + s.b).join(", ") : "";
  }
  function awardLabel(comp, a) { return t("award." + a.key + (a.who.length > 1 ? ".co" : "")); }
  function awardNote(comp, D, a) {
    if (a.key === "mvp" || a.key === "bestPair") return t("award.note.won", { n: a.note.n, p: a.note.p });
    if (a.key === "iron") return t("award.note.played", { n: a.note.n });
    if (a.key === "matchOfDay" || a.key === "comeback") return matchScore(comp, a.who[0], D);
    if (a.key === "upset") return t("award.note.upset", { s: a.note.s, t: a.note.t }) + " · " + matchScore(comp, a.who[0], D);
    if (a.scope && !D.isTeams && comp.divisions.length > 1) { const d = comp.divisions.find(x => x.id === a.scope); return d ? d.name : ""; }
    return "";
  }
  const EMOJI = { champion: "\u{1F3C6}", runnerUp: "\u{1F948}", third: "\u{1F949}", plate: "\u{1F37D}️", leader: "\u{1F4C8}", mvp: "⭐", bestPair: "\u{1F91D}", iron: "\u{1F3CB}️",
    matchOfDay: "\u{1F3BE}", comeback: "\u{1F525}", upset: "⚡" };

  // The champion team (for "took a set off the champions"), or the leader of a finished table.
  function championTeam(comp, D) {
    if (!D.isTeams) return null;
    const pl = placings(comp, D, comp.stages);
    const c = pl.list.find(p => p.key === "champion");
    return c && c.ids.length === 1 ? c.ids[0] : null;
  }

  /* ===== Markup shared by the app and the shared viewer ===== */
  const PLACES = ["champion", "runnerUp", "third", "plate", "leader"];
  // nameHtml(who) -> HTML for one winner (the viewer turns names into tappable labels)
  function awardsHtml(comp, D, nameHtml) {
    D = D || CompStandings.derive(comp);
    nameHtml = nameHtml || ((w) => esc(whoText(comp, D, w)));
    const list = awardsFor(comp, D);
    const row = (a) => {
      const note = PLACES.indexOf(a.key) !== -1 ? "" : awardNote(comp, D, a);
      return '<div class="aw-row"><span class="aw-em">' + (EMOJI[a.key] || "⭐") + '</span><div class="aw-body"><div class="aw-label">' + esc(awardLabel(comp, a)) + "</div>" +
        '<div class="aw-who">' + a.who.map(nameHtml).join('<span class="aw-and"> &amp; </span>') + "</div>" + (note ? '<div class="aw-note">' + esc(note) + "</div>" : "") + "</div></div>";
    };
    let h = '<div class="card aw-card"><div class="aw-head">\u{1F3C6} ' + esc(t("award.title")) + "</div>";
    if (comp.status !== "finished") h += '<div class="aw-sub">' + esc(t("award.preview")) + "</div>";
    if (!list.length) return h + '<div class="aw-sub">' + esc(t("award.none")) + "</div></div>";
    const places = list.filter(a => PLACES.indexOf(a.key) !== -1), rest = list.filter(a => PLACES.indexOf(a.key) === -1);
    const multi = !D.isTeams && comp.divisions.length > 1;
    if (multi) comp.divisions.forEach(function (d) {
      const mine = places.filter(a => a.scope === d.id);
      if (mine.length) h += '<div class="aw-div">' + esc(d.name) + "</div>" + mine.map(row).join("");
    });
    else h += places.map(row).join("");
    if (rest.length && multi && places.length) h += '<div class="aw-div">' + esc(t("award.overall")) + "</div>";
    h += rest.map(row).join("") + "</div>";
    return h;
  }
  function factsHtml(title, facts) {
    if (!facts.length) return "";
    return '<div class="card aw-card"><div class="aw-head">' + esc(title) + "</div>" +
      facts.map(f => '<div class="cf-fact"><span class="cf-em">' + f.emoji + '</span><span class="cf-tx">' + f.html + "</span></div>").join("") + "</div>";
  }
  // Highlights, then per-division facts (pairs, several divisions) or one fact per team.
  function allFactsHtml(comp, D) {
    D = D || CompStandings.derive(comp);
    const top = highlights(comp, D);
    let h = factsHtml(t("facts.title"), top);
    if (D.isTeams) {
      const tf = teamFacts(comp, D);
      if (collect(comp, D).length && tf.length) h += factsHtml(t("facts.teams"), tf);
    } else if (comp.divisions.length > 1) {
      divisionHighlights(comp, D, top).forEach(x => { h += factsHtml(t("facts.division", { d: x.division.name }), x.facts); });
    }
    return h;
  }

  return { awardsHtml, factsHtml, allFactsHtml, collect, highlights, divisionHighlights, teamFacts, awards, awardsFor, freeze, unfreeze, whoText, awardLabel, awardNote, EMOJI, seedOf, catalogue };
})();
