// CourtMixer - shared UI: modal, alert, confirm, toast, one-level undo, a11y headers
// Moved verbatim from index.html in Phase 0 (v1.9.0). Loaded as a classic script;
// all top-level declarations share one global scope, exactly as before the split.

function cmxCloseModal(){ var o=document.getElementById("cmxModal"); if(o){ o.style.display="none"; var b=document.getElementById("cmxModalBox"); if(b) b.innerHTML=""; } }
// Bumped on every open. A button handler that opens a second modal (an export dialog, a
// confirmation, an error alert) must not have that new modal closed by the handler it came
// from, so the auto-close below only fires if no newer modal appeared meanwhile.
var _cmxModalSeq = 0;
function cmxShowModal(opts){
  _cmxModalSeq++;
  var o=document.getElementById("cmxModal"), box=document.getElementById("cmxModalBox");
  box.innerHTML='<div class="cmx-modal-head"><span class="cmx-modal-title"></span><button type="button" class="cmx-modal-x" aria-label="Close">×</button></div><div class="cmx-modal-body"></div><div class="cmx-modal-actions"></div>';
  box.querySelector(".cmx-modal-title").textContent = opts.title||"";
  box.querySelector(".cmx-modal-body").innerHTML = opts.bodyHTML||"";
  var acts=box.querySelector(".cmx-modal-actions");
  (opts.buttons||[]).forEach(function(b){
    var btn=document.createElement("button"); btn.type="button"; btn.className="cmx-modal-btn "+(b.cls||""); btn.textContent=b.label;
    btn.onclick=function(){
      var seq = _cmxModalSeq;
      var r = b.onClick ? b.onClick(box) : undefined;
      if(!b.keepOpen && r!==false && _cmxModalSeq === seq) cmxCloseModal();
    };
    acts.appendChild(btn);
  });
  box.querySelector(".cmx-modal-x").onclick=cmxCloseModal;
  o.onclick=function(e){ if(e.target===o) cmxCloseModal(); };
  o.style.display="flex";
  if(opts.onOpen) opts.onOpen(box);
}
function cmxMsgHtml(msg){ return '<p class="cmx-modal-text">' + esc(msg).replace(/\n\n/g, "</p><p class=\'cmx-modal-text\'>").replace(/\n/g, "<br>") + "</p>"; }
// In-app replacements for the native dialogs: consistent with the rest of the UI, and not
// suppressible by the browser's "prevent additional dialogs" checkbox.
function cmxAlert(msg, title){
  cmxShowModal({ title: title || "CourtMixer", bodyHTML: cmxMsgHtml(msg),
    buttons: [ { label: "OK", cls: "primary", onClick: function(){} } ] });
}
function cmxConfirm(opts, onYes){
  cmxShowModal({ title: opts.title || "Are you sure?", bodyHTML: cmxMsgHtml(opts.message || ""),
    buttons: [
      { label: opts.yes || "Confirm", cls: opts.danger ? "danger" : "primary", onClick: function(){ if (onYes) onYes(); } },
      { label: opts.no || "Cancel", cls: "ghost", onClick: function(){ if (opts.onNo) opts.onNo(); } }
    ] });
}
/* ===== Toasts =====
   Short-lived and always dismissible by hand: swipe it away in any direction, tap the x,
   or press Escape. The bar along the bottom counts the remaining time down so the
   auto-dismiss never feels arbitrary. */
