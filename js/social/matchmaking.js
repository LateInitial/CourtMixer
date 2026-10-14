// CourtMixer - social matchmaking: pools, penalties, chooseMatch
// Moved verbatim from index.html in Phase 0 (v1.9.0). Loaded as a classic script;
// all top-level declarations share one global scope, exactly as before the split.

function formatPairNames(names) {
return names.join(" · ");
}

function playerLineLabel(p, rankByPlayerId) {
const rank = rankByPlayerId && rankByPlayerId[p.id];
const prefix = rank ? `#${rank} ` : "";
const g = (p.gender === "F") ? "F" : "M";
const stat = matchmakingMode === "mexicano" ? `${ptsOf(p)} pts` : fmtSkill(p);
return `${prefix}${esc(p.name)} · ${g} · ${stat} · ${p.matches} GP`;
}

// A pool capped by games-played/rest can end up single-gender, which makes an XD court
// fail even when the roster has plenty of both. Top the pool up so XD is always formable.
function ensureGenderMix(pool, ordered, genderMode) {
  if (genderMode !== "XD") return pool;
  const g = (p) => (p.gender === "F") ? "F" : "M";
  const out = pool.slice();
  ["M", "F"].forEach(want => {
    let have = out.filter(p => g(p) === want).length;
    for (const p of ordered) {
      if (have >= 2) break;
      if (g(p) !== want || out.some(x => x.id === p.id)) continue;
      out.push(p); have++;
    }
  });
  return out;
}
function buildMexicanoPool(active, courtNum, genderMode) {
const sorted = rankActivePlayers(active);
const n = sorted.length;
if (n <= 4) return sorted;
const band = getMexicanoBandForCourt(courtNum);
const centerIdx = Math.round((n - 1) * band.center);
const halfIdx = Math.max(2, Math.ceil((n - 1) * band.halfWidth));
const lo = Math.max(0, centerIdx - halfIdx);
const hi = Math.min(n - 1, centerIdx + halfIdx);
const mid = Math.ceil(n / 2);
const minGp = Math.min(...active.map(p => p.matches));
const byGp = [...active].sort((a, b) => a.matches - b.matches || comparePlayerRank(a, b));
const poolMap = new Map();
const add = (p) => poolMap.set(p.id, p);
const rankIdx = (p) => sorted.findIndex(x => x.id === p.id);
if (courtCount === 1) {
byGp.slice(0, Math.min(n, 12)).forEach(add);
sorted.slice(Math.max(0, mid - 3), Math.min(n, mid + 3)).forEach(add);
active.forEach(p => { if (poolMap.size < Math.min(n, 10)) add(p); });
return ensureGenderMix([...poolMap.values()], sorted, genderMode);
}
byGp.filter(p => p.matches <= minGp + 1).forEach(p => {
const idx = rankIdx(p);
if (!gpAllowedOnCourt(playerRankRatio(idx, n), courtNum)) return;
add(p);
});
sorted.slice(lo, hi + 1).forEach(add);
if (courtCount >= 3) sorted.slice(Math.max(0, mid - 3), Math.min(n, mid + 3)).forEach(add);
byGp.forEach(p => {
if (poolMap.size >= Math.min(12, n)) return;
const idx = rankIdx(p);
const r = playerRankRatio(idx, n);
if (!gpAllowedOnCourt(r, courtNum) && p.matches > minGp + 1) return;
add(p);
});
active.forEach(p => { if (poolMap.size < Math.max(8, Math.min(n, 10))) add(p); });
return ensureGenderMix([...poolMap.values()], sorted, genderMode);
}

