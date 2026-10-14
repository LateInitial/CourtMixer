// CourtMixer - shared pickers: score grid, skill grid, player detail modal
// Moved verbatim from index.html in Phase 0 (v1.9.0). Loaded as a classic script;
// all top-level declarations share one global scope, exactly as before the split.

function applyScorePick(inputEl, val){
  if (val === "" || val === null || val === undefined) return;
  const n = Math.max(0, parseInt(val, 10) || 0);
  inputEl.value = String(n);
  inputEl.dispatchEvent(new Event("input", { bubbles: true }));
  inputEl.dispatchEvent(new Event("change", { bubbles: true }));
}
function openSkillPicker(inputEl){
  const nameEl = document.getElementById("nameInput");
  const editing = editingId ? byId(editingId) : null;
  const who = editing ? editing.name : (((nameEl && nameEl.value.trim()) || "New player"));
  const cur = String(inputEl.value == null ? "" : inputEl.value).trim();
  var curU = (cur === "" || /^u$/i.test(cur));
  let grid = '<button type="button" class="sk-n sk-u' + (curU ? " sel" : "") + '" data-v="U">U</button>';
  for (let i = 2; i <= 20; i++) {
    const v = (i / 2).toFixed(1);
    const sel = (cur !== "" && Number(cur) === Number(v)) ? " sel" : "";
    grid += '<button type="button" class="sk-n' + sel + '" data-v="' + v + '">' + v + "</button>";
  }
  grid += '<button type="button" class="sk-n sk-custom">Custom</button>';
  cmxShowModal({
    title: "Select skill",
    bodyHTML: '<div class="sp-team">' + pdEsc(who) + "</div>"
      + '<div class="sk-grid">' + grid + "</div>"
      + '<div class="sk-note"><b class="u">U</b> = Unrated. Matchmaking treats an unrated player as <b>3.0</b>.</div>',
    buttons: [ { label: "Close", cls: "ghost", onClick: function(){} } ],
    onOpen: function(box){
      box.querySelectorAll(".sk-n").forEach(function(b){
        b.onclick = function(){
          if (b.classList.contains("sk-custom")) {
            cmxCloseModal();
            inputEl.removeAttribute("readonly");
            inputEl.focus();
            if (inputEl.select) inputEl.select();
            const restore = function(){ inputEl.setAttribute("readonly", "readonly"); inputEl.removeEventListener("blur", restore); };
            inputEl.addEventListener("blur", restore);
            return;
          }
          inputEl.value = b.dataset.v;
          inputEl.dispatchEvent(new Event("input", { bubbles: true }));
          inputEl.dispatchEvent(new Event("change", { bubbles: true }));
          cmxCloseModal();
        };
      });
    }
  });
}
document.addEventListener("click", function(e){
  const el = e.target;
  if (el && el.id === "skillInput" && el.hasAttribute("readonly")) { e.preventDefault(); openSkillPicker(el); }
});

function openScorePicker(inputEl){
  const team = inputEl.getAttribute("data-team") || "";
  const sub = inputEl.getAttribute("data-sub") || "";
  let grid = "";
  for (let i = 0; i <= 50; i++) grid += '<button type="button" class="sp-n" data-v="' + i + '">' + i + '</button>';
  grid += '<button type="button" class="sp-n sp-custom">Custom</button>';
  cmxShowModal({
    title: "Select score",
    bodyHTML: (sub ? '<div class="sp-sub">' + pdEsc(sub) + "</div>" : "")
      + (team ? '<div class="sp-team">' + pdEsc(team) + "</div>" : "")
      + '<div class="sp-grid">' + grid + "</div>",
    buttons: [ { label: "Close", cls: "ghost", onClick: function(){} } ],
    onOpen: function(box){
      box.querySelectorAll(".sp-n").forEach(function(b){
        b.onclick = function(){
          if (b.classList.contains("sp-custom")) {
            cmxCloseModal();
            inputEl.removeAttribute("readonly");
            inputEl.focus();
            if (inputEl.select) inputEl.select();
            const restore = function(){ inputEl.setAttribute("readonly", "readonly"); inputEl.removeEventListener("blur", restore); };
            inputEl.addEventListener("blur", restore);
            return;
          }
          applyScorePick(inputEl, b.dataset.v);
          cmxCloseModal();
        };
      });
    }
  });
}
document.addEventListener("click", function(e){
  const el = e.target;
  if (el && el.classList && el.classList.contains("score-pick") && el.hasAttribute("readonly")) {
    e.preventDefault();
    openScorePicker(el);
  }
});
// Editing a saved score stages both sides and commits on Save. Committing per tap made
// 21-15 -> 15-21 pass through 15-15, firing the draw prompt and crediting draw points.
document.addEventListener("change", function(e){
  var el = e.target;
  if (el && el.classList && el.classList.contains("score-live")) {
    var item = el.closest(".history-item");
    if (item) item.classList.add("dirty");
  }
});

function openPlayerDetail(pid){
  const d = computePlayerDetail(pid);
  if (!d) return;
  cmxShowModal({ title: d.name, bodyHTML: playerDetailHtml(d), buttons: [ { label: "Close", cls: "ghost", onClick: function(){} } ] });
}
document.addEventListener("click", function(e){
  const t = e.target && e.target.closest ? e.target.closest(".pd-open") : null;
  if (t && t.dataset && t.dataset.pid) { e.preventDefault(); openPlayerDetail(t.dataset.pid); }
});