const TOAST_UNDO_MS = 6000, TOAST_PLAIN_MS = 3000;
function dismissToast(){
  const t = document.getElementById("psToast");
  if (!t) return;
  clearTimeout(t._hideTimer);
  t.style.transition = "";
  t.style.transform = "";
  t.style.opacity = "";
  t.classList.remove("show");
}
function showToast(html, withUndo, customMs){
  const t = document.getElementById("psToast");
  if (!t) return;
  const ms = customMs || (withUndo ? TOAST_UNDO_MS : TOAST_PLAIN_MS);
  t.innerHTML = '<span class="toast-msg">' + html + "</span>"
    + (withUndo ? '<button type="button" class="toast-undo" id="toastUndoBtn">Undo</button>' : "")
    + '<button type="button" class="toast-x" aria-label="Dismiss">×</button>'
    + '<span class="toast-bar" style="animation-duration:' + ms + 'ms"></span>';
  t.style.transition = ""; t.style.transform = ""; t.style.opacity = "";
  t.classList.add("show");
  clearTimeout(t._hideTimer);
  t._hideTimer = setTimeout(dismissToast, ms);
  const b = document.getElementById("toastUndoBtn");
  if (b) b.onclick = function(){ dismissToast(); undoLast(); };
  const x = t.querySelector(".toast-x");
  if (x) x.onclick = dismissToast;
}
(function bindToastGestures(){
  const t = document.getElementById("psToast");
  if (!t) return;
  let sx = 0, sy = 0, dragging = false, moved = false;
  t.addEventListener("pointerdown", function(e){
    if (e.target.closest && e.target.closest("button")) return; // Undo / x handle their own taps
    dragging = true; moved = false; sx = e.clientX; sy = e.clientY;
    t.style.transition = "none";
  });
  t.addEventListener("pointermove", function(e){
    if (!dragging) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (!moved && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) moved = true;
    if (!moved) return;
    const down = Math.max(0, dy);
    t.style.transform = "translateX(calc(-50% + " + dx + "px)) translateY(" + down + "px)";
    t.style.opacity = String(Math.max(0, 1 - Math.max(Math.abs(dx), down) / 140));
  });
  t.addEventListener("pointerup", function(e){
    if (!dragging) return;
    dragging = false;
    t.style.transition = "";
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (moved) {
      if (Math.abs(dx) > 70 || dy > 60) { dismissToast(); return; }
      t.style.transform = ""; t.style.opacity = "";
      return;
    }
    // A stray tap should not silently throw away the chance to undo, so tap-to-dismiss
    // only applies to toasts that have no Undo button.
    if (!t.querySelector(".toast-undo")) dismissToast();
  });
  t.addEventListener("pointercancel", function(){
    dragging = false;
    t.style.transition = ""; t.style.transform = ""; t.style.opacity = "";
  });
  document.addEventListener("keydown", function(e){ if (e.key === "Escape") dismissToast(); });
})();

/* ===== One-level undo for destructive actions ===== */
let _undo = null;
function snapshot(label){
  try {
    _undo = { label: label, at: Date.now(),
      players: JSON.parse(JSON.stringify(players)), matchHistory: JSON.parse(JSON.stringify(matchHistory)),
      seen: Array.from(seenPairings), courtSlots: JSON.parse(JSON.stringify(courtSlots)),
      courtSlotManual: JSON.parse(JSON.stringify(courtSlotManual)), courtMode: JSON.parse(JSON.stringify(courtMode)),
      sessionName: sessionName, sessionDate: sessionDate, scoringStyle: scoringStyle,
      matchmakingMode: matchmakingMode, courtCount: courtCount,
      customDefaults: customDefaults ? JSON.parse(JSON.stringify(customDefaults)) : null };
  } catch (e) { _undo = null; }
}
function undoLast(){
  if (!_undo) return cmxAlert("There is nothing left to undo.");
  const u = _undo; _undo = null;
  players = u.players; matchHistory = u.matchHistory;
  seenPairings.clear(); u.seen.forEach(function(k){ seenPairings.add(k); });
  courtSlots = u.courtSlots; courtSlotManual = u.courtSlotManual; courtMode = u.courtMode;
  sessionName = u.sessionName; sessionDate = u.sessionDate; scoringStyle = u.scoringStyle;
  matchmakingMode = u.matchmakingMode; courtCount = u.courtCount; customDefaults = u.customDefaults;
  editingId = null; editTableMode = false; sortState = { col: null, dir: 1 };
  for (let c = 1; c <= MAX_COURTS; c++) courtRerollSeen[c].clear();
  if (customDefaults) { try { Store.set("courtmixer_custom_defaults", JSON.stringify(customDefaults)); } catch (e) {} }
  const sni = document.getElementById("sessionNameInput"); if (sni) sni.value = sessionName;
  const eb = document.getElementById("editModeBtn"); if (eb) { eb.textContent = "Edit"; eb.classList.remove("active-edit"); }
  recomputeStatsFromHistory();
  save(); saveCourts();
  updateMatchToolbar(); updateDefaultButtons();
  renderPlayers(); renderMatch(); renderHistory(); renderLeaderboard();
  showToast("Restored \u2014 " + esc(u.label) + " was undone.");
}
function undoable(label, fn){ snapshot(label); fn(); showToast(esc(label) + ".", true); }

function cmxCopy(text, box){
  var msg=box && box.querySelector("#cmxCopyMsg");
  function done(){ if(msg){ msg.textContent="Copied!"; msg.className="cmx-copymsg"; } }
  function fail(){ var t=box && box.querySelector("#cmxCodeOut"); if(t){ t.focus(); t.select(); try{ document.execCommand("copy"); done(); return; }catch(e){} } if(msg){ msg.textContent="Press and hold the code to copy it."; msg.className="cmx-copymsg err"; } }
  if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(text).then(done).catch(fail); } else { fail(); }
}
function makeHeadersAccessible(){
  document.querySelectorAll(".col-sort").forEach(el => {
    if (el.dataset.a11y) return;
    el.dataset.a11y = "1";
    el.setAttribute("role", "button");
    el.setAttribute("tabindex", "0");
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.click(); }
    });
  });
}