function mexicanoMatchBalancePenalty(a, b, everyone, priorities) {
if (priorities.length && priorities.some(pr => everyone.some(p => p.id === pr.id))) return 0;
const avgA = (ptsOf(a[0]) + ptsOf(a[1])) / 2;
const avgB = (ptsOf(b[0]) + ptsOf(b[1])) / 2;
const pairDelta = Math.abs(avgA - avgB);
const byPts = [...everyone].sort((x, y) => ptsOf(x) - ptsOf(y));
const idealDelta = Math.abs((ptsOf(byPts[0]) + ptsOf(byPts[3])) / 2 - (ptsOf(byPts[1]) + ptsOf(byPts[2])) / 2);
let pen = Math.max(0, pairDelta - idealDelta) * 1500;
if (pairDelta > 10) pen += (pairDelta - 10) * 1200;
const lowIds = new Set([byPts[0].id, byPts[1].id]);
const stackWeak = (lowIds.has(a[0].id) && lowIds.has(a[1].id)) || (lowIds.has(b[0].id) && lowIds.has(b[1].id));
if (stackWeak) pen += 20000;
const highIds = new Set([byPts[2].id, byPts[3].id]);
const stackStrong = (highIds.has(a[0].id) && highIds.has(a[1].id)) || (highIds.has(b[0].id) && highIds.has(b[1].id));
if (stackStrong && stackWeak) pen += 8000;
return pen;
}

function mexicanoQuartetPenalty(everyone, sorted, priorities) {
if (priorities.length && priorities.some(pr => everyone.some(p => p.id === pr.id))) return 0;
const pts = everyone.map(ptsOf);
const ptsSpread = Math.max(...pts) - Math.min(...pts);
let pen = 0;
if (ptsSpread > 18) pen += (ptsSpread - 18) * 500;
const n = sorted.length;
const bottomStart = Math.floor((n * 2) / 3);
const lowInMatch = everyone.filter(p => sorted.findIndex(x => x.id === p.id) >= bottomStart).length;
if (lowInMatch >= 2) {
const highsAvailable = sorted.slice(0, bottomStart).filter(p => !everyone.some(e => e.id === p.id));
if (highsAvailable.length >= 2) pen += 6000;
}
return pen;
}

function mexicanoGpPenalty(everyone, active) {
const minGp = Math.min(...active.map(p => p.matches));
let pen = 0;
everyone.forEach(p => {
pen += Math.max(0, p.matches - minGp) * 1400;
});
const atMin = everyone.filter(p => p.matches === minGp).length;
const availableAtMin = active.filter(p => p.matches === minGp).length;
if (availableAtMin >= 1 && atMin < Math.min(4, availableAtMin)) {
pen += (Math.min(4, availableAtMin) - atMin) * 3500;
}
return pen;
}

function mexicanoCourtFitPenalty(everyone, sorted, courtNum) {
if (matchmakingMode !== "mexicano") return 0;
const band = getMexicanoBandForCourt(courtNum);
const n = sorted.length;
let pen = 0;
everyone.forEach(p => {
const idx = sorted.findIndex(x => x.id === p.id);
if (idx < 0) return;
const r = playerRankRatio(idx, n);
const dist = Math.abs(r - band.center);
if (dist > band.halfWidth) pen += Math.floor((dist - band.halfWidth) * 4200);
});
return pen;
}


// Cumulative mixing: penalise repeated partners/opponents across the WHOLE session,
// weighted by how many times and how recently. Strongly favours fresh matchups.
function buildSocialHistory() {
const partnerCount = {}, oppCount = {}, partnerLast = {}, oppLast = {};
const k = (x, y) => x < y ? x + "|" + y : y + "|" + x;
const valid = matchHistory.filter(h => h.pairAIds && h.pairAIds.length === 2 && h.pairBIds && h.pairBIds.length === 2);
valid.forEach((h, i) => {
const pkA = k(h.pairAIds[0], h.pairAIds[1]), pkB = k(h.pairBIds[0], h.pairBIds[1]);
partnerCount[pkA] = (partnerCount[pkA] || 0) + 1; partnerLast[pkA] = i;
partnerCount[pkB] = (partnerCount[pkB] || 0) + 1; partnerLast[pkB] = i;
h.pairAIds.forEach(x => h.pairBIds.forEach(y => { const ok = k(x, y); oppCount[ok] = (oppCount[ok] || 0) + 1; oppLast[ok] = i; }));
});
return { partnerCount, oppCount, partnerLast, oppLast, n: valid.length, k };
}
function socialRepeatPenalty(a, b, social) {
const n = social.n, k = social.k;
let pen = 0;
const rec = (last) => { const g = n - 1 - last; return g <= 0 ? 2.2 : g === 1 ? 1.7 : g === 2 ? 1.35 : g <= 4 ? 1.15 : 1.0; };
const partnerPen = (x, y) => { const key = k(x, y), c = social.partnerCount[key] || 0; return c ? c * REPEAT_PARTNER_BASE * rec(social.partnerLast[key]) : 0; };
pen += partnerPen(a[0].id, a[1].id) + partnerPen(b[0].id, b[1].id);
const oppPen = (x, y) => { const key = k(x, y), c = social.oppCount[key] || 0; return c ? c * REPEAT_OPPONENT_BASE * rec(social.oppLast[key]) : 0; };
a.forEach(x => b.forEach(y => { pen += oppPen(x.id, y.id); }));
return pen;
}

