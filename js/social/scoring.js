// CourtMixer - social scoring: score credits, ranking comparators
// Moved verbatim from index.html in Phase 0 (v1.9.0). Loaded as a classic script;
// all top-level declarations share one global scope, exactly as before the split.

function applyScoreCredits(h, undo) {
const a = h.scoreA;
const b = h.scoreB;
const m = undo ? -1 : 1;
// Points difference (score margin) — tracked the same way for every scoring style
// rawPoints is the untouched match score. p.points follows the leaderboard ranking style
// (league awards 3/1), so matchmaking must never read it.
h.pairAIds.forEach(id => { const p = byId(id); if (p) { p.pointsDiff += m * (a - b); p.rawPoints = (p.rawPoints || 0) + m * a; } });
h.pairBIds.forEach(id => { const p = byId(id); if (p) { p.pointsDiff += m * (b - a); p.rawPoints = (p.rawPoints || 0) + m * b; } });
if (a === b) {
if (scoringStyle === "league") {
[...h.pairAIds, ...h.pairBIds].forEach(id => {
const p = byId(id);
if (p) p.points += m * LEAGUE_DRAW_PTS;
});
} else {
h.pairAIds.forEach(id => { const p = byId(id); if (p) p.points += m * a; });
h.pairBIds.forEach(id => { const p = byId(id); if (p) p.points += m * b; });
}
return;
}
const winIds = a > b ? h.pairAIds : h.pairBIds;
const loseIds = a > b ? h.pairBIds : h.pairAIds;
if (scoringStyle === "league") {
winIds.forEach(id => {
const p = byId(id);
if (p) {
p.wins += m;
p.points += m * LEAGUE_WIN_PTS;
}
});
loseIds.forEach(id => { const p = byId(id); if (p) p.points += m * LEAGUE_LOSS_PTS; });
} else {
winIds.forEach(id => { const p = byId(id); if (p) p.wins += m; });
h.pairAIds.forEach(id => { const p = byId(id); if (p) p.points += m * a; });
h.pairBIds.forEach(id => { const p = byId(id); if (p) p.points += m * b; });
}
}

function undoScoreCredits(h) {
if (h.scoreA === null) return;
applyScoreCredits(h, true);
}

function recomputeStatsFromHistory() {
players.forEach(p => { p.wins = 0; p.points = 0; p.pointsDiff = 0; p.rawPoints = 0; });
matchHistory.filter(h => h.scoreA !== null).forEach(h => applyScoreCredits(h, false));
}

function setScoringStyle(style) {
const next = ["points","adjpts","league","ptspergp"].includes(style) ? style : "points";
if (next === scoringStyle) return;
scoringStyle = next;
recomputeStatsFromHistory();
save();
renderLeaderboard();
renderPlayers();
}

function pairKey(idsA, idsB) {
const a = idsA.slice().sort().join("-");
const b = idsB.slice().sort().join("-");
return [a, b].sort().join("|");
}

function comparePlayerRank(a, b) {
if (ptsOf(b) !== ptsOf(a)) return ptsOf(b) - ptsOf(a);
if (b.wins !== a.wins) return b.wins - a.wins;
if (a.matches !== b.matches) return a.matches - b.matches;
return skillOf(b) - skillOf(a);
}

function rankActivePlayers(active) {
return [...active].sort(comparePlayerRank);
}

function ensureMatchmakingStatsFresh() {
if (matchmakingMode === "mexicano") recomputeStatsFromHistory();
}

// Uses the same ordering the Leaderboard tab shows, so the #rank on a court card and the
// #rank on the leaderboard can never disagree.
function getLeaderboardRankMap() {
const map = new Map();
computeLeaderboardData().ranked.forEach((p, i) => map.set(p.id, i + 1));
return map;
}
