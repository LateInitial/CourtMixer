// CourtMixer - social state: roster, history, courts, storage load and save
// Moved verbatim from index.html in Phase 0 (v1.9.0). Loaded as a classic script;
// all top-level declarations share one global scope, exactly as before the split.

function isMatchLive(h) {
return Boolean(h && h.scoreA === null && !h.closed);
}

const defaultPlayers = [
{ id: uid(), name: "Joshua", gender: "M", skill: 6.0, matches: 0, wins: 0, points: 0, priority: false, skip: false },
{ id: uid(), name: "Julius", gender: "M", skill: 6.0, matches: 0, wins: 0, points: 0, priority: false, skip: false },
{ id: uid(), name: "Michael", gender: "M", skill: 7.0, matches: 0, wins: 0, points: 0, priority: false, skip: false },
{ id: uid(), name: "Nopi", gender: "F", skill: 4.0, matches: 0, wins: 0, points: 0, priority: false, skip: false },
{ id: uid(), name: "Open", gender: "M", skill: 4.0, matches: 0, wins: 0, points: 0, priority: false, skip: false },
{ id: uid(), name: "Michelle", gender: "F", skill: 4.0, matches: 0, wins: 0, points: 0, priority: false, skip: false },
{ id: uid(), name: "Sendy", gender: "F", skill: 5.0, matches: 0, wins: 0, points: 0, priority: false, skip: false },
{ id: uid(), name: "Rizky", gender: "M", skill: 8.0, matches: 0, wins: 0, points: 0, priority: false, skip: false },
{ id: uid(), name: "Connie", gender: "F", skill: 4.0, matches: 0, wins: 0, points: 0, priority: false, skip: false },
{ id: uid(), name: "Adi", gender: "M", skill: 6.0, matches: 0, wins: 0, points: 0, priority: false, skip: false },
{ id: uid(), name: "Angel", gender: "F", skill: 4.0, matches: 0, wins: 0, points: 0, priority: false, skip: false },
{ id: uid(), name: "Artyon", gender: "M", skill: 6.0, matches: 0, wins: 0, points: 0, priority: false, skip: false },
{ id: uid(), name: "Ucok", gender: "M", skill: 6.0, matches: 0, wins: 0, points: 0, priority: false, skip: false },
{ id: uid(), name: "Hengky", gender: "M", skill: 5.0, matches: 0, wins: 0, points: 0, priority: false, skip: false },
{ id: uid(), name: "Edbert", gender: "M", skill: 4.0, matches: 0, wins: 0, points: 0, priority: false, skip: false },
{ id: uid(), name: "Jeje", gender: "F", skill: 2.0, matches: 0, wins: 0, points: 0, priority: false, skip: false },
{ id: uid(), name: "Danny", gender: "M", skill: 3.0, matches: 0, wins: 0, points: 0, priority: false, skip: false }
];

const UNRATED_SKILL = 3.0;
// Always the raw match score total - independent of the leaderboard ranking style.
const ptsOf = (p) => Number(p && p.rawPoints) || 0;
function isUnrated(p){ const s = p && p.skill; return s === null || s === undefined || s === ""; }
function skillOf(p){ return isUnrated(p) ? UNRATED_SKILL : Number(p.skill); }
function fmtSkill(p){ return isUnrated(p) ? "U" : Number(p.skill).toFixed(1); }
function normSkillInput(v){ const t = String(v == null ? "" : v).trim(); if (t === "" || /^u$/i.test(t)) return null; const n = Number(t); return Number.isFinite(n) ? n : NaN; }
function normSkillData(v){ if (v === null || v === undefined || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; }
let players = (function () { try { return JSON.parse(lsGet("courtmixer_players") || "null") || []; } catch (e) { return []; } })();
// Migrate: ensure wins field exists
players.forEach(p => { if (p.wins === undefined) p.wins = 0; if (p.points === undefined) p.points = 0; if (p.gender === undefined) p.gender = "M"; if (p.priorityLock === undefined) p.priorityLock = false; if (p.skipLock === undefined) p.skipLock = false; if (p.pointsDiff === undefined) p.pointsDiff = 0; if (p.rawPoints === undefined) p.rawPoints = 0; });
let matchHistory = (function () { try { const v = JSON.parse(lsGet("courtmixer_history") || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; } })();
matchHistory.forEach(h => { if (h.closed === undefined) h.closed = false; });
const MAX_COURTS = 4;
let courtCount = (() => {
const v = parseInt(lsGet("courtmixer_court_count") || "1", 10);
return v >= 1 && v <= MAX_COURTS ? v : 1;
})();
// A live match on a court above courtCount would be unreachable from the Match tab, so
// widen the court count to cover it rather than stranding it.
(() => {
  let mx = courtCount;
  matchHistory.forEach(h => { if (isMatchLive(h) && h.court && h.court > mx && h.court <= MAX_COURTS) mx = h.court; });
  if (mx !== courtCount) { courtCount = mx; try { lsSet("courtmixer_court_count", String(courtCount)); } catch (e) {} }
})();
let scoringStyle = (() => { const v = lsGet("courtmixer_scoring_style"); return ["points","adjpts","league","ptspergp"].includes(v) ? v : "points"; })();
const todayISO = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const fmtSessionDate = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ""); const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(); return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); };
let sessionName = lsGet("courtmixer_session_name") || "";
let sessionDate = lsGet("courtmixer_session_date") || "";
if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) { sessionDate = todayISO(); lsSet("courtmixer_session_date", sessionDate); }
let matchmakingMode = lsGet("courtmixer_matchmaking") === "mexicano" ? "mexicano" : "americano";
const LEAGUE_WIN_PTS = 3;
const LEAGUE_DRAW_PTS = 1;
const LEAGUE_LOSS_PTS = 1;
const REPEAT_PARTNER_BASE = 9000;
const REPEAT_OPPONENT_BASE = 4500;
const EMPTY_SLOTS = () => ({ 1:[null,null,null,null], 2:[null,null,null,null], 3:[null,null,null,null], 4:[null,null,null,null] });
const EMPTY_MANUAL = () => ({ 1:[false,false,false,false], 2:[false,false,false,false], 3:[false,false,false,false], 4:[false,false,false,false] });
// Pending (unconfirmed) lineups survive a reload — losing a four-court draw to a
// background tab refresh was the most annoying data loss in earlier builds.
function loadSlotState(key, empty, coerce) {
  try {
    const v = JSON.parse(lsGet(key) || "null");
    if (!v || typeof v !== "object") return empty();
    const out = empty();
    for (let c = 1; c <= MAX_COURTS; c++) {
      const row = v[c];
      if (Array.isArray(row) && row.length === 4) out[c] = row.map(coerce);
    }
    return out;
  } catch (e) { return empty(); }
}
let courtSlots = loadSlotState("courtmixer_court_slots", EMPTY_SLOTS, (x) => (typeof x === "string" && x) ? x : null);
let courtSlotManual = loadSlotState("courtmixer_court_manual", EMPTY_MANUAL, (x) => x === true);
let courtMode = (() => { try { const v = JSON.parse(lsGet("courtmixer_court_modes") || "null"); return (v && typeof v === "object") ? {1:v[1]||"",2:v[2]||"",3:v[3]||"",4:v[4]||""} : {1:"",2:"",3:"",4:""}; } catch(e) { return {1:"",2:"",3:"",4:""}; } })();
const courtRerollSeen = { 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set() };
function saveCourts() {
  try {
    localStorage.setItem("courtmixer_court_modes", JSON.stringify(courtMode));
    localStorage.setItem("courtmixer_court_slots", JSON.stringify(courtSlots));
    localStorage.setItem("courtmixer_court_manual", JSON.stringify(courtSlotManual));
  } catch (e) { /* storage blocked - save() already warned */ }
}