// Fair teams must beat stacked teams (two weakest vs two strongest) every time.
// Applies in BOTH formats and is NOT waived by priority (softened override).
const ANTI_STACK_PENALTY = 60000;
function antiStackPenalty(a, b) {
const usePts = matchmakingMode === "mexicano";
const val = (p) => usePts ? ptsOf(p) : skillOf(p);
const four = [...a, ...b].slice().sort((x, y) => val(x) - val(y));
if (val(four[1]) === val(four[2])) return 0; // no clear low/high boundary
const lowSet = new Set([four[0].id, four[1].id]);
const aBothLow = lowSet.has(a[0].id) && lowSet.has(a[1].id);
const bBothLow = lowSet.has(b[0].id) && lowSet.has(b[1].id);
return (aBothLow || bBothLow) ? ANTI_STACK_PENALTY : 0;
}

// Americano: strongly favour including the least-played players (keep game counts level).
function gpFairnessPenalty(everyone, active) {
const minGp = Math.min(...active.map(p => p.matches));
let pen = 0;
everyone.forEach(p => { pen += Math.max(0, p.matches - minGp) * 1200; });
return pen;
}

// Per player: how many of their games since they last CARRIED a low-high pairing (as the stronger half).
function getLowHighRecency() {
const LH_GAP = 3;
const games = {};
matchHistory.forEach(h => {
if (!h.pairAIds || h.pairAIds.length < 2 || !h.pairBIds || h.pairBIds.length < 2) return;
[h.pairAIds, h.pairBIds].forEach(team => {
const p0 = byId(team[0]), p1 = byId(team[1]);
let isLH = false, hiId = null;
if (p0 && p1) { isLH = Math.abs(skillOf(p0) - skillOf(p1)) > LH_GAP; hiId = skillOf(p0) >= skillOf(p1) ? p0.id : p1.id; }
team.forEach(id => { (games[id] = games[id] || []).push(isLH && id === hiId); });
});
});
const gamesSince = (id) => {
const arr = games[id];
if (!arr || !arr.length) return Infinity;
for (let i = arr.length - 1; i >= 0; i--) if (arr[i]) return (arr.length - 1) - i;
return Infinity;
};
return { gamesSince };
}

// Prefer similar-skill partners; low-high teams only when needed, and don't make one strong
// player carry low-high duty back-to-back (spread it across the strong players).
function lowHighPenalty(a, b, lhInfo) {
const T = 2, LH_GAP = 3, W_INTRA = 300;
let pen = 0;
[a, b].forEach(team => {
const gap = Math.abs(skillOf(team[0]) - skillOf(team[1]));
pen += Math.max(0, gap - T) * W_INTRA;
if (gap > LH_GAP) {
const hi = skillOf(team[0]) >= skillOf(team[1]) ? team[0] : team[1];
const k = lhInfo.gamesSince(hi.id);
if (k <= 1) pen += 3000;
else if (k === 2) pen += 800;
}
});
return pen;
}

