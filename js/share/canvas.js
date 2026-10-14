// CourtMixer - share as image: canvas text helpers and the leaderboard PNG
// Moved verbatim from index.html in Phase 0 (v1.9.0). Loaded as a classic script;
// all top-level declarations share one global scope, exactly as before the split.

function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function wrapText(ctx, text, maxW) { const words = text.split(/\s+/); const lines = []; let cur = ""; for (const w of words) { const t = cur ? cur + " " + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; } if (cur) lines.push(cur); return lines; }
function clipText(ctx, text, maxW) { if (ctx.measureText(text).width <= maxW) return text; let t = text; while (t.length > 1 && ctx.measureText(t + "\u2026").width > maxW) t = t.slice(0, -1); return t + "\u2026"; }

function scoredGamesMap() {
const m = {};
matchHistory.forEach(h => { if (h.scoreA === null || h.scoreA === undefined) return; if (!h.pairAIds || !h.pairBIds) return; [...h.pairAIds, ...h.pairBIds].forEach(id => { m[id] = (m[id] || 0) + 1; }); });
return m;
}
function computeLeaderboardData() {
const totalPoints = players.reduce((s, p) => s + p.points, 0);
const sg = scoredGamesMap();
const scoredOf = (p) => sg[p.id] || 0;
const totalSG = players.reduce((s, p) => s + scoredOf(p), 0);
const avgPPG = totalSG > 0 ? totalPoints / totalSG : 0;
const maxGP = players.reduce((mx, p) => Math.max(mx, p.matches), 0);
const maxSG = players.reduce((mx, p) => Math.max(mx, scoredOf(p)), 0);
const metric = (p) => scoringStyle === "adjpts" ? p.points + (maxSG - scoredOf(p)) * avgPPG : scoringStyle === "ptspergp" ? (scoredOf(p) > 0 ? p.points / scoredOf(p) : 0) : p.points;
const ranked = [...players].sort((a, b) => { const ma = metric(a), mb = metric(b); if (mb !== ma) return mb - ma; if (b.wins !== a.wins) return b.wins - a.wins; return (b.pointsDiff || 0) - (a.pointsDiff || 0); });
let header, valueFn, showStar = false;
if (scoringStyle === "league") { header = "League"; valueFn = p => p.points; }
else if (scoringStyle === "adjpts") { header = "Adj-Pts"; valueFn = p => Math.round(metric(p)); showStar = true; }
else if (scoringStyle === "ptspergp") { header = "Pts/GP"; valueFn = p => (scoredOf(p) > 0 ? (p.points / scoredOf(p)).toFixed(1) : "0.0"); }
else { header = "Points"; valueFn = p => p.points; }
return { ranked, header, valueFn, showStar, maxGP, avgPPG, maxSG, scoredOf };
}

function drawCard(ctx, x, y, w, h) { ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "#d8e3ff"; ctx.lineWidth = 1; roundRect(ctx, x, y, w, h, 14); ctx.fill(); ctx.stroke(); }

const RANKING_HELP = {
points: [["1","Points","Your pair's score in each match is added to your total. Win 21–15 and you earn 21 pts; opponents earn 15 each. More points = higher rank."],["2","Wins","If two players have equal points, the one with more match wins ranks higher."],["3","Points difference","Still tied? Your total score margin across all games (win 21–15 is +6, lose it is −6). A higher difference ranks higher."]],
adjpts: [["1","Adjusted points","Players who have played fewer games are topped up so totals are comparable. Each missing game is credited at the group's average points per game."],["2","The maths","Adjusted = your points + (most games anyone played − your games) × average points per game. A * marks anyone who got a top-up."],["3","Tiebreakers","Equal adjusted points? More wins ranks higher, then points difference."]],
league: [["1","League points","Win a match and each player on the winning pair earns 3 points; the losing pair earns 1 point each."],["2","Wins","Match wins are tracked separately. If league points are tied, the player with more wins ranks higher."],["3","Points difference","Still tied? The player with the better total score margin ranks higher."]],
ptspergp: [["1","Points per game","Your total points divided by games played, so the ranking stays fair even when people play different numbers of games."],["2","Wins","Equal points per game? The player with more wins ranks higher."],["3","Points difference","Still tied? The player with the better total score margin ranks higher."]]
};


