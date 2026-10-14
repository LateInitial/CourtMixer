// CourtMixer - social match tab: toolbar, tags, pair grid, finish actions, player detail data
// Moved verbatim from index.html in Phase 0 (v1.9.0). Loaded as a classic script;
// all top-level declarations share one global scope, exactly as before the split.

function updateMatchToolbar() {
// The how-to text only earns its space before the first match of a session. Both resets and
// "Start today's session" clear the history, so an empty history is exactly the condition
// under which the hints should come back.
const showHints = matchHistory.length === 0;
const hint = document.getElementById("matchCourtHint");
if (hint) {
hint.style.display = showHints ? "" : "none";
hint.textContent = "Tap a slot to swap a player. Each court has its own Generate, Clear and Confirm; MD/WD/XD sets men\u2019s, women\u2019s or mixed doubles.";
}
const formatHint = document.getElementById("matchFormatHint");
if (formatHint) {
formatHint.style.display = showHints ? "" : "none";
formatHint.textContent = matchmakingMode === "mexicano"
? (courtCount === 1
? "Mexicano: balanced draws by rank and games played."
: "Mexicano: higher courts take the higher ranks; games played stays even.")
: "Americano: balanced draws by skill and games played, mixing partners all session.";
}
document.querySelectorAll(".format-segment").forEach(btn => {
btn.classList.toggle("active", btn.dataset.matchmaking === matchmakingMode);
});
document.querySelectorAll(".court-segment").forEach(btn => {
btn.classList.toggle("active", Number(btn.dataset.setCourts) === courtCount);
});
const gen = document.getElementById("generateBtn");
if (gen) {
if (courtCount === 1) gen.textContent = "Generate Next Match";
else {
const n = [];
for (let cn = 1; cn <= courtCount; cn++) if (courtNeedsLineup(cn)) n.push(cn);
if (!n.length) gen.textContent = "Generate lineups";
else if (n.length === courtCount) gen.textContent = `Generate lineups (${courtCount} courts)`;
else gen.textContent = `Generate lineup (${n.length} open)`;
}
}
}

// One line only. Of the four old tags, pair avg delta is the one that answers the question
// the app exists to answer -- are these two teams evenly matched? Games fairness gap is about
// scheduling rather than the match, and skill spread describes the group, not the balance.
// Both the pending court card and the in-progress card render through here, so what you see
// before Confirm start is exactly what you see after.
function matchTagsHtml(m) {
const isMex = matchmakingMode === "mexicano";
const deltaGood = isMex ? m.pairDelta <= 6 : m.pairDelta <= 0.8;
const deltaFmt = isMex ? m.pairDelta.toFixed(0) : m.pairDelta.toFixed(2);
return `<div class="match-tags">
<span class="tag ${deltaGood ? "good" : "warn"}">Pair avg delta: ${deltaFmt}${isMex ? " pts" : ""}</span>
<span class="tag ${m.repeated ? "warn" : "good"}">${m.repeated ? "Repeat pairing used" : "Repeat pairing avoided"}</span>
</div>`;
}

function pairSideHtml(team, ranks, scoreId, scoreLabel, scoreSub) {
const inner = `<div class="pair-player">${playerLineLabel(team[0], ranks)}</div>
<div class="pair-player">${playerLineLabel(team[1], ranks)}</div>`;
if (!scoreId) return `<div class="pair">${inner}</div>`;
return `<div class="pair has-score"><div class="pair-main">${inner}</div><input type="number" min="0" inputmode="numeric" readonly id="${scoreId}" class="pair-score score-pick" placeholder="0" aria-label="Score for ${esc(scoreLabel)}" data-team="${esc(scoreLabel)}" data-sub="${esc(scoreSub || "")}" /></div>`;
}

function pairGridHtml(m, live) {
const ranks = m.rankByPlayerId || null;
const idA = live ? `msa-${live.id}` : "";
const idB = live ? `msb-${live.id}` : "";
const labA = live ? formatPairNames(live.pairA) : "";
const labB = live ? formatPairNames(live.pairB) : "";
const sub = live && live.court ? `Court ${live.court}` : "";
return `<div class="pair-grid">
${pairSideHtml(m.a, ranks, idA, labA, sub)}
<div class="pair-vs" aria-hidden="true">VS</div>
${pairSideHtml(m.b, ranks, idB, labB, sub)}
</div>
${matchTagsHtml(m)}`;
}

