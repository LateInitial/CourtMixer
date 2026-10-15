// CourtMixer - fixture generation (Phase 3, v1.11.0), spec §9.
// Pure functions: (entries, config, seed) -> stages / meetings / matches. Randomness comes from
// mulberry32 seeded with comp.id + stage id, so regenerating with the same inputs gives the same draw.

const CompGenerate = (function () {
  function rngFor(comp, key) { return mulberry32(hashString(comp.id + ":" + key)); }
  function shuffle(arr, rnd) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const x = a[i]; a[i] = a[j]; a[j] = x; }
    return a;
  }
  function nextPow2(n) { let p = 1; while (p < n) p *= 2; return Math.max(2, p); }

  // Seeded entries first (by seed number), then unseeded in random order.
  function seedOrder(entries, rnd) {
    const seeded = entries.filter(e => Number.isFinite(e.seed) && e.seed > 0).sort((a, b) => a.seed - b.seed);
    const rest = shuffle(entries.filter(e => !(Number.isFinite(e.seed) && e.seed > 0)), rnd);
    return seeded.concat(rest);
  }

  /* ===== Round robin: circle method ===== */
  // Returns rounds: [[ [idA, idB], ... ], ...]. Odd counts get a bye (that entry sits out the round).
  function roundRobin(ids) {
    const list = ids.slice();
    if (list.length % 2) list.push(null);
    const n = list.length, rounds = [];
    for (let r = 0; r < n - 1; r++) {
      const pairs = [];
      for (let i = 0; i < n / 2; i++) {
        const a = list[i], b = list[n - 1 - i];
        if (a !== null && b !== null) pairs.push((i === 0 && r % 2) ? [b, a] : [a, b]);
      }
      rounds.push(pairs);
      list.splice(1, 0, list.pop()); // rotate everyone but the first
    }
    return rounds;
  }

  /* ===== Groups ===== */
  // Balanced sizes (differ by at most 1), filled in snake order: A B C C B A A B C ...
  function splitGroups(orderedIds, groupSize) {
    const n = orderedIds.length;
    const g = Math.max(1, Math.ceil(n / Math.max(2, groupSize)));
    const groups = Array.from({ length: g }, () => []);
    orderedIds.forEach(function (id, i) {
      const row = Math.floor(i / g), col = i % g;
      groups[row % 2 ? g - 1 - col : col].push(id);
    });
    return groups;
  }
  function groupName(i) { return String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : ""); }

  /* ===== Knockout ===== */
  // Standard bracket positions: for 8 -> [1,8,4,5,2,7,3,6], so 1 and 2 are in opposite halves.
  function bracketPositions(size) {
    let pos = [1, 2];
    while (pos.length < size) {
      const m = pos.length * 2 + 1, nx = [];
      pos.forEach(s => { nx.push(s, m - s); });
      pos = nx;
    }
    return pos;
  }
  function roundLabelKey(size, round) {
    const left = size / Math.pow(2, round - 1); // entries in this round
    if (left === 2) return "ko.final";
    if (left === 4) return "ko.semi";
    if (left === 8) return "ko.quarter";
    return "ko.roundOf";
  }

  // Cross-over seeding for knockout from groups: rank 1 of each group are seeds 1..G, rank 2 are
  // G+1..2G, and so on. With the standard bracket that already pairs A1 v B2 / B1 v A2 (2 groups)
  // and A1 v D2, B1 v C2, C1 v B2, D1 v A2 (4 groups). Any first-round pair that still has two
  // group-mates (odd group counts) is repaired by swapping the weaker side with a nearby pair.
  function crossoverSeeds(groupCount, advance) {
    const seeds = [];
    for (let r = 1; r <= advance; r++) for (let g = 0; g < groupCount; g++) seeds.push({ group: g, rank: r });
    return seeds;
  }
  function placeQualifiers(groupCount, advance) {
    const seeds = crossoverSeeds(groupCount, advance), size = nextPow2(seeds.length);
    const slots = bracketPositions(size).map(s => s <= seeds.length ? seeds[s - 1] : null);
    const clash = (i) => slots[i] && slots[i + 1] && slots[i].group === slots[i + 1].group;
    for (let i = 0; i < slots.length; i += 2) {
      if (!clash(i)) continue;
      for (let d = 2; d < slots.length && clash(i); d += 2) {
        [i + d, i - d].forEach(function (j) {
          if (!clash(i) || j < 0 || j >= slots.length) return;
          // swap the weaker (second) sides of two full pairs, so byes stay with the best-placed
          if (!slots[j] || !slots[j + 1]) return;
          const k = j + 1;
          const x = slots[i + 1]; slots[i + 1] = slots[k]; slots[k] = x;
          if (clash(i) || clash(j)) { slots[k] = slots[i + 1]; slots[i + 1] = x; }
        });
      }
    }
    return { size, slots };
  }

  /* ===== Building stage records ===== */
  function newMeeting(stageId, groupId, round, slot, sideA, sideB) {
    return { id: uid(), stageId, groupId, round, slot, sideA, sideB, status: "pending", resultOverride: null, lineupA: null, lineupB: null };
  }
  const side = (id) => ({ refType: "entry", id: id, source: null });
  const fromSource = (src) => ({ refType: "entry", id: null, source: src });

  function rrMeetings(stage, group, ids, double) {
    const out = [], rounds = roundRobin(ids);
    rounds.forEach((pairs, r) => pairs.forEach((p, k) => out.push(newMeeting(stage.id, group.id, r + 1, k, side(p[0]), side(p[1])))));
    if (double) rounds.forEach((pairs, r) => pairs.forEach((p, k) => out.push(newMeeting(stage.id, group.id, rounds.length + r + 1, k, side(p[1]), side(p[0])))));
    return out;
  }

  // Knockout meetings. firstRound: array (bracket order) of sides for round 1.
  function koMeetings(stage, firstRound, thirdPlace) {
    const size = firstRound.length, out = [];
    let prev = [];
    for (let k = 0; k < size / 2; k++) {
      const m = newMeeting(stage.id, null, 1, k, firstRound[2 * k], firstRound[2 * k + 1]);
      out.push(m); prev.push(m);
    }
    let round = 1;
    while (prev.length > 1) {
      round++;
      const cur = [];
      for (let k = 0; k < prev.length / 2; k++) {
        const m = newMeeting(stage.id, null, round, k,
          fromSource({ kind: "meetingWinner", meetingId: prev[2 * k].id }),
          fromSource({ kind: "meetingWinner", meetingId: prev[2 * k + 1].id }));
        out.push(m); cur.push(m);
      }
      if (cur.length === 1 && thirdPlace && prev.length === 2) {
        const m3 = newMeeting(stage.id, null, round, 1,
          fromSource({ kind: "meetingLoser", meetingId: prev[0].id }),
          fromSource({ kind: "meetingLoser", meetingId: prev[1].id }));
        m3.thirdPlace = true;
        out.push(m3);
      }
      prev = cur;
    }
    stage.config.size = size;
    return out;
  }

  function newStage(divisionId, type, order, config, formatId) {
    return { id: uid(), divisionId, type, order, status: "pending", config: config || {}, groups: [], matchFormatId: formatId };
  }

  // Match records: one per meeting in pairs mode (byes get none).
  function matchFor(meeting, division) {
    return { id: uid(), meetingId: meeting.id, order: 1, rubberId: null, divisionId: division.id, category: division.category,
      sideA: { playerIds: [] }, sideB: { playerIds: [] }, courtId: null, status: "pending", outcome: null, sets: [],
      winner: null, startedAt: null, endedAt: null, editedAt: null, history: [], note: "" };
  }

  function planFor(comp, division) {
    const sp = comp.settings.stagePlan || {};
    return (comp.settings.formatPlan === "perDivision" && sp[division.id]) ? sp[division.id] : (sp.all || { type: "roundRobin" });
  }
  function formatIds(comp) {
    const f = comp.settings.matchFormats || {};
    return { main: f.main ? "main" : null, ko: f.ko ? "ko" : (f.main ? "main" : null) };
  }

  // Generates one division's stages, meetings and matches. Pure: returns new records.
  function generateDivision(comp, division) {
    const entries = comp.entries.filter(e => e.divisionId === division.id && !e.withdrawn);
    const baseKey = division.id + (division.drawSeq ? ":" + division.drawSeq : ""); // Redraw bumps drawSeq
    const r = buildStages(comp, entries, planFor(comp, division), baseKey, division.id);
    return { stages: r.stages, meetings: r.meetings, matches: makeMatches(comp, r.meetings, division) };
  }

  // Match records for meetings: one per meeting (pairs) or one per rubber (teams); byes get none.
  function makeMatches(comp, meetings, division) {
    const out = [];
    const real = meetings.filter(m => !isByeMeeting(m));
    if (comp.kind !== "teams") { real.forEach(m => out.push(matchFor(m, division))); return out; }
    const rubbers = (comp.settings.meetingTemplate || []).slice().sort((a, b) => a.order - b.order);
    const byId = {}; comp.divisions.forEach(d => { byId[d.id] = d; });
    real.forEach(function (m) {
      rubbers.forEach(function (rb, i) {
        const x = matchFor(m, byId[rb.divisionId] || { id: rb.divisionId, category: rb.category });
        x.order = i + 1; x.rubberId = rb.id; x.category = rb.category;
        out.push(x);
      });
    });
    return out;
  }

  // Teams mode: the teams are the entrants of one stage plan across all divisions; every meeting
  // gets one match per rubber of the meeting template (§5 rules, §11).
  function generateTeams(comp) {
    const teams = comp.teams.filter(tm => !tm.withdrawn).map(tm => ({ id: tm.id, seed: tm.seed || null }));
    const plan = (comp.settings.stagePlan || {}).all || { type: "roundRobin" };
    const r = buildStages(comp, teams, plan, "teams", null);
    r.meetings.forEach(m => { m.sideA.refType = "team"; m.sideB.refType = "team"; });
    return { stages: r.stages, meetings: r.meetings, matches: makeMatches(comp, r.meetings, null) };
  }

  // Stages and meetings for a list of entrants ({id, seed}) under one stage plan.
  function buildStages(comp, entries, plan, baseKey, divisionId) {
    const fids = formatIds(comp);
    const stages = [], meetings = [];
    if (entries.length < 2) return { stages, meetings };
    const division = { id: divisionId };

    if (plan.type === "roundRobin" || plan.type === "doubleRoundRobin") {
      const st = newStage(division.id, plan.type, 0, { manualOrder: {} }, fids.main);
      const ordered = seedOrder(entries, rngFor(comp, baseKey + ":rr")).map(e => e.id);
      const g = { id: uid(), name: "", entryIds: ordered };
      st.groups.push(g);
      rrMeetings(st, g, ordered, plan.type === "doubleRoundRobin").forEach(m => meetings.push(m));
      stages.push(st);
    } else if (plan.type === "groups") {
      const st = newStage(division.id, "groups", 0, { groupSize: plan.groupSize || 4, advance: plan.advance || 2, seeding: plan.seeding || "snake", manualOrder: {} }, fids.main);
      const rnd = rngFor(comp, baseKey + ":groups");
      const ordered = (plan.seeding === "random" ? shuffle(entries, rnd) : seedOrder(entries, rnd)).map(e => e.id);
      splitGroups(ordered, plan.groupSize || 4).forEach(function (ids, i) {
        const g = { id: uid(), name: groupName(i), entryIds: ids };
        st.groups.push(g);
        rrMeetings(st, g, ids, false).forEach(m => meetings.push(m));
      });
      stages.push(st);
      const advance = Math.max(1, Math.min(plan.advance || 2, Math.min.apply(null, st.groups.map(g => g.entryIds.length))));
      st.config.advance = advance;
      const ko = newStage(division.id, "knockout", 1, { thirdPlace: plan.thirdPlace !== false, fromStageId: st.id }, fids.ko);
      const q = placeQualifiers(st.groups.length, advance);
      if (q.slots.filter(Boolean).length >= 2) {
        const first = q.slots.map(s => s ? fromSource({ kind: "groupRank", groupId: st.groups[s.group].id, rank: s.rank }) : fromSource({ kind: "bye" }));
        koMeetings(ko, first, plan.thirdPlace !== false && st.groups.length * advance >= 4).forEach(m => meetings.push(m));
        stages.push(ko);
      }
      // Plate (§9.6): everyone who didn't go through plays a second bracket.
      if (plan.plate) {
        const seeds = [], most = Math.max.apply(null, st.groups.map(g => g.entryIds.length));
        for (let r = advance + 1; r <= most; r++) st.groups.forEach((g, gi) => { if (g.entryIds.length >= r) seeds.push({ group: gi, rank: r }); });
        if (seeds.length >= 2) {
          const size = nextPow2(seeds.length);
          const first = bracketPositions(size).map(s => s <= seeds.length ? fromSource({ kind: "groupRank", groupId: st.groups[seeds[s - 1].group].id, rank: seeds[s - 1].rank }) : fromSource({ kind: "bye" }));
          const pl = newStage(division.id, "plate", 2, { thirdPlace: false, fromStageId: st.id }, fids.ko);
          koMeetings(pl, first, false).forEach(m => meetings.push(m));
          stages.push(pl);
        }
      }
    } else if (plan.type === "knockout" || plan.type === "plate") {
      const st = newStage(division.id, "knockout", 0, { thirdPlace: plan.thirdPlace !== false }, fids.ko);
      const ordered = seedOrder(entries, rngFor(comp, baseKey + ":ko"));
      const size = nextPow2(ordered.length);
      const first = bracketPositions(size).map(s => s <= ordered.length ? side(ordered[s - 1].id) : fromSource({ kind: "bye" }));
      const ko = koMeetings(st, first, plan.thirdPlace !== false && ordered.length >= 4);
      ko.forEach(m => meetings.push(m));
      stages.push(st);
      // Knockout + plate (§9.6): whoever loses their first match plays a second bracket. In a
      // 16+ bracket that includes a seed who had a bye and then lost in round 2 (D-054); in smaller
      // brackets round 2 is already a semi-final, so only real first-round losers go in.
      const slots = [], all1 = ko.filter(m => m.round === 1);
      all1.forEach((m, k) => {
        if (!isByeMeeting(m)) { slots.push({ kind: "meetingLoser", meetingId: m.id }); return; }
        if (size < 16) return;
        const r2 = ko.find(x => x.round === 2 && x.slot === k >> 1), mate = all1[k ^ 1];
        if (!isByeMeeting(mate)) slots.push({ kind: "firstMatchLoser", meetingId: r2.id, which: k % 2 ? "B" : "A" }); // only if the bye side loses
        else if (k % 2 === 0) slots.push({ kind: "meetingLoser", meetingId: r2.id }); // two bye sides: either loser, counted once
      });
      if (plan.type === "plate" && slots.length >= 2) {
        // in bracket order, padded with byes to a power of 2
        const size2 = nextPow2(slots.length);
        const losers = bracketPositions(size2).map(s => s <= slots.length ? fromSource(slots[s - 1]) : fromSource({ kind: "bye" }));
        const pl = newStage(division.id, "plate", 1, { thirdPlace: false, fromStageId: st.id }, fids.ko);
        koMeetings(pl, losers, false).forEach(m => meetings.push(m));
        stages.push(pl);
      }
    } else if (plan.type === "swiss" || plan.type === "pointsLeague") {
      // Rounds are drawn one at a time (advance()); only round 1 exists at the start.
      const n = entries.length;
      const rounds = plan.rounds || defaultRounds(plan.type, n);
      const st = newStage(division.id, plan.type, 0, { manualOrder: {}, rounds: rounds, pairing: plan.pairing || "mexicano",
        firstRound: plan.firstRound || "seed", seedKey: baseKey }, plan.type === "pointsLeague" ? fids.main : fids.main);
      const ordered = seedOrder(entries, rngFor(comp, baseKey + ":" + plan.type)).map(e => e.id);
      const g = { id: uid(), name: "", entryIds: ordered };
      st.groups.push(g);
      stages.push(st);
      firstRound(comp, st, g, ordered).forEach(m => meetings.push(m));
    }
    stages.forEach((s, i) => { s.order = i; });
    return { stages, meetings };
  }

  /* ===== Swiss and points league (§9.7, §9.8) ===== */
  function defaultRounds(type, n) {
    if (type === "swiss") return Math.max(1, Math.min(n - 1, Math.ceil(Math.log2(Math.max(2, n))) + 1));
    return Math.max(1, Math.min(n - 1, 6));
  }
  function byeMeeting(st, g, round, slot, id) { return newMeeting(st.id, g.id, round, slot, side(id), fromSource({ kind: "bye" })); }

  function firstRound(comp, st, g, ordered) {
    if (st.type === "pointsLeague" && st.config.pairing === "americano") return americanoRound(st, g, ordered, 1);
    let ids = ordered.slice();
    if (st.config.firstRound === "random") ids = shuffle(ids, rngFor(comp, st.config.seedKey + ":r1"));
    const out = [];
    if (ids.length % 2) out.push(byeMeeting(st, g, 1, Math.floor(ids.length / 2), ids.pop())); // lowest seed sits out
    const half = ids.length / 2;
    for (let k = 0; k < half; k++) {
      // Swiss by seed: top half v bottom half (1 v 5, 2 v 6 ...); Mexicano / random: neighbours
      const pair = (st.type === "swiss" && st.config.firstRound !== "random") ? [ids[k], ids[k + half]] : [ids[2 * k], ids[2 * k + 1]];
      out.push(newMeeting(st.id, g.id, 1, k, side(pair[0]), side(pair[1])));
    }
    return out;
  }
  // Americano: a round-robin rotation, so opponents differ for as long as possible.
  function americanoRound(st, g, ordered, round) {
    const rr = roundRobin(ordered), pairs = rr[(round - 1) % rr.length], out = [];
    const playing = {};
    pairs.forEach((p, k) => { playing[p[0]] = playing[p[1]] = true; out.push(newMeeting(st.id, g.id, round, k, side(p[0]), side(p[1]))); });
    ordered.filter(id => !playing[id]).forEach((id, k) => out.push(byeMeeting(st, g, round, pairs.length + k, id)));
    return out;
  }
  // Next round from the current standings. order: entry ids best first; played: "a|b" keys;
  // hadBye: ids that already sat out. Swiss pairs top-down avoiding rematches (with backtracking);
  // Mexicano pairs 1v2, 3v4 avoiding last round's opponent.
  function pairRound(type, order, played, hadBye, lastOpp) {
    const ids = order.slice(), byes = [];
    if (ids.length % 2) {
      let k = ids.length - 1;
      while (k > 0 && hadBye[ids[k]]) k--;
      byes.push(ids.splice(k, 1)[0]);
    }
    // Swiss: never a previous opponent. Mexicano: never last round's opponent (others are fine).
    const met = type === "pointsLeague" ? (a, b) => lastOpp[a] === b : (a, b) => played[a < b ? a + "|" + b : b + "|" + a];
    // Top-down with backtracking: each entry takes the nearest-ranked opponent still allowed.
    function solve(rest, allowRematch) {
      if (!rest.length) return [];
      const a = rest[0];
      for (let j = 1; j < rest.length; j++) {
        if (!allowRematch && met(a, rest[j])) continue;
        const sub = solve(rest.slice(1, j).concat(rest.slice(j + 1)), allowRematch);
        if (sub) return [[a, rest[j]]].concat(sub);
      }
      return null;
    }
    const pairs = solve(ids, false) || solve(ids, true);
    return { pairs, byes };
  }

  // Draws the next Swiss / points-league round once the current one is finished. If the latest
  // round hasn't started yet, it's redrawn from the current standings (e.g. after a result was
  // corrected). Returns true when something changed.
  function advance(comp) {
    let changed = false;
    comp.stages.filter(st => st.type === "swiss" || st.type === "pointsLeague").forEach(function (st) {
      for (let guard = 0; guard < 2; guard++) {
        const D = CompStandings.derive(comp), g = st.groups[0];
        const ms = comp.meetings.filter(m => m.stageId === st.id);
        const last = Math.max.apply(null, ms.map(m => m.round).concat([0]));
        const lastMs = ms.filter(m => m.round === last);
        const untouched = lastMs.every(m => !comp.matches.some(x => x.meetingId === m.id && x.status !== "pending") && !m.resultOverride);
        const prevDone = ms.filter(m => m.round === last - 1).every(m => D.outcome(m).done);
        let round;
        if (last > 1 && untouched && prevDone && guard === 0) round = last;               // redraw an untouched round
        else if (last < st.config.rounds && lastMs.every(m => D.outcome(m).done)) round = last + 1;
        else break;
        const division = D.divisionById[st.divisionId] || { id: st.divisionId, category: "open" };
        const active = D.table(st.id, g.id).map(r => r.id).filter(id => { const e = D.entryById[id] || D.teamById[id]; return e && !e.withdrawn; });
        let fresh;
        if (st.type === "pointsLeague" && st.config.pairing === "americano") fresh = americanoRound(st, g, g.entryIds.filter(id => active.indexOf(id) !== -1), round);
        else {
          const played = {}, hadBye = {}, lastOpp = {};
          ms.filter(m => m.round < round).forEach(function (m) {
            const a = D.side(m, "A"), b = D.side(m, "B");
            if (a === "BYE" || b === "BYE") { hadBye[a === "BYE" ? b : a] = true; return; }
            if (!a || !b) return;
            played[a < b ? a + "|" + b : b + "|" + a] = true;
            if (m.round === round - 1) { lastOpp[a] = b; lastOpp[b] = a; }
          });
          const r = pairRound(st.type, active, played, hadBye, lastOpp);
          fresh = r.pairs.map((p, k) => newMeeting(st.id, g.id, round, k, side(p[0]), side(p[1])))
            .concat(r.byes.map((id, k) => byeMeeting(st, g, round, r.pairs.length + k, id)));
        }
        if (comp.kind === "teams") fresh.forEach(m => { m.sideA.refType = "team"; m.sideB.refType = "team"; });
        const sig = (list) => list.map(m => m.sideA.id + ">" + (m.sideB.id || "bye")).sort().join(",");
        if (round === last) {
          if (sig(fresh) === sig(lastMs)) break;                                         // same draw: keep it
          const gone = lastMs.map(m => m.id);
          comp.meetings = comp.meetings.filter(m => gone.indexOf(m.id) === -1);
          comp.matches = comp.matches.filter(x => gone.indexOf(x.meetingId) === -1);
        }
        comp.meetings = comp.meetings.concat(fresh);
        comp.matches = comp.matches.concat(makeMatches(comp, fresh, division));
        changed = true;
        if (round === last + 1) break;
      }
    });
    return changed;
  }

  function isByeMeeting(m) {
    return (m.sideA.source && m.sideA.source.kind === "bye") || (m.sideB.source && m.sideB.source.kind === "bye");
  }

  // Whole draw. Courts come from settings; ids are kept when they already exist.
  function generateDraw(comp) {
    const out = { stages: [], meetings: [], matches: [], courts: [] };
    if (comp.kind === "teams") {
      const r = generateTeams(comp);
      out.stages = r.stages; out.meetings = r.meetings; out.matches = r.matches;
      out.courts = buildCourts(comp);
      return out;
    }
    comp.divisions.forEach(function (d) {
      const r = generateDivision(comp, d);
      out.stages.push.apply(out.stages, r.stages);
      out.meetings.push.apply(out.meetings, r.meetings);
      out.matches.push.apply(out.matches, r.matches);
    });
    out.courts = buildCourts(comp);
    return out;
  }
  function buildCourts(comp) {
    const s = comp.settings, n = Math.max(1, Math.min(16, s.courtsCount || 1));
    const old = comp.courts || [];
    const out = [];
    for (let i = 0; i < n; i++) {
      const c = old[i] || { id: uid(), name: "", order: i, active: true, homeDivisionIds: [] };
      c.name = (s.courtNames && s.courtNames[i]) || ("Court " + (i + 1));
      c.order = i;
      if (c.active === undefined) c.active = true;
      // settings.courtAssign: { divisionId: [court positions] } (dedicated / home courts)
      const assign = s.courtAssign || {};
      c.homeDivisionIds = comp.divisions.filter(d => (assign[d.id] || []).indexOf(i) !== -1).map(d => d.id);
      out.push(c);
    }
    return out;
  }
  // Applies a generated draw to the competition and links divisions to their courts.
  function applyDraw(comp, draw) {
    comp.stages = draw.stages; comp.meetings = draw.meetings; comp.matches = draw.matches; comp.courts = draw.courts;
    comp.divisions.forEach(d => { d.courtIds = comp.courts.filter(c => c.homeDivisionIds.indexOf(d.id) !== -1).map(c => c.id); });
  }

  return { roundRobin, splitGroups, bracketPositions, placeQualifiers, seedOrder, nextPow2, generateDivision, generateTeams, generateDraw,
    advance, pairRound, defaultRounds, makeMatches,
    buildCourts, applyDraw, isByeMeeting, roundLabelKey, groupName, rngFor };
})();