function parseRuns(htmlText){
  var runs=[], re=/<strong>([\s\S]*?)<\/strong>|([^<]+)/g, m;
  while((m=re.exec(htmlText))!==null){
    if(m[1]!==undefined) runs.push({text:m[1].replace(/<[^>]+>/g,""), bold:true});
    else if(m[2]!==undefined) runs.push({text:m[2].replace(/<[^>]+>/g,""), bold:false});
  }
  runs.forEach(function(r){ r.text=r.text.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'"); });
  return runs;
}
function layoutRuns(ctx, runs, maxW, fontN, fontB){
  var lines=[], cur=[], curW=0;
  runs.forEach(function(run){
    run.text.split(/(\s+)/).forEach(function(tok){
      if(tok==="") return;
      ctx.font = run.bold?fontB:fontN;
      var w=ctx.measureText(tok).width;
      if(/^\s+$/.test(tok)){ if(cur.length){ cur.push({text:tok,bold:run.bold}); curW+=w; } }
      else { if(curW+w>maxW && cur.length){ lines.push(cur); cur=[]; curW=0; } cur.push({text:tok,bold:run.bold}); curW+=w; }
    });
  });
  if(cur.length) lines.push(cur);
  lines.forEach(function(ln){ while(ln.length && /^\s+$/.test(ln[ln.length-1].text)) ln.pop(); });
  return lines;
}
function drawRunLine(ctx, line, x, y, fontN, fontB, colN, colB){
  var cx=x; ctx.textAlign="left";
  line.forEach(function(tok){ ctx.font=tok.bold?fontB:fontN; ctx.fillStyle=tok.bold?colB:colN; ctx.fillText(tok.text, cx, y); cx+=ctx.measureText(tok.text).width; });
}

var CMX_LOGO_B64 = "PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1NzUuOSAxNDAuMCIgd2lkdGg9IjU3NS45IiBoZWlnaHQ9IjE0MC4wIiByb2xlPSJpbWciIGFyaWEtbGFiZWw9IkNvdXJ0TWl4ZXIg4oCUIGNvdXJ0IHNwb3J0cyBtYXRjaG1ha2luZyI+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoLTMuMjAgMCkiPjxwYXRoIGQ9Ik0zODMgNzEyUTUxNSA3MTIgNjA1LjAgNjQxLjVRNjk1IDU3MSA3MjEgNDUwSDUxMFE0OTEgNDkwIDQ1Ny41IDUxMS4wUTQyNCA1MzIgMzgwIDUzMlEzMTIgNTMyIDI3MS41IDQ4My41UTIzMSA0MzUgMjMxIDM1NFEyMzEgMjcyIDI3MS41IDIyMy41UTMxMiAxNzUgMzgwIDE3NVE0MjQgMTc1IDQ1Ny41IDE5Ni4wUTQ5MSAyMTcgNTEwIDI1N0g3MjFRNjk1IDEzNiA2MDUuMCA2NS41UTUxNSAtNSAzODMgLTVRMjc5IC01IDE5OS4wIDQwLjVRMTE5IDg2IDc1LjUgMTY3LjVRMzIgMjQ5IDMyIDM1NFEzMiA0NTggNzUuNSA1MzkuNVExMTkgNjIxIDE5OS4wIDY2Ni41UTI3OSA3MTIgMzgzIDcxMloiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDAuMDAgMTAwLjAwKSBzY2FsZSgwLjEwMDAwIC0wLjEwMDAwKSIgZmlsbD0iIzFiMjM0MCIvPjxwYXRoIGQ9Ik0yNCAyODFRMjQgMzY4IDYyLjUgNDMzLjBRMTAxIDQ5OCAxNjcuNSA1MzMuMFEyMzQgNTY4IDMxOCA1NjhRNDAyIDU2OCA0NjguNSA1MzMuMFE1MzUgNDk4IDU3My41IDQzMy4wUTYxMiAzNjggNjEyIDI4MVE2MTIgMTk0IDU3My41IDEyOC41UTUzNSA2MyA0NjguMCAyOC4wUTQwMSAtNyAzMTcgLTdRMjMzIC03IDE2Ni41IDI4LjBRMTAwIDYzIDYyLjAgMTI4LjBRMjQgMTkzIDI0IDI4MVpNNDEzIDI4MVE0MTMgMzM4IDM4NS41IDM2OC4wUTM1OCAzOTggMzE4IDM5OFEyNzggMzk4IDI1MS4wIDM2OC4wUTIyNCAzMzggMjI0IDI4MVEyMjQgMjIzIDI1MC4wIDE5My4wUTI3NiAxNjMgMzE3IDE2M1EzNTggMTYzIDM4NS41IDE5My41UTQxMyAyMjQgNDEzIDI4MVoiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDc1LjgwIDEwMC4wMCkgc2NhbGUoMC4xMDAwMCAtMC4xMDAwMCkiIGZpbGw9IiMxYjIzNDAiLz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxMzEuODAgMjEuODIpIHNjYWxlKDEuODE4MTgpIj48cGF0aCBkPSJNMTQgMzEgTDUgOSBROCAzIDEyIDkgUTE2IDIgMjAgOSBRMjQgMiAyOCA5IFEzMiAzIDM1IDkgTDI2IDMxIFoiIGZpbGw9IiNmM2Y0ZjgiIHN0cm9rZT0iIzFiMjM0MCIgc3Ryb2tlLXdpZHRoPSIxLjYiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48cGF0aCBkPSJNMjAgMzAgTDEyIDEwIiBzdHJva2U9IiMxYjIzNDAiIHN0cm9rZS13aWR0aD0iMC45IiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48cGF0aCBkPSJNMjAgMzAgTDIwIDkiIHN0cm9rZT0iIzFiMjM0MCIgc3Ryb2tlLXdpZHRoPSIwLjkiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPjxwYXRoIGQ9Ik0yMCAzMCBMMjggMTAiIHN0cm9rZT0iIzFiMjM0MCIgc3Ryb2tlLXdpZHRoPSIwLjkiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPjxyZWN0IHg9IjEzIiB5PSIzMCIgd2lkdGg9IjE0IiBoZWlnaHQ9IjUiIHJ4PSIyLjMiIGZpbGw9IiMxYjIzNDAiLz48cGF0aCBkPSJNMTQgMzQgTDE0IDM4IFExNCA0MyAyMCA0MyBRMjYgNDMgMjYgMzggTDI2IDM0IFoiIGZpbGw9IiNmM2Y0ZjgiIHN0cm9rZT0iIzFiMjM0MCIgc3Ryb2tlLXdpZHRoPSIxLjYiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48Y2lyY2xlIGN4PSIxNi44IiBjeT0iMzkuOCIgcj0iMS41IiBmaWxsPSIjZmZmZmZmIi8+PC9nPjxwYXRoIGQ9Ik00MzMgNTY2VjM1N0gzNzhRMzE0IDM1NyAyODMuMCAzMzIuMFEyNTIgMzA3IDI1MiAyNDVWMEg1NlY1NjFIMjUyVjQ2MlEyODUgNTEwIDMzMi4wIDUzOC4wUTM3OSA1NjYgNDMzIDU2NloiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDE5Ni45MCAxMDAuMDApIHNjYWxlKDAuMTAwMDAgLTAuMTAwMDApIiBmaWxsPSIjMWIyMzQwIi8+PHBhdGggZD0iTTM4NyAxNjdWMEgzMDJRODcgMCA4NyAyMTNWMzk4SDE4VjU2MUg4N1Y2OTdIMjg0VjU2MUgzODZWMzk4SDI4NFYyMTBRMjg0IDE4NyAyOTQuNSAxNzcuMFEzMDUgMTY3IDMzMCAxNjdaIiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgyNDQuNjAgMTAwLjAwKSBzY2FsZSgwLjEwMDAwIC0wLjEwMDAwKSIgZmlsbD0iIzFiMjM0MCIvPjxwYXRoIGQ9Ik04NzkgNzA1VjBINjgzVjM4OUw1NTAgMEgzODZMMjUyIDM5MlYwSDU2VjcwNUgyOTNMNDcwIDI0N0w2NDMgNzA1WiIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMjg2LjcwIDEwMC4wMCkgc2NhbGUoMC4wOTAwMCAtMC4wOTAwMCkiIGZpbGw9IiM0ZjZlZjciLz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgzNzEuODUgMi43MCkgc2NhbGUoMi43MDI3MCkiPjxjaXJjbGUgY3g9IjYuNSIgY3k9IjciIHI9IjYiIGZpbGw9IiNlM2ZmM2EiIHN0cm9rZT0iI2I5ZDQwMCIgc3Ryb2tlLXdpZHRoPSIwLjkiLz48cGF0aCBkPSJNMi42IDMgUTcuNSA3IDIuNiAxMSIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjEuMSIvPjxwYXRoIGQ9Ik0xMC40IDMgUTUuNSA3IDEwLjQgMTEiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIxLjEiLz48cmVjdCB4PSIzLjUiIHk9IjE1IiB3aWR0aD0iNiIgaGVpZ2h0PSIyMSIgcng9IjMiIGZpbGw9IiM0ZjZlZjciLz48L2c+PHBhdGggZD0iTTQwNiAwIDMwNSAxNDEgMjI1IDBIMTBMMTk3IDI5MUwyIDU2MUgyMjJMMzIzIDQyMEw0MDQgNTYxSDYxOUw0MjggMjc1TDYyNiAwWiIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoNDA3Ljk1IDEwMC4wMCkgc2NhbGUoMC4xMDAwMCAtMC4xMDAwMCkiIGZpbGw9IiM0ZjZlZjciLz48cGF0aCBkPSJNNTg5IDI0MUgyMThRMjIxIDE5NSAyNDMuNSAxNzIuNVEyNjYgMTUwIDMwMSAxNTBRMzUwIDE1MCAzNzEgMTk0SDU4MFE1NjcgMTM2IDUyOS41IDkwLjVRNDkyIDQ1IDQzNS4wIDE5LjBRMzc4IC03IDMwOSAtN1EyMjYgLTcgMTYxLjUgMjguMFE5NyA2MyA2MC41IDEyOC4wUTI0IDE5MyAyNCAyODFRMjQgMzY5IDYwLjAgNDMzLjVROTYgNDk4IDE2MC41IDUzMy4wUTIyNSA1NjggMzA5IDU2OFEzOTIgNTY4IDQ1Ni4wIDUzNC4wUTUyMCA1MDAgNTU2LjAgNDM2LjVRNTkyIDM3MyA1OTIgMjg3UTU5MiAyNjQgNTg5IDI0MVpNMzkyIDMzNlEzOTIgMzcyIDM2OC4wIDM5Mi41UTM0NCA0MTMgMzA4IDQxM1EyNzIgNDEzIDI0OS4wIDM5My41UTIyNiAzNzQgMjE5IDMzNloiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDQ3MC43NSAxMDAuMDApIHNjYWxlKDAuMTAwMDAgLTAuMTAwMDApIiBmaWxsPSIjNGY2ZWY3Ii8+PHBhdGggZD0iTTQzMyA1NjZWMzU3SDM3OFEzMTQgMzU3IDI4My4wIDMzMi4wUTI1MiAzMDcgMjUyIDI0NVYwSDU2VjU2MUgyNTJWNDYyUTI4NSA1MTAgMzMyLjAgNTM4LjBRMzc5IDU2NiA0MzMgNTY2WiIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoNTMyLjM1IDEwMC4wMCkgc2NhbGUoMC4xMDAwMCAtMC4xMDAwMCkiIGZpbGw9IiM0ZjZlZjciLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoOS4wNyAwKSI+PHBhdGggZD0iTTM5MiA3MDRRNTAzIDcwNCA1ODkuNSA2NDkuNVE2NzYgNTk1IDcxNSA0OTVINTc4UTU1MSA1NTAgNTAzLjAgNTc3LjBRNDU1IDYwNCAzOTIgNjA0UTMyMyA2MDQgMjY5LjAgNTczLjBRMjE1IDU0MiAxODQuNSA0ODQuMFExNTQgNDI2IDE1NCAzNDlRMTU0IDI3MiAxODQuNSAyMTQuMFEyMTUgMTU2IDI2OS4wIDEyNC41UTMyMyA5MyAzOTIgOTNRNDU1IDkzIDUwMy4wIDEyMC4wUTU1MSAxNDcgNTc4IDIwMkg3MTVRNjc2IDEwMiA1ODkuNSA0OC4wUTUwMyAtNiAzOTIgLTZRMjk0IC02IDIxMy4wIDM5LjVRMTMyIDg1IDg0LjUgMTY2LjBRMzcgMjQ3IDM3IDM0OVEzNyA0NTEgODQuNSA1MzIuMFExMzIgNjEzIDIxMy41IDY1OC41UTI5NSA3MDQgMzkyIDcwNFoiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDAuMDAgMTM0LjAwKSBzY2FsZSgwLjAyNTAwIC0wLjAyNTAwKSIgZmlsbD0iIzVmNmQ5NCIvPjxwYXRoIGQ9Ik0zNyAzNDlRMzcgNDUxIDg0LjUgNTMyLjBRMTMyIDYxMyAyMTMuNSA2NTguNVEyOTUgNzA0IDM5MiA3MDRRNDkwIDcwNCA1NzEuNSA2NTguNVE2NTMgNjEzIDcwMC4wIDUzMi4wUTc0NyA0NTEgNzQ3IDM0OVE3NDcgMjQ3IDcwMC4wIDE2NS41UTY1MyA4NCA1NzEuNSAzOC41UTQ5MCAtNyAzOTIgLTdRMjk1IC03IDIxMy41IDM4LjVRMTMyIDg0IDg0LjUgMTY1LjVRMzcgMjQ3IDM3IDM0OVpNNjMwIDM0OVE2MzAgNDI2IDU5OS41IDQ4NC4wUTU2OSA1NDIgNTE1LjAgNTczLjBRNDYxIDYwNCAzOTIgNjA0UTMyMyA2MDQgMjY5LjAgNTczLjBRMjE1IDU0MiAxODQuNSA0ODQuMFExNTQgNDI2IDE1NCAzNDlRMTU0IDI3MiAxODQuNSAyMTMuNVEyMTUgMTU1IDI2OS4wIDEyMy41UTMyMyA5MiAzOTIgOTJRNDYxIDkyIDUxNS4wIDEyMy41UTU2OSAxNTUgNTk5LjUgMjEzLjVRNjMwIDI3MiA2MzAgMzQ5WiIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMjUuMDEgMTM0LjAwKSBzY2FsZSgwLjAyNTAwIC0wLjAyNTAwKSIgZmlsbD0iIzVmNmQ5NCIvPjxwYXRoIGQ9Ik0xODggNjk1VjI1MlExODggMTczIDIyOS41IDEzMy4wUTI3MSA5MyAzNDUgOTNRNDIwIDkzIDQ2MS41IDEzMy4wUTUwMyAxNzMgNTAzIDI1MlY2OTVINjE3VjI1NFE2MTcgMTY5IDU4MC4wIDExMC4wUTU0MyA1MSA0ODEuMCAyMi4wUTQxOSAtNyAzNDQgLTdRMjY5IC03IDIwNy41IDIyLjBRMTQ2IDUxIDExMC4wIDExMC4wUTc0IDE2OSA3NCAyNTRWNjk1WiIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoNTAuMjkgMTM0LjAwKSBzY2FsZSgwLjAyNTAwIC0wLjAyNTAwKSIgZmlsbD0iIzVmNmQ5NCIvPjxwYXRoIGQ9Ik00MzYgMCAyNzYgMjc4SDE4OVYwSDc1VjY5NUgzMTVRMzk1IDY5NSA0NTAuNSA2NjcuMFE1MDYgNjM5IDUzMy41IDU5Mi4wUTU2MSA1NDUgNTYxIDQ4N1E1NjEgNDE5IDUyMS41IDM2My41UTQ4MiAzMDggNDAwIDI4OEw1NzIgMFpNMTg5IDM2OUgzMTVRMzc5IDM2OSA0MTEuNSA0MDEuMFE0NDQgNDMzIDQ0NCA0ODdRNDQ0IDU0MSA0MTIuMCA1NzEuNVEzODAgNjAyIDMxNSA2MDJIMTg5WiIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoNzMuMjIgMTM0LjAwKSBzY2FsZSgwLjAyNTAwIC0wLjAyNTAwKSIgZmlsbD0iIzVmNmQ5NCIvPjxwYXRoIGQ9Ik01MjQgNjk1VjYwMkgzMzlWMEgyMjVWNjAySDM5VjY5NVoiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDk0LjcwIDEzNC4wMCkgc2NhbGUoMC4wMjUwMCAtMC4wMjUwMCkiIGZpbGw9IiM1ZjZkOTQiLz48cGF0aCBkPSJNNTggMTkySDE4MFExODQgMTQ3IDIxNS41IDExOC4wUTI0NyA4OSAzMDQgODlRMzYzIDg5IDM5Ni4wIDExNy41UTQyOSAxNDYgNDI5IDE5MVE0MjkgMjI2IDQwOC41IDI0OC4wUTM4OCAyNzAgMzU3LjUgMjgyLjBRMzI3IDI5NCAyNzMgMzA4UTIwNSAzMjYgMTYyLjUgMzQ0LjVRMTIwIDM2MyA5MC4wIDQwMi4wUTYwIDQ0MSA2MCA1MDZRNjAgNTY2IDkwLjAgNjExLjBRMTIwIDY1NiAxNzQuMCA2ODAuMFEyMjggNzA0IDI5OSA3MDRRNDAwIDcwNCA0NjQuNSA2NTMuNVE1MjkgNjAzIDUzNiA1MTVINDEwUTQwNyA1NTMgMzc0LjAgNTgwLjBRMzQxIDYwNyAyODcgNjA3UTIzOCA2MDcgMjA3LjAgNTgyLjBRMTc2IDU1NyAxNzYgNTEwUTE3NiA0NzggMTk1LjUgNDU3LjVRMjE1IDQzNyAyNDUuMCA0MjUuMFEyNzUgNDEzIDMyNyAzOTlRMzk2IDM4MCA0MzkuNSAzNjEuMFE0ODMgMzQyIDUxMy41IDMwMi41UTU0NCAyNjMgNTQ0IDE5N1E1NDQgMTQ0IDUxNS41IDk3LjBRNDg3IDUwIDQzMi41IDIxLjVRMzc4IC03IDMwNCAtN1EyMzQgLTcgMTc4LjAgMTcuNVExMjIgNDIgOTAuMCA4Ny4wUTU4IDEzMiA1OCAxOTJaIiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxMjYuNjcgMTM0LjAwKSBzY2FsZSgwLjAyNTAwIC0wLjAyNTAwKSIgZmlsbD0iIzVmNmQ5NCIvPjxwYXRoIGQ9Ik0zMTUgMjgySDE4OVYwSDc1VjY5NUgzMTVRMzk1IDY5NSA0NTAuNSA2NjcuNVE1MDYgNjQwIDUzMy41IDU5My4wUTU2MSA1NDYgNTYxIDQ4OFE1NjEgNDM1IDUzNi4wIDM4OC4wUTUxMSAzNDEgNDU2LjAgMzExLjVRNDAxIDI4MiAzMTUgMjgyWk00NDQgNDg4UTQ0NCA2MDIgMzE1IDYwMkgxODlWMzc1SDMxNVEzODAgMzc1IDQxMi4wIDQwNC41UTQ0NCA0MzQgNDQ0IDQ4OFoiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDE0Ny40NSAxMzQuMDApIHNjYWxlKDAuMDI1MDAgLTAuMDI1MDApIiBmaWxsPSIjNWY2ZDk0Ii8+PHBhdGggZD0iTTM3IDM0OVEzNyA0NTEgODQuNSA1MzIuMFExMzIgNjEzIDIxMy41IDY1OC41UTI5NSA3MDQgMzkyIDcwNFE0OTAgNzA0IDU3MS41IDY1OC41UTY1MyA2MTMgNzAwLjAgNTMyLjBRNzQ3IDQ1MSA3NDcgMzQ5UTc0NyAyNDcgNzAwLjAgMTY1LjVRNjUzIDg0IDU3MS41IDM4LjVRNDkwIC03IDM5MiAtN1EyOTUgLTcgMjEzLjUgMzguNVExMzIgODQgODQuNSAxNjUuNVEzNyAyNDcgMzcgMzQ5Wk02MzAgMzQ5UTYzMCA0MjYgNTk5LjUgNDg0LjBRNTY5IDU0MiA1MTUuMCA1NzMuMFE0NjEgNjA0IDM5MiA2MDRRMzIzIDYwNCAyNjkuMCA1NzMuMFEyMTUgNTQyIDE4NC41IDQ4NC4wUTE1NCA0MjYgMTU0IDM0OVExNTQgMjcyIDE4NC41IDIxMy41UTIxNSAxNTUgMjY5LjAgMTIzLjVRMzIzIDkyIDM5MiA5MlE0NjEgOTIgNTE1LjAgMTIzLjVRNTY5IDE1NSA1OTkuNSAyMTMuNVE2MzAgMjcyIDYzMCAzNDlaIiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxNjguMDAgMTM0LjAwKSBzY2FsZSgwLjAyNTAwIC0wLjAyNTAwKSIgZmlsbD0iIzVmNmQ5NCIvPjxwYXRoIGQ9Ik00MzYgMCAyNzYgMjc4SDE4OVYwSDc1VjY5NUgzMTVRMzk1IDY5NSA0NTAuNSA2NjcuMFE1MDYgNjM5IDUzMy41IDU5Mi4wUTU2MSA1NDUgNTYxIDQ4N1E1NjEgNDE5IDUyMS41IDM2My41UTQ4MiAzMDggNDAwIDI4OEw1NzIgMFpNMTg5IDM2OUgzMTVRMzc5IDM2OSA0MTEuNSA0MDEuMFE0NDQgNDMzIDQ0NCA0ODdRNDQ0IDU0MSA0MTIuMCA1NzEuNVEzODAgNjAyIDMxNSA2MDJIMTg5WiIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMTkzLjI5IDEzNC4wMCkgc2NhbGUoMC4wMjUwMCAtMC4wMjUwMCkiIGZpbGw9IiM1ZjZkOTQiLz48cGF0aCBkPSJNNTI0IDY5NVY2MDJIMzM5VjBIMjI1VjYwMkgzOVY2OTVaIiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgyMTQuNzcgMTM0LjAwKSBzY2FsZSgwLjAyNTAwIC0wLjAyNTAwKSIgZmlsbD0iIzVmNmQ5NCIvPjxwYXRoIGQ9Ik01OCAxOTJIMTgwUTE4NCAxNDcgMjE1LjUgMTE4LjBRMjQ3IDg5IDMwNCA4OVEzNjMgODkgMzk2LjAgMTE3LjVRNDI5IDE0NiA0MjkgMTkxUTQyOSAyMjYgNDA4LjUgMjQ4LjBRMzg4IDI3MCAzNTcuNSAyODIuMFEzMjcgMjk0IDI3MyAzMDhRMjA1IDMyNiAxNjIuNSAzNDQuNVExMjAgMzYzIDkwLjAgNDAyLjBRNjAgNDQxIDYwIDUwNlE2MCA1NjYgOTAuMCA2MTEuMFExMjAgNjU2IDE3NC4wIDY4MC4wUTIyOCA3MDQgMjk5IDcwNFE0MDAgNzA0IDQ2NC41IDY1My41UTUyOSA2MDMgNTM2IDUxNUg0MTBRNDA3IDU1MyAzNzQuMCA1ODAuMFEzNDEgNjA3IDI4NyA2MDdRMjM4IDYwNyAyMDcuMCA1ODIuMFExNzYgNTU3IDE3NiA1MTBRMTc2IDQ3OCAxOTUuNSA0NTcuNVEyMTUgNDM3IDI0NS4wIDQyNS4wUTI3NSA0MTMgMzI3IDM5OVEzOTYgMzgwIDQzOS41IDM2MS4wUTQ4MyAzNDIgNTEzLjUgMzAyLjVRNTQ0IDI2MyA1NDQgMTk3UTU0NCAxNDQgNTE1LjUgOTcuMFE0ODcgNTAgNDMyLjUgMjEuNVEzNzggLTcgMzA0IC03UTIzNCAtNyAxNzguMCAxNy41UTEyMiA0MiA5MC4wIDg3LjBRNTggMTMyIDU4IDE5MloiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDIzNC41NSAxMzQuMDApIHNjYWxlKDAuMDI1MDAgLTAuMDI1MDApIiBmaWxsPSIjNWY2ZDk0Ii8+PHBhdGggZD0iTTgwNyA2OTVWMEg2OTNWNDc2TDQ4MSAwSDQwMkwxODkgNDc2VjBINzVWNjk1SDE5OEw0NDIgMTUwTDY4NSA2OTVaIiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgyNjcuNTEgMTM0LjAwKSBzY2FsZSgwLjAyNTAwIC0wLjAyNTAwKSIgZmlsbD0iIzVmNmQ5NCIvPjxwYXRoIGQ9Ik00OTQgMTQySDIwM0wxNTMgMEgzNEwyODMgNjk2SDQxNUw2NjQgMEg1NDRaTTQ2MiAyMzUgMzQ5IDU1OCAyMzUgMjM1WiIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMjk1LjI1IDEzNC4wMCkgc2NhbGUoMC4wMjUwMCAtMC4wMjUwMCkiIGZpbGw9IiM1ZjZkOTQiLz48cGF0aCBkPSJNNTI0IDY5NVY2MDJIMzM5VjBIMjI1VjYwMkgzOVY2OTVaIiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgzMTguMzUgMTM0LjAwKSBzY2FsZSgwLjAyNTAwIC0wLjAyNTAwKSIgZmlsbD0iIzVmNmQ5NCIvPjxwYXRoIGQ9Ik0zOTIgNzA0UTUwMyA3MDQgNTg5LjUgNjQ5LjVRNjc2IDU5NSA3MTUgNDk1SDU3OFE1NTEgNTUwIDUwMy4wIDU3Ny4wUTQ1NSA2MDQgMzkyIDYwNFEzMjMgNjA0IDI2OS4wIDU3My4wUTIxNSA1NDIgMTg0LjUgNDg0LjBRMTU0IDQyNiAxNTQgMzQ5UTE1NCAyNzIgMTg0LjUgMjE0LjBRMjE1IDE1NiAyNjkuMCAxMjQuNVEzMjMgOTMgMzkyIDkzUTQ1NSA5MyA1MDMuMCAxMjAuMFE1NTEgMTQ3IDU3OCAyMDJINzE1UTY3NiAxMDIgNTg5LjUgNDguMFE1MDMgLTYgMzkyIC02UTI5NCAtNiAyMTMuMCAzOS41UTEzMiA4NSA4NC41IDE2Ni4wUTM3IDI0NyAzNyAzNDlRMzcgNDUxIDg0LjUgNTMyLjBRMTMyIDYxMyAyMTMuNSA2NTguNVEyOTUgNzA0IDM5MiA3MDRaIiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgzMzguMTMgMTM0LjAwKSBzY2FsZSgwLjAyNTAwIC0wLjAyNTAwKSIgZmlsbD0iIzVmNmQ5NCIvPjxwYXRoIGQ9Ik02MzAgNjk1VjBINTE2VjMwNEgxODlWMEg3NVY2OTVIMTg5VjM5N0g1MTZWNjk1WiIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMzYzLjE0IDEzNC4wMCkgc2NhbGUoMC4wMjUwMCAtMC4wMjUwMCkiIGZpbGw9IiM1ZjZkOTQiLz48cGF0aCBkPSJNODA3IDY5NVYwSDY5M1Y0NzZMNDgxIDBINDAyTDE4OSA0NzZWMEg3NVY2OTVIMTk4TDQ0MiAxNTBMNjg1IDY5NVoiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDM4Ni40NSAxMzQuMDApIHNjYWxlKDAuMDI1MDAgLTAuMDI1MDApIiBmaWxsPSIjNWY2ZDk0Ii8+PHBhdGggZD0iTTQ5NCAxNDJIMjAzTDE1MyAwSDM0TDI4MyA2OTZINDE1TDY2NCAwSDU0NFpNNDYyIDIzNSAzNDkgNTU4IDIzNSAyMzVaIiB0cmFuc2Zvcm09InRyYW5zbGF0ZSg0MTQuMTggMTM0LjAwKSBzY2FsZSgwLjAyNTAwIC0wLjAyNTAwKSIgZmlsbD0iIzVmNmQ5NCIvPjxwYXRoIGQ9Ik00NTggMCAxODkgMzExVjBINzVWNjk1SDE4OVYzNzhMNDU5IDY5NUg2MDJMMzAwIDM0N0w2MDcgMFoiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDQzNy4yOSAxMzQuMDApIHNjYWxlKDAuMDI1MDAgLTAuMDI1MDApIiBmaWxsPSIjNWY2ZDk0Ii8+PHBhdGggZD0iTTE4OSA2OTVWMEg3NVY2OTVaIiB0cmFuc2Zvcm09InRyYW5zbGF0ZSg0NTguNzkgMTM0LjAwKSBzY2FsZSgwLjAyNTAwIC0wLjAyNTAwKSIgZmlsbD0iIzVmNmQ5NCIvPjxwYXRoIGQ9Ik02NDYgMEg1MzJMMTg5IDUxOVYwSDc1VjY5NkgxODlMNTMyIDE3OFY2OTZINjQ2WiIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoNDcxLjA4IDEzNC4wMCkgc2NhbGUoMC4wMjUwMCAtMC4wMjUwMCkiIGZpbGw9IiM1ZjZkOTQiLz48cGF0aCBkPSJNNTc4IDQ5NVE1NTEgNTQ3IDUwMy4wIDU3My41UTQ1NSA2MDAgMzkyIDYwMFEzMjMgNjAwIDI2OS4wIDU2OS4wUTIxNSA1MzggMTg0LjUgNDgxLjBRMTU0IDQyNCAxNTQgMzQ5UTE1NCAyNzQgMTg0LjUgMjE2LjVRMjE1IDE1OSAyNjkuMCAxMjguMFEzMjMgOTcgMzkyIDk3UTQ4NSA5NyA1NDMuMCAxNDkuMFE2MDEgMjAxIDYxNCAyOTBIMzUzVjM4MUg3MzZWMjkyUTcyNSAyMTEgNjc4LjUgMTQzLjBRNjMyIDc1IDU1Ny41IDM0LjVRNDgzIC02IDM5MiAtNlEyOTQgLTYgMjEzLjAgMzkuNVExMzIgODUgODQuNSAxNjYuMFEzNyAyNDcgMzcgMzQ5UTM3IDQ1MSA4NC41IDUzMi4wUTEzMiA2MTMgMjEzLjUgNjU4LjVRMjk1IDcwNCAzOTIgNzA0UTUwMyA3MDQgNTg5LjUgNjQ5LjVRNjc2IDU5NSA3MTUgNDk1WiIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoNDk0Ljc4IDEzNC4wMCkgc2NhbGUoMC4wMjUwMCAtMC4wMjUwMCkiIGZpbGw9IiM1ZjZkOTQiLz48L2c+PC9zdmc+";
var _cmxLogoImg = (typeof Image !== "undefined") ? new Image() : null;
if (_cmxLogoImg) { _cmxLogoImg.src = "data:image/svg+xml;base64," + CMX_LOGO_B64; }
function generateShareCanvas() {
const data = computeLeaderboardData();
const facts = computeFunFacts();
const help = RANKING_HELP[scoringStyle] || RANKING_HELP.points;
const W = 520, OUT = 13, PAD = 16, S = 4, FONT = "Inter, Segoe UI, Roboto, Arial, sans-serif";
const CW = W - OUT * 2, innerL = OUT + PAD, innerR = W - OUT - PAD, contentW = innerR - innerL;
const M = document.createElement("canvas").getContext("2d");
const hasName = !!sessionName.trim();

const brandH = 52, sessionH = 28, lbHeadH = 24, ROW = 35, ROWGAP = 5, GAP = 11;
const card1H = (sessionH + 10 + lbHeadH + data.ranked.length * (ROW + ROWGAP)) + PAD * 2;
const FACT_FN = "13.5px " + FONT, FACT_FB = "700 13.5px " + FONT, FACT_TEXTX = 42;
M.font = FACT_FN;
const factBlocks = facts.map(f => ({ emoji: f.emoji, lines: layoutRuns(M, parseRuns(f.text), contentW - FACT_TEXTX - 6, FACT_FN, FACT_FB) }));
const factBoxH = (b) => b.lines.length * 19 + 18;
const card2H = facts.length ? (24 + factBlocks.reduce((a, b) => a + factBoxH(b) + 7, 0)) + PAD * 2 : 0;
const helpItems = help.map(it => ({ n: it[0], title: it[1], lines: wrapText(M, it[2], contentW - 50) }));
const helpItemH = (it) => 20 + it.lines.length * 17 + 9;
const card3H = (24 + helpItems.reduce((a, it) => a + helpItemH(it), 0)) + PAD * 2;
const totalH = OUT + brandH + GAP + card1H + GAP + (facts.length ? card2H + GAP : 0) + card3H + OUT;

const canvas = document.createElement("canvas");
canvas.width = W * S; canvas.height = Math.ceil(totalH) * S;
const ctx = canvas.getContext("2d"); ctx.scale(S, S);
ctx.fillStyle = "#e7eeff"; ctx.fillRect(0, 0, W, totalH);

let y = OUT;
if (_cmxLogoImg && _cmxLogoImg.complete && _cmxLogoImg.naturalWidth) { var _lh = 40, _lw = _lh * (_cmxLogoImg.naturalWidth / _cmxLogoImg.naturalHeight); ctx.drawImage(_cmxLogoImg, OUT + 4, y + 6, _lw, _lh); } else { ctx.textAlign = "left"; ctx.fillStyle = "#1b2340"; ctx.font = "700 25px " + FONT; ctx.fillText("CourtMixer", OUT + 4, y + 24); ctx.fillStyle = "#5f6d94"; ctx.font = "12px " + FONT; ctx.fillText("Court sports matchmaking", OUT + 4, y + 41); } y += brandH;

drawCard(ctx, OUT, y, CW, card1H);
let cy = y + PAD;
if (hasName) { ctx.textAlign = "left"; ctx.fillStyle = "#1b2340"; ctx.font = "700 18px " + FONT; ctx.fillText(clipText(ctx, sessionName.trim(), contentW - 165), innerL, cy + 18); }
ctx.textAlign = "right"; ctx.fillStyle = "#4f6fff"; ctx.font = "600 12.5px " + FONT; ctx.fillText(fmtSessionDate(sessionDate), innerR, cy + 17); cy += sessionH + 10;

// column geometry (mirrors the app: bordered cells with dividers, centred numbers)
const cHash = 38, cPts = 68, cWon = 50, cGp = 44;
const xHashR = innerL + cHash, xPtsL = innerR - cPts, xWonL = xPtsL - cWon, xGpL = xWonL - cGp;
const cxHash = innerL + cHash / 2, cxGp = (xGpL + xWonL) / 2, cxWon = (xWonL + xPtsL) / 2, cxPts = (xPtsL + innerR) / 2;
const nameLeft = xHashR + 12, nameClipW = xGpL - nameLeft - 10;

ctx.fillStyle = "#6a769f"; ctx.font = "600 11px " + FONT;
ctx.textAlign = "center"; ctx.fillText("#", cxHash, cy + 15);
ctx.textAlign = "left"; ctx.fillText("NAME", nameLeft, cy + 15);
ctx.textAlign = "center"; ctx.fillText("GP", cxGp, cy + 15); ctx.fillText("WON", cxWon, cy + 15); ctx.fillText(data.header.toUpperCase(), cxPts, cy + 15);
cy += lbHeadH;
const medals = ["🥇", "🥈", "🥉"];
data.ranked.forEach((p, i) => {
const ry = cy + i * (ROW + ROWGAP), midY = ry + ROW / 2 + 5;
ctx.fillStyle = "#f5f8ff"; ctx.strokeStyle = "#e1e9ff"; ctx.lineWidth = 1; roundRect(ctx, innerL, ry, contentW, ROW, 9); ctx.fill(); ctx.stroke();
ctx.strokeStyle = "#e1e9ff"; ctx.lineWidth = 1; ctx.beginPath();
[xHashR, xGpL, xWonL, xPtsL].forEach(x => { ctx.moveTo(x, ry + 1); ctx.lineTo(x, ry + ROW - 1); });
ctx.stroke();
ctx.textAlign = "center";
if (i < 3) { ctx.font = "18px " + FONT; ctx.fillText(medals[i], cxHash, ry + ROW / 2 + 6); }
else { ctx.fillStyle = "#5f6d94"; ctx.font = "600 14px " + FONT; ctx.fillText(String(i + 1), cxHash, midY); }
ctx.textAlign = "left"; ctx.font = "700 15px " + FONT;
const _hasStar = data.showStar && data.scoredOf(p) < data.maxSG;
let _starW = 0; if (_hasStar) { ctx.font = "800 15px " + FONT; _starW = ctx.measureText("*").width + 1; ctx.font = "700 15px " + FONT; }
const _nm = clipText(ctx, p.name, nameClipW - _starW);
ctx.fillStyle = "#1b2340"; ctx.fillText(_nm, nameLeft, midY);
if (_hasStar) { const _nw = ctx.measureText(_nm).width; ctx.fillStyle = "#f5a623"; ctx.font = "800 15px " + FONT; ctx.fillText("*", nameLeft + _nw + 1, midY); }
ctx.textAlign = "center"; ctx.font = "600 14px " + FONT; ctx.fillStyle = "#5f6d94"; ctx.fillText(String(p.matches), cxGp, midY);
ctx.fillStyle = "#22a96e"; ctx.fillText(String(p.wins), cxWon, midY);
ctx.fillStyle = "#e0901a"; ctx.font = "700 15px " + FONT; ctx.fillText(String(data.valueFn(p)), cxPts, midY);
});
y += card1H + GAP;

if (facts.length) {
drawCard(ctx, OUT, y, CW, card2H);
let fy = y + PAD;
ctx.textAlign = "left"; ctx.fillStyle = "#6a769f"; ctx.font = "700 12px " + FONT; ctx.fillText("✨ DID YOU KNOW?", innerL, fy + 14); fy += 24;
factBlocks.forEach(b => {
const bh = factBoxH(b);
ctx.fillStyle = "#f8faff"; ctx.strokeStyle = "#e1e9ff"; ctx.lineWidth = 1; roundRect(ctx, innerL, fy, contentW, bh, 9); ctx.fill(); ctx.stroke();
ctx.textAlign = "left"; ctx.font = "16px " + FONT; ctx.fillStyle = "#1b2340"; ctx.fillText(b.emoji, innerL + 12, fy + 24);
b.lines.forEach((ln, li) => drawRunLine(ctx, ln, innerL + FACT_TEXTX, fy + 23 + li * 19, FACT_FN, FACT_FB, "#3b4e84", "#1b2340"));
fy += bh + 7;
});
y += card2H + GAP;
}

drawCard(ctx, OUT, y, CW, card3H);
let hy = y + PAD;
ctx.textAlign = "left"; ctx.fillStyle = "#6a769f"; ctx.font = "700 12px " + FONT; ctx.fillText("HOW RANKINGS WORK", innerL, hy + 14); hy += 24;
const bg = ["#fff4e0", "#e6f8ee", "#eef3ff"], fg = ["#f5a623", "#22a96e", "#4f6fff"];
helpItems.forEach((it, idx) => {
ctx.fillStyle = bg[idx % 3]; roundRect(ctx, innerL, hy, 22, 22, 6); ctx.fill();
ctx.fillStyle = fg[idx % 3]; ctx.font = "700 12px " + FONT; ctx.textAlign = "center"; ctx.fillText(it.n, innerL + 11, hy + 15);
ctx.textAlign = "left"; ctx.fillStyle = "#1b2340"; ctx.font = "700 13.5px " + FONT; ctx.fillText(it.title, innerL + 32, hy + 14);
ctx.fillStyle = "#5f6d94"; ctx.font = "13px " + FONT; it.lines.forEach((ln, li) => ctx.fillText(ln, innerL + 32, hy + 32 + li * 17));
hy += helpItemH(it);
});

return canvas;
}


/* ===== CourtMixer interactive share (index57) ===== */
function shareFileBase(){ var nm = (sessionName && sessionName.trim()) ? sessionName.trim().replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "") : "CourtMixer"; return nm + "-" + (sessionDate || todayISO()); }
/* ===== Interactive shared leaderboard =====
   The shared file is a plain document: every table, card and player profile is written into
   the HTML, and the tabs, ranking-style switch, column sorting and player cards all run on
   hidden radio inputs plus :checked sibling selectors. There is deliberately NO JavaScript in
   the shared file -- iOS previews attachments in QuickLook, which renders HTML and CSS but
   disables scripting, so everything script-generated used to arrive blank on iPhones.
   One code path means Android and iPhone cannot diverge. */
const APP_URL = "https://lateinitial.github.io/CourtMixer/";
const VIEWER_STYLES = [["points", "Points"], ["adjpts", "Adj-Pts"], ["league", "League"], ["ptspergp", "Pts/GP"]];
const VIEWER_SORT_COLS = [["name", "Name"], ["gender", "M/F"], ["gp", "GP"], ["md", "MD"], ["wd", "WD"], ["xd", "XD"]];