// Rounds are reconstructed from history: a new round starts when a court is reused.
function getRotationInfo() {
const valid = matchHistory.filter(h => h.pairAIds && h.pairAIds.length === 2 && h.pairBIds && h.pairBIds.length === 2);
let curRound = 0; const used = new Set(); const roundOf = [];
valid.forEach(h => { const court = h.court || 1; if (curRound === 0 || used.has(court)) { curRound++; used.clear(); } used.add(court); roundOf.push(curRound); });
const currentRound = curRound;
const playedSet = {}, lastRoundPlayed = {};
valid.forEach((h, i) => { [...h.pairAIds, ...h.pairBIds].forEach(id => { (playedSet[id] = playedSet[id] || new Set()).add(roundOf[i]); lastRoundPlayed[id] = Math.max(lastRoundPlayed[id] || 0, roundOf[i]); }); });
const lastRoundPlayers = new Set(); const lastPartner = {};
valid.forEach((h, i) => { if (roundOf[i] !== currentRound) return; [...h.pairAIds, ...h.pairBIds].forEach(id => lastRoundPlayers.add(id)); lastPartner[h.pairAIds[0]] = h.pairAIds[1]; lastPartner[h.pairAIds[1]] = h.pairAIds[0]; lastPartner[h.pairBIds[0]] = h.pairBIds[1]; lastPartner[h.pairBIds[1]] = h.pairBIds[0]; });
const trailing = (id) => { const set = playedSet[id]; if (!set) return 0; let c = 0, r = currentRound; while (set.has(r)) { c++; r--; } return c; };
const restGap = (id) => (currentRound + 1) - (lastRoundPlayed[id] || 0);
return { currentRound, lastRoundPlayers, lastPartner, trailing, restGap };
}

// Rest priority + carryover rules. Not waived for priority players (they're excluded from the carryover count instead).
const REST_FULL_ROUNDS = 4, REST_WEIGHT = 1200;
function rotationPenalty(everyone, rotation) {
let pen = 0;
everyone.forEach(p => { pen += Math.max(0, REST_FULL_ROUNDS - rotation.restGap(p.id)) * REST_WEIGHT; });
const reps = everyone.filter(p => rotation.lastRoundPlayers.has(p.id) && !p.priority);
if (reps.length === 2) pen += 4000;           // 2 carryovers: allowed, not preferred
if (reps.length >= 3) pen += (reps.length - 1) * 12000; // 3+ carryovers: avoid
for (let i = 0; i < reps.length; i++) for (let j = i + 1; j < reps.length; j++) {
if (rotation.lastPartner[reps[i].id] === reps[j].id) pen += 200000; // both of a last-round pair: near-forbidden
}
return pen;
}

function buildAmericanoPool(active, priorities, rotation, genderMode) {
// Most-rested / least-played first, capped to bound the combination search on big groups.
const AMERICANO_POOL_CAP = 14;
const sorted = [...active].sort((a, b) =>
(a.matches - b.matches) || (rotation.restGap(b.id) - rotation.restGap(a.id)) || (Math.random() - 0.5));
let pool = sorted.slice(0, Math.min(active.length, AMERICANO_POOL_CAP));
if (priorities.length) { const ids = new Set(pool.map(p => p.id)); priorities.forEach(pr => { if (!ids.has(pr.id)) pool.push(pr); }); }
return ensureGenderMix(pool, sorted, genderMode);
}

function allLineups(pool) {
const out = [];
for (let i = 0; i < pool.length - 3; i++) {
for (let j = i + 1; j < pool.length - 2; j++) {
for (let k = j + 1; k < pool.length - 1; k++) {
for (let m = k + 1; m < pool.length; m++) {
const four = [pool[i], pool[j], pool[k], pool[m]];
const splitA = [four[0], four[1]];
const splitB = [four[2], four[3]];
const splitC = [four[0], four[2]];
const splitD = [four[1], four[3]];
const splitE = [four[0], four[3]];
const splitF = [four[1], four[2]];
out.push([splitA, splitB], [splitC, splitD], [splitE, splitF]);
}
}
}
}
return out;
}

function getLiveMatchForCourt(cn) {
// Matches recorded while on a single court carry court:null - treat those as Court 1.
return matchHistory.find(h => isMatchLive(h) && (h.court || 1) === cn) || null;
}

function courtNeedsLineup(cn) {
if (courtSlots[cn].some(Boolean)) return false;
if (getLiveMatchForCourt(cn)) return false;
return true;
}

function idsFromInProgressMatches(excludeCourt) {
const ids = new Set();
matchHistory.forEach(h => {
if (!isMatchLive(h)) return;
if (courtCount > 1 && excludeCourt != null && h.court === excludeCourt) return;
[...h.pairAIds, ...h.pairBIds].forEach(id => ids.add(id));
});
return ids;
}

function buildExcludeIds(forCourt) {
const ex = new Set(idsFromInProgressMatches(forCourt));
for (let c = 1; c <= courtCount; c++) {
if (c !== forCourt) idsFromPendingCourt(c).forEach(id => ex.add(id));
}
return ex;
}

