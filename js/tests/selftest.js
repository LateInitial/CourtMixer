// CourtMixer - self-tests (?selftest) and share diagnostics (?sharetest)
// Moved verbatim from index.html in Phase 0 (v1.9.0). Loaded as a classic script;
// all top-level declarations share one global scope, exactly as before the split.

function runSelfTests(){
  const out = [];
  let pass = 0, fail = 0;
  const ok = (name, cond) => { if (cond) { pass++; out.push("  ok   " + name); } else { fail++; out.push("  FAIL " + name); } };
  const eq = (name, a, b) => ok(name + "  (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")", JSON.stringify(a) === JSON.stringify(b));

  out.push("esc / uid");
  eq("esc escapes all five", esc('<a href="x">&\'</a>'), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;");
  ok("uid is uuid-shaped", /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(uid()));
  ok("uid is unique", uid() !== uid());

  out.push("skill helpers");
  eq("unrated -> 3.0", skillOf({ skill: null }), 3);
  eq("blank string is unrated", fmtSkill({ skill: "" }), "U");
  eq("normSkillInput U -> null", normSkillInput("u"), null);
  eq("normSkillData junk -> null", normSkillData("abc"), null);

  out.push("pairKey");
  eq("pairKey is order-insensitive", pairKey(["a","b"],["c","d"]), pairKey(["d","c"],["b","a"]));
  ok("pairKey separates different fours", pairKey(["a","b"],["c","d"]) !== pairKey(["a","c"],["b","d"]));

  out.push("normalizeHistoryEntry");
  ok("rejects missing ids", normalizeHistoryEntry({ pairAIds: ["a"], pairBIds: ["c","d"] }) === null);
  ok("rejects non-objects", normalizeHistoryEntry(null) === null);
  eq("half a score is no score", (normalizeHistoryEntry({ pairAIds:["a","b"], pairBIds:["c","d"], scoreA: 21, scoreB: null }) || {}).scoreA, null);
  eq("keeps a valid score", (normalizeHistoryEntry({ pairAIds:["a","b"], pairBIds:["c","d"], scoreA: 21, scoreB: 15 }) || {}).scoreB, 15);

  out.push("ensureGenderMix");
  const men = [1,2,3,4,5].map(i => ({ id: "m" + i, gender: "M" }));
  const women = [1,2].map(i => ({ id: "w" + i, gender: "F" }));
  const mixed = ensureGenderMix(men.slice(0, 4), men.concat(women), "XD");
  eq("XD pool gains two women", mixed.filter(p => p.gender === "F").length, 2);
  eq("non-XD pool is untouched", ensureGenderMix(men.slice(0, 4), men.concat(women), "").length, 4);

  out.push("scoring engine (sandboxed)");
  const _p = players, _h = matchHistory, _st = scoringStyle;
  try {
    players = [
      { id:"a", name:"A", gender:"M", skill:5, matches:1, wins:0, points:0, pointsDiff:0, rawPoints:0 },
      { id:"b", name:"B", gender:"F", skill:5, matches:1, wins:0, points:0, pointsDiff:0, rawPoints:0 },
      { id:"c", name:"C", gender:"M", skill:5, matches:1, wins:0, points:0, pointsDiff:0, rawPoints:0 },
      { id:"d", name:"D", gender:"F", skill:5, matches:1, wins:0, points:0, pointsDiff:0, rawPoints:0 }
    ];
    matchHistory = [{ id:"h1", pairAIds:["a","b"], pairBIds:["c","d"], pairA:["A","B"], pairB:["C","D"], scoreA:21, scoreB:15, closed:false, court:null }];

    scoringStyle = "points";
    recomputeStatsFromHistory();
    eq("points: winner scores 21", byId("a").points, 21);
    eq("points: loser scores 15", byId("c").points, 15);
    eq("points: winner has the win", byId("a").wins, 1);
    eq("points: point diff +6", byId("a").pointsDiff, 6);
    eq("points: raw = 21", byId("a").rawPoints, 21);

    scoringStyle = "league";
    recomputeStatsFromHistory();
    eq("league: winner gets 3", byId("a").points, 3);
    eq("league: loser gets 1", byId("c").points, 1);
    eq("league: rawPoints stays the match score", byId("a").rawPoints, 21);
    eq("league: matchmaking reads raw points", ptsOf(byId("a")), 21);

    scoringStyle = "points";
    recomputeStatsFromHistory();
    applyScoreCredits(matchHistory[0], true);
    eq("undo clears points", byId("a").points, 0);
    eq("undo clears wins", byId("a").wins, 0);
    eq("undo clears diff", byId("a").pointsDiff, 0);
    eq("undo clears raw", byId("a").rawPoints, 0);

    out.push("export payload shape");
    // The exported key is "history". A shorthand rename silently changed it in v1.6.0 and
    // every backup file lost its match history on import, so pin the contract here.
    const payload = JSON.parse(JSON.stringify(buildSessionPayload()));
    ok("session export uses the 'history' key", Array.isArray(payload.history));
    eq("exported history length", payload.history.length, matchHistory.length);
    ok("no stray 'matchHistory' key in the export", payload.matchHistory === undefined);
    ["players", "seen", "courtCount", "scoringStyle", "matchmakingMode", "sessionName", "sessionDate"].forEach(function (key) {
      ok("export carries " + key, payload[key] !== undefined);
    });
    // Export is code-only now, so pin the code round-trip instead of a filename helper.
    const rtCode = _cmxEncode(buildSessionPayload(), "CMXS1:");
    const rtBack = _cmxDecode(rtCode);
    ok("session code round-trips", !!rtBack && Array.isArray(rtBack.history));
    eq("code keeps every match", rtBack.history.length, matchHistory.length);
    ok("code survives surrounding chat text", (function () {
      const d = _cmxDecode("Here you go!\n\n" + rtCode + "\n\nsee you Friday");
      return !!d && d.app === "CourtMixer";
    })());
    ok("raw exported JSON also pastes in", (function () {
      const d = _cmxDecode(JSON.stringify(buildSessionPayload()));
      return !!d && d.app === "CourtMixer";
    })());

    out.push("modal nesting");
    // A modal button that opens a SECOND modal used to have it closed again immediately by
    // the first modal's auto-close, which is exactly why Export looked like a dead button.
    (function () {
      cmxShowModal({ title: "seq-test", bodyHTML: "", buttons: [{ label: "go", cls: "ghost", onClick: function () { cmxAlert("nested"); } }] });
      const b = document.querySelector(".cmx-modal-btn");
      if (b) b.click();
      const overlay = document.getElementById("cmxModal");
      const stillOpen = overlay && getComputedStyle(overlay).display !== "none";
      const title = (document.querySelector(".cmx-modal-title") || {}).textContent;
      ok("a modal opened from a modal handler stays open", !!stillOpen && title === "CourtMixer");
      cmxCloseModal();
    })();

    recomputeStatsFromHistory();
    const boards = {};
    ["points", "league"].forEach(st => { scoringStyle = st; recomputeStatsFromHistory(); boards[st] = computeLeaderboardData().ranked.map(p => String(computeLeaderboardData().valueFn(p))); });
    ok("shared boards differ per style", boards.points.join(",") !== boards.league.join(","));

    out.push("matchmaking under a wide games-played spread");
    const mk = (n, g, gen, gp) => Array.from({ length: n }, (_, i) => ({ id: "x" + gen + i, name: gen + i, gender: gen, skill: 5, matches: gp, wins: 0, points: 0, rawPoints: 0, pointsDiff: 0, priority: false, skip: false, priorityLock: false, skipLock: false }));
    const _mode = matchmakingMode, _cc = courtCount, _seen = Array.from(seenPairings);
    try {
      matchHistory = []; seenPairings.clear(); courtCount = 1; matchmakingMode = "americano";
      // 7 regulars on 20 games plus one late joiner: the GP spread exceeds the roster size
      players = mk(4, 0, "M", 20).concat(mk(3, 0, "F", 20));
      players.forEach((p, i) => { p.id = "reg" + i; });
      players.push({ id: "late", name: "Late", gender: "F", skill: 5, matches: 0, wins: 0, points: 0, rawPoints: 0, pointsDiff: 0, priority: false, skip: false, priorityLock: false, skipLock: false });
      const r1 = chooseMatch({ excludeIds: new Set(), courtNum: 1, genderMode: "", avoidKeys: new Set() });
      ok("late joiner does not break matchmaking", !r1.error);
      ok("late joiner gets picked first", !r1.error && [].concat(r1.a, r1.b).some(p => p.id === "late"));

      // men-heavy roster where every woman is heavily played
      players = mk(16, 0, "M", 0).concat(mk(2, 0, "F", 99));
      players.forEach((p, i) => { p.id = "g" + i; });
      const r2 = chooseMatch({ excludeIds: new Set(), courtNum: 1, genderMode: "XD", avoidKeys: new Set() });
      ok("XD still forms on a men-heavy roster", !r2.error);
      const gg = (p) => p.gender === "F" ? "F" : "M";
      ok("both XD teams are mixed", !r2.error && gg(r2.a[0]) !== gg(r2.a[1]) && gg(r2.b[0]) !== gg(r2.b[1]));
      const r3 = chooseMatch({ excludeIds: new Set(), courtNum: 1, genderMode: "WD", avoidKeys: new Set() });
      ok("WD refuses when only two women are available", !!r3.error);
    } finally {
      matchmakingMode = _mode; courtCount = _cc;
      seenPairings.clear(); _seen.forEach(k => seenPairings.add(k));
    }
  } finally {
    players = _p; matchHistory = _h; scoringStyle = _st;
    recomputeStatsFromHistory();
  }

  // ===== Phase 1: storage layer =====
  // Every test below runs against an in-memory mock, never the real localStorage.
  const mockStorage = (init) => {
    const m = new Map(Object.entries(init || {}));
    return {
      getItem: (k) => m.has(k) ? m.get(k) : null,
      setItem: (k, v) => { m.set(k, String(v)); },
      removeItem: (k) => { m.delete(k); },
      key: (i) => { const k = Array.from(m.keys())[i]; return k === undefined ? null : k; },
      get length() { return m.size; },
      _map: m
    };
  };
  const throwing = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); },
    removeItem() { throw new Error("blocked"); }, key() { throw new Error("blocked"); }, get length() { throw new Error("blocked"); } };
  // Key-order-insensitive JSON, so "same data" doesn't depend on property order.
  const canon = (v) => Array.isArray(v) ? "[" + v.map(canon).join(",") + "]"
    : (v && typeof v === "object") ? "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}"
    : JSON.stringify(v);
  const canonStr = (s) => { try { return canon(JSON.parse(s)); } catch (e) { return s; } };

  out.push("Store");
  const _realBackend = Store._useBackend(throwing);
  try {
    eq("throwing storage: get -> null", Store.get("courtmixer_players"), null);
    eq("throwing storage: set -> false", Store.set("k", "v"), false);
    ok("throwing storage: remove does not throw", (function () { try { Store.remove("k"); return true; } catch (e) { return false; } })());
    eq("throwing storage: getJSON -> fallback", Store.getJSON("k", [1]), [1]);
    eq("throwing storage: setJSON -> false", Store.setJSON("k", { a: 1 }), false);
    eq("throwing storage: keys -> []", Store.keys("courtmixer_"), []);
    eq("throwing storage: available -> false", Store.available(), false);

    Store._useBackend(mockStorage({ "courtmixer_a": "1", "courtmixer_b": "{bad json", "other": "x" }));
    eq("available on working storage", Store.available(), true);
    ok("set then get round-trips", Store.set("courtmixer_c", "hello") && Store.get("courtmixer_c") === "hello");
    eq("getJSON parse error -> fallback", Store.getJSON("courtmixer_b", "fb"), "fb");
    eq("getJSON missing -> fallback", Store.getJSON("nope", null), null);
    ok("setJSON then getJSON round-trips", Store.setJSON("courtmixer_d", { x: [1, 2] }) && canon(Store.getJSON("courtmixer_d")) === canon({ x: [1, 2] }));
    eq("keys filters by prefix", Store.keys("courtmixer_"), ["courtmixer_a", "courtmixer_b", "courtmixer_c", "courtmixer_d"]);
    Store.remove("courtmixer_a");
    eq("remove deletes the key", Store.get("courtmixer_a"), null);
  } finally { Store._useBackend(_realBackend); }

  out.push("Docs");
  Store._useBackend(mockStorage());
  try {
    ok("valid: social", Docs.valid("social"));
    ok("valid: comp:<id>", Docs.valid("comp:abc-123"));
    ok("rejects bad keys", !Docs.valid("comp:") && !Docs.valid("comp:a b") && !Docs.valid("players") && !Docs.valid("comp:" + "x".repeat(65)));
    ok("rejects reserved comp ids", !Docs.valid("comp:index") && !Docs.valid("comp:active"));
    ok("comp doc put", Docs.put("comp:t1", { id: "t1", name: "Cup" }));
    eq("comp doc get", (Docs.get("comp:t1") || {}).name, "Cup");
    eq("comp doc stored under courtmixer_comp_<id>", Store.getJSON("courtmixer_comp_t1", {}).id, "t1");
    eq("list has social and the comp", Docs.list(), ["social", "comp:t1"]);
    eq("missing comp -> null", Docs.get("comp:none"), null);
    eq("meta defaults", Docs.meta("comp:t1"), { updatedAt: 0, localVersion: 0, serverVersion: 0, dirty: false });
    Docs.setMeta("comp:t1", { dirty: true, localVersion: 2 });
    eq("setMeta merges", Docs.meta("comp:t1"), { updatedAt: 0, localVersion: 2, serverVersion: 0, dirty: true });
    ok("remove comp doc", Docs.remove("comp:t1") && Docs.get("comp:t1") === null && Docs.meta("comp:t1").dirty === false);
    ok("social doc cannot be removed", Docs.remove("social") === false);
  } finally { Store._useBackend(_realBackend); }

  out.push("Docs social round-trip (sandboxed)");
  {
    const keep = { players, matchHistory, seen: Array.from(seenPairings), courtCount, scoringStyle, matchmakingMode,
      customDefaults, sessionName, sessionDate, courtSlots, courtSlotManual, courtMode };
    const sni = document.getElementById("sessionNameInput"), sniVal = sni ? sni.value : null;
    const mock = mockStorage();
    Store._useBackend(mock);
    try {
      // A session with everything an export leaves out: pending lineup, manual slots, court
      // mode, priority/skip locks, no saved default roster, and a live match on court 2.
      const P = (id, name, g, skill) => ({ id, name, gender: g, skill, matches: 0, wins: 0, points: 0, priority: false, skip: false, priorityLock: false, skipLock: false, pointsDiff: 0, rawPoints: 0 });
      players = [P("p1", "Ann", "F", 5), P("p2", "Ben", "M", null), P("p3", "Cy", "M", 6.5), P("p4", "Di", "F", 4),
                 P("p5", "Ed", "M", 3), P("p6", "Flo", "F", 7), P("p7", "Gus", "M", 5), P("p8", "Hal", "M", 5)];
      players[0].priority = true; players[1].skipLock = true; players[1].skip = true;
      matchHistory = [
        { id: "m1", time: "10:00", pairA: ["Ann", "Ben"], pairB: ["Cy", "Di"], pairAIds: ["p1", "p2"], pairBIds: ["p3", "p4"], pairDelta: 0.5, repeated: false, scoreA: 21, scoreB: 17, closed: false, court: 1, category: "XD" },
        { id: "m2", time: "10:20", pairA: ["Ed", "Flo"], pairB: ["Gus", "Hal"], pairAIds: ["p5", "p6"], pairBIds: ["p7", "p8"], pairDelta: 0, repeated: false, scoreA: null, scoreB: null, closed: false, court: 2, category: null }
      ];
      seenPairings.clear(); seenPairings.add(pairKey(["p1", "p2"], ["p3", "p4"]));
      courtCount = 2; scoringStyle = "league"; matchmakingMode = "mexicano"; customDefaults = null;
      sessionName = "Round-trip test"; sessionDate = "2026-10-15";
      courtSlots = EMPTY_SLOTS(); courtSlots[1] = ["p1", "p3", null, "p4"];
      courtSlotManual = EMPTY_MANUAL(); courtSlotManual[1] = [true, false, false, true];
      courtMode = { 1: "XD", 2: "", 3: "", 4: "" };
      recomputeStatsFromHistory();
      save(); saveCourts();

      const before = {}; mock._map.forEach((v, k) => { before[k] = canonStr(v); });
      const stateOf = () => canon({ players, matchHistory, seen: Array.from(seenPairings).sort(), courtCount, scoringStyle, matchmakingMode, customDefaults, sessionName, sessionDate, courtSlots, courtSlotManual, courtMode });
      const memBefore = stateOf();

      const doc = Docs.get("social");
      ok("social doc is the export payload", !!doc && doc.app === "CourtMixer" && doc.type === "session" && Array.isArray(doc.history));
      const exportKeys = Object.keys(buildSessionPayload()).sort().join(",");
      eq("exports carry no 'local' block", Object.keys(buildSessionPayload()).indexOf("local"), -1);
      ok("Docs.put('social') succeeds", Docs.put("social", JSON.parse(JSON.stringify(doc))));
      eq("export keys unchanged after round-trip", Object.keys(buildSessionPayload()).sort().join(","), exportKeys);
      ok("in-memory social state unchanged after round-trip", stateOf() === memBefore);
      const after = {}; mock._map.forEach((v, k) => { after[k] = canonStr(v); });
      const changed = Object.keys(Object.assign({}, before, after)).filter(k => before[k] !== after[k]);
      eq("stored social keys unchanged after round-trip", changed, []);
      ok("Docs.put('social') rejects junk", Docs.put("social", { app: "Other" }) === false);
    } finally {
      Store._useBackend(_realBackend);
      players = keep.players; matchHistory = keep.matchHistory;
      seenPairings.clear(); keep.seen.forEach(k => seenPairings.add(k));
      courtCount = keep.courtCount; scoringStyle = keep.scoringStyle; matchmakingMode = keep.matchmakingMode;
      customDefaults = keep.customDefaults; sessionName = keep.sessionName; sessionDate = keep.sessionDate;
      courtSlots = keep.courtSlots; courtSlotManual = keep.courtSlotManual; courtMode = keep.courtMode;
      if (sni) sni.value = sniVal;
      recomputeStatsFromHistory();
      updateMatchToolbar(); updateDefaultButtons();
      renderPlayers(); renderMatch(); renderHistory(); renderLeaderboard(); renderStats();
    }
  }

  // ===== Phase 2: competition shell =====
  out.push("strings table");
  eq("t() fills placeholders", t("wiz.stepOf", { n: 4, total: 10, name: "Divisions" }), "Step 4 of 10 — Divisions");
  eq("t() returns the key when missing", t("no.such.key"), "no.such.key");
  delete STR.missing["no.such.key"];

  const SOCIAL_KEYS = ["courtmixer_players", "courtmixer_history", "courtmixer_seen", "courtmixer_court_count",
    "courtmixer_scoring_style", "courtmixer_matchmaking", "courtmixer_session_name", "courtmixer_session_date",
    "courtmixer_court_modes", "courtmixer_court_slots", "courtmixer_court_manual", "courtmixer_custom_defaults",
    "courtmixer_ps_hint_seen"];
  const _warned = _storageWarned;
  const compRootHtml = (document.getElementById("compRoot") || {}).innerHTML;
  const realMode = CompStore.getMode();
  Store._useBackend(mockStorage());
  CompStore._reset();
  try {
    out.push("competition model");
    const c1 = CompModel.newCompetition();
    CompModel.applyPreset(c1, CompModel.RECOMMENDED_PRESET);
    eq("new competition starts in setup", c1.status, "setup");
    eq("schema version stamped", c1.schemaVersion, CompModel.SCHEMA_VERSION);
    eq("recommended preset: pairs", c1.kind, "pairs");
    eq("recommended preset: 2 divisions", c1.divisions.map(d => d.name), ["A", "B"]);
    eq("recommended preset: groups + knockout", c1.settings.stagePlan.all.type, "groups");
    const tp = CompModel.newCompetition(); CompModel.applyPreset(tp, "teamsFlexible");
    ok("team preset: 3 divisions, 4 teams, flexible lineup", tp.kind === "teams" && tp.divisions.length === 3 && tp.teams.length === 4 && tp.settings.lineup.mode === "flexible");
    CompModel.renameDivisions(c1, "metals");
    eq("naming quick-fill renames", c1.divisions.map(d => d.name), ["Gold", "Silver"]);
    ok("migrate keeps a current document", CompModel.migrate(JSON.parse(JSON.stringify(c1))).id === c1.id);
    eq("migrate leaves a newer document alone", CompModel.migrate({ schemaVersion: 99, id: "x" }).schemaVersion, 99);
    c1.matches = [{ id: "m" }]; c1.status = "live";
    const dup = CompModel.duplicate(c1);
    ok("duplicate: new id, back to setup, results cleared, settings kept",
      dup.id !== c1.id && dup.status === "setup" && dup.matches.length === 0 && dup.divisions.length === 2 && dup.settings.stagePlan.all.type === "groups");

    out.push("wizard navigation");
    const w = CompModel.newCompetition();
    CompModel.applyPreset(w, CompModel.RECOMMENDED_PRESET);
    w.wizard.visited.start = true;
    eq("pairs: 10 visible steps", Wizard.visibleSteps(w).length, 10);
    ok("pairs skip teams, template and meetingWin", ["teams", "template", "meetingWin"].every(id => Wizard.visibleSteps(w).indexOf(id) === -1));
    eq("step 1 renumbered", Wizard.position(w, "start"), { n: 1, total: 10 });
    eq("Next from start goes to basics", (Wizard.next(w), w.wizard.currentStep), "basics");
    eq("basics blocks Next until name and sport are set", Wizard.next(w), ["wiz.err.name", "wiz.err.sport"]);
    ok("cannot jump past the furthest step", !Wizard.canJump(w, "format"));
    w.name = "Club Cup"; w.sport = "badminton";
    eq("Next validates and moves on", (Wizard.next(w), w.wizard.currentStep), "type");
    Wizard.next(w); // -> divisions
    Wizard.back(w); Wizard.back(w);
    ok("Back keeps the answers", w.wizard.currentStep === "basics" && w.name === "Club Cup" && w.sport === "badminton");
    ok("can jump forward to a visited step", Wizard.jump(w, "divisions") && w.wizard.currentStep === "divisions");
    w.kind = "teams";
    eq("teams: 13 visible steps, divisions is step 4", [Wizard.visibleSteps(w).length, Wizard.position(w, "divisions").n], [13, 4]);
    w.kind = "pairs";

    out.push("wizard invalidation");
    // entries and players in division B, then later steps visited
    const divB = w.divisions[1].id;
    w.players = [{ id: "pl1", name: "Rina", gender: "F", teamId: null, divisionId: divB, role: "regular", withdrawn: false }];
    w.entries = [{ id: "e1", divisionId: divB, teamId: null, playerIds: ["pl1", "pl2"], label: "Rina / Sari", seed: null, withdrawn: false }];
    w.wizard.visited.entries = true; w.wizard.visited.format = true;
    eq("changing divisions affects visited Entries and Format", Wizard.affected(w, "divisions"), ["entries", "format"]);
    CompModel.setDivisionCount(w, 1);
    Wizard.markReview(w, Wizard.affected(w, "divisions"));
    ok("dependent steps marked needsReview", w.wizard.needsReview.entries && w.wizard.needsReview.format);
    ok("entries kept, moved to Unassigned", w.entries.length === 1 && w.entries[0].divisionId === null && w.players[0].divisionId === null);
    eq("Unassigned bucket lists them", [CompModel.unassigned(w).players.length, CompModel.unassigned(w).entries.length], [1, 1]);
    eq("Review is blocked while steps need review", Wizard.blockers(w), ["entries", "format"]);
    Wizard.jump(w, "entries");
    eq("Entries blocks Next while pairs are unassigned", Wizard.next(w), ["wiz.err.pairs", "wiz.err.unassigned"]);
    w.entries[0].divisionId = w.divisions[0].id;
    Wizard.pairsUtil.addPair(w, w.divisions[0].id, ["Ann", "Ben"], ["F", "M"]);
    Wizard.next(w);
    ok("Next on a flagged step clears its flag", !w.wizard.needsReview.entries);

    out.push("use recommended for the rest");
    const r = CompModel.newCompetition();
    CompModel.applyPreset(r, "teamsFixed");
    r.wizard.visited.start = true; r.name = "Team Battle"; r.sport = "padel";
    Wizard.next(r); Wizard.next(r); Wizard.next(r); // start -> basics -> type -> divisions
    eq("on step 4", r.wizard.currentStep, "divisions");
    r.teams.forEach(tm => r.divisions.forEach(d => { for (let i = 0; i < 2; i++) Wizard.teamsUtil.addPlayer(r, tm.id, d.id, tm.name + d.name + i, "M", "regular"); }));
    eq("use recommended succeeds", Wizard.useRecommended(r), []);
    eq("lands on Review", r.wizard.currentStep, "review");
    ok("every step marked visited", Wizard.visibleSteps(r).every(id => r.wizard.visited[id]));
    ok("result is a valid competition (every step validates)", Wizard.visibleSteps(r).every(id => Wizard.validate(r, id).length === 0));

    out.push("competition storage");
    const s1 = CompModel.newCompetition({ name: "Draft" });
    s1.wizard.currentStep = "divisions"; s1.wizard.visited.divisions = true;
    CompStore.save(s1); CompStore.setActive(s1.id);
    eq("writes are debounced", Store.get("courtmixer_comp_" + s1.id), null);
    CompStore.flush();
    ok("flush writes the document", !!Store.get("courtmixer_comp_" + s1.id));
    eq("index entry written", Store.getJSON("courtmixer_comp_index", []).map(e => e.name), ["Draft"]);
    CompStore._reset(); // simulates a reload
    const back1 = CompStore.getActive();
    ok("draft survives reload at the same step", !!back1 && back1.id === s1.id && back1.wizard.currentStep === "divisions");
    const doc = JSON.parse(JSON.stringify(back1));
    CompStore.remove(s1.id);
    ok("remove deletes document, index entry and active id", !Store.get("courtmixer_comp_" + s1.id) && CompStore.list().length === 0 && CompStore.getActiveId() === null);
    CompStore.restore(doc); CompStore.setActive(doc.id);
    ok("restore (undo) brings it back", !!CompStore.getActive() && CompStore.list().length === 1);
    ok("Docs sees the competition", Docs.list().indexOf("comp:" + doc.id) !== -1);

    out.push("blocked storage");
    _storageWarned = true; // suppress the one-time alert during the test
    Store._useBackend(throwing);
    CompStore._reset();
    const b1 = CompModel.newCompetition({ name: "Offline" });
    CompStore.save(b1); CompStore.setActive(b1.id); CompStore.flush();
    ok("keeps working in memory when storage is blocked", CompStore.getActive() && CompStore.getActive().name === "Offline");

    out.push("mode switch leaves social data alone");
    const mock2 = mockStorage();
    Store._useBackend(mock2);
    CompStore._reset();
    save(); saveCourts();
    Store.set("courtmixer_custom_defaults", JSON.stringify([{ name: "X", gender: "M", skill: 5 }]));
    Store.set("courtmixer_ps_hint_seen", "1");
    const socialBefore = SOCIAL_KEYS.map(k => Store.get(k));
    CompStore.setMode("competition");
    const sc = CompModel.newCompetition(); CompModel.applyPreset(sc, "teamsFixed");
    CompStore.save(sc); CompStore.setActive(sc.id); CompStore.flush();
    CompShell.render();
    CompStore.setMode("social");
    CompShell.render();
    eq("app mode stored", Store.get("courtmixer_app_mode"), "social");
    eq("every social key byte-identical after Competition and back", SOCIAL_KEYS.filter((k, i) => Store.get(k) !== socialBefore[i]), []);

    out.push("every wizard step renders with known strings");
    const host = document.createElement("div");
    [CompModel.newCompetition(), CompModel.newCompetition()].forEach(function (cmp, i) {
      CompModel.applyPreset(cmp, i ? "teamsFixed" : "pairsGroupsKo");
      Wizard.visibleSteps(cmp).forEach(id => { cmp.wizard.visited[id] = true; });
      Wizard.visibleSteps(cmp).forEach(id => { cmp.wizard.currentStep = id; Wizard.mount(host, cmp); });
    });
    eq("no missing strings", Object.keys(STR.missing), []);

    // ===== Phase 3: pairs competitions =====
    out.push("score formats (evaluateScore)");
    const F = (id) => CompFormat.fromPreset(id);
    const set1 = (f, a, b, extra) => CompFormat.evaluateSet(f, Object.assign({ a, b }, extra || {}), 0);
    const clean = (r) => !r.errors.length && !r.warnings.length;
    const b21 = F("bad3x21"), b30 = F("bad1x30"), b15 = F("bad3x15"), pro = F("tenPro8"), shortS = F("tenShort4"), pad = F("padRace4");
    ok("badminton 21/cap 30: 21-19, 22-20, 30-29 are fine", clean(set1(b21, 21, 19)) && clean(set1(b21, 22, 20)) && clean(set1(b21, 30, 29)));
    ok("badminton 21/cap 30: 21-20 and 31-29 warn", set1(b21, 21, 20).warnings.length === 1 && set1(b21, 31, 29).warnings.length === 1);
    ok("badminton 30 no cap: 58-56 fine, 31-30 warns", clean(set1(b30, 58, 56)) && set1(b30, 31, 30).warnings.length === 1);
    ok("badminton 15/cap 21: 21-20 fine", clean(set1(b15, 21, 20)));
    ok("tennis pro set: 8-6 fine, 9-8 with tiebreak fine, 8-7 warns",
      clean(set1(pro, 8, 6)) && clean(set1(pro, 9, 8, { tbA: 7, tbB: 4 })) && set1(pro, 8, 7).warnings.length === 1);
    eq("short sets + match tiebreak: 4-2, 2-4, [10-8] -> A", CompFormat.evaluateScore(shortS, [{ a: 4, b: 2 }, { a: 2, b: 4 }, { a: 10, b: 8 }]).winner, "A");
    ok("padel race to 4: 4-3 fine, 5-3 warns", clean(set1(pad, 4, 3)) && set1(pad, 5, 3).warnings.length === 1);
    ok("error: a third game after the match was decided", CompFormat.evaluateScore(b21, [{ a: 21, b: 10 }, { a: 21, b: 12 }, { a: 21, b: 5 }]).errors.length === 1);
    ok("error: unfinished match without retiring", CompFormat.evaluateScore(b21, [{ a: 21, b: 10 }]).errors.length === 1);
    ok("error: negative or fractional scores", set1(b21, -1, 21).errors.length === 1 && set1(b21, 20.5, 21).errors.length === 1);
    eq("walkover at the format's maximum", CompFormat.walkoverSets(b21), [{ a: 21, b: 0 }, { a: 21, b: 0 }]);

    out.push("fixture generation");
    let rrOk = true;
    for (let n = 3; n <= 10; n++) {
      const ids = Array.from({ length: n }, (_, i) => "e" + i), rounds = CompGenerate.roundRobin(ids), seen = {};
      let dup = false;
      rounds.forEach(r => r.forEach(p => { const k = p.slice().sort().join("|"); if (seen[k]) dup = true; seen[k] = true; }));
      const byesOk = rounds.every(r => r.length === Math.floor(n / 2));
      if (dup || Object.keys(seen).length !== n * (n - 1) / 2 || rounds.length !== (n % 2 ? n : n - 1) || !byesOk) rrOk = false;
    }
    ok("round robin n=3..10: every pair meets once, byes and round counts correct", rrOk);
    const ord8 = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"];
    eq("snake seeding: 8 seeds into 2 groups", CompGenerate.splitGroups(ord8, 4), [["s1", "s4", "s5", "s8"], ["s2", "s3", "s6", "s7"]]);
    const sizesOk = [5, 7, 9, 10, 13].every(n => { const g = CompGenerate.splitGroups(Array.from({ length: n }, (_, i) => i), 4).map(x => x.length); return Math.max.apply(null, g) - Math.min.apply(null, g) <= 1; });
    ok("group sizes differ by at most 1", sizesOk);
    let koOk = true;
    for (let n = 5; n <= 16; n++) {
      const size = CompGenerate.nextPow2(n), pos = CompGenerate.bracketPositions(size);
      const half = pos.slice(0, size / 2);
      if ((half.indexOf(1) !== -1) === (half.indexOf(2) !== -1)) koOk = false;   // 1 and 2 in opposite halves
      for (let k = 0; k < size / 2; k++) {                                      // byes only face top seeds
        const a = pos[2 * k], b = pos[2 * k + 1], bye = a > n ? b : b > n ? a : null;
        if (bye !== null && bye > size - n) koOk = false;
      }
    }
    ok("knockout n=5..16: bracket size, byes to top seeds, 1 and 2 in opposite halves", koOk);
    const cross = (g) => { const q = CompGenerate.placeQualifiers(g, 2).slots; for (let i = 0; i < q.length; i += 2) if (q[i] && q[i + 1] && q[i].group === q[i + 1].group) return false; return true; };
    ok("cross-over from 2, 3 and 4 groups: no group-mates in the first knockout round", cross(2) && cross(3) && cross(4));
    eq("4 groups cross over A1-D2, D1-A2, B1-C2, C1-B2", CompGenerate.placeQualifiers(4, 2).slots.map(s => String.fromCharCode(65 + s.group) + s.rank).join(" "), "A1 D2 D1 A2 B1 C2 C1 B2");

    out.push("standings and tiebreakers");
    // Builds a live one-group round robin with the given results: [[i, j, setsA-B per game...]]
    const league = (n, results, opts) => {
      const c = CompModel.newCompetition({ name: "T" }); c.sport = "badminton";
      CompModel.setDivisionCount(c, 1);
      for (let i = 0; i < n; i++) Wizard.pairsUtil.addPair(c, c.divisions[0].id, ["P" + i + "a", "P" + i + "b"], ["M", "M"]);
      c.settings.matchFormats = { main: F("bad1x21") };
      c.settings.stagePlan = { all: CompModel.stagePlanFor("roundRobin") };
      Object.assign(c.settings, opts || {});
      CompGenerate.applyDraw(c, CompGenerate.generateDraw(c)); c.status = "live";
      results.forEach(function (r) {
        const a = c.entries[r[0]].id, b = c.entries[r[1]].id;
        const m = c.meetings.find(mm => (mm.sideA.id === a && mm.sideB.id === b) || (mm.sideA.id === b && mm.sideB.id === a));
        const flip = m.sideA.id !== a, x = c.matches.find(mm => mm.meetingId === m.id);
        const sets = [flip ? { a: r[3], b: r[2] } : { a: r[2], b: r[3] }];
        CompResults.apply(c, x.id, { sets, outcome: r[4] || "normal", winner: (sets[0].a > sets[0].b) ? "A" : "B" });
        if (r[4] === "walkover") { x.sets = []; x.winner = flip ? (r[2] > r[3] ? "B" : "A") : (r[2] > r[3] ? "A" : "B"); }
      });
      const D = CompStandings.derive(c), st = c.stages[0];
      return { c, rows: D.table(st.id, st.groups[0].id), names: () => D.table(st.id, st.groups[0].id).map(r => c.entries.findIndex(e => e.id === r.id)) };
    };
    // 0 beats 1, 1 beats 2, 2 beats 0 (all 1 win among themselves); 3 loses to all. Point differences decide.
    const L1 = league(4, [[0, 1, 21, 19], [1, 2, 21, 10], [2, 0, 21, 15], [0, 3, 21, 5], [1, 3, 21, 5], [2, 3, 21, 5]]);
    eq("3-way tie: head-to-head level, point difference decides (+25, +12, +11)", L1.names(), [1, 0, 2, 3]);
    // 0 and 1 both win 2; 0 has the far better point difference, but 1 beat 0
    const L2 = league(4, [[1, 0, 21, 19], [0, 2, 21, 0], [0, 3, 21, 0], [2, 1, 21, 19], [1, 3, 21, 19], [3, 2, 21, 19]]);
    eq("head-to-head separates a two-way tie before differences", L2.names().slice(0, 2), [1, 0]);
    const L3 = league(4, [[0, 1, 21, 10], [1, 2, 21, 10], [2, 0, 21, 10], [0, 3, 21, 5], [1, 3, 21, 5], [2, 3, 21, 5]]);
    ok("a tie nothing can split is flagged for the organiser", L3.rows.slice(0, 3).every(r => r.tiedWith.length === 2));
    L3.c.stages[0].config.manualOrder[L3.c.stages[0].groups[0].id] = [L3.c.entries[2].id, L3.c.entries[0].id, L3.c.entries[1].id];
    eq("Tie \u2014 decide order is used", CompStandings.derive(L3.c).table(L3.c.stages[0].id, L3.c.stages[0].groups[0].id).slice(0, 3).map(r => L3.c.entries.findIndex(e => e.id === r.id)), [2, 0, 1]);
    const W1 = league(2, [[0, 1, 21, 0, "walkover"]], { walkoverScore: "formatMax" });
    const W2 = league(2, [[0, 1, 21, 0, "walkover"]], { walkoverScore: "winOnly" });
    ok("walkover counts per setting (max score vs win only)", W1.rows[0].gamesFor === 21 && W2.rows[0].gamesFor === 0 && W2.rows[0].won === 1);
    const V = league(3, [[0, 1, 21, 10], [0, 2, 21, 10]]);
    V.c.entries[0].withdrawn = true; V.c.entries[0].withdrawMode = "void";
    const vRows = CompStandings.derive(V.c).table(V.c.stages[0].id, V.c.stages[0].groups[0].id);
    ok("void withdrawal: their results disappear from the table", vRows.length === 2 && vRows.every(r => r.played === 0));
    const WO = league(3, [[1, 2, 21, 10]]);
    WO.c.entries[0].withdrawn = true; WO.c.entries[0].withdrawMode = "walkover";
    const woRows = CompStandings.derive(WO.c).table(WO.c.stages[0].id, WO.c.stages[0].groups[0].id);
    ok("walkover withdrawal: opponents get the remaining matches", woRows.find(r => r.id === WO.c.entries[1].id).won === 2 && woRows.find(r => r.id === WO.c.entries[0].id).lost === 2);

    out.push("knockout results and cascade");
    const k = CompModel.newCompetition({ name: "KO" }); k.sport = "badminton";
    CompModel.setDivisionCount(k, 1);
    for (let i = 0; i < 4; i++) { const e = Wizard.pairsUtil.addPair(k, k.divisions[0].id, ["K" + i + "a", "K" + i + "b"], ["M", "M"]); e.seed = i + 1; }
    k.settings.matchFormats = { main: F("bad1x21") };
    k.settings.stagePlan = { all: CompModel.stagePlanFor("knockout") };
    CompGenerate.applyDraw(k, CompGenerate.generateDraw(k)); k.status = "live";
    const KD = () => CompStandings.derive(k);
    const sfs = k.meetings.filter(m => m.round === 1), fin = k.meetings.find(m => m.round === 2 && !m.thirdPlace), third = k.meetings.find(m => m.thirdPlace);
    ok("4 seeds: semis 1v4 and 2v3, a final and a 3rd-place match", sfs.length === 2 && !!fin && !!third && sfs[0].sideA.id === k.entries[0].id && sfs[0].sideB.id === k.entries[3].id);
    const mOf = (m) => k.matches.find(x => x.meetingId === m.id);
    CompResults.apply(k, mOf(sfs[0]).id, { sets: [{ a: 21, b: 10 }], winner: "A" });
    CompResults.apply(k, mOf(sfs[1]).id, { sets: [{ a: 21, b: 10 }], winner: "A" });
    ok("winners reach the final", KD().side(fin, "A") === k.entries[0].id && KD().side(fin, "B") === k.entries[1].id);
    ok("final is ready to start", CompSchedule.isReady(KD(), mOf(fin)));
    CompResults.apply(k, mOf(fin).id, { sets: [{ a: 21, b: 18 }], winner: "A" });
    // change semi-final 1: seed 4 now wins
    CompResults.apply(k, mOf(sfs[0]).id, { sets: [{ a: 10, b: 21 }], winner: "B" });
    eq("editing a semi-final flags the final", CompStandings.staleMatches(k).map(x => x.meetingId), [fin.id]);
    CompStandings.clearStale(k);
    ok("cascade clears the final and keeps it in history", mOf(fin).status === "pending" && mOf(fin).history.length === 1 && KD().side(fin, "A") === k.entries[3].id);

    out.push("groups + knockout end to end");
    const gk = CompModel.newCompetition({ name: "GK" }); gk.sport = "padel";
    CompModel.setDivisionCount(gk, 1);
    for (let i = 0; i < 8; i++) Wizard.pairsUtil.addPair(gk, gk.divisions[0].id, ["G" + i + "a", "G" + i + "b"], ["M", "F"]);
    gk.settings.matchFormats = { main: F("padRace4") };
    gk.settings.stagePlan = { all: CompModel.stagePlanFor("groups") };
    CompGenerate.applyDraw(gk, CompGenerate.generateDraw(gk)); gk.status = "live";
    const gst = gk.stages.find(s => s.type === "groups"), kst = gk.stages.find(s => s.type === "knockout");
    ok("2 groups of 4 and a 4-team knockout", gst.groups.length === 2 && gst.groups.every(g => g.entryIds.length === 4) && kst.config.size === 4);
    const ko1 = gk.meetings.filter(m => m.stageId === kst.id && m.round === 1);
    ok("knockout waits for the groups", ko1.every(m => !CompStandings.derive(gk).side(m, "A")));
    // play every group match: lower entry index wins 4-1
    const idx = (id) => gk.entries.findIndex(e => e.id === id);
    gk.meetings.filter(m => m.stageId === gst.id).forEach(m => {
      const aWins = idx(m.sideA.id) < idx(m.sideB.id);
      CompResults.apply(gk, gk.matches.find(x => x.meetingId === m.id).id, { sets: [aWins ? { a: 4, b: 1 } : { a: 1, b: 4 }], winner: aWins ? "A" : "B" });
    });
    const GD = CompStandings.derive(gk);
    ok("group winners and runners-up fill the knockout", ko1.every(m => GD.side(m, "A") && GD.side(m, "B")));
    ok("no group-mates meet in the first knockout round", ko1.every(m => !gst.groups.some(g => g.entryIds.indexOf(GD.side(m, "A")) !== -1 && g.entryIds.indexOf(GD.side(m, "B")) !== -1)));
    const est = CompSchedule.estimate(gk, { stages: gk.stages, meetings: gk.meetings, matches: gk.matches });
    ok("time estimate is positive and rounded to 5 minutes", est.minutes > 0 && est.minutes % 5 === 0 && est.complete);

    out.push("audit fixes");
    ok("30-5 at cap 30 warns; 30-28 is fine", set1(b21, 30, 5).warnings.length === 1 && clean(set1(b21, 30, 28)));
    eq("retired: the unfinished game isn't a game won", CompFormat.tally(b21, [{ a: 21, b: 15 }, { a: 8, b: 3 }], "retired"), { setsA: 1, setsB: 0, gamesA: 29, gamesB: 18 });
    eq("retired at a level score can be saved", CompFormat.evaluateScore(b21, [{ a: 21, b: 15 }, { a: 11, b: 11 }], { partial: true }).errors, []);
    const pp = Wizard.pairsUtil.parsePairs("Ann f / Ben m\nCy / Di f / f\nEd / Flo mf\nMary Jane / Tom\nA / B / C");
    eq("paste: genders after names or at the end of the line", pp.pairs.map(p => p.names.join("+") + ":" + p.genders.join("")),
      ["Ann+Ben:FM", "Cy+Di:FF", "Ed+Flo:MF", "Mary Jane+Tom:"]);
    eq("paste: a line with three names is skipped", pp.bad, ["A / B / C"]);
    const TW = league(4, [[2, 3, 21, 10]]);
    TW.c.entries[0].withdrawn = true; TW.c.entries[0].withdrawMode = "walkover";
    TW.c.entries[1].withdrawn = true; TW.c.entries[1].withdrawMode = "walkover";
    ok("two withdrawn pairs in one group don't stall it", CompStandings.derive(TW.c).groupComplete(TW.c.stages[0].id, TW.c.stages[0].groups[0].id));
    const old = { schemaVersion: 1, id: "o", settings: { standings: { pairs: { pointsWin: 1, pointsLoss: 0, pointsByScore: null, rankBy: "wins", tiebreakers: ["headToHead"] } }, changeoverMinutes: 3 } };
    const mig = CompModel.migrate(old);
    ok("v1.10.0 drafts are upgraded (standings shape, new settings)", mig.schemaVersion === 2 && mig.settings.standings.pairs.league.win === 3 &&
      mig.settings.standings.pairs.pointsByScore["2-0"] === 3 && mig.settings.timeAvailable === 240 && mig.settings.changeoverMinutes === undefined);
    const dsrc = JSON.parse(JSON.stringify(TW.c));
    const dd = CompModel.duplicate(dsrc);
    ok("duplicate brings withdrawn pairs back", dd.entries.every(e => !e.withdrawn));
    const kd = KD(), order = CompSchedule.readyList(kd).map(x => kd.meetingById[x.meetingId]);
    ok("3rd-place match is queued before the final", order.length === 2 && order[0].thirdPlace === true);
    // void withdrawal leaving fewer pairs than knockout places: that slot becomes a bye
    const vg = CompModel.newCompetition({ name: "VG" }); vg.sport = "padel";
    CompModel.setDivisionCount(vg, 1);
    for (let i = 0; i < 6; i++) Wizard.pairsUtil.addPair(vg, vg.divisions[0].id, ["V" + i + "a", "V" + i + "b"], ["M", "M"]);
    vg.settings.matchFormats = { main: F("padRace4") };
    vg.settings.stagePlan = { all: Object.assign(CompModel.stagePlanFor("groups"), { groupSize: 3, advance: 3 }) };
    CompGenerate.applyDraw(vg, CompGenerate.generateDraw(vg)); vg.status = "live";
    const vgs = vg.stages[0], gA = vgs.groups[0];
    const out1 = vg.entries.find(e => e.id === gA.entryIds[0]); out1.withdrawn = true; out1.withdrawMode = "void";
    vg.meetings.filter(m => m.stageId === vgs.id).forEach(m => {
      const x = vg.matches.find(mm => mm.meetingId === m.id);
      if (CompStandings.derive(vg).outcome(m).done) return;
      CompResults.apply(vg, x.id, { sets: [{ a: 4, b: 2 }], winner: "A" });
    });
    const VD = CompStandings.derive(vg);
    eq("a place left empty by a void withdrawal is a bye", VD.groupRankEntry(gA.id, 3), "BYE");

    out.push("team competitions");
    // Two teams, 3 divisions x 4 players, fixed pairs, template A1 A2 B1 B2 C1 C2, round robin.
    const teamComp = (opts) => {
      const c = CompModel.newCompetition({ name: "Teams" });
      CompModel.applyPreset(c, opts.flexible ? "teamsFlexible" : "teamsFixed");
      c.sport = "badminton";
      CompModel.setDivisionCount(c, 3); CompModel.setTeamCount(c, 2);
      c.teams.forEach(tm => c.divisions.forEach(d => { for (let i = 0; i < 4; i++) Wizard.teamsUtil.addPlayer(c, tm.id, d.id, tm.name + d.name + i, "M", "regular"); }));
      Wizard.teamsUtil.addPlayer(c, c.teams[0].id, c.divisions[0].id, "Reserve Ray", "M", "reserve");
      CompLineups.syncTeamEntries(c);
      c.settings.meetingTemplate = CompLineups.buildTemplate(c);
      c.settings.matchFormats = { main: F("bad1x21") };
      c.settings.stagePlan = { all: CompModel.stagePlanFor(opts.ko ? "knockout" : "roundRobin") };
      Object.assign(c.settings.standings.teams, opts.teams || {});
      if (opts.dead) c.settings.deadRubbers = opts.dead;
      if (opts.decider) c.settings.meetingTemplate.push({ id: "dec", order: 6, label: "Decider", divisionId: c.divisions[0].id, category: "open", isDecider: true, slot: null });
      CompGenerate.applyDraw(c, CompGenerate.generateDraw(c)); c.status = "live";
      return c;
    };
    // results: "AABBAB" etc. in rubber order; games 21-10 for each winner (or custom pairs)
    const playMeeting = (c, pattern, scores) => {
      const m = c.meetings[0], D0 = CompStandings.derive(c);
      c.matches.filter(x => x.meetingId === m.id).sort((a, b) => a.order - b.order).forEach((x, i) => {
        const w = pattern[i];
        if (!w || w === "-") return;
        const sc = scores && scores[i] || (w === "A" ? { a: 21, b: 10 } : { a: 10, b: 21 });
        if (!x.sideA.playerIds.length) { x.sideA.playerIds = D0.playerIdsOf(x, "A"); x.sideB.playerIds = D0.playerIdsOf(x, "B"); }
        CompResults.apply(c, x.id, { sets: [sc], winner: w });
      });
      return CompStandings.derive(c);
    };
    const T1 = teamComp({});
    eq("template built from registered pairs", T1.settings.meetingTemplate.map(r => r.label), ["A1", "A2", "B1", "B2", "C1", "C2"]);
    ok("each team has 2 pairs per division", T1.teams.every(tm => T1.entries.filter(e => e.teamId === tm.id).length === 6));
    eq("one meeting, one match per rubber", [T1.meetings.length, T1.matches.length], [1, 6]);
    const TD = CompStandings.derive(T1), x1 = T1.matches.find(x => x.order === 1);
    eq("fixed pairs: A1 plays A1", TD.playerIdsOf(x1, "A"), T1.entries.find(e => e.teamId === TD.side(T1.meetings[0], "A") && e.label === "A1").playerIds);
    let Dm = playMeeting(T1, "AABAA-");
    ok("meeting result: 4 matches to 1 is decided before the last rubber", Dm.teamResult(T1.meetings[0]).decided && Dm.teamResult(T1.meetings[0]).winner === "A");
    ok("play all (round robin default): the last rubber is still played", !Dm.outcome(T1.meetings[0]).done && Dm.rubberNeeded(T1.matches.find(x => x.order === 6)));
    const T2 = teamComp({ dead: { groupStage: "stopWhenDecided", knockout: "stopWhenDecided" } });
    Dm = playMeeting(T2, "AAAA--");
    ok("stop when decided: remaining rubbers are dead and the meeting is done", Dm.outcome(T2.meetings[0]).done && T2.matches.filter(x => x.order > 4).every(x => !Dm.rubberNeeded(x)));
    const ts2 = Dm.table(T2.stages[0].id, T2.stages[0].groups[0].id);
    eq("meeting points: win 2, loss 0", ts2.map(r => r.points), [2, 0]);
    // 3-3 splits
    const split = (rule, scores, extra) => { const c = teamComp({ teams: { splitRule: rule }, decider: rule === "decider" }); return { c, D: playMeeting(c, "AAABBB" + (extra || ""), scores) }; };
    const close = [{ a: 21, b: 19 }, { a: 21, b: 19 }, { a: 21, b: 19 }, { a: 10, b: 21 }, { a: 10, b: 21 }, { a: 10, b: 21 }];
    let sp = split("totalGames", close);
    eq("3-3, total points decide: B scored more", sp.D.outcome(sp.c.meetings[0]).winner, "B");
    sp = split("totalGames");
    eq("3-3, total points level too: a draw", sp.D.outcome(sp.c.meetings[0]).winner, "draw");
    sp = split("draw", close);
    eq("3-3, record a draw", sp.D.outcome(sp.c.meetings[0]).winner, "draw");
    eq("draw = 1 meeting point each", sp.D.table(sp.c.stages[0].id, sp.c.stages[0].groups[0].id).map(r => r.points), [1, 1]);
    sp = split("decider");
    ok("3-3 with a decider: the decider becomes needed", !sp.D.outcome(sp.c.meetings[0]).done && sp.D.teamResult(sp.c.meetings[0]).needDecider && sp.D.rubberNeeded(sp.c.matches.find(x => x.rubberId === "dec")));
    ok("the decider waits for a lineup", CompLineups.needed(sp.D).length === 2);
    const spDec = split("decider", null, "B");
    eq("decider decides", spDec.D.outcome(spDec.c.meetings[0]).winner, "B");
    const nl = teamComp({ teams: { splitRule: "decider" }, decider: true }), nlD = playMeeting(nl, "AAAABB");
    ok("decider not needed when the meeting isn't level", nlD.outcome(nl.meetings[0]).done && !nlD.rubberNeeded(nl.matches.find(x => x.rubberId === "dec")));
    // match tally
    const TT = teamComp({ teams: { resultMode: "tally" } }), TTD = playMeeting(TT, "AAAABB");
    eq("match tally: points are matches won", TTD.table(TT.stages[0].id, TT.stages[0].groups[0].id).map(r => r.points), [4, 2]);
    // flexible lineups and stats following the person
    const TF = teamComp({ flexible: true });
    const TFD = CompStandings.derive(TF), mf = TF.meetings[0];
    ok("flexible: nothing is ready until lineups are in", CompSchedule.readyList(TFD).length === 0 && CompLineups.needed(TFD).length === 2);
    const teamA = TFD.side(mf, "A"), ray = TF.players.find(p => p.name === "Reserve Ray");
    const lineupFrom = (tid) => { const l = {}; TF.matches.filter(x => x.meetingId === mf.id).forEach(x => { const rb = TFD.rubberOf(x); l[x.rubberId] = TF.entries.find(e => e.teamId === tid && e.divisionId === rb.divisionId && e.slot === rb.slot).playerIds.slice(); }); return l; };
    mf.lineupA = lineupFrom(teamA); mf.lineupB = lineupFrom(TFD.side(mf, "B"));
    const a1 = TF.matches.find(x => x.order === 1), rayLineup = ray.teamId === teamA ? mf.lineupA : mf.lineupB;
    const replaced = rayLineup[a1.rubberId][0];
    rayLineup[a1.rubberId][0] = ray.id;
    const TFD2 = CompStandings.derive(TF);
    eq("all six rubbers ready once lineups are in", CompSchedule.readyList(TFD2).length, 6);
    CompUI.startMatch(TF, a1.id, TF.courts[0].id);
    CompResults.apply(TF, a1.id, { sets: [{ a: 21, b: 15 }], winner: ray.teamId === teamA ? "A" : "B" });
    ok("stats follow the reserve, not the replaced player", a1.sideA.playerIds.concat(a1.sideB.playerIds).indexOf(ray.id) !== -1 && a1.sideA.playerIds.concat(a1.sideB.playerIds).indexOf(replaced) === -1);
    const chk = CompLineups.check(TF, mf, "A", { r1: [TF.players[0].id, TF.players[0].id] });
    ok("lineup check: same player twice in a rubber is an error", chk.errors.length === 1);
    // knockout level meeting needs a decision
    const TK = teamComp({ ko: true, teams: { splitRule: "draw" } }), TKD = playMeeting(TK, "AAABBB");
    ok("knockout 3-3 with level points: organiser decides", TKD.teamResult(TK.meetings[0]).needsDecision && !TKD.outcome(TK.meetings[0]).done);
    TK.meetings[0].resultOverride = { winner: "B", reason: "organiser" };
    eq("decision recorded", CompStandings.derive(TK).outcome(TK.meetings[0]).winner, "B");
    // withdrawn team: every rubber is a walkover for the opponent
    const TW2 = teamComp({ teams: { resultMode: "tally" } });
    TW2.teams[0].withdrawn = true; TW2.teams[0].withdrawMode = "walkover";
    const tw = CompStandings.derive(TW2).table(TW2.stages[0].id, TW2.stages[0].groups[0].id);
    eq("withdrawn team: opponents get every match", tw.map(r => [r.points, r.matchDiff]), [[6, 6], [0, -6]]);

    out.push("team review fixes");
    const TWP = teamComp({});
    playMeeting(TWP, "AAAABB");
    const winnerTeam = CompStandings.derive(TWP).side(TWP.meetings[0], "A");
    const wt = TWP.teams.find(x => x.id === winnerTeam); wt.withdrawn = true; wt.withdrawMode = "walkover";
    eq("withdrawing a team keeps the meetings it already played", CompStandings.derive(TWP).outcome(TWP.meetings[0]).winner, "A");
    const TWQ = teamComp({ teams: { resultMode: "tally" } });
    playMeeting(TWQ, "AA----");
    const loserTeam = TWQ.teams.find(x => x.id === CompStandings.derive(TWQ).side(TWQ.meetings[0], "A"));
    loserTeam.withdrawn = true; loserTeam.withdrawMode = "walkover";
    const twq = CompStandings.derive(TWQ).teamResult(TWQ.meetings[0]);
    eq("a team withdrawing mid-meeting gives up only the rubbers left", [twq.matchesA, twq.matchesB, twq.done], [2, 4, true]);
    const SW = CompModel.newCompetition({ name: "Switch" });
    CompModel.setDivisionCount(SW, 1);
    for (let i = 0; i < 3; i++) Wizard.pairsUtil.addPair(SW, SW.divisions[0].id, ["S" + i + "a", "S" + i + "b"], ["M", "M"]);
    SW.kind = "teams"; CompModel.setTeamCount(SW, 2); CompLineups.syncTeamEntries(SW); SW.kind = "pairs";
    eq("switching to teams and back keeps the pairs", SW.entries.length, 3);
    const DUP = CompModel.duplicate(Object.assign(JSON.parse(JSON.stringify(TWP)), { status: "finished" }));
    ok("duplicate keeps registered reserves and brings withdrawn teams back", DUP.players.some(p => p.name === "Reserve Ray") && DUP.teams.every(x => !x.withdrawn));
    const EST = teamComp({});
    CompModel.setTeamCount(EST, 4);
    EST.teams.slice(2).forEach(tm => EST.divisions.forEach(d => { for (let i = 0; i < 4; i++) Wizard.teamsUtil.addPlayer(EST, tm.id, d.id, tm.name + d.name + i, "M", "regular"); }));
    CompLineups.syncTeamEntries(EST); EST.settings.courtsCount = 12;
    const estDraw = CompGenerate.generateDraw(EST), estR = CompSchedule.estimate(EST, estDraw);
    ok("team estimate: a pair can't be on two courts at once (3 meetings x 15 min >= 45)", estR.minutes >= 45 && estDraw.matches.length === 36);
    const UT = teamComp({});
    const t0 = UT.teams[0];
    for (let i = 0; i < 2; i++) Wizard.teamsUtil.addPlayer(UT, t0.id, UT.divisions[0].id, "Extra" + i, "M", "regular");
    CompLineups.syncTeamEntries(UT); UT.wizard.visited.template = true;
    ok("a new pair the template doesn't cover is flagged", UT.entries.some(e => e.teamId === t0.id && e.slot === 3) &&
      !UT.settings.meetingTemplate.some(r => r.slot === 3));

    out.push("swiss, points league, plate");
    // Build a one-division pairs competition with the given stage plan, then play it to the end
    // through the same calls the Courts tab uses. pick(i) decides who wins the i-th match.
    const dynComp = (n, plan, total) => {
      const c = CompModel.newCompetition({ name: "Dyn" });
      CompModel.applyPreset(c, "pairsRoundRobin"); c.sport = "padel"; CompModel.setDivisionCount(c, 1);
      for (let i = 0; i < n; i++) Wizard.pairsUtil.addPair(c, c.divisions[0].id, ["D" + i + "a", "D" + i + "b"], ["M", "M"]).seed = i + 1;
      c.settings.matchFormats = { main: total ? CompFormat.finalize(JSON.parse(JSON.stringify(CompFormat.TOTAL_POINTS))) : CompFormat.fromPreset("padRace4") };
      c.settings.stagePlan = { all: plan }; c.settings.courtsCount = 2; Wizard.pairsUtil.syncCourtNames(c);
      CompGenerate.applyDraw(c, CompGenerate.generateDraw(c)); CompGenerate.advance(c); c.status = "live";
      return c;
    };
    const playOut = (c, pick) => {
      for (let i = 0; i < 2000; i++) {
        const D = CompStandings.derive(c), x = CompSchedule.readyList(D)[0];
        if (!x) return D;
        const w = pick(i, x), sc = c.settings.matchFormats.main.setType === "totalPoints" ? (w === "A" ? { a: 13, b: 8 } : { a: 8, b: 13 }) : (w === "A" ? { a: 4, b: 1 } : { a: 1, b: 4 });
        CompResults.apply(c, x.id, { sets: [sc], winner: w });
        CompGenerate.advance(c);
      }
      return CompStandings.derive(c);
    };
    const dynCheck = (c, D) => {
      const st = c.stages[0], seen = {}, bye = {}, r = { rematches: 0, doubleBye: 0, maxByes: 0, rounds: 0, wrong: 0 };
      const per = {};
      c.meetings.filter(m => m.stageId === st.id).forEach(m => {
        const a = D.side(m, "A"), b = D.side(m, "B");
        r.rounds = Math.max(r.rounds, m.round);
        (per[m.round] = per[m.round] || []).push(a, b);
        if (a === "BYE" || b === "BYE") { const id = a === "BYE" ? b : a; if (bye[id]) r.doubleBye++; bye[id] = 1; return; }
        const k = [a, b].sort().join("|"); if (seen[k]) r.rematches++; seen[k] = 1;
      });
      Object.keys(per).forEach(k => {
        const ids = per[k].filter(x => x !== "BYE"), byes = per[k].length - ids.length;
        r.maxByes = Math.max(r.maxByes, byes);
        if (new Set(ids).size !== ids.length || ids.length !== st.groups[0].entryIds.length) r.wrong++;
      });
      return r;
    };
    [8, 9].forEach(n => [0, 1].forEach(v => {
      const c = dynComp(n, { type: "swiss", rounds: 5 });
      const D = playOut(c, (i) => ((i * 7 + v * 3 + n) % 5) < 3 ? "A" : "B"), r = dynCheck(c, D);
      eq("swiss " + n + " entries, 5 rounds (run " + (v + 1) + "): no rematches, every round complete", [r.rounds, r.rematches, r.wrong], [5, 0, 0]);
      if (n === 9) eq("swiss 9 entries: one bye per round, never twice to the same entry", [r.maxByes, r.doubleBye], [1, 0]);
      ok("swiss " + n + ": everything finished", c.meetings.every(m => D.outcome(m).done));
    }));
    const SB = dynComp(9, { type: "swiss", rounds: 1 }), SBD = playOut(SB, () => "A");
    const byeM = SB.meetings.find(m => SBD.side(m, "A") === "BYE" || SBD.side(m, "B") === "BYE");
    const byeId = SBD.side(byeM, "A") === "BYE" ? SBD.side(byeM, "B") : SBD.side(byeM, "A");
    const byeRow = SBD.table(SB.stages[0].id, SB.stages[0].groups[0].id).find(x => x.id === byeId);
    eq("swiss round 1: the lowest seed gets the bye", byeId, SB.entries.find(e => e.seed === 9).id);
    eq("a bye counts as a walkover win", [byeRow.won, byeRow.played > 0 || byeRow.won === 1], [1, true]);
    const SR = dynComp(8, { type: "swiss", rounds: 3 });
    const r1 = SR.meetings.filter(m => m.round === 1).map(m => SR.entries.find(e => e.id === CompStandings.derive(SR).side(m, "A")).seed + "v" + SR.entries.find(e => e.id === CompStandings.derive(SR).side(m, "B")).seed);
    eq("swiss round 1 by seed: top half v bottom half", r1, ["1v5", "2v6", "3v7", "4v8"]);
    ok("swiss: only round 1 is drawn at the start", SR.meetings.every(m => m.round === 1));
    const MX = dynComp(8, { type: "pointsLeague", rounds: 5, pairing: "mexicano" }, true);
    let last = {}, immediate = 0;
    const MXD = playOut(MX, (i) => (i % 3 ? "A" : "B"));
    for (let rd = 1; rd <= 5; rd++) {
      const now = {};
      MX.meetings.filter(m => m.round === rd).forEach(m => { const a = MXD.side(m, "A"), b = MXD.side(m, "B"); if (last[a] === b) immediate++; now[a] = b; now[b] = a; });
      last = now;
    }
    eq("mexicano: 5 rounds drawn, nobody meets last round's opponent", [Math.max(...MX.meetings.map(m => m.round)), immediate], [5, 0]);
    const mxRows = MXD.table(MX.stages[0].id, MX.stages[0].groups[0].id);
    ok("points league: ranked by points scored", mxRows.every((x, i) => i === 0 || mxRows[i - 1].points >= x.points) && mxRows[0].points === mxRows[0].gamesFor);
    const LB = dynComp(7, { type: "pointsLeague", rounds: 1, pairing: "mexicano" }, true), LBD = playOut(LB, () => "A");
    const lbM = LB.meetings.find(m => LBD.side(m, "A") === "BYE" || LBD.side(m, "B") === "BYE");
    const lbRow = LBD.table(LB.stages[0].id, LB.stages[0].groups[0].id).find(x => x.id === (LBD.side(lbM, "A") === "BYE" ? LBD.side(lbM, "B") : LBD.side(lbM, "A")));
    eq("points league: sitting out earns half the target points, no win, no match played", [lbRow.points, lbRow.won, lbRow.played], [11, 0, 0]);
    const AM = dynComp(6, { type: "pointsLeague", rounds: 5, pairing: "americano" }, true), AMD = playOut(AM, () => "A"), ar = dynCheck(AM, AMD);
    eq("americano 6 entries, 5 rounds: everyone meets everyone once", [ar.rounds, ar.rematches, ar.wrong], [5, 0, 0]);
    const RD = dynComp(8, { type: "swiss", rounds: 3 });
    const r1m = RD.matches.filter(x => x.round === 1 || RD.meetings.find(m => m.id === x.meetingId).round === 1);
    r1m.forEach(x => { CompResults.apply(RD, x.id, { sets: [{ a: 4, b: 1 }], winner: "A" }); CompGenerate.advance(RD); });
    const before = RD.meetings.filter(m => m.round === 2).map(m => m.sides ? JSON.stringify(m.sides) : JSON.stringify([CompStandings.derive(RD).side(m, "A"), CompStandings.derive(RD).side(m, "B")])).join();
    CompResults.apply(RD, r1m[0].id, { sets: [{ a: 1, b: 4 }], winner: "B" }); CompStandings.clearStale(RD); CompGenerate.advance(RD);
    const D2 = CompStandings.derive(RD);
    const after = RD.meetings.filter(m => m.round === 2).map(m => JSON.stringify([D2.side(m, "A"), D2.side(m, "B")])).join();
    ok("an untouched next round is redrawn after a correction", RD.meetings.filter(m => m.round === 2).length === 4 && before !== after);
    ok("knockout + plate, 5 entries: one real first-round match, so no plate", !dynComp(5, { type: "plate", thirdPlace: false }).stages.some(s => s.type === "plate"));
    [6, 11, 16].forEach(n => {
      const c = dynComp(n, { type: "plate", thirdPlace: n >= 8 }), D = playOut(c, (i) => (i % 2 ? "A" : "B"));
      const plate = c.stages.find(s => s.type === "plate");
      ok("knockout + plate, " + n + " entries: both brackets finish", plate && c.meetings.every(m => D.outcome(m).done) && c.meetings.some(m => m.stageId === plate.id));
    });
    [9, 11, 12].forEach(n => {
      const c = dynComp(n, { type: "plate", thirdPlace: true }), D = playOut(c, (i) => (i % 3 ? "A" : "B"));
      const main = c.stages.find(s => s.type === "knockout"), plate = c.stages.find(s => s.type === "plate");
      const firstLost = c.entries.filter(e => {
        const first = c.meetings.filter(m => m.stageId === main.id && D.outcome(m).kind !== "bye" && [D.side(m, "A"), D.side(m, "B")].indexOf(e.id) !== -1).sort((a, b) => a.round - b.round)[0];
        const o = first && D.outcome(first);
        return o && D.side(first, o.winner === "A" ? "B" : "A") === e.id;
      }).map(e => e.id).sort();
      const inPlate = [];
      c.meetings.filter(m => m.stageId === plate.id).forEach(m => ["A", "B"].forEach(w => { const id = D.side(m, w); if (id && id !== "BYE" && inPlate.indexOf(id) === -1) inPlate.push(id); }));
      eq("knockout + plate, " + n + " entries: the plate is everyone who lost their first match (byes included)", [inPlate.sort().join(), c.meetings.every(m => D.outcome(m).done)], [firstLost.join(), true]);
    });
    out.push("phase 5 review fixes");
    const LL = dynComp(7, { type: "pointsLeague", rounds: 12, pairing: "mexicano" }, true), LLD = playOut(LL, (i) => (i % 4 ? "A" : "B"));
    const offs = {};
    LL.meetings.forEach(m => { const a = LLD.side(m, "A"), b = LLD.side(m, "B"); if (a === "BYE" || b === "BYE") { const id = a === "BYE" ? b : a; offs[id] = (offs[id] || 0) + 1; } });
    const offN = LL.entries.map(e => offs[e.id] || 0);
    ok("long points league: rounds off are shared out (12 rounds, 7 pairs: 1 or 2 each)", Math.max.apply(null, offN) - Math.min.apply(null, offN) <= 1);
    [5, 6, 7, 8].forEach(n => {
      const c = dynComp(n, { type: "swiss", rounds: n - 1 }), D = playOut(c, (i) => ((i * 5 + n) % 7) < 4 ? "A" : "B");
      eq("swiss " + n + " entries over " + (n - 1) + " rounds: still no rematches", dynCheck(c, D).rematches, 0);
    });
    const SD = CompModel.newCompetition({ name: "SD" });
    CompModel.applyPreset(SD, "pairsRoundRobin"); SD.sport = "padel"; CompModel.setDivisionCount(SD, 2);
    SD.divisions.forEach((d, di) => { for (let i = 0; i < (di ? 4 : 10); i++) Wizard.pairsUtil.addPair(SD, d.id, [d.name + i + "a", d.name + i + "b"], ["M", "M"]); });
    SD.settings.stagePlan = { all: { type: "swiss", rounds: 6 } };
    const sdDraw = CompGenerate.generateDraw(SD);
    eq("swiss rounds are capped per division (4 pairs: 3 rounds)", sdDraw.stages.map(st => st.config.rounds), [6, 3]);
    const PP = CompModel.newCompetition({ name: "PP" });
    CompModel.applyPreset(PP, "pairsPoints"); PP.sport = "padel";
    PP.settings.matchFormats = {};
    Wizard.useRecommended(PP);
    eq("points league preset plays first to 21 total points", (PP.settings.matchFormats.main || {}).setType, "totalPoints");
    const GQ = dynComp(12, { type: "groups", groupSize: 4, advance: 2, thirdPlace: true, plate: true });
    const gqD = CompStandings.derive(GQ), gqPlate = GQ.stages.find(st => st.type === "plate");
    ok("groups + plate: no first-round plate match between two pairs of the same group", GQ.meetings.filter(m => m.stageId === gqPlate.id && m.round === 1).every(m => {
      const a = m.sideA.source, b = m.sideB.source;
      return !(a && b && a.kind === "groupRank" && b.kind === "groupRank" && a.groupId === b.groupId);
    }) && gqD);
    const BS = dynComp(9, { type: "swiss", rounds: 1 });
    BS.settings.matchFormats = { main: CompFormat.fromPreset("bad3x21") }; BS.settings.standings.pairs.rankBy = "score"; BS.settings.walkoverScore = "winOnly";
    const BSD = CompStandings.derive(BS), bsM = BS.meetings.find(m => BSD.side(m, "B") === "BYE" || BSD.side(m, "A") === "BYE");
    const bsRow = BSD.table(BS.stages[0].id, BS.stages[0].groups[0].id).find(x => x.id === (BSD.side(bsM, "A") === "BYE" ? BSD.side(bsM, "B") : BSD.side(bsM, "A")));
    eq("a Swiss bye scores like a 2-0 walkover when ranking by score", bsRow.points, BS.settings.standings.pairs.pointsByScore["2-0"]);
    const AW = dynComp(8, { type: "pointsLeague", rounds: 6, pairing: "americano" }, true);
    for (let i = 0; i < 6; i++) { // round 1 and two matches of round 2
      const x = CompSchedule.readyList(CompStandings.derive(AW))[0];
      CompResults.apply(AW, x.id, { sets: [{ a: 13, b: 8 }], winner: "A" }); CompGenerate.advance(AW);
    }
    AW.entries[3].withdrawn = true; AW.entries[3].withdrawMode = "walkover"; CompGenerate.advance(AW);
    const awD = playOut(AW, () => "A"), awR = dynCheck(AW, awD);
    eq("americano after a withdrawal: no repeated opponents", [awR.rematches, AW.meetings.every(m => awD.outcome(m).done)], [0, true]);
    const GP = dynComp(10, { type: "groups", groupSize: 4, advance: 2, thirdPlace: true, plate: true });
    const GPD = playOut(GP, (i) => (i % 3 ? "A" : "B"));
    const gpPlate = GP.stages.find(s => s.type === "plate");
    const gpQual = GP.stages[0].groups.reduce((a, g) => a.concat(GPD.table(GP.stages[0].id, g.id).slice(0, 2).map(r => r.id)), []);
    const gpIn = GP.meetings.filter(m => m.stageId === gpPlate.id && m.round === 1).reduce((a, m) => a.concat([GPD.side(m, "A"), GPD.side(m, "B")]), []).filter(x => x !== "BYE");
    ok("groups + plate: the plate holds the non-qualifiers only, and everything finishes", gpIn.length === 10 - gpQual.length && gpIn.every(x => gpQual.indexOf(x) === -1) && GP.meetings.every(m => GPD.outcome(m).done));

    out.push("use recommended, then generate");
    const ur = CompModel.newCompetition({ name: "Rec" });
    CompModel.applyPreset(ur, CompModel.RECOMMENDED_PRESET);
    ur.sport = "tennis"; ur.wizard.visited.start = true;
    Wizard.next(ur); Wizard.next(ur); Wizard.next(ur); // basics -> type -> divisions
    ur.divisions.forEach(d => { for (let i = 0; i < 5; i++) Wizard.pairsUtil.addPair(ur, d.id, [d.name + i + "a", d.name + i + "b"], ["M", "M"]); });
    eq("use recommended from Divisions", Wizard.useRecommended(ur), []);
    eq("nothing blocks Generate", [Wizard.invalidSteps(ur), Wizard.blockers(ur), Wizard.unbuilt(ur)], [[], [], []]);
    const draw = CompGenerate.generateDraw(ur);
    ok("the draw has matches for both divisions", ur.divisions.every(d => draw.matches.some(x => x.divisionId === d.id)));
  } finally {
    Store._useBackend(_realBackend);
    _storageWarned = _warned;
    CompStore._reset();
    if (CompStore.getMode() !== realMode) CompStore.setMode(realMode);
    CompShell.render();
    const cr = document.getElementById("compRoot");
    if (cr && CompStore.getMode() !== "competition") cr.innerHTML = compRootHtml || "";
  }

  const el = document.createElement("div");
  el.className = "selftest-out";
  el.textContent = "CourtMixer v" + APP_VERSION + " self-tests\n" + pass + " passed, " + fail + " failed\n\n" + out.join("\n") + "\n\n(tap to close)";
  el.onclick = () => el.remove();
  document.body.appendChild(el);
  return { pass, fail };
}

