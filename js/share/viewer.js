// CourtMixer - share as interactive HTML: boards, stats, CSS, the no-JavaScript viewer
// Moved verbatim from index.html in Phase 0 (v1.9.0). Loaded as a classic script;
// all top-level declarations share one global scope, exactly as before the split.

function buildViewerBoards() {
  const prev = scoringStyle, boards = {}, headers = {};
  VIEWER_STYLES.forEach(function (st) {
    scoringStyle = st[0];
    // p.points is style-dependent, so each board must be recomputed, not just relabelled.
    recomputeStatsFromHistory();
    const d = computeLeaderboardData();
    headers[st[0]] = d.header;
    boards[st[0]] = d.ranked.map(function (p, i) {
      return { pos: i + 1, id: p.id, name: p.name, gp: p.matches, wins: p.wins,
               val: String(d.valueFn(p)), star: !!(d.showStar && d.scoredOf(p) < d.maxSG) };
    });
  });
  scoringStyle = prev;
  recomputeStatsFromHistory();
  return { boards: boards, headers: headers };
}

function buildViewerStats() {
  const counts = computeCategoryCounts();
  const rows = players.map(function (p) {
    const c = counts[p.id] || { MD: 0, WD: 0, XD: 0 };
    return { id: p.id, name: p.name, gender: (p.gender === "F" ? "F" : "M"),
             gp: p.matches, md: c.MD, wd: c.WD, xd: c.XD };
  });
  // Pre-compute each row's position for every column so CSS `order` can do the sorting.
  const orders = {};
  VIEWER_SORT_COLS.forEach(function (col) {
    const key = col[0];
    const sorted = rows.slice().sort(function (a, b) {
      if (key === "name" || key === "gender") {
        const av = String(a[key]).toLowerCase(), bv = String(b[key]).toLowerCase();
        return av < bv ? -1 : av > bv ? 1 : 0;
      }
      return a[key] - b[key];
    });
    orders[key] = {};
    sorted.forEach(function (r, i) { orders[key][r.id] = i + 1; });
  });
  return { rows: rows, orders: orders };
}

