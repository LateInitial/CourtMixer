// CourtMixer - social match stats: category counts and the stats table
// Moved verbatim from index.html in Phase 0 (v1.9.0). Loaded as a classic script;
// all top-level declarations share one global scope, exactly as before the split.

function computeCategoryCounts() {
const counts = {};
players.forEach(p => { counts[p.id] = { MD: 0, WD: 0, XD: 0 }; });
matchHistory.forEach(h => {
if (!h.pairAIds || h.pairAIds.length < 2 || !h.pairBIds || h.pairBIds.length < 2) return;
const ids = [...h.pairAIds, ...h.pairBIds];
let cat = h.category;
if (cat !== "MD" && cat !== "WD" && cat !== "XD") cat = inferCategoryFromPlayers(ids.map(byId));
ids.forEach(id => { if (counts[id]) counts[id][cat]++; });
});
return counts;
}
function bindStatsSortHandlers() {
document.querySelectorAll('#statsHeader .col-sort').forEach(el => {
el.onclick = () => {
const col = el.dataset.sort;
if (statsSortState.col === col) statsSortState.dir = -statsSortState.dir;
else { statsSortState.col = col; statsSortState.dir = 1; }
renderMatchStats();
};
});
}
function renderMatchStats() {
const headerBox = document.getElementById("statsHeader");
const table = document.getElementById("statsTable");
if (!headerBox || !table) return;
const counts = computeCategoryCounts();
const arrow = (col) => statsSortState.col === col ? (statsSortState.dir === 1 ? " ▲" : " ▼") : "";
headerBox.innerHTML = `<div class="header-row"><div>#</div><div class="col-sort" data-sort="name">Name${arrow("name")}</div><div class="col-mf col-sort" data-sort="gender">M/F${arrow("gender")}</div><div class="col-games col-sort" data-sort="matches">GP${arrow("matches")}</div><div class="col-games col-sort" data-sort="md">MD${arrow("md")}</div><div class="col-games col-sort" data-sort="wd">WD${arrow("wd")}</div><div class="col-games col-sort" data-sort="xd">XD${arrow("xd")}</div></div>`;
let list = [...players];
const c = statsSortState.col, dir = statsSortState.dir;
if (c) {
list.sort((a, b) => {
if (c === "name") { const av = a.name.toLowerCase(), bv = b.name.toLowerCase(); return av < bv ? -dir : av > bv ? dir : 0; }
if (c === "gender") { const av = (a.gender || ""), bv = (b.gender || ""); return av < bv ? -dir : av > bv ? dir : 0; }
if (c === "matches") return (a.matches - b.matches) * dir;
if (c === "md") return (counts[a.id].MD - counts[b.id].MD) * dir;
if (c === "wd") return (counts[a.id].WD - counts[b.id].WD) * dir;
if (c === "xd") return (counts[a.id].XD - counts[b.id].XD) * dir;
return 0;
});
}
table.innerHTML = "";
list.forEach((p, idx) => {
const g = (p.gender === "F") ? "F" : "M";
const cc = counts[p.id] || { MD: 0, WD: 0, XD: 0 };
const row = document.createElement("div");
row.className = "row";
row.innerHTML = `<div>${idx + 1}</div><div class="name"><button type="button" class="pd-open" data-pid="${p.id}">${esc(p.name)}</button></div><div class="col-mf gender-${g}">${g}</div><div class="col-games">${p.matches}</div><div class="col-games">${cc.MD}</div><div class="col-games">${cc.WD}</div><div class="col-games">${cc.XD}</div>`;
table.appendChild(row);
});
bindStatsSortHandlers();
}