function endMatchPanelHtml(h) {
return `<div class="end-match-panel">
<div class="end-match-actions">
<button type="button" class="primary small end-save-score-btn" data-hid="${h.id}">Finish &amp; save score</button>
<button type="button" class="secondary small end-no-score-btn" data-hid="${h.id}">Finish without score</button>
</div>
</div>`;
}

function finishMatchWithScore(histId) {
const h = matchHistory.find(x => x.id === histId);
if (!h || !isMatchLive(h)) return cmxAlert("This match is no longer in progress.");
const saEl = document.getElementById(`msa-${histId}`);
const sbEl = document.getElementById(`msb-${histId}`);
const sa = saEl?.value?.trim() ?? "";
const sb = sbEl?.value?.trim() ?? "";
if (sa === "" || sb === "") {
return cmxAlert("Enter both scores, or use “Finish without score”.");
}
saveScore(histId, sa, sb);
}

function finishMatchWithoutScore(histId) {
const h = matchHistory.find(x => x.id === histId);
if (!h || !isMatchLive(h)) return cmxAlert("This match is no longer in progress.");
h.closed = true;
save();
renderMatch();
renderHistory();
renderLeaderboard();
renderStats();
}

function doGenerateMatches() {
ensureMatchmakingStatsFresh();
const targets = [];
for (let cn = 1; cn <= courtCount; cn++) {
if (getLiveMatchForCourt(cn)) continue;
if (courtSlots[cn].some(x => !x)) targets.push(cn);
}
if (!targets.length) return cmxAlert("No open slots to fill. Clear a court, or finish a match first.");
for (const cn of targets) {
const res = fillCourtAction(cn, false);
if (res.error) { renderMatch(); updateMatchToolbar(); return cmxAlert(`Court ${cn}: ${res.error}`); }
}
renderMatch();
updateMatchToolbar();
document.querySelector('[data-view="matchView"]')?.click();
}

function inferCategoryFromPlayers(ps) {
const gs = ps.map(p => (p && p.gender === "F") ? "F" : "M");
if (gs.every(g => g === "M")) return "MD";
if (gs.every(g => g === "F")) return "WD";
return "XD";
}

