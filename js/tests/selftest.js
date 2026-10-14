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
