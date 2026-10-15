// CourtMixer - social transfer codes: payloads, encode/decode, export and import
// Moved verbatim from index.html in Phase 0 (v1.9.0). Loaded as a classic script;
// all top-level declarations share one global scope, exactly as before the split.

function buildRosterPayload(){
  return { app:"CourtMixer", type:"roster", version:1, exportedAt:new Date().toISOString(),
    players: players.map(function(p){ return { name:String(p.name||""), gender:(p.gender==="F"?"F":"M"), skill: normSkillData(p.skill) }; }) };
}
function buildSessionPayload(){
  var rosterDefault = (customDefaults && customDefaults.length) ? customDefaults : players.map(function(p){ return { name:p.name, gender:(p.gender==="F"?"F":"M"), skill:p.skill }; });
  return { app:"CourtMixer", type:"session", version:1, exportedAt:new Date().toISOString(), players:players, history:matchHistory, seen:Array.from(seenPairings), courtCount:courtCount, scoringStyle:scoringStyle, matchmakingMode:matchmakingMode, customDefaults:rosterDefault, sessionName:sessionName, sessionDate:sessionDate };
}
function applyRosterImport(data){
  if(!data || data.app!=="CourtMixer" || !Array.isArray(data.players) || !data.players.length){ cmxAlert("No players found in that roster code/file."); return; }
  const warn = (matchHistory && matchHistory.length)
    ? "This replaces your current players and CLEARS all match history and scores on this device."
    : "This replaces your current players.";
  cmxConfirm({ title: "Import roster", yes: "Import", danger: true, message: warn }, function(){
    snapshot("Roster imported");
    doApplyRosterImport(data);
    showToast("Roster imported \u2014 " + players.length + " players.", true);
  });
}
function doApplyRosterImport(data){
  players = data.players.map(function(p){ return { id:uid(), name:String(p.name||""), gender:p.gender==="F"?"F":"M", skill: normSkillData(p.skill), matches:0, wins:0, points:0, priority:false, skip:false, priorityLock:false, skipLock:false, pointsDiff:0 }; });
  matchHistory = [];
  seenPairings.clear();
  courtSlots = EMPTY_SLOTS();
  courtSlotManual = EMPTY_MANUAL();
  courtMode = { 1:"", 2:"", 3:"", 4:"" };
  for (var c=1;c<=MAX_COURTS;c++) courtRerollSeen[c].clear();
  editingId=null; editTableMode=false; sortState={col:null,dir:1};
  recomputeStatsFromHistory();
  save(); saveCourts();
  var eb=document.getElementById("editModeBtn"); if(eb){ eb.textContent="Edit"; eb.classList.remove("active-edit"); }
  updateMatchToolbar(); updateDefaultButtons();
  renderPlayers(); renderMatch(); renderHistory(); renderLeaderboard(); renderStats();
}
function applySessionImport(data){
  if(!data || data.app!=="CourtMixer"){ cmxAlert("That isn't a valid CourtMixer code."); return; }
  if(data.type==="roster"){ cmxAlert("That looks like a roster code. Use Import Roster on the Players tab."); return; }
  applyBackupData(data);
}
function _cmxEncode(obj, prefix){ try{ return prefix + LZString.compressToEncodedURIComponent(JSON.stringify(obj)); }catch(e){ return ""; } }
function _cmxDecode(text){
  if(!text) return null;
  var s=String(text).trim();
  // Find the code wherever it sits. People copy the whole chat message, so there is usually
  // text before and after it. The body is a run of LZString's URI-safe alphabet, which stops
  // at the first space or newline and therefore never swallows the words after the code.
  var m=s.match(/CMX[RSC]1:([A-Za-z0-9+\-$]+)/);
  var body = m ? m[1] : s;
  var out=null;
  try{ var j=LZString.decompressFromEncodedURIComponent(body); if(j){ out=JSON.parse(j); } }catch(e){ out=null; }
  if(out) return out;
  try{ return JSON.parse(s); }catch(e){ return null; }
}
function cmxExportText(kind){
  var isRoster = kind==="roster";
  var obj = isRoster ? buildRosterPayload() : buildSessionPayload();
  var code = _cmxEncode(obj, isRoster?"CMXR1:":"CMXS1:");
  var what = isRoster ? "CourtMixer roster" : "CourtMixer session";
  var canShareText = typeof navigator.share === "function";
  var buttons = [
    { label:"Copy code", cls:"primary", keepOpen:true, onClick:function(box){ cmxCopy(code, box); return false; } }
  ];
  if (canShareText) buttons.push({ label:"Share code", cls:"secondary", keepOpen:true, onClick:function(box){
    // Text-only share, no files: this is the one shape phones reliably accept.
    var p;
    try { p = navigator.share({ title: what, text: code }); }
    catch (err) { var m1 = box.querySelector("#cmxCopyMsg"); if (m1) { m1.textContent = "Couldn't open the share sheet \u2014 use Copy code."; m1.className = "cmx-copymsg err"; } return false; }
    p.then(function(){ cmxCloseModal(); showToast("Code shared \u2014 the other person pastes it into <strong>Import</strong>."); })
     .catch(function(err){
       var m2 = box.querySelector("#cmxCopyMsg");
       if (!m2) return;
       if (err && err.name === "AbortError") { m2.textContent = "Sharing cancelled."; m2.className = "cmx-copymsg"; return; }
       m2.textContent = "Couldn't share (" + ((err && err.name) || "unknown") + ") \u2014 use Copy code.";
       m2.className = "cmx-copymsg err";
     });
    return false;
  } });
  buttons.push({ label:"Close", cls:"ghost", onClick:function(){} });
  cmxShowModal({ title: isRoster?"Roster code":"Session code",
    bodyHTML:'<p class="cmx-modal-text">Send this code to the other person. They open <strong>'+(isRoster?"Import Roster":"Import History")+'</strong> and paste it.</p><textarea id="cmxCodeOut" class="cmx-code" readonly rows="5"></textarea><div id="cmxCopyMsg" class="cmx-copymsg"></div>',
    buttons: buttons,
    onOpen:function(box){ var t=box.querySelector("#cmxCodeOut"); if(t) t.value=code; } });
}
function cmxImportText(kind){
  var isRoster = kind==="roster";
  cmxShowModal({ title: isRoster?"Paste roster code":"Paste session code",
    bodyHTML:'<p class="cmx-modal-text">Paste the code, then press <strong>Paste code</strong>. Copying the whole chat message is fine \u2014 any text around the code is ignored.</p><textarea id="cmxCodeIn" class="cmx-code" rows="5" placeholder="Paste code here"></textarea><div id="cmxImportMsg" class="cmx-copymsg"></div>',
    buttons:[
      { label:"Paste code", cls:"primary", keepOpen:true, onClick:function(box){
          var t=box.querySelector("#cmxCodeIn"); var txt=t?t.value:""; var msg=box.querySelector("#cmxImportMsg");
          var data=_cmxDecode(txt);
          if(!data || data.app!=="CourtMixer"){ if(msg){ msg.textContent="That code isn't a valid CourtMixer code."; msg.className="cmx-copymsg err"; } return false; }
          if(data.type==="competition"){ if(msg){ msg.textContent="That's a competition code — import it in Competition mode (\u{1F3C6} in the header)."; msg.className="cmx-copymsg err"; } return false; }
          cmxCloseModal();
          if(isRoster) applyRosterImport(data); else applySessionImport(data);
          return false;
        } },
      { label:"Cancel", cls:"ghost", onClick:function(){} }
    ] });
}

