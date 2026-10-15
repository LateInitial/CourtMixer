// CourtMixer - social history tab: stats bar, delete, save score, renderHistory
// Moved verbatim from index.html in Phase 0 (v1.9.0). Loaded as a classic script;
// all top-level declarations share one global scope, exactly as before the split.

function renderStats() {
const stats = document.getElementById("stats");
if (!stats) return;
// The Export/Import tools live here, so they must render even with an empty roster --
// otherwise a fresh install has no way to restore a saved session.
const tools = `<span style="margin-left:auto;display:inline-flex;gap:8px;align-items:center;flex-wrap:wrap;"><button id="histExportBtn" class="small secondary" title="Export a backup" style="padding:6px 12px;font-size:12px;">Export History</button><button id="histImportBtn" class="small secondary" title="Import a backup" style="padding:6px 12px;font-size:12px;">Import History</button>${(typeof Sync !== "undefined" && Sync.visible()) ? `<button id="histSyncBtn" class="small secondary" title="Cloud sync" style="padding:6px 12px;font-size:12px;">${esc(Sync.statusText())}</button>` : ""}${matchHistory.some(h => h.scoreA === null) ? `<button id="saveAllBtn" class="small save-btn" title="Save every score you have entered below" style="padding:6px 12px;font-size:12px;">Save Scores</button>` : ""}</span>`;
if (!players.length) {
stats.innerHTML = `<span>No players yet &mdash; add some above, or use <strong>Import History</strong> to restore a saved session.</span>${tools}`;
} else {
const most = [...players].sort((a, b) => b.matches - a.matches)[0];
const least = [...players].sort((a, b) => a.matches - b.matches)[0];
const deltas = matchHistory.map(h => Number(h.pairDelta)).filter(v => Number.isFinite(v));
const avgDelta = deltas.length ? (deltas.reduce((x, y) => x + y, 0) / deltas.length).toFixed(2) : "n/a";
stats.innerHTML = `<span>Most played: <strong>${esc(most.name)} (${most.matches})</strong> | Least played: <strong>${esc(least.name)} (${least.matches})</strong> | Avg pair delta: <strong>${avgDelta}</strong></span>${tools}`;
}
const histExp = document.getElementById("histExportBtn"); if (histExp) histExp.onclick = () => cmxExportText("session");
const histImp = document.getElementById("histImportBtn"); if (histImp) histImp.onclick = () => cmxImportText("session");
const histSync = document.getElementById("histSyncBtn"); if (histSync) histSync.onclick = () => SyncUI.open();
const saveAllBtn = document.getElementById("saveAllBtn");
if (saveAllBtn) {
saveAllBtn.onclick = () => {
const toSave = [];
matchHistory.filter(h => h.scoreA === null).forEach(h => {
const saEl = document.getElementById(`sa-${h.id}`);
const sbEl = document.getElementById(`sb-${h.id}`);
if (saEl && sbEl && saEl.value !== "" && sbEl.value !== "") toSave.push({ hid: h.id, a: saEl.value, b: sbEl.value });
});
if (!toSave.length) return cmxAlert("No scores to save. Enter scores in one or more matches first.");
// saveScore validates and reports its own problems; a draw opens a confirmation.
toSave.forEach(({ hid, a, b }) => saveScore(hid, a, b));
};
}
}

function deleteMatch(histId) {
const idx = matchHistory.findIndex(x => x.id === histId);
if (idx === -1) return;
const h = matchHistory[idx];
// Undo GP for all 4 players
[...h.pairAIds, ...h.pairBIds].forEach(id => {
const p = byId(id);
if (p) p.matches = Math.max(0, p.matches - 1);
});
if (h.scoreA !== null) undoScoreCredits(h);
const key = pairKey(h.pairAIds || [], h.pairBIds || []);
matchHistory.splice(idx, 1);
// A deleted match should stop blocking its matchup for the rest of the session.
if (!matchHistory.some(x => pairKey(x.pairAIds || [], x.pairBIds || []) === key)) seenPairings.delete(key);
save();
renderHistory();
renderLeaderboard();
renderPlayers();
renderStats();
renderMatch();
}