function liveMatchToDisplay(h) {
ensureMatchmakingStatsFresh();
const a = h.pairAIds.map(id => byId(id)).filter(Boolean);
const b = h.pairBIds.map(id => byId(id)).filter(Boolean);
if (a.length !== 2 || b.length !== 2) return null;
const isMex = matchmakingMode === "mexicano";
const avgA = isMex ? (ptsOf(a[0]) + ptsOf(a[1])) / 2 : (skillOf(a[0]) + skillOf(a[1])) / 2;
const avgB = isMex ? (ptsOf(b[0]) + ptsOf(b[1])) / 2 : (skillOf(b[0]) + skillOf(b[1])) / 2;
const allSkills = [...a, ...b].map(p => skillOf(p));
const allPts = [...a, ...b].map(ptsOf);
const rankByPlayerId = {};
getLeaderboardRankMap().forEach((rank, id) => { rankByPlayerId[id] = rank; });
return {
a, b, avgA, avgB,
spread: Math.max(...allSkills) - Math.min(...allSkills),
ptsSpread: Math.max(...allPts) - Math.min(...allPts),
pairDelta: h.pairDelta ?? Math.abs(avgA - avgB),
fairnessGap: 0,
repeated: Boolean(h.repeated),
live: true,
rankByPlayerId
};
}