// A backup can be hand-edited or come from an older build; a malformed match entry used to
// throw inside renderHistory and leave the app looking bricked. Normalise, then drop the rest.
function normalizeHistoryEntry(h) {
if (!h || typeof h !== "object") return null;
const ids = (v) => Array.isArray(v) ? v.filter(x => typeof x === "string") : [];
const names = (v) => Array.isArray(v) ? v.map(x => String(x == null ? "" : x)) : [];
const aIds = ids(h.pairAIds), bIds = ids(h.pairBIds);
if (aIds.length !== 2 || bIds.length !== 2) return null;
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const sa = (h.scoreA === null || h.scoreA === undefined) ? null : num(h.scoreA);
const sb = (h.scoreB === null || h.scoreB === undefined) ? null : num(h.scoreB);
const paired = (sa === null || sb === null) ? [null, null] : [sa, sb];
const aN = names(h.pairA), bN = names(h.pairB);
const court = (Number(h.court) >= 1 && Number(h.court) <= MAX_COURTS) ? Number(h.court) : null;
const cat = (h.category === "MD" || h.category === "WD" || h.category === "XD") ? h.category : null;
return {
id: (typeof h.id === "string" && h.id) ? h.id : uid(),
time: String(h.time == null ? "" : h.time),
pairA: aN.length === 2 ? aN : ["?", "?"],
pairB: bN.length === 2 ? bN : ["?", "?"],
pairAIds: aIds, pairBIds: bIds,
pairDelta: Number.isFinite(Number(h.pairDelta)) ? Number(h.pairDelta) : 0,
repeated: !!h.repeated,
scoreA: paired[0], scoreB: paired[1],
closed: !!h.closed,
court: court, category: cat
};
}