function saveScore(histId, scoreA, scoreB, opts) {
const h = matchHistory.find(x => x.id === histId);
if (!h) return false;
const a = parseInt(scoreA), b = parseInt(scoreB);
if (isNaN(a) || isNaN(b) || a < 0 || b < 0) {
cmxAlert("Enter valid scores (0 or more).");
return false;
}
if (a === b && !(opts && opts.skipDrawConfirm)) {
const ptsNote = scoringStyle === "league"
? "Each player will earn 1 league point."
: `Each player will earn ${a} point${a === 1 ? "" : "s"} (their pair's score).`;
cmxConfirm({ title: "Save a draw?", yes: "Save draw",
message: `This match is a draw (${a}–${b}).\n\n${ptsNote}` }, () => saveScore(histId, a, b, { skipDrawConfirm: true }));
return false;
}
if (h.scoreA !== null) undoScoreCredits(h);
h.scoreA = a;
h.scoreB = b;
h.closed = false;
applyScoreCredits(h, false);
save();
renderHistory();
renderLeaderboard();
renderPlayers();
renderMatch();
return true;
}

function renderHistory() {
const list = document.getElementById("historyList");
list.innerHTML = "";
[...matchHistory].reverse().forEach(h => {
const hasScore = h.scoreA !== null;
const endedNoScore = h.closed && !hasScore;
const isDraw = hasScore && h.scoreA === h.scoreB;
const aWon = hasScore && h.scoreA > h.scoreB;
const item = document.createElement("div");
item.className = "history-item " + (hasScore ? "scored" : "unscored");

const teamA = formatPairNames(h.pairA);
const teamB = formatPairNames(h.pairB);

const drawBadge = (hasScore && isDraw) ? `<span class="draw-badge">Draw</span>` : "";

item.innerHTML = `
${hasScore ? `<div class="hist-scored">
<div class="hist-sline"><span class="hist-tname ${isDraw ? "" : aWon ? "win" : "lose"}">${esc(teamA)}</span><input type="number" min="0" readonly id="hla-${h.id}" title="Tap to change this score" class="hist-snum ${isDraw ? "" : aWon ? "win" : "lose"} score-pick score-live" data-hid="${h.id}" data-side="a" value="${h.scoreA}" data-team="${esc(teamA)}" data-sub="${h.court ? `Court ${h.court}` : ""}" /></div>
<div class="hist-sline"><span class="hist-tname ${isDraw ? "" : !aWon ? "win" : "lose"}">${esc(teamB)}</span><input type="number" min="0" readonly id="hlb-${h.id}" title="Tap to change this score" class="hist-snum ${isDraw ? "" : !aWon ? "win" : "lose"} score-pick score-live" data-hid="${h.id}" data-side="b" value="${h.scoreB}" data-team="${esc(teamB)}" data-sub="${h.court ? `Court ${h.court}` : ""}" /></div>
<div class="score-commit"><span class="score-commit-note">Edited &mdash; not saved yet</span><button type="button" class="score-save-btn" data-commit="${h.id}">Save</button><button type="button" class="score-revert-btn" data-revert="${h.id}">Revert</button></div>
</div>` : ""}
<div class="history-meta">
<div class="hist-meta-tags">
<span class="tag ${h.repeated ? "warn" : "good"}">${h.repeated ? "Repeat" : "Unique"}</span>
${endedNoScore ? `<span class="tag warn">Ended · no score</span>` : ""}
${drawBadge}
${h.court ? `<span class="tag hist-court-tag">Court ${h.court}</span>` : ""}
<span class="hist-time">${h.time}</span>
</div>
<button class="hist-del-btn" data-hid="${h.id}" title="Delete this match">Del</button>
</div>
${hasScore ? "" : `<div class="score-entry" id="se-${h.id}">
<div class="score-line"><span class="score-names">${esc(teamA)}</span><input type="number" min="0" readonly id="sa-${h.id}" class="score-pick" value="${h.scoreA ?? ""}" placeholder="0" data-team="${esc(teamA)}" data-sub="${h.court ? `Court ${h.court}` : ""}" /></div>
<div class="score-line"><span class="score-names">${esc(teamB)}</span><input type="number" min="0" readonly id="sb-${h.id}" class="score-pick" value="${h.scoreB ?? ""}" placeholder="0" data-team="${esc(teamB)}" data-sub="${h.court ? `Court ${h.court}` : ""}" /></div>
<div class="score-actions"><button class="score-save-btn" data-hid="${h.id}">Save</button></div>
</div>`}
`;
list.appendChild(item);
});

// Bind score save buttons (new scores)
document.querySelectorAll(".score-save-btn[data-hid]").forEach(btn => {
btn.onclick = () => {
const hid = btn.dataset.hid;
saveScore(hid, document.getElementById(`sa-${hid}`).value, document.getElementById(`sb-${hid}`).value);
};
});
// Bind commit / revert for edits to an already-saved score
document.querySelectorAll("[data-commit]").forEach(btn => {
btn.onclick = () => {
const hid = btn.dataset.commit;
const a = document.getElementById(`hla-${hid}`), b = document.getElementById(`hlb-${hid}`);
if (a && b) saveScore(hid, a.value, b.value);
};
});
document.querySelectorAll("[data-revert]").forEach(btn => { btn.onclick = () => renderHistory(); });
// Bind del buttons
document.querySelectorAll(".hist-del-btn").forEach(btn => {
btn.onclick = () => {
const hid = btn.dataset.hid;
cmxConfirm({ title: "Delete match", yes: "Delete", danger: true,
message: "Delete this match?\n\nGames played and any scores will be adjusted for all four players." },
() => undoable("Match deleted", () => deleteMatch(hid)));
};
});

renderStats();
renderMatchStats();
}