function chooseMatch(opts) {
const ex = opts && opts.excludeIds instanceof Set ? opts.excludeIds : new Set((opts && opts.excludeIds) || []);
const avoidKeys = opts && opts.avoidKeys instanceof Set ? opts.avoidKeys : new Set();
const courtNum = opts && typeof opts.courtNum === "number" ? opts.courtNum : 1;
let active = players.filter(p => !p.skip && !ex.has(p.id));
const genderMode = opts && opts.genderMode ? opts.genderMode : "";
if (genderMode === "MD") {
active = active.filter(p => (p.gender || "M") === "M");
if (active.length < 4) return { error: "Men's doubles (MD) needs at least 4 available male players." };
} else if (genderMode === "WD") {
active = active.filter(p => (p.gender || "M") === "F");
if (active.length < 4) return { error: "Women's doubles (WD) needs at least 4 available female players." };
} else if (genderMode === "XD") {
const nm = active.filter(p => (p.gender || "M") === "M").length;
const nf = active.filter(p => (p.gender || "M") === "F").length;
if (nm < 2 || nf < 2) return { error: "Mixed doubles (XD) needs at least 2 male and 2 female available players." };
}
if (active.length < 4) return { error: "Need at least 4 available active players (not skipped, not on another court, and not in a match still in progress)." };
const rotation = getRotationInfo();
const lhInfo = getLowHighRecency();
const blocked3 = active.filter(p => rotation.trailing(p.id) >= 2 && !p.priority);
if (blocked3.length) {
const elig = active.filter(p => !blocked3.includes(p));
if (elig.length >= 4) active = elig; // never a 3rd straight round unless it drops us below 4
}
const priorities = active.filter(p => p.priority);
if (priorities.length > MAX_PRIORITY_PLAYERS) {
return { error: `At most ${MAX_PRIORITY_PLAYERS} priority players can be active at once.` };
}
if (priorities.length === 4) {
const missing = priorities.filter(pr => ex.has(pr.id));
if (missing.length) return { error: "All 4 priority players must be available — someone is on another court or still playing." };
}
const sortedActive = rankActivePlayers(active);
let candidatePool;
if (priorities.length === 4) {
candidatePool = priorities.slice();
} else if (matchmakingMode === "mexicano") {
candidatePool = buildMexicanoPool(active, courtNum, genderMode);
if (priorities.length) candidatePool = [...new Map([...candidatePool, ...priorities].map(p => [p.id, p])).values()];
if (candidatePool.length < 4) candidatePool = active.slice();
} else {
candidatePool = buildAmericanoPool(active, priorities, rotation, genderMode);
}
let lineups = allLineups(candidatePool);
if (genderMode === "XD") {
const gg = (p) => (p.gender || "M");
lineups = lineups.filter(([la, lb]) => gg(la[0]) !== gg(la[1]) && gg(lb[0]) !== gg(lb[1]));
}
if (!lineups.length) return { error: genderMode === "XD" ? "Couldn't form a mixed (XD) lineup from the available players." : "No valid lineup found." };
const social = buildSocialHistory();
const candidates = [];
const isMex = matchmakingMode === "mexicano";
const maxGapStart = isMex ? 0 : 3;
const maxGapEnd = isMex ? 2 : active.length;
const fairnessWeight = isMex ? 12000 : 1000;
// Widening ladder for the acceptable games-played gap. The final Infinity rung matters:
// a late joiner (or a long session) can push the real GP spread past active.length, and
// without it every lineup gets filtered out and matchmaking fails with "no valid lineup"
// even though a perfectly good match exists. The gap is still penalised by fairnessWeight,
// so this only ever relaxes a hard filter, never the preference ordering.
const gapLadder = [];
for (let g = maxGapStart; g <= maxGapEnd; g++) gapLadder.push(g);
gapLadder.push(Infinity);
for (const maxGap of gapLadder) {
for (const [a, b] of lineups) {
const everyone = [...a, ...b];
if (priorities.length && !priorities.every(pr => everyone.some(p => p.id === pr.id))) continue;
const projected = players.map(p => ({ ...p }));
for (const p of everyone) {
const o = projected.find(x => x.id === p.id);
if (o) o.matches += 1;
}
const activeProjected = projected.filter(p => !p.skip);
const maxGames = Math.max(...activeProjected.map(p => p.matches));
const minGames = Math.min(...activeProjected.map(p => p.matches));
const fairnessGap = maxGames - minGames;
if (fairnessGap > maxGap) continue;
const gpSpread = Math.max(...everyone.map(p => p.matches)) - Math.min(...everyone.map(p => p.matches));
const allSkills = everyone.map(p => skillOf(p));
const spread = Math.max(...allSkills) - Math.min(...allSkills);
const allPts = everyone.map(ptsOf);
const ptsSpread = Math.max(...allPts) - Math.min(...allPts);
const avgA = isMex ? (ptsOf(a[0]) + ptsOf(a[1])) / 2 : (skillOf(a[0]) + skillOf(a[1])) / 2;
const avgB = isMex ? (ptsOf(b[0]) + ptsOf(b[1])) / 2 : (skillOf(b[0]) + skillOf(b[1])) / 2;
const pairDelta = Math.abs(avgA - avgB);
const key = pairKey(a.map(p => p.id), b.map(p => p.id));
const repeated = seenPairings.has(key) ? 1 : 0;
const score =
fairnessGap * fairnessWeight +
(isMex
? mexicanoGpPenalty(everyone, active) +
gpSpread * 1800 +
mexicanoQuartetPenalty(everyone, sortedActive, priorities) +
mexicanoMatchBalancePenalty(a, b, everyone, priorities) +
mexicanoCourtFitPenalty(everyone, sortedActive, courtNum)
: gpFairnessPenalty(everyone, active) + lowHighPenalty(a, b, lhInfo)) +
socialRepeatPenalty(a, b, social) +
antiStackPenalty(a, b) +
rotationPenalty(everyone, rotation) +
spread * (isMex ? 8 : 5) +
pairDelta * (isMex ? 350 : 1400) +
repeated * 1000000;
candidates.push({ a, b, avgA, avgB, spread, ptsSpread, pairDelta, fairnessGap, repeated, key, score });
}
if (candidates.length) break;
}
if (!candidates.length) return { error: "No valid lineup found. Add more players or adjust skip toggles." };
let pool = candidates.filter(c => !avoidKeys.has(c.key));
let cycleReset = false;
if (!pool.length) {
pool = candidates;
cycleReset = true;
if (opts && typeof opts.onCycleReset === "function") opts.onCycleReset();
}
if (cycleReset) {
const pick = pool[Math.floor(Math.random() * pool.length)];
return { ...pick, cycleReset: true };
}
pool.sort((x, y) => x.score - y.score);
const tieBand = pool.filter(c => c.score === pool[0].score);
return tieBand[Math.floor(Math.random() * tieBand.length)];
}

function idsFromPendingCourt(c) {
return new Set(courtSlots[c].filter(Boolean));
}

function setMatchmakingMode(mode) {
const next = mode === "mexicano" ? "mexicano" : "americano";
if (next === matchmakingMode) return;
matchmakingMode = next;
save();
updateMatchToolbar();
}
