// CourtMixer - social players tab: edit mode, sorting, priority/skip, rendering
// Moved verbatim from index.html in Phase 0 (v1.9.0). Loaded as a classic script;
// all top-level declarations share one global scope, exactly as before the split.

function setEditMode(id) {
editingId = id;
const toolbar = document.getElementById("toolbar");
const nameInput = document.getElementById("nameInput");
const skillInput = document.getElementById("skillInput");
const addBtn = document.getElementById("addPlayerBtn");

if (id) {
const p = byId(id);
nameInput.value = p.name;
skillInput.value = isUnrated(p) ? "U" : Number(p.skill).toFixed(1);
setGenderUI(p.gender || "M");
nameInput.focus();
toolbar.classList.add("editing-mode");
addBtn.textContent = "Save Changes";
addBtn.classList.remove("primary");
addBtn.classList.add("save-btn");
} else {
nameInput.value = "";
skillInput.value = "";
setGenderUI("M");
toolbar.classList.remove("editing-mode");
addBtn.textContent = "Add Player";
addBtn.classList.add("primary");
addBtn.classList.remove("save-btn");
}
renderPlayers();
}


function getDisplayPlayers() {
if (!sortState.col) return players;
const col = sortState.col, dir = sortState.dir;
const copy = [...players];
copy.sort((a, b) => {
if (col === "name") { const av = a.name.toLowerCase(), bv = b.name.toLowerCase(); return av < bv ? -dir : av > bv ? dir : 0; }
if (col === "gender") { const av = (a.gender || ""), bv = (b.gender || ""); return av < bv ? -dir : av > bv ? dir : 0; }
if (col === "skill") return (skillOf(a) - skillOf(b)) * dir;
if (col === "matches") return (a.matches - b.matches) * dir;
return 0;
});
return copy;
}

function setGenderUI(g) {
selectedGender = (g === "F") ? "F" : "M";
document.querySelectorAll('#genderToggle .gender-seg').forEach(b => b.classList.toggle('active', b.dataset.gender === selectedGender));
}

function updateDefaultButtons() {
["exportBtn", "importBtn"].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = editTableMode ? "" : "none"; });
["resetBtn", "saveDefaultBtn"].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = ""; });
const _rb = document.getElementById("resetBtn");
if (_rb) { _rb.textContent = editTableMode ? "Reset All" : "Reset Data"; _rb.classList.toggle("danger", editTableMode); }
}

function bindSortHandlers() {
document.querySelectorAll('#playersHeader .col-sort').forEach(el => {
el.onclick = () => {
const col = el.dataset.sort;
if (sortState.col === col) sortState.dir = -sortState.dir;
else { sortState.col = col; sortState.dir = 1; }
renderPlayers();
};
});
}

function showPsHintOnce() {
if (Store.get("courtmixer_ps_hint_seen")) return;
Store.set("courtmixer_ps_hint_seen", "1");
// Routed through showToast so the tip is swipe/tap/Escape dismissible like every other toast.
showToast('<strong>Tip —</strong> a ✓ lasts for the next game only. Press &amp; hold the box to 🔒 lock a player until you clear it.', false, 7000);
}

function stateBoxHtml(p, kind) {
const on = kind === "priority" ? p.priority : p.skip;
const locked = kind === "priority" ? p.priorityLock : p.skipLock;
const cls = on ? (kind === "priority" ? "on-priority" : "on-skip") : "";
const lk = (on && locked) ? " locked" : "";
const icon = on ? (locked ? "🔒" : "✓") : "";
const state = on ? (locked ? "locked" : "this game") : "off";
return `<div class="toggle-wrap"><button type="button" class="state-box ${cls}${lk}" data-role="${kind}" data-id="${p.id}" aria-label="${kind} ${state} for ${esc(p.name)}" title="Tap: this game only · Long-press: lock (persists)">${icon}</button></div>`;
}

