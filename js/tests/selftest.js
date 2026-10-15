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
