// CourtMixer - social courts: confirm, reroll, fill, constrained fill
// Moved verbatim from index.html in Phase 0 (v1.9.0). Loaded as a classic script;
// all top-level declarations share one global scope, exactly as before the split.

function doConfirmCourt(courtNum) {
const ids = courtSlots[courtNum];
if (ids.some(x => !x)) return cmxAlert("Fill all four slots before confirming this court.");
const ps = ids.map(id => byId(id));
if (ps.some(p => !p)) return cmxAlert("One of the players no longer exists \u2014 re-pick that slot.");
const a = [ps[0], ps[1]], b = [ps[2], ps[3]];
a.concat(b).forEach(p => { const pl = byId(p.id); if (pl) pl.matches += 1; });
const key = pairKey([ids[0], ids[1]], [ids[2], ids[3]]);
const repeated = seenPairings.has(key);
seenPairings.add(key);
const isMex = matchmakingMode === "mexicano";
const avgA = isMex ? (ptsOf(a[0]) + ptsOf(a[1])) / 2 : (skillOf(a[0]) + skillOf(a[1])) / 2;
const avgB = isMex ? (ptsOf(b[0]) + ptsOf(b[1])) / 2 : (skillOf(b[0]) + skillOf(b[1])) / 2;
const category = (courtMode[courtNum] === "MD" || courtMode[courtNum] === "WD" || courtMode[courtNum] === "XD") ? courtMode[courtNum] : inferCategoryFromPlayers([...a, ...b]);
matchHistory.push({
id: uid(),
time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
pairA: a.map(p => p.name),
pairB: b.map(p => p.name),
pairAIds: a.map(p => p.id),
pairBIds: b.map(p => p.id),
pairDelta: Math.abs(avgA - avgB),
repeated: repeated,
scoreA: null,
scoreB: null,
closed: false,
court: courtCount > 1 ? courtNum : null,
category: category
});
courtSlots[courtNum] = [null, null, null, null];
courtSlotManual[courtNum] = [false, false, false, false];
courtRerollSeen[courtNum].clear();
// One-game Priority/Skip expire once a game is confirmed; locked ones persist.
players.forEach(pl => {
if (pl.priority && !pl.priorityLock) pl.priority = false;
if (pl.skip && !pl.skipLock) pl.skip = false;
});
saveCourts();
save();
renderPlayers();
renderMatch();
renderHistory();
renderLeaderboard();
}

function doRerollCourt(courtNum) {
const full = courtSlots[courtNum].every(Boolean);
const res = fillCourtAction(courtNum, full);
if (res.error) return cmxAlert(`Court ${courtNum}: ${res.error}`);
if (res.noop) return cmxAlert(res.noop);
renderMatch();
}

function fillCourtAction(cn, reroll) {
ensureMatchmakingStatsFresh();
if (getLiveMatchForCourt(cn)) return { noop: "Finish the in-progress match on this court first." };
const slots = courtSlots[cn], manual = courtSlotManual[cn];
const toFill = [];
for (let i = 0; i < 4; i++) { if (reroll ? !manual[i] : !slots[i]) toFill.push(i); }
if (!toFill.length) return { noop: reroll ? "All four players are locked. Clear or change a slot to reroll." : "This court is already full." };
const fixedPositions = [0, 1, 2, 3].filter(i => !toFill.includes(i) && slots[i]);
if (!fixedPositions.length && toFill.length === 4) {
if (slots.every(Boolean)) courtRerollSeen[cn].add(pairKey([slots[0], slots[1]], [slots[2], slots[3]]));
const pick = chooseMatch({ excludeIds: buildExcludeIds(cn), courtNum: cn, genderMode: courtMode[cn] || "", avoidKeys: courtRerollSeen[cn], onCycleReset: () => courtRerollSeen[cn].clear() });
if (pick.error) return { error: pick.error };
courtSlots[cn] = [pick.a[0].id, pick.a[1].id, pick.b[0].id, pick.b[1].id];
courtSlotManual[cn] = [false, false, false, false];
saveCourts();
return { ok: true };
}
const fill = constrainedFill(cn, toFill, fixedPositions);
if (fill.error) return { error: fill.error };
toFill.forEach((pos, idx) => { courtSlots[cn][pos] = fill.ids[idx]; courtSlotManual[cn][pos] = false; });
saveCourts();
return { ok: true };
}