function setToggleState(p, kind, action) {
showPsHintOnce();
const onProp = kind;
const lockProp = kind === "priority" ? "priorityLock" : "skipLock";
const otherProp = kind === "priority" ? "skip" : "priority";
const otherLockProp = kind === "priority" ? "skipLock" : "priorityLock";
const turningOn = !p[onProp];
if (kind === "priority" && turningOn) {
const count = players.filter(x => x.priority && !x.skip).length;
if (count >= MAX_PRIORITY_PLAYERS) {
cmxAlert(`At most ${MAX_PRIORITY_PLAYERS} players can be Priority at once (a full court). Clear another priority tag first.`);
return;
}
}
if (action === "tap") {
if (!p[onProp]) { p[onProp] = true; p[lockProp] = false; p[otherProp] = false; p[otherLockProp] = false; }
else { p[onProp] = false; p[lockProp] = false; }
} else {
if (p[onProp] && p[lockProp]) { p[onProp] = false; p[lockProp] = false; }
else { p[onProp] = true; p[lockProp] = true; p[otherProp] = false; p[otherLockProp] = false; }
}
renderPlayers();
}

function bindStateBoxes() {
document.querySelectorAll('.state-box').forEach(box => {
const id = box.dataset.id, kind = box.dataset.role;
let held = false, timer = null;
let active = false, sx = 0, sy = 0;
const clearTimer = () => { if (timer) { clearTimeout(timer); timer = null; } };
const start = (e) => {
active = true; held = false; sx = e.clientX; sy = e.clientY;
clearTimer();
timer = setTimeout(() => {
timer = null; held = true;
const p = byId(id);
if (p) { setToggleState(p, kind, "hold"); if (navigator.vibrate) navigator.vibrate(15); }
}, 450);
};
const move = (e) => {
if (!active) return;
if (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10) { clearTimer(); active = false; }
};
const end = () => {
if (!active) { clearTimer(); return; }
active = false;
if (timer) { clearTimer(); if (!held) { const p = byId(id); if (p) setToggleState(p, kind, "tap"); } }
};
const cancel = () => { clearTimer(); active = false; };
box.addEventListener("pointerdown", start);
box.addEventListener("pointermove", move);
box.addEventListener("pointerup", end);
box.addEventListener("pointercancel", cancel);
box.addEventListener("contextmenu", (e) => e.preventDefault());
});
}

