// CourtMixer - social match tab rendering: slots, court cards, renderMatch
// Moved verbatim from index.html in Phase 0 (v1.9.0). Loaded as a classic script;
// all top-level declarations share one global scope, exactly as before the split.

function optLabel(p, rankMap) {
const g = (p.gender === "F") ? "F" : "M";
const stat = matchmakingMode === "mexicano" ? `${ptsOf(p)}pts` : fmtSkill(p);
const r = rankMap && rankMap.get(p.id);
return `${r ? "#" + r + " " : ""}${esc(p.name)} \u00b7 ${g} \u00b7 ${stat} \u00b7 ${p.matches} GP`;
}

function eligibleForSlot(cn, slot) {
const busy = new Set();
matchHistory.forEach(h => { if (isMatchLive(h)) [...h.pairAIds, ...h.pairBIds].forEach(id => busy.add(id)); });
for (let c = 1; c <= courtCount; c++) {
courtSlots[c].forEach((id, i) => { if (id && !(c === cn && i === slot)) busy.add(id); });
}
return players.filter(p => !p.skip && !busy.has(p.id));
}

function slotSelectHtml(cn, idx, rankMap) {
const curId = courtSlots[cn][idx];
const cur = curId ? byId(curId) : null;
const elig = eligibleForSlot(cn, idx).filter(p => !cur || p.id !== cur.id).sort((a, b) => a.name.localeCompare(b.name));
let opts = cur
? `<option value="${cur.id}" selected>${optLabel(cur, rankMap)}</option>`
: `<option value="" selected>+ Add player</option>`;
elig.forEach(p => { opts += `<option value="${p.id}">${optLabel(p, rankMap)}</option>`; });
if (cur) opts += `<option value="__remove__">\u2715 Remove</option>`;
const lockedCls = (cur && (courtSlotManual[cn][idx] || cur.priority)) ? " slot-locked" : "";
return `<select class="slot-select ${cur ? "" : "slot-empty"}${lockedCls}" data-court="${cn}" data-slot="${idx}" aria-label="Court ${cn} player ${idx + 1}">${opts}</select>`;
}

function slotsTagsHtml(cn) {
const ids = courtSlots[cn];
const a = [byId(ids[0]), byId(ids[1])], b = [byId(ids[2]), byId(ids[3])];
if (a.some(x => !x) || b.some(x => !x)) return "";
const isMex = matchmakingMode === "mexicano";
const avgA = isMex ? (ptsOf(a[0]) + ptsOf(a[1])) / 2 : (skillOf(a[0]) + skillOf(a[1])) / 2;
const avgB = isMex ? (ptsOf(b[0]) + ptsOf(b[1])) / 2 : (skillOf(b[0]) + skillOf(b[1])) / 2;
const key = pairKey([ids[0], ids[1]], [ids[2], ids[3]]);
// Same two values doConfirmCourt freezes onto the history entry, so the tags don't change
// when the match starts.
return matchTagsHtml({ pairDelta: Math.abs(avgA - avgB), repeated: seenPairings.has(key) });
}

function courtModeChipsHtml(cn) {
const mode = courtMode[cn] || "";
const chip = (md) => `<button type="button" class="mode-chip ${mode === md ? "active" : ""}" data-court="${cn}" data-mode="${md}">${md}</button>`;
return `<span class="mode-chips">${chip("MD")}${chip("WD")}${chip("XD")}</span>`;
}

function courtActionsHtml(cn, full, filledCount) {
const confirmBtn = full ? `<button type="button" class="primary small court-confirm-btn" data-court="${cn}">Confirm start</button>` : "";
const genBtn = `<button type="button" class="secondary small court-reroll-btn" data-court="${cn}">${full ? "Reroll" : "Generate"}</button>`;
const clearBtn = filledCount > 0 ? `<button type="button" class="secondary small court-clear-btn" data-court="${cn}">Clear</button>` : "";
return `${confirmBtn}${genBtn}${clearBtn}`;
}

function courtCardHtml(cn) {
const live = getLiveMatchForCourt(cn);
if (live) {
const disp = liveMatchToDisplay(live);
return `<div class="court-card court-live"><div class="court-card-head"><span>Court ${cn}</span><span class="court-status">In progress</span></div>
${pairGridHtml(disp, live)}
${endMatchPanelHtml(live)}</div>`;
}
const slots = courtSlots[cn];
const filledCount = slots.filter(Boolean).length;
const full = filledCount === 4;
const status = full ? "Ready" : (filledCount === 0 ? "Open" : "Filling\u2026");
const rankMap = getLeaderboardRankMap();
const sl = (idx) => slotSelectHtml(cn, idx, rankMap);
return `<div class="court-card ${full ? "" : "court-empty"}">
<div class="court-card-head"><span>Court ${cn}</span>${courtModeChipsHtml(cn)}<span class="court-status">${status}</span></div>
<div class="pair-grid editable">
<div class="pair">${sl(0)}${sl(1)}</div>
<div class="pair-vs" aria-hidden="true">VS</div>
<div class="pair">${sl(2)}${sl(3)}</div>
</div>
${full ? slotsTagsHtml(cn) : ""}
<div class="court-card-actions">${courtActionsHtml(cn, full, filledCount)}</div>
</div>`;
}

function setSlotPlayer(cn, slot, val) {
if (val === "__remove__" || val === "") {
courtSlots[cn][slot] = null;
courtSlotManual[cn][slot] = false;
} else {
for (let i = 0; i < 4; i++) { if (courtSlots[cn][i] === val) { courtSlots[cn][i] = null; courtSlotManual[cn][i] = false; } }
courtSlots[cn][slot] = val;
courtSlotManual[cn][slot] = true;
}
saveCourts();
renderMatch();
}

function setCourtMode(cn, mode) {
courtMode[cn] = (courtMode[cn] === mode) ? "" : mode;
saveCourts();
renderMatch();
}

function renderMatch() {
if (matchmakingMode === "mexicano") ensureMatchmakingStatsFresh();
const box = document.getElementById("matchResult");
const blocks = [];
for (let cn = 1; cn <= courtCount; cn++) blocks.push(courtCardHtml(cn));
const gridClass = courtCount === 1 ? "courts-grid courts-1" : "courts-grid";
box.innerHTML = `<div class="${gridClass}">${blocks.join("")}</div>`;
updateMatchToolbar();
}