function constrainedFill(cn, toFill, fixedPositions) {
const slots = courtSlots[cn].slice();
const fixedIds = fixedPositions.map(i => slots[i]);
const ex = buildExcludeIds(cn);
fixedIds.forEach(id => ex.add(id));
let pool = players.filter(p => !p.skip && !ex.has(p.id));
const mode = courtMode[cn] || "";
if (mode === "MD") pool = pool.filter(p => (p.gender || "M") === "M");
if (mode === "WD") pool = pool.filter(p => (p.gender || "M") === "F");
if (pool.length < toFill.length) {
return { error: mode === "MD" ? "Not enough available male players to fill this court." : mode === "WD" ? "Not enough available female players to fill this court." : "Not enough available players to fill the remaining slots." };
}
const rot = getRotationInfo();
const lh = getLowHighRecency();
const eligFill = pool.filter(p => rot.trailing(p.id) < 2);
if (eligFill.length >= toFill.length) pool = eligFill;
const restOrdered = [...pool].sort((a, b) => (rot.restGap(b.id) - rot.restGap(a.id)) || (a.matches - b.matches) || (Math.random() - 0.5));
pool = ensureGenderMix(restOrdered.slice(0, Math.min(pool.length, 12)), restOrdered, mode);
const k = toFill.length;
const combos = [];
const rec = (pos, used, cur) => {
if (combos.length > 20000) return;
if (pos === k) { combos.push(cur.slice()); return; }
for (const p of pool) { if (used.has(p.id)) continue; used.add(p.id); cur.push(p); rec(pos + 1, used, cur); cur.pop(); used.delete(p.id); }
};
rec(0, new Set(), []);
const social = buildSocialHistory();
const isMex = matchmakingMode === "mexicano";
const gOf = (p) => (p.gender === "F") ? "F" : "M";
let bestScore = Infinity, ties = [];
for (const combo of combos) {
const pos = slots.slice();
toFill.forEach((i, idx) => { pos[i] = combo[idx].id; });
const a = [byId(pos[0]), byId(pos[1])], b = [byId(pos[2]), byId(pos[3])];
if (a.some(x => !x) || b.some(x => !x)) continue;
if (mode === "XD" && !(gOf(a[0]) !== gOf(a[1]) && gOf(b[0]) !== gOf(b[1]))) continue;
const everyone = [...a, ...b];
const avgA = isMex ? (ptsOf(a[0]) + ptsOf(a[1])) / 2 : (skillOf(a[0]) + skillOf(a[1])) / 2;
const avgB = isMex ? (ptsOf(b[0]) + ptsOf(b[1])) / 2 : (skillOf(b[0]) + skillOf(b[1])) / 2;
const pairDelta = Math.abs(avgA - avgB);
const sk = everyone.map(p => skillOf(p)); const spread = Math.max(...sk) - Math.min(...sk);
const pts = everyone.map(ptsOf); const ptsSpread = Math.max(...pts) - Math.min(...pts);
const fillGP = combo.reduce((sum, p) => sum + p.matches, 0);
const key = pairKey([pos[0], pos[1]], [pos[2], pos[3]]);
const repeated = seenPairings.has(key) ? 1 : 0;
const score = fillGP * 1200 + socialRepeatPenalty(a, b, social) + antiStackPenalty(a, b) + rotationPenalty([...a, ...b], rot) + (isMex ? 0 : lowHighPenalty(a, b, lh)) + pairDelta * (isMex ? 350 : 1400) + (isMex ? ptsSpread * 8 : spread * 5) + repeated * 1000000;
if (score < bestScore - 1e-9) { bestScore = score; ties = [combo]; }
else if (Math.abs(score - bestScore) < 1e-9) { ties.push(combo); }
}
if (!ties.length) return { error: mode === "XD" ? "Couldn't form a mixed (XD) lineup with the players you've placed." : "No valid fill found for the remaining slots." };
const chosen = ties[Math.floor(Math.random() * ties.length)];
return { ids: chosen.map(p => p.id) };
}