/* ===== Did You Know =====
   Every fact is positive: nobody is named for losing, and no fact reports a poor record.
   Selection guarantees one team fact and one individual fact, never repeats a name across
   the three, and weights the rarer/more striking facts higher. The roll is seeded on the
   scores themselves, so the three facts hold still while you browse and only change when a
   score is saved, edited or deleted -- and a shared leaderboard shows the same three. */
const FACT_KIND = {
  TIGHT_MARGINS: "individual", CLUTCH: "individual", HIGH_WIN_RATE: "individual",
  PARTNER_DIVERSITY: "individual", WIN_STREAK: "individual", UNDEFEATED: "individual",
  POINT_DIFF_LEADER: "individual", HOT_FINISH: "individual", EFFICIENT_SCORER: "individual",
  LUCKY_CHARM: "individual",
  OPPONENT_VARIETY: "individual", DECISIVE: "individual",
  PERFECT_DUO: "team", EXCLUSIVE_DUO: "team", RIVALRY: "team",
  BLOWOUT: "team", UPSET: "team", TOP_SCORING_MATCH: "team", CLOSEST_GAME: "team"
};
// Tier A 2 (rare and striking) / Tier B 1.5 / Tier C 1 (steady statistical ones).
const FACT_WEIGHT = {
  WIN_STREAK: 2, UNDEFEATED: 2, PERFECT_DUO: 2, EXCLUSIVE_DUO: 2, UPSET: 2, CLOSEST_GAME: 2,
  CLUTCH: 1.5, HIGH_WIN_RATE: 1.5, HOT_FINISH: 1.5, LUCKY_CHARM: 1.5,
  RIVALRY: 1.5, BLOWOUT: 1.5, TOP_SCORING_MATCH: 1.5, DECISIVE: 1.5,
  TIGHT_MARGINS: 1, PARTNER_DIVERSITY: 1, POINT_DIFF_LEADER: 1, EFFICIENT_SCORER: 1,
  OPPONENT_VARIETY: 1
};