/* ===== Share diagnostics: open with ?sharetest =====
   Web Share behaviour cannot be reproduced on a desktop browser, so this reports exactly what
   the phone says rather than leaving it to guesswork. */
function runShareDiagnostics() {
  const el = document.createElement("div");
  el.className = "selftest-out";
  const lines = [];
  lines.push("CourtMixer v" + APP_VERSION + " — share diagnostics");
  lines.push("");
  lines.push("secure context : " + (window.isSecureContext ? "yes" : "NO (share needs https)"));
  lines.push("origin         : " + location.origin);
  lines.push("navigator.share    : " + typeof navigator.share);
  lines.push("navigator.canShare : " + typeof navigator.canShare);
  lines.push("");
  [["application/json", ".json"], ["text/plain", ".txt"]].forEach(function (p) {
    try {
      const f = new File([new Blob(["{}"], { type: p[0] })], "probe" + p[1], { type: p[0] });
      lines.push("canShare files only " + p[1] + " : " + (navigator.canShare ? navigator.canShare({ files: [f] }) : "n/a"));
      lines.push("canShare files+title " + p[1] + ": " + (navigator.canShare ? navigator.canShare({ files: [f], title: "t" }) : "n/a"));
    } catch (e) { lines.push(p[1] + " probe threw: " + e.name); }
  });
  lines.push("");
  lines.push("Tap a button to attempt a real share; the result appears below.");
  el.textContent = lines.join("\n");

  const mk = (label, payload) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.style.cssText = "display:block;margin:8px 0;padding:10px 14px;border-radius:8px;background:#4f6ef7;color:#fff;border:0;font:inherit;";
    b.onclick = function () {
      const res = document.createElement("div");
      try {
        const p = navigator.share(payload());
        p.then(function () { res.textContent = "→ " + label + ": RESOLVED (shared)"; })
         .catch(function (e) { res.textContent = "→ " + label + ": rejected " + (e && e.name) + " — " + (e && e.message); });
      } catch (e) { res.textContent = "→ " + label + ": threw " + e.name + " — " + e.message; }
      el.appendChild(res);
    };
    el.appendChild(b);
  };
  const mkFile = (mime, ext) => new File([new Blob(['{"app":"CourtMixer"}'], { type: mime })], "cmx-test" + ext, { type: mime });
  mk("share .json (files only)", () => ({ files: [mkFile("application/json", ".json")] }));
  mk("share .txt (files only)", () => ({ files: [mkFile("text/plain", ".txt")] }));
  mk("share .json + title", () => ({ files: [mkFile("application/json", ".json")], title: "CourtMixer" }));
  mk("share text only (no file)", () => ({ title: "CourtMixer", text: "hello" }));

  const close = document.createElement("button");
  close.textContent = "Close";
  close.style.cssText = "display:block;margin:14px 0 0;padding:10px 14px;border-radius:8px;background:#64748b;color:#fff;border:0;font:inherit;";
  close.onclick = () => el.remove();
  el.appendChild(close);
  document.body.appendChild(el);
}