function renderPlayers() {
const inner = document.getElementById("playersTableInner");
const headerBox = document.getElementById("playersHeader");
const table = document.getElementById("playersTable");
const _pv = document.getElementById("playersView"); if (_pv) _pv.classList.toggle("edit-active", editTableMode);
const _emptyBox = document.getElementById("playersEmpty");
const _tableCard = document.getElementById("playersTableCard");
const _isEmpty = players.length === 0;
if (_emptyBox) _emptyBox.style.display = _isEmpty ? "" : "none";
if (_tableCard) _tableCard.style.display = _isEmpty ? "none" : "";
inner.classList.toggle("players-mode-edit", editTableMode);
inner.classList.toggle("players-mode-normal", !editTableMode);
const arrow = (col) => sortState.col === col ? (sortState.dir === 1 ? " ▲" : " ▼") : "";
if (editTableMode) {
headerBox.innerHTML = `<div class="header-row"><div>#</div><div class="col-sort" data-sort="name">Name${arrow("name")}</div><div class="col-mf col-sort" data-sort="gender">M/F${arrow("gender")}</div><div class="col-skill col-sort" data-sort="skill">Skill${arrow("skill")}</div><div class="col-actions">Edit</div><div class="col-del">Del</div></div>`;
} else {
headerBox.innerHTML = `<div class="header-row"><div>#</div><div class="col-sort" data-sort="name">Name${arrow("name")}</div><div class="col-mf col-sort" data-sort="gender">M/F${arrow("gender")}</div><div class="col-skill col-sort" data-sort="skill">Skill${arrow("skill")}</div><div class="col-games col-sort" data-sort="matches">GP${arrow("matches")}</div><div class="col-priority">Priority</div><div class="col-skip">Skip</div></div>`;
}
table.innerHTML = "";
const list = getDisplayPlayers();
list.forEach((p, idx) => {
const isEditing = editingId === p.id;
const row = document.createElement("div");
let rowClass = "row";
if (isEditing) rowClass += " editing";
else if (p.skip) rowClass += " skip";
else if (p.priority) rowClass += " priority";
row.className = rowClass;
const g = (p.gender === "F") ? "F" : "M";
const genderHtml = `<div class="col-mf gender-${g}">${g}</div>`;
if (editTableMode) {
const editHTML = isEditing
? `<button class="small save-btn" data-role="save" data-id="${p.id}" title="Save changes">Save</button>`
: `<button class="small edit-btn" data-role="edit" data-id="${p.id}" title="Edit player">Edit</button>`;
const delHTML = `<button class="small danger" data-role="delete" data-id="${p.id}" title="Delete player">Del</button>`;
row.innerHTML = `<div>${idx + 1}</div><div class="name">${esc(p.name)}</div>${genderHtml}<div class="skill col-skill">${fmtSkill(p)}</div><div class="col-actions">${editHTML}</div><div class="col-del">${delHTML}</div>`;
} else {
row.innerHTML = `<div>${idx + 1}</div><div class="name">${esc(p.name)}</div>${genderHtml}<div class="skill col-skill">${fmtSkill(p)}</div><div class="col-games">${p.matches}</div>${stateBoxHtml(p,"priority")}${stateBoxHtml(p,"skip")}`;
}
table.appendChild(row);
});
bindRowHandlers();
bindSortHandlers();
bindStateBoxes();
save();
}

function bindRowHandlers() {
// Priority/Skip boxes are wired in bindStateBoxes() (tap = this game, long-press = lock)

document.querySelectorAll('[data-role="edit"]').forEach(el => {
el.onclick = (e) => {
setEditMode(e.target.dataset.id);
};
});

document.querySelectorAll('[data-role="save"]').forEach(el => {
el.onclick = (e) => {
// Save from row button = same as save from toolbar
saveEditedPlayer();
};
});

document.querySelectorAll('[data-role="delete"]').forEach(el => {
el.onclick = (e) => {
const id = e.target.dataset.id;
const player = byId(id);
cmxConfirm({ title: "Delete player", yes: "Delete", danger: true,
message: `Delete "${player ? player.name : "this player"}"?\n\nTheir past matches stay in the history.` }, () => {
undoable("Player deleted", () => {
players = players.filter(p => p.id !== id);
if (editingId === id) setEditMode(null);
else renderPlayers();
renderStats();
});
});
};
});
}

function saveEditedPlayer() {
if (!editingId) return;
const nameInput = document.getElementById("nameInput");
const skillInput = document.getElementById("skillInput");
const name = nameInput.value.trim();
const skill = normSkillInput(skillInput.value);
if (!name) return cmxAlert("Enter player name.");
if (skill !== null && (!Number.isFinite(skill) || skill < 1 || skill > 10)) return cmxAlert("Skill must be 1.0 to 10.0 \u2014 or leave it blank to add them as Unrated.");
const p = byId(editingId);
if (p) {
p.name = name;
p.skill = skill;
p.gender = selectedGender;
}
setEditMode(null);
renderStats();
}

function loadSamplePlayers() {
snapshot("Sample players loaded");
players = defaultPlayers.map(p => ({ id: uid(), name: p.name, gender: (p.gender === "F" ? "F" : "M"), skill: p.skill, matches: 0, wins: 0, points: 0, priority: false, skip: false, priorityLock: false, skipLock: false, pointsDiff: 0 }));
matchHistory = [];
seenPairings.clear();
save();
renderPlayers(); renderMatch(); renderHistory(); renderLeaderboard(); renderStats();
showToast("Sample players loaded.", true);
}
