// CourtMixer - match formats (Phase 3, v1.11.0), spec §7.
// Presets per sport, a plain-language description, a best-effort ITF TODS code, walkover scores,
// picker ranges, and evaluateScore(): the pure function that decides winners and flags scores that
// break the format. Warnings never block a save; errors do.

const CompFormat = (function () {
  function mk(o) {
    return Object.assign({ id: "", name: "", sport: "other", sets: 1, setType: "points", target: 21, winBy: 2, cap: null,
      tiebreakAt: null, tiebreakTo: null, finalSet: "full", matchTiebreakTo: null, noAd: false, todsCode: "", minutes: 20 }, o);
  }
  // §7.3. The first preset of each sport is the recommended one.
  const PRESETS = {
    badminton: [
      mk({ id: "bad1x21", sport: "badminton", sets: 1, setType: "points", target: 21, winBy: 2, cap: 30, minutes: 15 }),
      mk({ id: "bad3x21", sport: "badminton", sets: 3, setType: "points", target: 21, winBy: 2, cap: 30, minutes: 35 }),
      mk({ id: "bad3x15", sport: "badminton", sets: 3, setType: "points", target: 15, winBy: 2, cap: 21, minutes: 25 }),
      mk({ id: "bad1x30", sport: "badminton", sets: 1, setType: "points", target: 30, winBy: 2, cap: null, minutes: 22 }),
      mk({ id: "bad1x25", sport: "badminton", sets: 1, setType: "points", target: 25, winBy: 2, cap: null, minutes: 18 })
    ],
    padel: [
      mk({ id: "padRace4", sport: "padel", sets: 1, setType: "games", target: 4, winBy: 1, noAd: true, minutes: 20 }),
      mk({ id: "padRace3", sport: "padel", sets: 1, setType: "games", target: 3, winBy: 1, noAd: true, minutes: 15 }),
      mk({ id: "pad1set6", sport: "padel", sets: 1, setType: "games", target: 6, winBy: 2, tiebreakAt: 6, tiebreakTo: 7, minutes: 40 }),
      mk({ id: "pad3setMtb", sport: "padel", sets: 3, setType: "games", target: 6, winBy: 2, tiebreakAt: 6, tiebreakTo: 7, finalSet: "matchTiebreak", matchTiebreakTo: 10, minutes: 70 })
    ],
    tennis: [
      mk({ id: "tenPro8", sport: "tennis", sets: 1, setType: "games", target: 8, winBy: 2, tiebreakAt: 8, tiebreakTo: 7, minutes: 45 }),
      mk({ id: "tenShort4", sport: "tennis", sets: 3, setType: "games", target: 4, winBy: 2, tiebreakAt: 4, tiebreakTo: 7, finalSet: "matchTiebreak", matchTiebreakTo: 10, minutes: 50 }),
      mk({ id: "ten3setMtb", sport: "tennis", sets: 3, setType: "games", target: 6, winBy: 2, tiebreakAt: 6, tiebreakTo: 7, finalSet: "matchTiebreak", matchTiebreakTo: 10, minutes: 80 }),
      mk({ id: "ten3full", sport: "tennis", sets: 3, setType: "games", target: 6, winBy: 2, tiebreakAt: 6, tiebreakTo: 7, finalSet: "full", minutes: 100 }),
      mk({ id: "ten1set6", sport: "tennis", sets: 1, setType: "games", target: 6, winBy: 2, tiebreakAt: 6, tiebreakTo: 7, minutes: 40 })
    ],
    other: [
      mk({ id: "oth1x21", sport: "other", sets: 1, setType: "points", target: 21, winBy: 2, cap: null, minutes: 20 }),
      mk({ id: "oth3x21", sport: "other", sets: 3, setType: "points", target: 21, winBy: 2, cap: null, minutes: 35 })
    ]
  };
  const TOTAL_POINTS = mk({ id: "totalPoints", sport: "any", setType: "totalPoints", sets: 1, target: 21, winBy: 1, minutes: 12 });

  // Every sport also offers the points-league format ("first to 21 total points", §7.3).
  function presetsFor(sport) { return (PRESETS[sport] || PRESETS.other).concat([TOTAL_POINTS]); }
  function recommendedFor(sport) { return presetsFor(sport)[0]; }
  function copy(f) { return JSON.parse(JSON.stringify(f)); }
  function findPreset(id) {
    let hit = null;
    Object.keys(PRESETS).forEach(s => PRESETS[s].forEach(p => { if (p.id === id) hit = p; }));
    return hit || (id === TOTAL_POINTS.id ? TOTAL_POINTS : null);
  }

  // Default minutes for a format: the preset's figure, else an estimate from its size.
  function minutesFor(f) {
    const p = findPreset(f.id);
    if (p && p.sets === f.sets && p.target === f.target && p.setType === f.setType) return p.minutes;
    if (f.setType === "totalPoints") return Math.max(8, Math.round(f.target * 0.6));
    if (f.setType === "points") return Math.max(8, Math.round(f.target * 0.7 * Math.max(1, Math.ceil(f.sets / 2) + (f.sets > 1 ? 0.5 : 0))));
    return Math.max(10, Math.round(f.target * 6 * Math.max(1, Math.ceil(f.sets / 2) + (f.sets > 1 ? 0.5 : 0))));
  }

  // "Best of 3 games to 21, win by 2, capped at 30"
  function describe(f) {
    const unit = f.setType === "games" ? t("fmt.unit.set") : t("fmt.unit.game");
    let s;
    if (f.setType === "totalPoints") s = t("fmt.desc.total", { n: f.target });
    else if (f.setType === "games" && f.sets === 1 && f.winBy === 1 && !f.tiebreakAt) s = t("fmt.desc.race", { n: f.target });
    else {
      const what = f.setType === "games" ? t("fmt.desc.setTo", { n: f.target }) : t("fmt.desc.gameTo", { n: f.target });
      s = f.sets === 1 ? t("fmt.desc.one", { what: what }) : t("fmt.desc.bestOf", { n: f.sets, unitPlural: f.setType === "games" ? t("fmt.unit.sets") : t("fmt.unit.games"), what: what });
      if (f.setType === "points") {
        if (f.winBy === 2) s += ", " + t("fmt.desc.winBy2");
        if (f.cap) s += ", " + t("fmt.desc.cap", { n: f.cap });
      } else if (f.tiebreakAt) s += ", " + t("fmt.desc.tb", { at: f.tiebreakAt, to: f.tiebreakTo || 7 });
      if (f.sets > 1 && f.finalSet === "matchTiebreak") s += ", " + t("fmt.desc.mtb", { n: f.matchTiebreakTo || 10 });
    }
    if (f.noAd) s += ", " + (f.sport === "padel" ? t("fmt.desc.golden") : t("fmt.desc.noAd"));
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function example(f) {
    const ex = walkoverSets(f).map((s, i) => {
      if (f.setType === "points") return i === 1 ? (f.target - 2) + "–" + f.target : f.target + "–" + (f.target - 3);
      if (f.setType === "games") return f.target + "–" + Math.max(0, f.target - 2);
      return Math.ceil(f.target / 2 + 1) + "–" + Math.floor(f.target / 2 - 1);
    });
    if (f.setType === "points" && f.sets > 1) ex.push(f.target + "–" + (f.target - 5));
    if (f.setType === "points" && f.cap) ex[ex.length - 1] = f.cap + "–" + (f.cap - 1);
    return ex.join(", ");
  }

  // ITF TODS MatchUp Format Code, best effort ("" when it can't be expressed).
  function tods(f) {
    if (f.setType === "totalPoints") return "";
    if (f.setType === "points") return "SET" + f.sets + "-S:" + f.target + (f.cap ? "/" + "C" + f.cap : "") + (f.winBy === 1 ? "NOAD" : "");
    let set = "S:" + f.target + (f.tiebreakAt ? "/TB" + (f.tiebreakTo || 7) + (f.tiebreakAt !== f.target ? "@" + f.tiebreakAt : "") : "");
    let code = "SET" + f.sets + "-" + set;
    if (f.sets > 1 && f.finalSet === "matchTiebreak") code += "-F:TB" + (f.matchTiebreakTo || 10);
    return code;
  }
  function finalize(f) { f.todsCode = tods(f); f.name = describe(f); return f; }

  function needed(f) { return Math.floor(f.sets / 2) + 1; }
  function isMatchTiebreakSet(f, i) { return f.sets > 1 && f.finalSet === "matchTiebreak" && i === f.sets - 1; }

  // What a walkover is worth with walkoverScore = formatMax.
  function walkoverSets(f) {
    const out = [];
    for (let i = 0; i < needed(f); i++) out.push({ a: isMatchTiebreakSet(f, i) ? (f.matchTiebreakTo || 10) : f.target, b: 0 });
    return out;
  }
  // Score picker range for one set box.
  function pickerMax(f, i) {
    if (isMatchTiebreakSet(f, i)) return (f.matchTiebreakTo || 10) + 9;
    if (f.setType === "games") return f.target + 2;
    if (f.setType === "totalPoints") return f.target;
    return (f.cap || f.target) + 9;
  }
  function needsTiebreak(f, set, i) {
    if (f.setType !== "games" || !f.tiebreakAt || isMatchTiebreakSet(f, i)) return false;
    const hi = Math.max(set.a, set.b), lo = Math.min(set.a, set.b);
    return hi === f.tiebreakAt + 1 && lo === f.tiebreakAt;
  }

  const isInt = (v) => typeof v === "number" && Number.isInteger(v);

  // One set/game: { winner: 'A'|'B'|'draw'|null, warnings, errors }
  function evaluateSet(f, set, i) {
    const warnings = [], errors = [];
    const a = set.a, b = set.b;
    if (!isInt(a) || !isInt(b)) { errors.push(t("fmt.err.int")); return { winner: null, warnings, errors }; }
    if (a < 0 || b < 0) { errors.push(t("fmt.err.negative")); return { winner: null, warnings, errors }; }
    const sc = a + "–" + b;
    if (f.setType === "totalPoints") {
      if (a + b !== f.target) warnings.push(t("fmt.warn.total", { s: sc, n: f.target }));
      return { winner: a === b ? "draw" : a > b ? "A" : "B", warnings, errors };
    }
    if (a === b) { errors.push(t("fmt.err.noWinner", { s: sc })); return { winner: null, warnings, errors }; }
    const w = Math.max(a, b), l = Math.min(a, b), winner = a > b ? "A" : "B";
    if (isMatchTiebreakSet(f, i)) {
      const to = f.matchTiebreakTo || 10;
      if (w < to || (w > to && w - l !== 2) || (w === to && w - l < 2)) warnings.push(t("fmt.warn.mtb", { s: sc, n: to }));
      return { winner, warnings, errors };
    }
    if (f.setType === "points") {
      const T = f.target, cap = f.cap;
      if (cap && w > cap) warnings.push(t("fmt.warn.cap", { s: sc, n: cap }));
      else if (w < T) warnings.push(t("fmt.warn.short", { s: sc, n: T }));
      else if (cap && w === cap && cap > T) { if (l < cap - 2) warnings.push(t("fmt.warn.over", { s: sc, n: T })); } // 30-29 / 30-28 only
      else if (f.winBy === 2) {
        if (w - l < 2) warnings.push(t("fmt.warn.lead2", { s: sc }));
        else if (w > T && w - l !== 2) warnings.push(t("fmt.warn.over", { s: sc, n: T }));
      } else if (w > T) warnings.push(t("fmt.warn.over", { s: sc, n: T }));
      return { winner, warnings, errors };
    }
    // games
    const T = f.target, at = f.tiebreakAt;
    let ok = false;
    if (f.winBy === 1) ok = w === T && l < T;
    else {
      ok = (w === T && l <= T - 2) || (w === T + 1 && l === T - 1 && (!at || at >= T));
      if (at && w === at + 1 && l === at) ok = true;
      if (!at && w > T && w - l === 2) ok = true; // advantage set
    }
    if (!ok) warnings.push(t("fmt.warn.set", { s: sc, n: T }));
    if (needsTiebreak(f, set, i)) {
      const ta = set.tbA, tb = set.tbB;
      if (isInt(ta) && isInt(tb)) {
        if (ta < 0 || tb < 0) errors.push(t("fmt.err.negative"));
        else {
          const tw = Math.max(ta, tb), tl = Math.min(ta, tb), to = f.tiebreakTo || 7;
          if ((ta > tb ? "A" : "B") !== winner || ta === tb) warnings.push(t("fmt.warn.tbSide"));
          else if (tw < to || (tw > to && tw - tl !== 2) || tw - tl < 2) warnings.push(t("fmt.warn.tb", { n: to }));
        }
      }
    }
    return { winner, warnings, errors };
  }

  // The whole match (§7.2). sets: [{a, b, tbA?, tbB?}]. opts.partial: a retired match may stop early.
  function evaluateScore(f, sets, opts) {
    opts = opts || {};
    const warnings = [], errors = [];
    sets = Array.isArray(sets) ? sets : [];
    if (sets.length > f.sets) errors.push(t("fmt.err.tooMany", { n: f.sets }));
    let wa = 0, wb = 0, decided = null, draw = false;
    sets.forEach(function (s, i) {
      if (decided) { errors.push(t("fmt.err.afterDecided", { n: i + 1 })); return; }
      // A retirement can happen at a level score in the game being played.
      if (opts.partial && i === sets.length - 1 && isInt(s.a) && isInt(s.b) && s.a === s.b && s.a >= 0) return;
      const r = evaluateSet(f, s, i);
      r.errors.forEach(e => errors.push(e)); r.warnings.forEach(w => warnings.push(w));
      if (r.winner === "A") wa++; else if (r.winner === "B") wb++; else if (r.winner === "draw") draw = true;
      if (f.setType === "totalPoints") decided = r.winner;
      else if (wa >= needed(f)) decided = "A"; else if (wb >= needed(f)) decided = "B";
    });
    const complete = !!decided && !errors.length;
    if (!decided && !opts.partial && !errors.length) errors.push(t("fmt.err.incomplete"));
    return { winner: errors.length ? null : decided, complete, warnings, errors, setsA: wa, setsB: wb, draw };
  }

  // Totals for standings: sets and games/points won by each side. In a retired match the game
  // being played when it stopped counts for points/games but isn't a set won.
  function tally(f, sets, outcome) {
    let setsA = 0, setsB = 0, gamesA = 0, gamesB = 0;
    sets = sets || [];
    sets.forEach(function (s, i) {
      gamesA += Number(s.a) || 0; gamesB += Number(s.b) || 0;
      if (f.setType === "totalPoints") return;
      if (outcome === "retired" && i === sets.length - 1) { const ev = evaluateSet(f, s, i); if (!ev.winner || ev.warnings.length) return; }
      if (s.a > s.b) setsA++; else if (s.b > s.a) setsB++;
    });
    return { setsA, setsB, gamesA, gamesB };
  }

  function custom(sport) { return finalize(mk({ id: "custom", sport: sport || "other" })); }
  function fromPreset(id) { const p = findPreset(id); return p ? finalize(copy(p)) : null; }

  return { PRESETS, TOTAL_POINTS, presetsFor, recommendedFor, findPreset, fromPreset, custom, minutesFor, describe, example,
    tods, finalize, needed, isMatchTiebreakSet, walkoverSets, pickerMax, needsTiebreak, evaluateSet, evaluateScore, tally };
})();