function applyBackupData(data) {
if (!data || data.app !== "CourtMixer" || !Array.isArray(data.players)) { cmxAlert("That isn't a valid CourtMixer backup."); return; }
if (data.type === "roster") { cmxAlert("That's a roster file. Use Import Roster on the Players tab."); return; }
cmxConfirm({ title: "Import backup", yes: "Import", danger: true,
message: "Import this backup?\n\nIt replaces the players, match history and settings currently on this device." }, () => {
snapshot("Backup imported");
doApplyBackup(data);
showToast("Backup imported.", true);
});
}

function doApplyBackup(data) {
players = data.players.map(p => ({ id: p.id || uid(), name: String(p.name || ""), gender: p.gender === "F" ? "F" : "M", skill: normSkillData(p.skill), matches: Number(p.matches) || 0, wins: Number(p.wins) || 0, points: Number(p.points) || 0, priority: false, skip: false, priorityLock: false, skipLock: false, pointsDiff: Number(p.pointsDiff) || 0 }));
// v1.6.0-v1.7.0 wrote the array under "matchHistory"; accept both so those backups still load.
const rawHist = Array.isArray(data.history) ? data.history : (Array.isArray(data.matchHistory) ? data.matchHistory : []);
matchHistory = rawHist.map(normalizeHistoryEntry).filter(Boolean);
const dropped = rawHist.length - matchHistory.length;
seenPairings.clear(); (Array.isArray(data.seen) ? data.seen : []).forEach(k => seenPairings.add(k));
courtCount = (data.courtCount >= 1 && data.courtCount <= MAX_COURTS) ? data.courtCount : 1;
scoringStyle = ["points", "adjpts", "league", "ptspergp"].includes(data.scoringStyle) ? data.scoringStyle : "points";
matchmakingMode = data.matchmakingMode === "mexicano" ? "mexicano" : "americano";
customDefaults = Array.isArray(data.customDefaults) ? data.customDefaults.map(p => ({ name: p.name, gender: p.gender === "F" ? "F" : "M", skill: normSkillData(p.skill) })) : null;
sessionName = typeof data.sessionName === "string" ? data.sessionName : "";
sessionDate = /^\d{4}-\d{2}-\d{2}$/.test(data.sessionDate) ? data.sessionDate : todayISO();
courtSlots = EMPTY_SLOTS();
courtSlotManual = EMPTY_MANUAL();
courtMode = { 1: "", 2: "", 3: "", 4: "" };
for (let c = 1; c <= MAX_COURTS; c++) courtRerollSeen[c].clear();
editingId = null; editTableMode = false; sortState = { col: null, dir: 1 };
if (customDefaults) Store.set("courtmixer_custom_defaults", JSON.stringify(customDefaults)); else Store.remove("courtmixer_custom_defaults");
recomputeStatsFromHistory();
save(); saveCourts();
const sni = document.getElementById("sessionNameInput"); if (sni) sni.value = sessionName;
const eb = document.getElementById("editModeBtn"); if (eb) { eb.textContent = "Edit"; eb.classList.remove("active-edit"); }
updateMatchToolbar(); updateDefaultButtons();
renderPlayers(); renderMatch(); renderHistory(); renderLeaderboard();
renderStats();
// A backup written on more courts than are shown must not strand a live match.
matchHistory.forEach(h => { if (isMatchLive(h) && h.court && h.court > courtCount && h.court <= MAX_COURTS) courtCount = h.court; });
updateMatchToolbar(); renderMatch();
if (dropped > 0) cmxAlert(dropped + " match" + (dropped === 1 ? " was" : "es were") + " skipped because the entry was incomplete. Everything else imported fine.", "Imported with warnings");
}