function viewerCss(playerCount) {
  let css = `
:root{--bg:#eef2ff;--card:#fff;--ink:#1b2340;--muted:#5f6d94;}
*{box-sizing:border-box;}
body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,'Segoe UI',Roboto,Arial,sans-serif;-webkit-text-size-adjust:100%;}
.ctl{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;clip:rect(0 0 0 0);}
.wrap{max-width:560px;margin:0 auto;padding:14px;padding-left:max(14px,env(safe-area-inset-left));padding-right:max(14px,env(safe-area-inset-right));}
.brand{padding:6px 4px 12px;}
.brand-link{display:inline-block;text-decoration:none;}
.brand-cta{font-size:11px;color:var(--muted);margin-top:5px;}
.brand-cta a{color:#4f6ef7;text-decoration:none;font-weight:600;}
.brand-logo{height:42px;width:auto;display:block;}
.tabs{display:flex;background:#e7edff;border-radius:12px;padding:4px;gap:4px;margin-bottom:12px;}
.tab{flex:1;border:1px solid #d3ddf5;background:#fff;padding:10px;border-radius:9px;font-weight:600;color:var(--muted);cursor:pointer;font-size:14px;text-align:center;user-select:none;-webkit-user-select:none;}
.view{display:none;}
.card{background:var(--card);border:1px solid #e1e9ff;border-radius:14px;padding:14px;margin-bottom:12px;}
.session-name{font-weight:700;font-size:18px;}
.session-date{color:#4f6fff;font-size:13px;font-weight:600;margin-top:2px;}
.styles{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0;}
.style-btn{flex:1;min-width:64px;border:1px solid #c7d2fe;background:#eef2ff;color:#3949ab;border-radius:8px;padding:8px 4px;font-size:13px;font-weight:600;cursor:pointer;text-align:center;user-select:none;-webkit-user-select:none;}
.board{display:none;}
table.lb{width:100%;border-collapse:separate;border-spacing:0 5px;table-layout:fixed;}
table.lb th{font-size:11px;color:var(--muted);text-transform:uppercase;text-align:center;padding:4px 6px;font-weight:700;}
table.lb th.name{text-align:left;}
table.lb td{background:#f5f8ff;border-top:1px solid #e1e9ff;border-bottom:1px solid #e1e9ff;padding:10px 6px;font-size:15px;text-align:center;}
table.lb td:first-child{border-left:1px solid #e1e9ff;border-radius:12px 0 0 12px;}
table.lb td:last-child{border-right:1px solid #e1e9ff;border-radius:0 12px 12px 0;}
table.lb td.name{text-align:left;font-weight:700;}
table.lb th:nth-child(1),table.lb td:nth-child(1){width:42px;}
table.lb th:nth-child(3),table.lb td:nth-child(3){width:40px;}
table.lb th:nth-child(4),table.lb td:nth-child(4){width:48px;}
table.lb th:nth-child(5),table.lb td:nth-child(5){width:80px;white-space:nowrap;}
.star{color:#f5a623;font-weight:800;}
.won{color:#22a96e;}
.pts{color:#e0901a;font-weight:700;}
.head{color:#6a769f;font-weight:700;font-size:12px;letter-spacing:.04em;}
.fact{display:flex;align-items:flex-start;gap:12px;background:#f8faff;border:1px solid #e1e9ff;border-radius:10px;padding:10px 12px;margin-top:8px;}
.fact .em{font-size:20px;flex-shrink:0;line-height:1.4;}
.fact .tx{font-size:13px;color:#3b4e84;line-height:1.55;}
.fact .tx strong{color:#1b2340;}
.helpblk{display:none;}
.help-item{display:flex;align-items:flex-start;gap:10px;margin-top:10px;}
.help-num{width:22px;height:22px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;flex-shrink:0;}
.subtabs{display:flex;gap:8px;margin-bottom:12px;}
.subtab{flex:1;border:1px solid #c7d2fe;background:#eef2ff;border-radius:8px;padding:8px 4px;font-size:13px;font-weight:600;color:#3949ab;cursor:pointer;text-align:center;user-select:none;-webkit-user-select:none;}
.subview{display:none;}
.sg .hr{display:grid;grid-template-columns:minmax(64px,1fr) 44px 44px 44px 44px 44px;align-items:end;font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:700;padding:0 4px 8px;text-align:center;}
.sg .hr>div:nth-child(1){text-align:left;}
.sg-body{display:flex;flex-direction:column;}
.sg .r{display:grid;grid-template-columns:minmax(64px,1fr) 44px 44px 44px 44px 44px;align-items:center;background:#f5f8ff;border:1px solid #e1e9ff;border-radius:9px;padding:9px 4px;margin-bottom:5px;font-size:14px;text-align:center;}
.sg .r>div:nth-child(1){text-align:left;font-weight:700;}
.sg .hr .s label{display:none;cursor:pointer;padding:7px 2px;margin:-7px -2px;border-radius:6px;user-select:none;-webkit-user-select:none;white-space:nowrap;}
.sg .hr .s .lb-a{display:block;}
.gM{color:#2563eb;font-weight:700;}
.gF{color:#db2777;font-weight:700;}
.hist{background:#f8faff;border:1px solid #e1e9ff;border-radius:10px;padding:10px 12px;margin-bottom:8px;}
.hist-top{display:flex;justify-content:space-between;align-items:center;gap:8px;}
.hist-match{font-size:14px;}
.hist-vs{color:var(--muted);margin:0 6px;font-size:12px;}
.winner{color:#22a96e;font-weight:800;}
.loser{color:var(--ink);font-weight:800;}
.hist-score{font-weight:800;font-size:16px;white-space:nowrap;}
.hist-meta{margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;}
.tag{font-size:11px;padding:2px 8px;border-radius:20px;background:#eef2ff;color:#3949ab;}
.tag.win{background:#e6f8ee;color:#16a34a;}
.muted{color:var(--muted);font-size:12px;}
.foot{text-align:center;color:#94a3b8;font-size:11px;padding:10px;padding-bottom:max(10px,env(safe-area-inset-bottom));}
.tapname{cursor:pointer;color:inherit;text-decoration:underline;text-decoration-color:#c7d2fe;text-underline-offset:2px;}
.lb-hint{font-size:11px;color:var(--muted);margin-top:10px;text-align:center;}
.pdm{position:fixed;inset:0;background:rgba(15,23,42,.45);display:none;align-items:center;justify-content:center;padding:16px;z-index:50;}
.pdm-back{position:absolute;inset:0;cursor:pointer;}
.pdm-box{position:relative;z-index:1;background:#fff;border-radius:14px;max-width:400px;width:100%;max-height:86vh;overflow:auto;padding:16px 16px 18px;box-shadow:0 18px 44px rgba(0,0,0,.24);}
.pdm-head{display:flex;justify-content:space-between;align-items:center;}
.pdm-title{font-weight:800;font-size:17px;color:var(--ink);}
.pdm-x{font-size:22px;line-height:1;color:#94a3b8;cursor:pointer;padding:0 6px;user-select:none;-webkit-user-select:none;}
.pd-head{font-size:12px;color:var(--muted);margin:2px 0 12px;}
.pd-card{background:#f8faff;border:1px solid #e1e9ff;border-radius:10px;padding:10px 12px;margin-bottom:8px;}
.pd-card h4{margin:0 0 8px;font-size:11px;font-weight:700;color:#6a769f;text-transform:uppercase;letter-spacing:.05em;}
.pd-row2,.pd-row3{display:grid;gap:6px;text-align:center;}
.pd-row2{grid-template-columns:repeat(2,1fr);}
.pd-row3{grid-template-columns:repeat(3,1fr);}
.pd-row2 b,.pd-row3 b{display:block;font-size:18px;font-weight:800;color:var(--ink);line-height:1.2;}
.pd-row2 span,.pd-row3 span{display:block;font-size:11px;color:var(--muted);margin-top:2px;}
.pd-avg{margin-top:8px;}
.pd-avg b{font-size:15px;}
.pd-win{color:#22a96e;}
.pd-loss{color:#dc2626;}
.pd-note{font-size:12px;color:var(--muted);margin-top:6px;}
.pd-match{border-top:1px solid #e1e9ff;padding:8px 0 6px;}
.pd-match.first{border-top:none;padding-top:0;}
.pd-match-top{display:flex;justify-content:space-between;align-items:baseline;gap:8px;}
.pd-meta{font-size:11px;color:var(--muted);}
.pd-score{font-weight:800;font-size:14px;white-space:nowrap;}
.pd-noscore{font-size:11px;color:var(--muted);}
.pd-teams{font-size:12.5px;margin-top:2px;line-height:1.4;}
.pd-vs{color:var(--muted);font-size:11px;margin:0 5px;}
`;
  const ACTIVE_TAB = "background:#fff;color:#3949ab;border-color:#4f6ef7;box-shadow:0 1px 3px rgba(79,110,247,.18);";
  const ACTIVE_PILL = "background:#4f6ef7;color:#fff;border-color:#4f6ef7;";
  // View tabs
  css += `#v-lb:checked ~ .wrap #lbv{display:block;}\n#v-hist:checked ~ .wrap #histv{display:block;}\n`;
  css += `#v-lb:checked ~ .wrap .t-lb{${ACTIVE_TAB}}\n#v-hist:checked ~ .wrap .t-hist{${ACTIVE_TAB}}\n`;
  // Ranking styles: board, help block and the pill itself
  VIEWER_STYLES.forEach(function (st) {
    const k = st[0];
    css += `#s-${k}:checked ~ .wrap .b-${k}{display:block;}\n`;
    css += `#s-${k}:checked ~ .wrap .h-${k}{display:block;}\n`;
    css += `#s-${k}:checked ~ .wrap .sb-${k}{${ACTIVE_PILL}}\n`;
  });
  // History sub-tabs
  css += `#sub-mh:checked ~ .wrap #mh{display:block;}\n#sub-ms:checked ~ .wrap #ms{display:block;}\n`;
  css += `#sub-mh:checked ~ .wrap .st-mh{${ACTIVE_PILL}}\n#sub-ms:checked ~ .wrap .st-ms{${ACTIVE_PILL}}\n`;
  // Column sorting, driven entirely by CSS `order` over pre-computed positions
  VIEWER_SORT_COLS.forEach(function (col) {
    const k = col[0];
    css += `#sort-${k}-a:checked ~ .wrap .sg-body .r{order:var(--o-${k});}\n`;
    css += `#sort-${k}-d:checked ~ .wrap .sg-body .r{order:calc(0 - var(--o-${k}));}\n`;
    css += `#sort-${k}-a:checked ~ .wrap .s-${k} .lb-a{display:none;}\n`;
    css += `#sort-${k}-a:checked ~ .wrap .s-${k} .lb-d{display:block;color:#4f6ef7;}\n`;
    css += `#sort-${k}-d:checked ~ .wrap .s-${k} .lb-a{display:none;}\n`;
    css += `#sort-${k}-d:checked ~ .wrap .s-${k} .lb-r{display:block;color:#4f6ef7;}\n`;
  });
  // One rule per player card
  for (let i = 0; i < playerCount; i++) css += `#pd-${i}:checked ~ .pdm-${i}{display:flex;}\n`;
  return css;
}