function clearCourtsAbove(n) {
for (let c = n + 1; c <= MAX_COURTS; c++) {
courtSlots[c] = [null, null, null, null];
courtSlotManual[c] = [false, false, false, false];
courtMode[c] = "";
courtRerollSeen[c].clear();
}
}

function getMexicanoBandForCourt(courtNum) {
const bands = {
"1-1": { center: 0.5, halfWidth: 0.5 },
"2-1": { center: 0.25, halfWidth: 0.38 },
"2-2": { center: 0.75, halfWidth: 0.38 },
"3-1": { center: 0.17, halfWidth: 0.32 },
"3-2": { center: 0.5, halfWidth: 0.36 },
"3-3": { center: 0.83, halfWidth: 0.32 },
"4-1": { center: 0.12, halfWidth: 0.26 },
"4-2": { center: 0.32, halfWidth: 0.26 },
"4-3": { center: 0.68, halfWidth: 0.26 },
"4-4": { center: 0.88, halfWidth: 0.26 }
};
return bands[`${courtCount}-${courtNum}`] || bands["1-1"];
}

function playerRankRatio(idx, n) {
if (n <= 1) return 0.5;
return idx / (n - 1);
}

function gpAllowedOnCourt(rankRatio, courtNum) {
if (courtCount === 1) return true;
if (courtCount === 2) {
if (courtNum === 1 && rankRatio > 0.7) return false;
if (courtNum === 2 && rankRatio < 0.3) return false;
return true;
}
if (courtCount === 3) {
if (courtNum === 1 && rankRatio > 0.58) return false;
if (courtNum === 3 && rankRatio < 0.42) return false;
return true;
}
if (courtNum === 1 && rankRatio > 0.52) return false;
if (courtNum === 2 && rankRatio > 0.62) return false;
if (courtNum === 3 && rankRatio < 0.38) return false;
if (courtNum === 4 && rankRatio < 0.48) return false;
return true;
}
const MAX_PRIORITY_PLAYERS = 4;
let editingId = null; // track which player is being edited
let editTableMode = false;
let sortState = { col: null, dir: 1 };
let statsSortState = { col: null, dir: 1 };
let selectedGender = "M";
let customDefaults = (function () { try { return JSON.parse(lsGet("courtmixer_custom_defaults") || "null"); } catch (e) { return null; } })();

const seenPairings = new Set((function () { try { const v = JSON.parse(lsGet("courtmixer_seen") || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; } })());
const byId = (id) => players.find(p => p.id === id);
let _storageWarned = false;
const save = () => {
try {
localStorage.setItem("courtmixer_players", JSON.stringify(players));
localStorage.setItem("courtmixer_history", JSON.stringify(matchHistory));
localStorage.setItem("courtmixer_seen", JSON.stringify(Array.from(seenPairings)));
localStorage.setItem("courtmixer_court_count", String(courtCount));
localStorage.setItem("courtmixer_scoring_style", scoringStyle);
localStorage.setItem("courtmixer_matchmaking", matchmakingMode);
localStorage.setItem("courtmixer_session_name", sessionName);
localStorage.setItem("courtmixer_session_date", sessionDate);
} catch (e) {
if (!_storageWarned) { _storageWarned = true; cmxAlert("This browser is blocking local storage (e.g. Private Browsing), so changes can't be saved automatically. Use Edit \u25b8 Export to back up your data."); }
}
};