/* ===== Player details popup (index59) ===== */
function pdEsc(s){ return esc(s); }
function computePlayerDetail(pid){
  const p = byId(pid); if (!p) return null;
  const cats = computeCategoryCounts()[pid] || { MD:0, WD:0, XD:0 };
  let won=0, lost=0, drawn=0, scored=0, conceded=0, decided=0;
  const list = [];
  matchHistory.forEach(function(h){
    const idsA = h.pairAIds || [], idsB = h.pairBIds || [];
    const inA = idsA.indexOf(pid) >= 0, inB = idsB.indexOf(pid) >= 0;
    if (!inA && !inB) return;
    const myIds = inA ? idsA : idsB, myNames = inA ? h.pairA : h.pairB;
    const oppNames = inA ? h.pairB : h.pairA;
    let partner = "";
    for (let i = 0; i < myIds.length; i++) { if (myIds[i] !== pid) partner = myNames[i]; }
    const hasScore = h.scoreA !== null && h.scoreA !== undefined;
    const mine = inA ? h.scoreA : h.scoreB, theirs = inA ? h.scoreB : h.scoreA;
    let result = "none";
    if (hasScore) {
      decided++; scored += Number(mine) || 0; conceded += Number(theirs) || 0;
      if (mine > theirs) { won++; result = "win"; }
      else if (mine < theirs) { lost++; result = "loss"; }
      else { drawn++; result = "draw"; }
    }
    let cat = h.category;
    if (cat !== "MD" && cat !== "WD" && cat !== "XD") cat = inferCategoryFromPlayers(idsA.concat(idsB).map(byId));
    list.push({ time: h.time || "", court: h.court || null, cat: cat, partner: partner, opp: formatPairNames(oppNames), mine: hasScore ? mine : null, theirs: hasScore ? theirs : null, result: result });
  });
  list.reverse();
  return { id: pid, name: p.name, gender: (p.gender === "F" ? "F" : "M"), played: p.matches,
    won: won, lost: lost, drawn: drawn, decided: decided,
    winRate: decided ? Math.round(won / decided * 100) : 0,
    scored: scored, conceded: conceded, diff: scored - conceded,
    avgFor: decided ? scored / decided : 0, avgAgainst: decided ? conceded / decided : 0,
    cats: cats, matches: list };
}
function playerDetailHtml(d){
  const unscored = d.played - d.decided;
  let h = '<div class="pd-head">' + (d.gender === "F" ? "Female" : "Male") + " · " + d.played + " game" + (d.played === 1 ? "" : "s") + "</div>";
  h += '<div class="pd-card pd-row3">'
    + "<div><b>" + d.played + "</b><span>Played</span></div>"
    + "<div><b>" + (d.decided ? d.winRate + "%" : "—") + "</b><span>Win rate</span></div>"
    + "<div><b>" + (d.diff > 0 ? "+" : "") + d.diff + "</b><span>Point diff</span></div>"
    + "</div>";
  h += '<div class="pd-card"><h4>Record</h4><div class="pd-row3">'
    + '<div><b class="pd-win">' + d.won + "</b><span>Won</span></div>"
    + '<div><b class="pd-loss">' + d.lost + "</b><span>Lost</span></div>"
    + "<div><b>" + d.drawn + "</b><span>Drawn</span></div>"
    + "</div>"
    + (unscored > 0 ? '<div class="pd-note">' + unscored + " match" + (unscored === 1 ? "" : "es") + " ended without a score.</div>" : "")
    + "</div>";
  h += '<div class="pd-card"><h4>Score statistics</h4><div class="pd-row2">'
    + '<div><b class="pd-win">' + d.scored + "</b><span>Scored</span></div>"
    + '<div><b class="pd-loss">' + d.conceded + "</b><span>Conceded</span></div>"
    + '</div><div class="pd-row2 pd-avg">'
    + "<div><b>" + (d.decided ? d.avgFor.toFixed(1) : "—") + "</b><span>Avg scored</span></div>"
    + "<div><b>" + (d.decided ? d.avgAgainst.toFixed(1) : "—") + "</b><span>Avg conceded</span></div>"
    + "</div></div>";
  h += '<div class="pd-card"><h4>Categories</h4><div class="pd-row3">'
    + "<div><b>" + d.cats.MD + "</b><span>MD</span></div>"
    + "<div><b>" + d.cats.WD + "</b><span>WD</span></div>"
    + "<div><b>" + d.cats.XD + "</b><span>XD</span></div>"
    + "</div></div>";
  h += '<div class="pd-card"><h4>Matches (' + d.matches.length + ")</h4>";
  if (!d.matches.length) h += '<div class="pd-note">No matches yet.</div>';
  d.matches.forEach(function(m, i){
    const scoreHtml = (m.mine === null)
      ? '<span class="pd-noscore">No score</span>'
      : '<span class="pd-score ' + (m.result === "win" ? "pd-win" : m.result === "loss" ? "pd-loss" : "") + '">' + m.mine + " – " + m.theirs + "</span>";
    const meta = [];
    if (m.court) meta.push("Court " + m.court);
    if (m.cat) meta.push(m.cat);
    if (m.time) meta.push(m.time);
    h += '<div class="pd-match' + (i === 0 ? " first" : "") + '"><div class="pd-match-top"><span class="pd-meta">' + pdEsc(meta.join(" · ")) + "</span>" + scoreHtml + "</div>"
      + '<div class="pd-teams">with <b>' + pdEsc(m.partner) + '</b> <span class="pd-vs">vs</span> <b>' + pdEsc(m.opp) + "</b></div></div>";
  });
  h += "</div>";
  return h;
}