function buildInteractiveViewerHTML() {
  const model = buildViewerBoards();
  const stats = buildViewerStats();
  const facts = computeFunFacts();
  const idIndex = {};
  players.forEach(function (p, i) { idIndex[p.id] = i; });
  const nameLabel = function (id, name) {
    return idIndex[id] === undefined
      ? esc(name)
      : `<label class="tapname" for="pd-${idIndex[id]}">${esc(name)}</label>`;
  };

  // --- radios (must precede .wrap so the sibling combinator can reach it)
  let ctl = `<input type="radio" name="v" id="v-lb" class="ctl" checked><input type="radio" name="v" id="v-hist" class="ctl">`;
  VIEWER_STYLES.forEach(function (st, i) {
    ctl += `<input type="radio" name="s" id="s-${st[0]}" class="ctl"${i === 0 ? " checked" : ""}>`;
  });
  ctl += `<input type="radio" name="sub" id="sub-mh" class="ctl" checked><input type="radio" name="sub" id="sub-ms" class="ctl">`;
  ctl += `<input type="radio" name="sort" id="sort-none" class="ctl" checked>`;
  VIEWER_SORT_COLS.forEach(function (col) {
    ctl += `<input type="radio" name="sort" id="sort-${col[0]}-a" class="ctl"><input type="radio" name="sort" id="sort-${col[0]}-d" class="ctl">`;
  });
  ctl += `<input type="radio" name="pd" id="pd-none" class="ctl" checked>`;
  players.forEach(function (p, i) { ctl += `<input type="radio" name="pd" id="pd-${i}" class="ctl">`; });

  // --- session header
  let sess = "";
  if (sessionName && sessionName.trim()) sess += `<div class="session-name">${esc(sessionName.trim())}</div>`;
  sess += `<div class="session-date">${esc(fmtSessionDate(sessionDate))}</div>`;

  // --- ranking style pills + the four boards
  let pills = "";
  VIEWER_STYLES.forEach(function (st) {
    pills += `<label class="style-btn sb-${st[0]}" for="s-${st[0]}">${esc(st[1])}</label>`;
  });
  const medals = ["\u{1F947}", "\u{1F948}", "\u{1F949}"];
  let boardsHtml = "";
  VIEWER_STYLES.forEach(function (st) {
    const k = st[0], rows = model.boards[k] || [];
    let body = "";
    rows.forEach(function (r) {
      const rank = r.pos <= 3 ? medals[r.pos - 1] : String(r.pos);
      body += `<tr><td>${rank}</td><td class="name">${nameLabel(r.id, r.name)}${r.star ? '<span class="star">*</span>' : ""}</td>`
            + `<td>${r.gp}</td><td class="won">${r.wins}</td><td class="pts">${esc(r.val)}</td></tr>`;
    });
    if (!rows.length) body = `<tr><td colspan="5" class="muted">No players yet.</td></tr>`;
    boardsHtml += `<div class="board b-${k}"><table class="lb"><thead><tr><th>#</th><th class="name">Name</th><th>GP</th><th>Won</th><th>${esc(model.headers[k] || st[1])}</th></tr></thead><tbody>${body}</tbody></table></div>`;
  });

  // --- fun facts
  let factsCard = "";
  if (facts.length) {
    let fl = "";
    facts.forEach(function (f) { fl += `<div class="fact"><span class="em">${f.emoji}</span><span class="tx">${f.text}</span></div>`; });
    factsCard = `<div class="card"><div class="head">✨ DID YOU KNOW?</div>${fl}</div>`;
  }

  // --- how rankings work, one block per style
  const bg = ["#fff4e0", "#e6f8ee", "#eef3ff"], fg = ["#f5a623", "#22a96e", "#4f6fff"];
  let helpHtml = "";
  VIEWER_STYLES.forEach(function (st) {
    const items = RANKING_HELP[st[0]] || RANKING_HELP.points;
    let inner = "";
    items.forEach(function (it, idx) {
      inner += `<div class="help-item"><div class="help-num" style="background:${bg[idx % 3]};color:${fg[idx % 3]}">${esc(it[0])}</div>`
             + `<div><span style="font-weight:700;color:#1b2340;">${esc(it[1])}</span> <span class="muted" style="font-size:13px;">— ${esc(it[2])}</span></div></div>`;
    });
    helpHtml += `<div class="helpblk h-${st[0]}">${inner}</div>`;
  });

  // --- match history
  let histHtml = "";
  [].concat(matchHistory).reverse().forEach(function (h) {
    const has = h.scoreA !== null && h.scoreA !== undefined;
    const draw = has && h.scoreA === h.scoreB, aWon = has && h.scoreA > h.scoreB;
    const aCls = has ? (draw ? "" : aWon ? "winner" : "loser") : "";
    const bCls = has ? (draw ? "" : !aWon ? "winner" : "loser") : "";
    let cat = (h.category === "MD" || h.category === "WD" || h.category === "XD")
      ? h.category : inferCategoryFromPlayers([].concat(h.pairAIds || [], h.pairBIds || []).map(byId));
    const score = has
      ? `<span class="hist-score"><span class="${draw ? "" : aWon ? "winner" : "loser"}">${h.scoreA}</span>–<span class="${draw ? "" : !aWon ? "winner" : "loser"}">${h.scoreB}</span></span>`
      : "";
    let meta = "";
    if (cat) meta += `<span class="tag">${esc(cat)}</span>`;
    // No "X won" tag: the green name and score already say it. Draw is kept because a draw
    // colours nothing, so the badge is its only signal. Matches the app's History tab.
    if (draw) meta += `<span class="tag">Draw</span>`;
    if (h.court) meta += `<span class="tag">Court ${esc(String(h.court))}</span>`;
    if (h.time) meta += `<span class="muted">${esc(h.time)}</span>`;
    histHtml += `<div class="hist"><div class="hist-top"><div class="hist-match">`
      + `<span class="${aCls}">${esc(formatPairNames(h.pairA || []))}</span><span class="hist-vs">vs</span>`
      + `<span class="${bCls}">${esc(formatPairNames(h.pairB || []))}</span></div>${score}</div>`
      + `<div class="hist-meta">${meta}</div></div>`;
  });
  if (!histHtml) histHtml = `<div class="muted">No matches yet.</div>`;

  // --- match stats, sortable without script
  let statsHead = "";
  VIEWER_SORT_COLS.forEach(function (col) {
    // Three stacked labels, one visible at a time: tapping the whole header cell cycles
    // unsorted -> ascending -> descending -> ascending, exactly like the app.
    statsHead += `<div class="s s-${col[0]}">`
      + `<label class="lb-a" for="sort-${col[0]}-a">${esc(col[1])}</label>`
      + `<label class="lb-d" for="sort-${col[0]}-d">${esc(col[1])} ▲</label>`
      + `<label class="lb-r" for="sort-${col[0]}-a">${esc(col[1])} ▼</label>`
      + `</div>`;
  });
  let statsRows = "";
  stats.rows.forEach(function (r) {
    const vars = VIEWER_SORT_COLS.map(function (c) { return `--o-${c[0]}:${stats.orders[c[0]][r.id]}`; }).join(";");
    statsRows += `<div class="r" style="${vars}"><div>${nameLabel(r.id, r.name)}</div>`
      + `<div class="g${r.gender}">${r.gender}</div><div>${r.gp}</div><div>${r.md}</div><div>${r.wd}</div><div>${r.xd}</div></div>`;
  });
  if (!statsRows) statsRows = `<div class="muted">No players yet.</div>`;

  // --- one card per player
  let modals = "";
  players.forEach(function (p, i) {
    const d = computePlayerDetail(p.id);
    if (!d) return;
    modals += `<div class="pdm pdm-${i}"><label class="pdm-back" for="pd-none" aria-label="Close"></label>`
      + `<div class="pdm-box"><div class="pdm-head"><span class="pdm-title">${esc(d.name)}</span>`
      + `<label class="pdm-x" for="pd-none" aria-label="Close">×</label></div>${playerDetailHtml(d)}</div></div>`;
  });

  const title = (sessionName && sessionName.trim())
    ? `${esc(sessionName.trim())} — CourtMixer` : "CourtMixer — shared leaderboard";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="theme-color" content="#4f6fff">
<title>${title}</title>
<style>${viewerCss(players.length)}</style>
</head>
<body>
${ctl}
<div class="wrap">
<div class="brand"><a class="brand-link" href="${APP_URL}" target="_blank" rel="noopener"><img class="brand-logo" src="data:image/svg+xml;base64,${CMX_LOGO_B64}" alt="CourtMixer"></a><div class="brand-cta">Made with <a href="${APP_URL}" target="_blank" rel="noopener">CourtMixer</a> \u2014 tap to open the app</div></div>
<div class="tabs"><label class="tab t-lb" for="v-lb">Leaderboard</label><label class="tab t-hist" for="v-hist">History</label></div>
<section id="lbv" class="view">
<div class="card">${sess}<div class="styles">${pills}</div>${boardsHtml}<div class="lb-hint">Tap a name for player details.</div></div>
${factsCard}
<div class="card"><div class="head">HOW RANKINGS WORK</div>${helpHtml}</div>
</section>
<section id="histv" class="view">
<div class="subtabs"><label class="subtab st-mh" for="sub-mh">Match History</label><label class="subtab st-ms" for="sub-ms">Match Stats</label></div>
<div id="mh" class="subview"><div class="card">${histHtml}</div></div>
<div id="ms" class="subview"><div class="card"><div class="sg"><div class="hr">${statsHead}</div><div class="sg-body">${statsRows}</div></div></div></div>
</section>
<div class="foot">Shared from <a href="${APP_URL}" target="_blank" rel="noopener" style="color:#4f6ef7;text-decoration:none;">CourtMixer</a> v${esc(APP_VERSION)} · read-only snapshot</div>
</div>
${modals}
</body>
</html>`;
}

function shareInteractiveLeaderboard(){
  var doc;
  try { doc = buildInteractiveViewerHTML(); } catch (e) { cmxAlert("Could not build the interactive leaderboard."); return; }
  var blob = new Blob([doc], { type: "text/html" });
  var fname = shareFileBase() + ".html";
  var file = new File([blob], fname, { type: "text/html" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: "CourtMixer leaderboard" }).catch(function(){}); return; }
  var url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = fname; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){ URL.revokeObjectURL(url); }, 1500);
}
function shareLeaderboardChooser(){
  cmxShowModal({ title: "Share leaderboard",
    bodyHTML: '<p class="cmx-modal-text">Choose how to share your leaderboard.</p>',
    buttons: [
      { label: "Share leaderboard as image (.png)", cls: "primary", onClick: function(){ shareLeaderboardImage(); } },
      { label: "Share interactive leaderboard (.html)", cls: "secondary", onClick: function(){ shareInteractiveLeaderboard(); } },
      { label: "Cancel", cls: "ghost", onClick: function(){} }
    ] });
}

function shareLeaderboardImage() {
let canvas;
try { canvas = generateShareCanvas(); } catch (e) { cmxAlert("Could not build the image."); return; }
canvas.toBlob((blob) => {
if (!blob) { cmxAlert("Could not build the image."); return; }
const fname = shareFileBase() + ".png";
const file = new File([blob], fname, { type: "image/png" });
const title = sessionName.trim() || "CourtMixer leaderboard";
if (navigator.canShare && navigator.canShare({ files: [file] })) {
navigator.share({ files: [file], title }).catch(() => {});
return;
}
const url = URL.createObjectURL(blob);
const a = document.createElement("a"); a.href = url; a.download = fname; document.body.appendChild(a); a.click(); a.remove();
setTimeout(() => URL.revokeObjectURL(url), 1500);
}, "image/png");
}
