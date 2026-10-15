// CourtMixer - competition data model (Phase 2, v1.10.0): factories, presets, defaults,
// schema migrations and the pure helpers the wizard uses to adapt data when answers change.
// Spec §5. Nothing here touches storage or the DOM.

const CompModel = (function () {
  const SCHEMA_VERSION = 2;
  // Ordered list: MIGRATIONS[n] upgrades a document from schemaVersion n to n + 1.
  const MIGRATIONS = {
    // v1.10.0 drafts: older standings shape, no court assignment / time budget / knockout format.
    1: function (doc) {
      const s = doc.settings = doc.settings || {}, d = defaultSettings();
      const sp = s.standings = s.standings || {};
      const p = sp.pairs = sp.pairs || {};
      if (!p.league) p.league = { win: Number(p.pointsWin) > 1 ? Number(p.pointsWin) : 3, loss: Number(p.pointsLoss) || 0 };
      if (!p.pointsByScore) p.pointsByScore = d.standings.pairs.pointsByScore;
      if (["wins", "league", "score"].indexOf(p.rankBy) === -1) p.rankBy = "wins";
      if (!Array.isArray(p.tiebreakers)) p.tiebreakers = d.standings.pairs.tiebreakers;
      delete p.pointsWin; delete p.pointsLoss;
      if (!sp.teams) sp.teams = d.standings.teams;
      ["courtAssign", "timeAvailable", "koFormat"].forEach(k => { if (s[k] === undefined) s[k] = d[k]; });
      delete s.changeoverMinutes; delete s.minutesPerMatch;
    }
  };

  const SPORTS = ["badminton", "padel", "tennis", "other"];
  const CATEGORIES = ["open", "MD", "WD", "XD"];
  const MAX_DIVISIONS = 8, MIN_TEAMS = 2, MAX_TEAMS = 16, MAX_COURTS = 16;
  const TEAM_COLORS = ["#e5484d", "#f5a623", "#22a96e", "#4f6fff", "#8e4ec6", "#12a5b5", "#d6409f", "#5f6d94"];

  // Division naming quick-fill. Lists are 8 long so every count up to MAX_DIVISIONS has a name.
  const NAMING = {
    letters: ["A", "B", "C", "D", "E", "F", "G", "H"],
    metals: ["Gold", "Silver", "Bronze", "Platinum", "Diamond", "Copper", "Iron", "Steel"],
    levels: ["Advanced", "Intermediate", "Beginner", "Expert", "Upper Intermediate", "Novice", "Starter", "Open"]
  };
  function divisionNames(scheme, n) {
    const list = NAMING[scheme] || NAMING.letters;
    const out = [];
    for (let i = 0; i < n; i++) out.push(list[i] || ("Division " + (i + 1)));
    return out;
  }

  // Each preset pre-fills later steps; the user can still change everything (§6.2 step 1).
  const PRESETS = {
    pairsGroupsKo:   { kind: "pairs", stage: "groups",      lineup: null },
    pairsRoundRobin: { kind: "pairs", stage: "roundRobin",  lineup: null },
    pairsKnockout:   { kind: "pairs", stage: "knockout",    lineup: null },
    pairsPoints:     { kind: "pairs", stage: "pointsLeague", lineup: null },
    teamsFixed:      { kind: "teams", stage: "roundRobin",  lineup: "fixed" },
    teamsFlexible:   { kind: "teams", stage: "roundRobin",  lineup: "flexible" },
    custom:          { kind: null,    stage: null,          lineup: null }
  };
  const PRESET_ORDER = ["pairsGroupsKo", "pairsRoundRobin", "pairsKnockout", "pairsPoints", "teamsFixed", "teamsFlexible", "custom"];
  const RECOMMENDED_PRESET = "pairsGroupsKo";

  function recommendedDivisionCount(kind) { return kind === "teams" ? 3 : 2; }

  function todayISO() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  // CompSettings (§5.1) with every recommended default.
  function defaultSettings() {
    return {
      preset: null, divisionNaming: "letters",
      courtsCount: 2, courtNames: ["Court 1", "Court 2"], courtMode: "shared",
      startTime: null, restRule: "prefer", minRestMatches: 1,
      formatPlan: "sameForAll",
      stagePlan: { all: { type: "groups", groupSize: 4, advance: 2, thirdPlace: true, seeding: "snake" } },
      matchFormats: {},
      standings: {
        pairs: { rankBy: "wins", league: { win: 3, loss: 0 }, pointsByScore: { "2-0": 3, "2-1": 2, "1-2": 1, "0-2": 0 },
          tiebreakers: ["headToHead", "setDiff", "gameDiff", "gamesWon", "manual"] },
        teams: { resultMode: "meeting", meetingPoints: { win: 2, draw: 1, loss: 0 }, splitRule: "totalGames",
          tiebreakers: ["headToHead", "matchDiff", "setDiff", "gameDiff", "manual"] }
      },
      walkoverScore: "formatMax", timeAvailable: 240, courtAssign: {}, koFormat: "same",
      deadRubbers: { groupStage: "playAll", knockout: "stopWhenDecided" },
      lineup: { mode: "fixed", onePerMeeting: true, crossDivision: "warn", reservesAnyDivision: true },
      meetingTemplate: []
    };
  }

  function newDivision(name, order) { return { id: uid(), name: name, order: order, category: "open", courtIds: [] }; }
  function newTeam(order) { return { id: uid(), name: "Team " + (order + 1), order: order, color: null, withdrawn: false }; }

  function newCompetition(opts) {
    opts = opts || {};
    const now = Date.now();
    return {
      schemaVersion: SCHEMA_VERSION,
      id: uid(), name: opts.name || "", dateISO: todayISO(), sport: null,
      kind: "pairs", status: "setup", createdAt: now, updatedAt: now,
      settings: defaultSettings(),
      wizard: { currentStep: "start", visited: {}, needsReview: {} },
      divisions: [], players: [], teams: [], entries: [], stages: [], meetings: [], matches: [], courts: [],
      log: []
    };
  }

  // Duplicate: keeps settings and players, clears results and the draw (§6.2 step 1).
  // Withdrawals and substitutions belonged to that event, so everyone starts fresh: withdrawn
  // pairs are back in, and one-match stand-ins and replaced players are dropped.
  function duplicate(src) {
    const c = JSON.parse(JSON.stringify(src));
    c.entries.forEach(e => { e.withdrawn = false; delete e.withdrawMode; });
    (c.teams || []).forEach(tm => { tm.withdrawn = false; delete tm.withdrawMode; });
    const inEntry = {};
    c.entries.forEach(e => e.playerIds.forEach(id => { inEntry[id] = true; }));
    // registered reserves stay; one-match stand-ins (subFor) and replaced players go
    c.players = c.players.filter(p => inEntry[p.id] || !(p.replacedBy || p.subFor));
    c.players.forEach(p => { p.withdrawn = false; delete p.replacedBy; delete p.subFor; });
    c.divisions.forEach(d => { delete d.drawSeq; });
    const now = Date.now();
    c.id = uid(); c.status = "setup"; c.createdAt = now; c.updatedAt = now; c.dateISO = todayISO();
    c.name = (src.name || "") + " (copy)";
    c.stages = []; c.meetings = []; c.matches = []; c.log = [];
    delete c.statusBeforeArchive;
    c.wizard = { currentStep: "basics", visited: { start: true }, needsReview: {} };
    return c;
  }

  // Applies a preset's choices. Steps the user has already answered keep their answers;
  // the caller marks them needsReview instead (§6.1 invalidation).
  function applyPreset(comp, presetId) {
    const p = PRESETS[presetId];
    if (!p) return;
    comp.settings.preset = presetId;
    const v = comp.wizard.visited;
    if (p.kind && !v.type) comp.kind = p.kind;
    if (!v.divisions) setDivisionCount(comp, recommendedDivisionCount(comp.kind));
    if (!v.teams && comp.kind === "teams" && comp.teams.length === 0) setTeamCount(comp, 4);
    if (p.stage && !v.format) comp.settings.stagePlan = { all: stagePlanFor(p.stage) };
    if (p.lineup && !v.template) comp.settings.lineup.mode = p.lineup;
  }

  function stagePlanFor(type) {
    if (type === "groups") return { type: "groups", groupSize: 4, advance: 2, thirdPlace: true, seeding: "snake" };
    if (type === "knockout") return { type: "knockout", thirdPlace: true };
    if (type === "pointsLeague") return { type: "pointsLeague", rounds: null, pairing: "mexicano" };
    return { type: type };
  }

  // Grows or shrinks the division list. Data is never deleted: players and entries of a removed
  // division move to "Unassigned" (divisionId null) so the Entries step can prompt for them.
  function setDivisionCount(comp, n) {
    n = Math.max(1, Math.min(MAX_DIVISIONS, Math.round(Number(n) || 1)));
    const names = divisionNames(comp.settings.divisionNaming, n);
    while (comp.divisions.length < n) comp.divisions.push(newDivision(names[comp.divisions.length], comp.divisions.length));
    if (comp.divisions.length > n) {
      const removed = comp.divisions.slice(n).map(d => d.id);
      comp.divisions = comp.divisions.slice(0, n);
      const gone = (id) => removed.indexOf(id) !== -1;
      comp.players.forEach(p => { if (gone(p.divisionId)) p.divisionId = null; });
      comp.entries.forEach(e => { if (gone(e.divisionId)) e.divisionId = null; });
      comp.courts.forEach(c => { c.homeDivisionIds = (c.homeDivisionIds || []).filter(id => !gone(id)); });
      (comp.settings.meetingTemplate || []).forEach(r => { if (gone(r.divisionId)) r.divisionId = null; });
      Object.keys(comp.settings.stagePlan || {}).forEach(k => { if (k !== "all" && gone(k)) delete comp.settings.stagePlan[k]; });
    }
  }
  function renameDivisions(comp, scheme) {
    if (scheme !== "custom") {
      const names = divisionNames(scheme, comp.divisions.length);
      comp.divisions.forEach((d, i) => { d.name = names[i]; });
    }
    comp.settings.divisionNaming = scheme;
  }
  // Removed teams keep their players: they move to "no team" (teamId null), never deleted.
  function setTeamCount(comp, n) {
    n = Math.max(MIN_TEAMS, Math.min(MAX_TEAMS, Math.round(Number(n) || MIN_TEAMS)));
    while (comp.teams.length < n) comp.teams.push(newTeam(comp.teams.length));
    if (comp.teams.length > n) {
      const removed = comp.teams.slice(n).map(t => t.id);
      comp.teams = comp.teams.slice(0, n);
      const gone = (id) => removed.indexOf(id) !== -1;
      comp.players.forEach(p => { if (gone(p.teamId)) p.teamId = null; });
      comp.entries.forEach(e => { if (gone(e.teamId)) e.teamId = null; });
    }
  }

  function unassigned(comp) {
    return {
      players: comp.players.filter(p => p.divisionId === null && !p.withdrawn),
      entries: comp.entries.filter(e => e.divisionId === null && !e.withdrawn)
    };
  }

  // Upgrades an older document in place. A document from a NEWER app version is left alone.
  function migrate(doc) {
    if (!doc || typeof doc !== "object") return null;
    let v = Number(doc.schemaVersion) || 1;
    while (v < SCHEMA_VERSION && MIGRATIONS[v]) { MIGRATIONS[v](doc); v++; doc.schemaVersion = v; }
    return doc;
  }

  // Index entry kept in courtmixer_comp_index (§12.3).
  function indexEntry(comp) {
    return { id: comp.id, name: comp.name, dateISO: comp.dateISO, status: comp.status, updatedAt: comp.updatedAt };
  }

  return {
    SCHEMA_VERSION, SPORTS, CATEGORIES, MAX_DIVISIONS, MIN_TEAMS, MAX_TEAMS, MAX_COURTS, TEAM_COLORS,
    PRESETS, PRESET_ORDER, RECOMMENDED_PRESET, NAMING,
    recommendedDivisionCount, defaultSettings, newCompetition, duplicate, applyPreset, stagePlanFor,
    setDivisionCount, renameDivisions, divisionNames, setTeamCount, unassigned, migrate, indexEntry, todayISO
  };
})();
