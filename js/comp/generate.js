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
    const matches = r.meetings.filter(m => !isByeMeeting(m)).map(m => matchFor(m, division));
    return { stages: r.stages, meetings: r.meetings, matches };
  }

  // Teams mode: the teams are the entrants of one stage plan across all divisions; every meeting
  // gets one match per rubber of the meeting template (§5 rules, §11).
  function generateTeams(comp) {
    const teams = comp.teams.filter(tm => !tm.withdrawn).map(tm => ({ id: tm.id, seed: tm.seed || null }));
    const plan = (comp.settings.stagePlan || {}).all || { type: "roundRobin" };
    const r = buildStages(comp, teams, plan, "teams" + (comp.settings.drawSeq ? ":" + comp.settings.drawSeq : ""), null);
    r.meetings.forEach(m => { m.sideA.refType = "team"; m.sideB.refType = "team"; });
    const rubbers = (comp.settings.meetingTemplate || []).slice().sort((a, b) => a.order - b.order);
    const byId = {}; comp.divisions.forEach(d => { byId[d.id] = d; });
    const matches = [];
    r.meetings.filter(m => !isByeMeeting(m)).forEach(function (m) {
      rubbers.forEach(function (rb, i) {
        const x = matchFor(m, byId[rb.divisionId] || { id: rb.divisionId, category: rb.category });
        x.order = i + 1; x.rubberId = rb.id; x.category = rb.category;
        matches.push(x);
      });
    });
    return { stages: r.stages, meetings: r.meetings, matches };
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
    } else if (plan.type === "knockout") {
      const st = newStage(division.id, "knockout", 0, { thirdPlace: plan.thirdPlace !== false }, fids.ko);
      const ordered = seedOrder(entries, rngFor(comp, baseKey + ":ko"));
      const size = nextPow2(ordered.length);
      const first = bracketPositions(size).map(s => s <= ordered.length ? side(ordered[s - 1].id) : fromSource({ kind: "bye" }));
      koMeetings(st, first, plan.thirdPlace !== false && ordered.length >= 4).forEach(m => meetings.push(m));
      stages.push(st);
    }
    stages.forEach((s, i) => { s.order = i; });
    return { stages, meetings };
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
    buildCourts, applyDraw, isByeMeeting, roundLabelKey, groupName, rngFor };
})();
