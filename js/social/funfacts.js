// CourtMixer - social Did You Know: fact catalogue, weighting, seeded selection
// Moved verbatim from index.html in Phase 0 (v1.9.0). Loaded as a classic script;
// all top-level declarations share one global scope, exactly as before the split.

function funFactsSeed() {
  const key = matchHistory
    .filter(h => h.scoreA !== null && h.scoreA !== undefined)
    .map(h => h.id + ":" + h.scoreA + ":" + h.scoreB)
    .join("|");
  return hashString(key || "empty");
}
function pickWeighted(pool, rnd) {
  const total = pool.reduce((sum, f) => sum + f.weight, 0);
  if (!pool.length || total <= 0) return null;
  let r = rnd() * total;
  for (const f of pool) { r -= f.weight; if (r <= 0) return f; }
  return pool[pool.length - 1];
}

function computeFunFacts() {
const facts = [];
const scored = matchHistory.filter(h => h.scoreA !== null);
if (!scored.length || players.length < 2) return facts;

const margin = (ms) => ms.reduce((s, h) => s + Math.abs(h.scoreA - h.scoreB), 0) / ms.length;
const matchesOf = (id) => scored.filter(h => [...h.pairAIds, ...h.pairBIds].includes(id));
const pushFact = (type, subjectIds, emoji, text, score = 50) => {
const ids = [...new Set(subjectIds)].filter(Boolean);
facts.push({ type, subjectIds: ids, emoji, text, score, kind: FACT_KIND[type] || "individual", weight: FACT_WEIGHT[type] || 1 });
};
// Returns the single highest item by val(); null if the top value is tied (no clear winner).
const uniqueTop = (arr, val) => { let best = null, bv = -Infinity, tie = false; arr.forEach(it => { const v = val(it); if (v > bv) { bv = v; best = it; tie = false; } else if (v === bv) { tie = true; } }); return tie ? null : best; };

// TIGHT_MARGINS — tightest average margin (unique)
const tight = uniqueTop(players.filter(p => matchesOf(p.id).length >= 2).map(p => ({ p, avg: margin(matchesOf(p.id)) })).filter(c => c.avg <= 4), c => -c.avg);
if (tight) pushFact("TIGHT_MARGINS", [tight.p.id], "🎯", `${nm(tight.p.name)} lives on the edge — their matches have an average margin of just <strong>${tight.avg.toFixed(1)} points</strong>. Every rally counts!`, 55 + (5 - tight.avg) * 4);

// CLUTCH — most clutch wins (unique)
const comebacks = {};
scored.forEach(h => { if (Math.abs(h.scoreA - h.scoreB) <= 3) (h.scoreA > h.scoreB ? h.pairAIds : h.pairBIds).forEach(id => comebacks[id] = (comebacks[id] || 0) + 1); });
const clutch = uniqueTop(Object.entries(comebacks).filter(([, c]) => c >= 2).map(([id, c]) => ({ id, c })), o => o.c);
if (clutch) { const p = byId(clutch.id); if (p) pushFact("CLUTCH", [p.id], "💪", `${nm(p.name)} thrives under pressure — they've won <strong>${clutch.c} nail-biting matches</strong> decided by 3 points or fewer. Clutch player!`, 60 + clutch.c * 6); }

// HIGH_WIN_RATE — unique highest
// Rates are over games that actually have a score - a match ended without one is not a loss.
const wr = uniqueTop(players.map(p => ({ p, g: matchesOf(p.id).length })).filter(o => o.g >= 2 && o.p.wins / o.g >= 0.75).map(o => ({ p: o.p, g: o.g, r: o.p.wins / o.g })), c => c.r);
if (wr) { const pct = Math.round(wr.r * 100); pushFact("HIGH_WIN_RATE", [wr.p.id], "🔥", `${nm(wr.p.name)} is on fire with a <strong>${pct}% win rate</strong> across ${wr.g} games. Unstoppable!`, 50 + pct * 0.5 + wr.g); }

// PERFECT_DUO — unbeaten pair with unique most wins
const pairStats = {};
scored.forEach(h => { const aWon = h.scoreA > h.scoreB; [{ ids: h.pairAIds.slice().sort(), won: aWon }, { ids: h.pairBIds.slice().sort(), won: !aWon }].forEach(({ ids, won }) => { const k = ids.join("|"); (pairStats[k] = pairStats[k] || { ids, wins: 0, total: 0 }); pairStats[k].total++; if (won) pairStats[k].wins++; }); });
const perfect = uniqueTop(Object.values(pairStats).filter(ps => ps.total >= 2 && ps.wins === ps.total && ps.ids.length === 2), ps => ps.wins);
if (perfect) { const names = perfect.ids.map(id => byId(id)?.name).filter(Boolean); if (names.length === 2) pushFact("PERFECT_DUO", perfect.ids, "🤝", `${nm(names[0])} & ${nm(names[1])} are an unbeaten duo — <strong>${perfect.wins} wins from ${perfect.total} matches</strong> together. Chemistry unlocked!`, 70 + perfect.wins * 6); }

// PARTNER_DIVERSITY — unique most partners
const teammates = {};
scored.forEach(h => [h.pairAIds, h.pairBIds].forEach(pr => { if (pr.length === 2) { const [a, b] = pr; (teammates[a] = teammates[a] || new Set()).add(b); (teammates[b] = teammates[b] || new Set()).add(a); } }));
const social = uniqueTop(Object.entries(teammates).filter(([, set]) => set.size >= 3).map(([id, set]) => ({ id, c: set.size })), o => o.c);
if (social) pushFact("PARTNER_DIVERSITY", [social.id], "🌟", `${nm(byId(social.id)?.name)} has partnered with <strong>${social.c} different players</strong> — the ultimate team player who gels with everyone!`, 55 + social.c * 4);

// BLOWOUT — unique biggest margin
const blow = uniqueTop(scored.map(h => ({ h, m: Math.abs(h.scoreA - h.scoreB) })).filter(o => o.m >= 8), o => o.m);
if (blow) { const h = blow.h, winIds = h.scoreA > h.scoreB ? h.pairAIds : h.pairBIds, names = winIds.map(id => byId(id)?.name).filter(Boolean); pushFact("BLOWOUT", winIds, "💥", `Biggest blowout goes to ${nm(names.join(" & "))} — they crushed it <strong>${Math.max(h.scoreA, h.scoreB)}–${Math.min(h.scoreA, h.scoreB)}</strong>! Dominant!`, 55 + blow.m * 2); }

// WIN_STREAK — unique longest
const playerResults = {};
matchHistory.forEach(h => { if (h.scoreA === null) return; const aWon = h.scoreA > h.scoreB; [...h.pairAIds, ...h.pairBIds].forEach(id => (playerResults[id] = playerResults[id] || []).push(h.pairAIds.includes(id) ? aWon : !aWon)); });
const streakTop = uniqueTop(Object.entries(playerResults).map(([id, res]) => { let st = 0, mx = 0; res.forEach(w => { st = w ? st + 1 : 0; mx = Math.max(mx, st); }); return { id, streak: mx }; }).filter(o => o.streak >= 3), o => o.streak);
if (streakTop) pushFact("WIN_STREAK", [streakTop.id], "🚀", `${nm(byId(streakTop.id)?.name)} is riding a hot streak — <strong>${streakTop.streak} wins in a row</strong>! Can anyone stop them?`, 60 + streakTop.streak * 7);


// RIVALRY — unique most-frequent pair of opponents
const rivalStats = {};
scored.forEach(h => h.pairAIds.forEach(a => h.pairBIds.forEach(b => { const k = [a, b].sort().join("|"); rivalStats[k] = (rivalStats[k] || 0) + 1; })));
const rivalTop = uniqueTop(Object.entries(rivalStats).filter(([, c]) => c >= 3).map(([k, c]) => ({ k, c })), o => o.c);
if (rivalTop) {
const [id1, id2] = rivalTop.k.split("|"), n1 = byId(id1)?.name, n2 = byId(id2)?.name;
if (n1 && n2) {
pushFact("RIVALRY", [id1, id2], "⚔️", `${nm(n1)} and ${nm(n2)} have faced each other across the net <strong>${rivalTop.c} times</strong> — the group's most compelling rivalry!`, 55 + rivalTop.c * 4);
}
}

// CLOSEST_GAME — the tightest finish of the night (credits all four players, no loser framing)
const closest = uniqueTop(scored.map(h => ({ h, m: Math.abs(h.scoreA - h.scoreB) })).filter(o => o.m >= 1 && o.m <= 3), o => -o.m);
if (closest) { const h = closest.h; pushFact("CLOSEST_GAME", [...h.pairAIds, ...h.pairBIds], "\u{1F62C}", `Tightest game of the night: ${nm(h.pairA.join(" & "))} vs ${nm(h.pairB.join(" & "))} \u2014 settled by just <strong>${closest.m} point${closest.m === 1 ? "" : "s"}</strong>!`, 62 + (4 - closest.m) * 6); }

// OPPONENT_VARIETY — unique most different opponents faced
const oppSets = {};
scored.forEach(h => h.pairAIds.forEach(a => h.pairBIds.forEach(b => {
(oppSets[a] = oppSets[a] || new Set()).add(b);
(oppSets[b] = oppSets[b] || new Set()).add(a);
})));
const oppTop = uniqueTop(Object.entries(oppSets).filter(([, set]) => set.size >= 4).map(([id, set]) => ({ id, c: set.size })), o => o.c);
if (oppTop) { const p = byId(oppTop.id); if (p) pushFact("OPPONENT_VARIETY", [p.id], "\u{1F9ED}", `${nm(p.name)} has faced <strong>${oppTop.c} different opponents</strong> \u2014 they\u2019ve taken on nearly the whole room!`, 55 + oppTop.c * 3); }

// DECISIVE — unique most wins by 10+ points
const decisiveWins = {};
scored.forEach(h => {
if (Math.abs(h.scoreA - h.scoreB) < 10) return;
(h.scoreA > h.scoreB ? h.pairAIds : h.pairBIds).forEach(id => { decisiveWins[id] = (decisiveWins[id] || 0) + 1; });
});
const decTop = uniqueTop(Object.entries(decisiveWins).filter(([, c]) => c >= 2).map(([id, c]) => ({ id, c })), o => o.c);
if (decTop) { const p = byId(decTop.id); if (p) pushFact("DECISIVE", [p.id], "\u{1F3F9}", `${nm(p.name)} closes games out \u2014 <strong>${decTop.c} wins</strong> by 10 points or more.`, 58 + decTop.c * 6); }

// EXCLUSIVE_DUO — unique (most wins among exclusive players)
const partnerCount = {};
scored.forEach(h => [h.pairAIds, h.pairBIds].forEach(ids => { if (ids.length === 2) { (partnerCount[ids[0]] = partnerCount[ids[0]] || new Set()).add(ids[1]); (partnerCount[ids[1]] = partnerCount[ids[1]] || new Set()).add(ids[0]); } }));
const exclTop = uniqueTop(players.filter(p => p.wins >= 2 && partnerCount[p.id] && partnerCount[p.id].size === 1), p => p.wins);
if (exclTop) { const partId = [...partnerCount[exclTop.id]][0], partName = byId(partId)?.name; if (partName) pushFact("EXCLUSIVE_DUO", [exclTop.id, partId], "💞", `${nm(exclTop.name)} and ${nm(partName)} have only ever partnered with each other — a loyal duo through and through!`, 60 + exclTop.wins * 5); }

// UNDEFEATED — unique (most games among undefeated)
const undefTop = uniqueTop(players.map(p => ({ p, g: matchesOf(p.id).length })).filter(o => o.g >= 3 && o.p.wins === o.g), o => o.g);
if (undefTop) pushFact("UNDEFEATED", [undefTop.p.id], "👑", `${nm(undefTop.p.name)} remains <strong>undefeated</strong> after ${undefTop.g} games. Royalty on the court!`, 85 + undefTop.g * 2);

// #1 Point-difference leader — unique
const pdTop = uniqueTop(players.filter(p => p.matches >= 2 && (p.pointsDiff || 0) >= 6), p => p.pointsDiff);
if (pdTop) pushFact("POINT_DIFF_LEADER", [pdTop.id], "📊", `${nm(pdTop.name)} owns the scoresheet with a commanding <strong>+${pdTop.pointsDiff} point difference</strong> — outscoring the room.`, 60 + Math.min(pdTop.pointsDiff, 40));

// #2 Upset of the day — unique biggest skill gap
const upTop = uniqueTop(scored.map(h => { const a = h.pairAIds.map(byId), b = h.pairBIds.map(byId); if (a.some(x => !x) || b.some(x => !x)) return null; const avgA = (skillOf(a[0]) + skillOf(a[1])) / 2, avgB = (skillOf(b[0]) + skillOf(b[1])) / 2, aWon = h.scoreA > h.scoreB; return { h, gap: aWon ? avgB - avgA : avgA - avgB, winIds: aWon ? h.pairAIds : h.pairBIds }; }).filter(o => o && o.gap >= 1.5), o => o.gap);
if (upTop) { const h = upTop.h, names = upTop.winIds.map(id => byId(id)?.name).filter(Boolean); pushFact("UPSET", upTop.winIds, "🐉", `${nm(names.join(" & "))} pulled off the upset of the day, toppling a much stronger pair <strong>${Math.max(h.scoreA, h.scoreB)}–${Math.min(h.scoreA, h.scoreB)}</strong>. Giant-killers!`, 65 + upTop.gap * 8); }

// #4 Highest-scoring match — unique highest total
const topScore = uniqueTop(scored.map(h => ({ h, total: h.scoreA + h.scoreB })).filter(o => o.total >= 30), o => o.total);
if (topScore) { const h = topScore.h; pushFact("TOP_SCORING_MATCH", [...h.pairAIds, ...h.pairBIds], "🍿", `Highest-scoring clash: ${nm(h.pairA.join(" & "))} vs ${nm(h.pairB.join(" & "))} — <strong>${topScore.total} points</strong> in one game!`, 55 + (topScore.total - 30)); }

// #5 Hot finish — unique biggest improvement
const hotTop = uniqueTop(players.map(p => { const pm = matchesOf(p.id); if (pm.length < 4) return null; const won = h => (h.pairAIds.includes(p.id) ? h.scoreA > h.scoreB : h.scoreB > h.scoreA); const half = Math.floor(pm.length / 2); const fr = pm.slice(0, half).filter(won).length / half, sa = pm.slice(half), sr = sa.filter(won).length / sa.length; return { p, imp: sr - fr }; }).filter(o => o && o.imp >= 0.34), o => o.imp);
if (hotTop) pushFact("HOT_FINISH", [hotTop.p.id], "📈", `${nm(hotTop.p.name)} caught fire late — winning far more in the back half of the night than the start.`, 62 + hotTop.imp * 30);

// #6 Most efficient scorer — unique highest points-per-game (not League)
if (scoringStyle !== "league") {
const effTop = uniqueTop(players.map(p => ({ p, g: matchesOf(p.id).length })).filter(o => o.g >= 2).map(o => ({ p: o.p, ppg: o.p.points / o.g })).filter(o => o.ppg > 0), o => o.ppg);
if (effTop) pushFact("EFFICIENT_SCORER", [effTop.p.id], "⚡", `${nm(effTop.p.name)} is the most efficient scorer, averaging <strong>${effTop.ppg.toFixed(1)} points a game</strong>.`, 58 + effTop.ppg * 0.4);
}

// #10 Lucky charm — unique highest team win rate
const teamWin = {};
scored.forEach(h => { const aWon = h.scoreA > h.scoreB; [{ ids: h.pairAIds, won: aWon }, { ids: h.pairBIds, won: !aWon }].forEach(({ ids, won }) => ids.forEach(id => { const t = (teamWin[id] = teamWin[id] || { w: 0, t: 0 }); t.t++; if (won) t.w++; })); });
const charmTop = uniqueTop(players.filter(p => teamWin[p.id] && teamWin[p.id].t >= 3).map(p => ({ p, rate: teamWin[p.id].w / teamWin[p.id].t })).filter(o => o.rate >= 0.6), o => o.rate);
if (charmTop) pushFact("LUCKY_CHARM", [charmTop.p.id], "🍀", `Pair up with ${nm(charmTop.p.name)} and you tend to win — teams with them win <strong>${Math.round(charmTop.rate * 100)}%</strong> of the time.`, 55 + charmTop.rate * 40);

// Keep the strongest instance of each type, then pick 3: one team, one individual, one
// either -- weighted, seeded on the scores, and never naming the same player twice.
const bestByType = {};
facts.forEach(f => { if (!bestByType[f.type] || f.score > bestByType[f.type].score) bestByType[f.type] = f; });
const pool = Object.values(bestByType);
const rnd = mulberry32(funFactsSeed());
const used = new Set(), chosen = [];
const available = (kind) => pool.filter(f =>
  chosen.indexOf(f) < 0 &&
  (!kind || f.kind === kind) &&
  !f.subjectIds.some(id => used.has(id)));
const take = (kind) => {
  const f = pickWeighted(available(kind), rnd);
  if (!f) return null;
  chosen.push(f);
  f.subjectIds.forEach(id => used.add(id));
  return f;
};
// A team fact is preferred but never forced: uniqueTop deliberately yields nothing when two
// results tie, since crowning one of them would be unfair to the other. Three individual
// facts is a perfectly good outcome.
take("team");
take("individual");
take(null);
// Early in a session one of the pools can be empty; fill the remaining slots rather than
// showing fewer than three facts.
while (chosen.length < 3 && take(null)) { /* keep filling */ }
// Shuffle so the team fact is not always first.
for (let i = chosen.length - 1; i > 0; i--) {
  const j = Math.floor(rnd() * (i + 1));
  const tmp = chosen[i]; chosen[i] = chosen[j]; chosen[j] = tmp;
}
return chosen.map(({ emoji, text }) => ({ emoji, text }));
}

function renderFunFacts() {
const card = document.getElementById("funFactsCard");
const list = document.getElementById("funFactsList");
const facts = computeFunFacts();
if (!facts.length) { card.style.display = "none"; return; }
card.style.display = "";
list.innerHTML = facts.map(f => `
<div style="display:flex;align-items:flex-start;gap:10px;background:#f8faff;border:1px solid #e1e9ff;border-radius:10px;padding:10px 12px;">
<span style="font-size:20px;flex-shrink:0;line-height:1.4;">${f.emoji}</span>
<span style="font-size:13px;color:#3b4e84;line-height:1.55;">${f.text}</span>
</div>`).join("");
}
