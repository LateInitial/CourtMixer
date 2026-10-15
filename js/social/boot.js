// CourtMixer - bootstrap: wire the controls, stamp the version, first render
// Moved verbatim from index.html in Phase 0 (v1.9.0). Loaded as a classic script;
// all top-level declarations share one global scope, exactly as before the split.

document.getElementById("addPlayerBtn").onclick = () => {
if (editingId) {
// In edit mode: Save Changes
saveEditedPlayer();
return;
}
const nameInput = document.getElementById("nameInput");
const skillInput = document.getElementById("skillInput");
const name = nameInput.value.trim();
const skill = normSkillInput(skillInput.value);
if (!name) return cmxAlert("Enter player name.");
if (skill !== null && (!Number.isFinite(skill) || skill < 1 || skill > 10)) return cmxAlert("Skill must be 1.0 to 10.0 \u2014 or leave it blank to add them as Unrated.");
players.push({ id: uid(), name, gender: selectedGender, skill, matches: 0, wins: 0, points: 0, priority: false, skip: false, priorityLock: false, skipLock: false, pointsDiff: 0 });
nameInput.value = "";
skillInput.value = "";
setGenderUI("M");
renderPlayers();
renderStats();
};

document.getElementById("resetBtn").onclick = () => {
if (editTableMode) {
cmxConfirm({ title: "Reset All", yes: "Erase everything", danger: true,
message: "Erase every player and all match history?\n\nYour saved default roster is kept \u2014 use Reset Data to bring it back." },
() => undoable("Everything reset", doResetAll));
return;
}
const usingCustom = customDefaults && customDefaults.length;
const q = usingCustom ? "Reset to your saved default roster?" : "Clear all players and start over?";
cmxConfirm({ title: "Reset Data", yes: "Reset", danger: true,
message: `${q}\n\nThis clears all games played, scores, match history, and priority/skip tags.` },
() => undoable("Session reset", () => doResetSession(usingCustom)));
};

document.getElementById("generateBtn").onclick = () => {
doGenerateMatches();
};

document.querySelectorAll(".tab").forEach(tab => {
tab.onclick = () => {
document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
tab.classList.add("active");
document.getElementById(tab.dataset.view).classList.add("active");
if (tab.dataset.view === "historyView") renderMatchStats();
};
});

document.querySelectorAll('#historySubtabs .subtab').forEach(btn => {
btn.onclick = () => {
document.querySelectorAll('#historySubtabs .subtab').forEach(b => b.classList.remove('active'));
document.querySelectorAll('#historyView .subview').forEach(v => v.classList.remove('active'));
btn.classList.add('active');
const pane = document.getElementById(btn.dataset.subview);
if (pane) pane.classList.add('active');
if (btn.dataset.subview === 'matchStatsPane') renderMatchStats();
};
});

document.getElementById("matchResult").addEventListener("click", (e) => {
const rr = e.target.closest(".court-reroll-btn");
if (rr) { doRerollCourt(Number(rr.dataset.court)); return; }
const cc = e.target.closest(".court-confirm-btn");
if (cc) { doConfirmCourt(Number(cc.dataset.court)); return; }
const cl = e.target.closest(".court-clear-btn");
if (cl) { const cc2 = Number(cl.dataset.court); courtSlots[cc2] = [null, null, null, null]; courtSlotManual[cc2] = [false, false, false, false]; saveCourts(); renderMatch(); return; }
const mc = e.target.closest(".mode-chip");
if (mc) { setCourtMode(Number(mc.dataset.court), mc.dataset.mode); return; }
const es = e.target.closest(".end-save-score-btn");
if (es) { finishMatchWithScore(es.dataset.hid); return; }
const en = e.target.closest(".end-no-score-btn");
if (en) { finishMatchWithoutScore(en.dataset.hid); }
});
document.getElementById("matchResult").addEventListener("change", (e) => {
const sel = e.target.closest(".slot-select");
if (sel) setSlotPlayer(Number(sel.dataset.court), Number(sel.dataset.slot), sel.value);
});

document.querySelectorAll(".court-segment").forEach(btn => {
btn.onclick = () => {
const n = Number(btn.dataset.setCourts);
if (n === courtCount) return;
if (n < courtCount) {
const busyCourts = [];
for (let c = n + 1; c <= courtCount; c++) if (getLiveMatchForCourt(c)) busyCourts.push(c);
if (busyCourts.length) return cmxAlert(`Court ${busyCourts.join(", ")} still has a match in progress.\n\nFinish it (with or without a score) before reducing the number of courts.`);
}
courtCount = n;
Store.set("courtmixer_court_count", String(n));
clearCourtsAbove(courtCount);
updateMatchToolbar();
renderMatch();
save();
};
});

