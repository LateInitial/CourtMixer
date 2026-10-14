// CourtMixer - social leaderboard: table, stale-session prompt, new session
// Moved verbatim from index.html in Phase 0 (v1.9.0). Loaded as a classic script;
// all top-level declarations share one global scope, exactly as before the split.

function renderLeaderboard() {
const _sdl = document.getElementById("sessionDateLabel"); if (_sdl) _sdl.textContent = fmtSessionDate(sessionDate);
if (typeof renderSessionStale === "function") renderSessionStale();
const _sni = document.getElementById("sessionNameInput"); if (_sni && document.activeElement !== _sni) _sni.value = sessionName;
document.querySelectorAll(".ranking-style-segment").forEach(btn => {
btn.classList.toggle("active", btn.dataset.scoringStyle === scoringStyle);
});
const helpIds = { points: "rankingsHelpPoints", adjpts: "rankingsHelpAdj", league: "rankingsHelpLeague", ptspergp: "rankingsHelpPtsGp" };
Object.entries(helpIds).forEach(([style, id]) => {
const el = document.getElementById(id);
if (el) el.style.display = (style === scoringStyle) ? "flex" : "none";
});
const box = document.getElementById("leaderboardTable");
if (!players.length) { box.innerHTML = '<div class="muted">No players yet.</div>'; renderFunFacts(); return; }

const lb = computeLeaderboardData();
const ranked = lb.ranked, valueFn = lb.valueFn, showStar = lb.showStar;
const maxGP = lb.maxGP, avgPPG = lb.avgPPG, ptsHeader = lb.header, maxSG = lb.maxSG, scoredOf = lb.scoredOf;

const medals = ["🥇", "🥈", "🥉"];
const rankClasses = ["top1", "top2", "top3"];

let rows = ranked.map((p, i) => {
const rankDisplay = i < 3 ? medals[i] : (i + 1);
const rankClass = i < 3 ? rankClasses[i] : "";
const missing = maxSG - scoredOf(p);
const star = (showStar && missing > 0)
? `<span title="Adjusted: +${Math.round(missing * avgPPG)} pts credited for ${missing} unplayed game(s)" style="color:#f5a623;font-weight:800;">*</span>`
: "";
return `<tr>
<td class="lb-rank ${rankClass}">${rankDisplay}</td>
<td class="lb-name"><button type="button" class="pd-open" data-pid="${p.id}">${esc(p.name)}</button>${star}</td>
<td class="lb-gp right">${p.matches}</td>
<td class="lb-wins right">${p.wins}</td>
<td class="lb-points right">${valueFn(p)}</td>
</tr>`;
}).join("");
box.innerHTML = `<table class="lb-table">
<thead><tr>
<th class="lb-rank">#</th>
<th>Name</th>
<th class="right">GP</th>
<th class="right">Won</th>
<th class="right">${ptsHeader}</th>
</tr></thead>
<tbody>${rows}</tbody>
</table>`;
renderFunFacts();
}

function renderSessionStale(){
  const box = document.getElementById("sessionStale");
  if (!box) return;
  const stale = sessionDate !== todayISO() && matchHistory.length > 0;
  if (!stale) { box.innerHTML = ""; return; }
  box.innerHTML = `<div class="session-stale"><span>This session is dated <b>${esc(fmtSessionDate(sessionDate))}</b>. Starting a new one keeps your players and clears the scores.</span><button type="button" id="newSessionBtn">Start today\u2019s session</button></div>`;
  const b = document.getElementById("newSessionBtn");
  if (b) b.onclick = () => cmxConfirm({ title: "Start a new session", yes: "Start new session", danger: true,
    message: "Keep the current players, but clear all match history, scores and games played?" },
    () => undoable("New session started", startNewSession));
}
function startNewSession(){
  matchHistory = [];
  seenPairings.clear();
  players.forEach(p => { p.matches = 0; p.wins = 0; p.points = 0; p.pointsDiff = 0; p.rawPoints = 0; p.priority = false; p.skip = false; p.priorityLock = false; p.skipLock = false; });
  courtSlots = EMPTY_SLOTS(); courtSlotManual = EMPTY_MANUAL(); courtMode = { 1:"", 2:"", 3:"", 4:"" };
  for (let c = 1; c <= MAX_COURTS; c++) courtRerollSeen[c].clear();
  sessionDate = todayISO();
  save(); saveCourts();
  updateMatchToolbar();
  renderPlayers(); renderMatch(); renderHistory(); renderLeaderboard(); renderStats();
}

// Sortable column headers were mouse-only.
