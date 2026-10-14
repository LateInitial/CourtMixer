// CourtMixer - social reset: Reset All and Reset Data
// Moved verbatim from index.html in Phase 0 (v1.9.0). Loaded as a classic script;
// all top-level declarations share one global scope, exactly as before the split.

function doResetAll() {
players = []; matchHistory = []; editingId = null; seenPairings.clear();
courtSlots = EMPTY_SLOTS();
courtSlotManual = EMPTY_MANUAL();
courtMode = { 1:"", 2:"", 3:"", 4:"" };
saveCourts();
for (let c = 1; c <= MAX_COURTS; c++) courtRerollSeen[c].clear();
sortState = { col: null, dir: 1 };
editTableMode = false;
const _tb = document.getElementById("toolbar"); if (_tb) _tb.classList.remove("editing-mode");
const _eb = document.getElementById("editModeBtn"); if (_eb) { _eb.textContent = "Edit"; _eb.classList.remove("active-edit"); }
const _ab = document.getElementById("addPlayerBtn"); if (_ab) { _ab.textContent = "Add Player"; _ab.classList.add("primary"); _ab.classList.remove("save-btn"); }
updateDefaultButtons();
renderPlayers(); renderMatch(); renderHistory(); renderLeaderboard(); renderStats(); save();
}

function doResetSession(usingCustom) {
const base = usingCustom ? customDefaults : [];
players = base.map(p => ({ id: uid(), name: p.name, gender: (p.gender === "F" ? "F" : "M"), skill: p.skill, matches: 0, wins: 0, points: 0, priority: false, skip: false, priorityLock: false, skipLock: false, pointsDiff: 0 }));
matchHistory = [];
editingId = null;
seenPairings.clear();
courtSlots = EMPTY_SLOTS();
courtSlotManual = EMPTY_MANUAL();
courtMode = { 1:"", 2:"", 3:"", 4:"" };
saveCourts();
for (let c = 1; c <= MAX_COURTS; c++) courtRerollSeen[c].clear();
sortState = { col: null, dir: 1 };
lsDel("courtmixer_ps_hint_seen");
sessionDate = todayISO();
lsSet("courtmixer_session_date", sessionDate);
// Reset toolbar state too
const toolbar = document.getElementById("toolbar");
const addBtn = document.getElementById("addPlayerBtn");
toolbar.classList.remove("editing-mode");
addBtn.textContent = "Add Player";
addBtn.classList.add("primary");
addBtn.classList.remove("save-btn");
renderPlayers();
renderMatch();
renderHistory();
renderLeaderboard();
renderStats();
save();
}