updateMatchToolbar();

document.querySelectorAll(".ranking-style-segment").forEach(btn => {
btn.onclick = () => setScoringStyle(btn.dataset.scoringStyle);
});

document.querySelectorAll(".format-segment").forEach(btn => {
btn.onclick = () => setMatchmakingMode(btn.dataset.matchmaking);
});

document.querySelectorAll('#genderToggle .gender-seg').forEach(b => { b.onclick = () => setGenderUI(b.dataset.gender); });

document.getElementById("editModeBtn").onclick = () => {
editTableMode = !editTableMode;
const btn = document.getElementById("editModeBtn");
btn.classList.toggle("active-edit", editTableMode);
btn.textContent = editTableMode ? "Done" : "Edit";
if (!editTableMode && editingId) setEditMode(null);
updateDefaultButtons();
renderPlayers();
};


/* ===== CourtMixer share codes + modal (index56) ===== */
const _sampleBtn = document.getElementById("loadSampleBtn");
if (_sampleBtn) _sampleBtn.onclick = loadSamplePlayers;

document.getElementById("saveDefaultBtn").onclick = () => {
if (!players.length) return cmxAlert("Add some players first, then save them as your default.");
cmxConfirm({ title: "Save as default", yes: "Save",
message: "Save the current roster (names, gender, skill) as your default?\n\nReset Data will then restore THIS roster instead of the built-in sample." }, () => {
customDefaults = players.map(p => ({ name: p.name, gender: (p.gender === "F" ? "F" : "M"), skill: p.skill }));
try { Store.set("courtmixer_custom_defaults", JSON.stringify(customDefaults)); } catch (e) {}
Sync.markDirty("social");
updateDefaultButtons();
showToast("Saved \u2014 Reset Data will now restore this roster.");
});
};

document.getElementById("exportBtn").onclick = () => cmxExportText("roster");
document.getElementById("importBtn").onclick = () => cmxImportText("roster");

setGenderUI("M");
updateDefaultButtons();

const sessionNameInput = document.getElementById("sessionNameInput");
if (sessionNameInput) {
sessionNameInput.value = sessionName;
sessionNameInput.addEventListener("input", (e) => { sessionName = e.target.value; Store.set("courtmixer_session_name", sessionName); Sync.markDirty("social"); });
}
const shareLbBtn = document.getElementById("shareLbBtn");
if (shareLbBtn) shareLbBtn.onclick = shareLeaderboardChooser;

/* ===== Version stamp, install manifest, stale-session prompt, self-tests ===== */
(function stampVersion(){
  const f = document.querySelector(".app-foot");
  if (f) f.innerHTML = f.innerHTML.replace("${APP_VERSION}", esc(APP_VERSION));
})();

// Installable from the hosted URL: "add to home screen" gets a real name and icon.
(function injectManifest(){
  try {
    const icon = document.querySelector('link[rel="icon"]');
    const mf = {
      name: "CourtMixer", short_name: "CourtMixer",
      description: "Court sports matchmaking for social badminton, tennis and padel.",
      start_url: ".", scope: ".", display: "standalone",
      background_color: "#eef4ff", theme_color: "#4f6fff",
      icons: icon ? [{ src: icon.href, sizes: "any", type: "image/svg+xml", purpose: "any maskable" }] : []
    };
    const l = document.createElement("link");
    l.rel = "manifest";
    l.href = "data:application/manifest+json," + encodeURIComponent(JSON.stringify(mf));
    document.head.appendChild(l);
  } catch (e) { /* manifest is a nicety, never a blocker */ }
})();

// A session left open overnight would otherwise keep filing today's games under yesterday.
const _origBindSort = bindSortHandlers, _origBindStatsSort = bindStatsSortHandlers;
bindSortHandlers = function(){ _origBindSort(); makeHeadersAccessible(); };
bindStatsSortHandlers = function(){ _origBindStatsSort(); makeHeadersAccessible(); };

/* ===== Self-tests: open with ?selftest or #selftest ===== */

recomputeStatsFromHistory();

renderPlayers();
renderMatch();
renderHistory();
renderLeaderboard();
renderStats();
if (/[?#&]selftest/.test(location.search + location.hash)) runSelfTests();
if (/[?#&]sharetest/.test(location.search + location.hash)) runShareDiagnostics();
