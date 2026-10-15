// CourtMixer - Competition sharing (§13.4): CMXC1 export/import codes, the PNG and the no-JS HTML viewer.
const CompShare = (function () {
  "use strict";

  /* ===== CMXC1 codes ===== */
  // Internal ids (36-character UUIDs) are most of a code and don't compress, so inside the code each
  // one becomes a short "~n" id. They only need to be consistent within the document; the
  // competition's own id is kept, so importing it again can still offer Replace (D-061).
  const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  function shortIds(comp) {
    const text = JSON.stringify(comp), taken = {}, map = {};
    (text.match(/"~[0-9a-z]+"/g) || []).forEach(x => { taken[x.slice(1, -1)] = true; }); // short ids from an earlier import stay unique
    let n = 0;
    const next = () => { let id; do { id = "~" + (n++).toString(36); } while (taken[id]); return id; };
    map[comp.id] = comp.id;
    return JSON.parse(text.replace(UUID, function (u) { return map[u] || (map[u] = next()); }));
  }
  function payload(comp) {
    return { app: "CourtMixer", type: "competition", version: 1, appVersion: APP_VERSION, exportedAt: new Date().toISOString(),
      competition: shortIds(comp) };
  }
  function encode(comp) { return _cmxEncode(payload(comp), "CMXC1:"); }
  // The competition document inside a pasted code, or null.
  function decode(text) {
    const data = _cmxDecode(text);
    if (!data || data.app !== "CourtMixer" || data.type !== "competition" || !data.competition || typeof data.competition !== "object") return null;
    const doc = data.competition;
    if (!doc.id || !Array.isArray(doc.divisions) || !Array.isArray(doc.matches) || !Array.isArray(doc.meetings) || !Array.isArray(doc.stages)) return null;
    return CompModel.migrate(doc);
  }

  function copyText(text, box) {
    const msg = box && box.querySelector("#cmxCopyMsg");
    const say = (k, err) => { if (msg) { msg.textContent = t(k); msg.className = "cmx-copymsg" + (err ? " err" : ""); } };
    const fallback = () => {
      const ta = box && box.querySelector("#cmxCodeOut");
      if (ta) { ta.focus(); ta.select(); try { if (document.execCommand("copy")) { say("code.copied"); return; } } catch (e) { /* hold to copy */ } }
      say("code.holdToCopy", true);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => say("code.copied")).catch(fallback);
    else fallback();
  }

  function showExport(comp) {
    const code = encode(comp);
    if (!code) { cmxAlert(t("code.failed")); return; }
    const buttons = [{ label: t("code.copy"), cls: "primary", keepOpen: true, onClick: function (box) { copyText(code, box); return false; } }];
    if (typeof navigator.share === "function") buttons.push({ label: t("code.share"), cls: "secondary", keepOpen: true, onClick: function (box) {
      // text only: the one share shape phones reliably accept
      const msg = box.querySelector("#cmxCopyMsg");
      let p;
      try { p = navigator.share({ title: comp.name || t("comp.untitled"), text: code }); }
      catch (err) { if (msg) { msg.textContent = t("code.shareFailed"); msg.className = "cmx-copymsg err"; } return false; }
      p.then(function () { cmxCloseModal(); showToast(esc(t("code.shared"))); }).catch(function (err) {
        if (!msg) return;
        msg.textContent = t(err && err.name === "AbortError" ? "code.shareCancelled" : "code.shareFailed");
        msg.className = "cmx-copymsg" + (err && err.name === "AbortError" ? "" : " err");
      });
      return false;
    } });
    buttons.push({ label: t("wiz.close"), cls: "ghost", onClick: function () {} });
    cmxShowModal({ title: t("code.exportTitle"),
      bodyHTML: '<p class="cmx-modal-text">' + esc(t("code.exportText")) + '</p><textarea id="cmxCodeOut" class="cmx-code" readonly rows="5"></textarea><div id="cmxCopyMsg" class="cmx-copymsg"></div>',
      buttons, onOpen: function (box) { const ta = box.querySelector("#cmxCodeOut"); if (ta) ta.value = code; } });
  }

  // Import: a competition with the same id already here -> Replace or Import as a copy (new id).
  function showImport(onDone) {
    cmxShowModal({ title: t("code.importTitle"),
      bodyHTML: '<p class="cmx-modal-text">' + esc(t("code.importText")) + '</p><textarea id="cmxCodeIn" class="cmx-code" rows="5" placeholder="' + esc(t("code.placeholder")) + '"></textarea><div id="cmxImportMsg" class="cmx-copymsg"></div>',
      buttons: [
        { label: t("code.import"), cls: "primary", keepOpen: true, onClick: function (box) {
          const ta = box.querySelector("#cmxCodeIn"), msg = box.querySelector("#cmxImportMsg");
          const doc = decode(ta ? ta.value : "");
          if (!doc) {
            const other = _cmxDecode(ta ? ta.value : "");
            if (msg) { msg.textContent = t(other && other.app === "CourtMixer" && other.type !== "competition" ? "code.socialCode" : "code.invalid"); msg.className = "cmx-copymsg err"; }
            return false;
          }
          cmxCloseModal();
          setTimeout(function () { place(doc, onDone); }, 0);
          return false;
        } },
        { label: t("wiz.cancel"), cls: "ghost", onClick: function () {} }
      ] });
  }
  function place(doc, onDone) {
    const exists = CompStore.list().some(e => e.id === doc.id);
    const finish = function (d, copy) {
      if (copy) { d.id = uid(); d.name = t("code.copyName", { name: d.name || t("comp.untitled") }); }
      const old = !copy && exists ? CompStore.load(d.id) : null;
      if (old) CompShell.snapshot(t("code.replace"), old); // replacing is undoable
      if (d.status === "archived") d.status = d.statusBeforeArchive || "live";
      CompStore.save(d); CompStore.flush(); CompStore.setActive(d.id);
      if (old) CompShell.toastUndo(esc(t("code.imported", { name: d.name || t("comp.untitled") })));
      else showToast(esc(t("code.imported", { name: d.name || t("comp.untitled") })));
      if (onDone) onDone(d);
    };
    if (!exists) { finish(doc, false); return; }
    cmxShowModal({ title: t("code.existsTitle"), bodyHTML: cmxMsgHtml(t("code.exists", { name: doc.name || t("comp.untitled") })), buttons: [
      { label: t("code.replace"), cls: "danger", onClick: function () { finish(doc, false); } },
      { label: t("code.asCopy"), cls: "primary", onClick: function () { finish(doc, true); } },
      { label: t("wiz.cancel"), cls: "ghost", onClick: function () {} }
    ] });
  }

  /* ===== Shared data helpers ===== */
  const sign = (n) => (n > 0 ? "+" : "") + n;
  function setsText(x, flip) {
    if (!x) return "";
    if (x.outcome === "walkover") return t("results.wo");
    return (x.sets || []).map(s => flip ? s.b + "–" + s.a : s.a + "–" + s.b).join(", ") + (x.outcome === "retired" ? " " + t("results.ret") : "");
  }
  // Pairs: one block per division; teams: one block with every stage.
  function blocks(comp, D) {
    const sorted = (list) => list.slice().sort((a, b) => a.order - b.order);
    if (D.isTeams) return [{ division: null, stages: sorted(comp.stages) }];
    return comp.divisions.map(d => ({ division: d, stages: sorted(comp.stages.filter(st => st.divisionId === d.id)) })).filter(b => b.stages.length);
  }
  function stageTitle(D, st, g) {
    if (CompStandings.isKO(st)) return t(st.type === "plate" ? "standings.plate" : "standings.knockout");
    return st.type === "groups" ? t("standings.group", { g: g.name }) : t("standings.table");
  }
  // Every finished match of an entry/team/player, from its own side.
  function matchesFor(comp, D, test) {
    const out = [];
    comp.matches.forEach(function (x) {
      if (x.status !== "done" || !x.winner) return;
      const m = D.meetingById[x.meetingId];
      if (!m || D.outcome(m).kind === "void") return;
      const side = test(x, m);
      if (!side) return;
      out.push({ x, m, side, won: x.winner === side, draw: x.winner === "draw" });
    });
    return out.sort((a, b) => (b.x.endedAt || 0) - (a.x.endedAt || 0));
  }
  function recordOf(list) { return { w: list.filter(r => r.won).length, l: list.filter(r => !r.won && !r.draw).length, d: list.filter(r => r.draw).length }; }

  /* ===== Interactive HTML viewer (no JavaScript, §13.4) ===== */
  // Same technique as the social viewer: hidden radios + :checked sibling selectors, so it works with
  // scripting off and in iOS QuickLook. Every name opens a pre-rendered detail card.
  const VIEWER_CSS = `
:root{--bg:#eef2ff;--card:#fff;--ink:#1b2340;--muted:#5f6d94;}
*{box-sizing:border-box;}
body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,'Segoe UI',Roboto,Arial,sans-serif;-webkit-text-size-adjust:100%;}
.ctl{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;clip:rect(0 0 0 0);}
.wrap{max-width:560px;margin:0 auto;padding:14px;padding-left:max(14px,env(safe-area-inset-left));padding-right:max(14px,env(safe-area-inset-right));}
.brand{padding:6px 4px 12px;}
.brand-link{display:inline-block;text-decoration:none;}
.brand-logo{height:42px;width:auto;display:block;}
.brand-cta{font-size:11px;color:var(--muted);margin-top:5px;}
.brand-cta a{color:#4f6ef7;text-decoration:none;font-weight:600;}
.tabs{display:flex;flex-wrap:wrap;background:#e7edff;border-radius:12px;padding:4px;gap:4px;margin-bottom:12px;}
.tab{flex:1 1 auto;min-width:64px;border:1px solid #d3ddf5;background:#fff;padding:10px 6px;border-radius:9px;font-weight:600;color:var(--muted);cursor:pointer;font-size:13.5px;text-align:center;user-select:none;-webkit-user-select:none;}
.view{display:none;}
.card{background:var(--card);border:1px solid #e1e9ff;border-radius:14px;padding:14px;margin-bottom:12px;}
.comp-name{font-weight:700;font-size:18px;overflow-wrap:anywhere;}
.comp-meta{color:#4f6fff;font-size:13px;font-weight:600;margin-top:2px;}
.comp-status{color:var(--muted);font-size:12.5px;margin-top:4px;}
.sec{font-weight:800;font-size:16px;margin:16px 4px 8px;color:#8d5f1f;}
.head{color:#6a769f;font-weight:700;font-size:12px;letter-spacing:.04em;text-transform:uppercase;margin-bottom:8px;}
.st-r{display:grid;grid-template-columns:30px minmax(0,1fr) 34px 44px;gap:6px;align-items:center;background:#f5f8ff;border:1px solid #e1e9ff;border-radius:9px;padding:8px 8px;margin-bottom:5px;font-size:14px;}
.st-r.h{background:none;border:none;font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:700;padding:0 8px 2px;}
.st-r>span:nth-child(n+3){text-align:center;}
.st-n{font-weight:700;overflow-wrap:anywhere;}
.st-s{display:block;font-size:11.5px;color:var(--muted);font-weight:500;margin-top:2px;}
.st-q{display:inline-block;margin-left:4px;font-size:10px;font-weight:800;color:#16a34a;background:#e6f8ee;border-radius:6px;padding:0 4px;vertical-align:middle;}
.st-line{margin-bottom:12px;box-shadow:0 6px 0 -4px #f0d9a8;}
.ko-r{margin-bottom:10px;}
.ko-h{font-size:12px;font-weight:700;color:#6a769f;text-transform:uppercase;letter-spacing:.04em;margin:4px 2px 6px;}
.ko-m{background:#f8faff;border:1px solid #e1e9ff;border-radius:10px;padding:8px 10px;margin-bottom:6px;}
.ko-s{font-size:14px;padding:2px 0;overflow-wrap:anywhere;}
.ko-s.win{color:#16a34a;font-weight:800;}
.ko-note{font-size:12px;color:var(--muted);margin-top:2px;}
.res{background:#f8faff;border:1px solid #e1e9ff;border-radius:10px;padding:10px 12px;margin-bottom:8px;}
.res-top{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;}
.res-sides{font-size:14px;min-width:0;overflow-wrap:anywhere;line-height:1.45;}
.res-vs{color:var(--muted);margin:0 5px;font-size:12px;}
.res-score{font-weight:800;font-size:14.5px;white-space:nowrap;}
.res-meta{margin-top:4px;font-size:11.5px;color:var(--muted);}
.res-rub{font-size:12.5px;margin-top:6px;padding-top:6px;border-top:1px solid #e1e9ff;display:flex;justify-content:space-between;gap:8px;}
.res-rub>span:first-child{min-width:0;overflow-wrap:anywhere;}
.res-rub>span:last-child{white-space:nowrap;text-align:right;}
.win{color:#16a34a;font-weight:800;}
.tag{font-size:11px;padding:1px 7px;border-radius:20px;background:#eef2ff;color:#3949ab;margin-left:4px;white-space:nowrap;}
.tag.w{background:#e6f8ee;color:#16a34a;}
.muted{color:var(--muted);font-size:12.5px;}
.aw-card{display:flex;flex-direction:column;gap:8px;}
.aw-head{font-weight:700;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#6a769f;}
.aw-sub{font-size:12.5px;color:var(--muted);}
.aw-div{font-weight:700;font-size:13px;color:#8d5f1f;margin-top:4px;}
.aw-row{display:flex;gap:12px;align-items:flex-start;background:#f8faff;border:1px solid #e1e9ff;border-radius:10px;padding:10px 12px;}
.aw-em{font-size:22px;line-height:1.2;flex-shrink:0;}
.aw-body{min-width:0;flex:1;}
.aw-label{font-size:12px;font-weight:700;color:#6a769f;text-transform:uppercase;letter-spacing:.03em;}
.aw-who{font-weight:700;font-size:15px;overflow-wrap:anywhere;margin-top:2px;}
.aw-and{color:#6a769f;font-weight:600;}
.aw-note{font-size:12.5px;color:var(--muted);margin-top:2px;overflow-wrap:anywhere;}
.cf-fact{display:flex;gap:12px;align-items:flex-start;background:#f8faff;border:1px solid #e1e9ff;border-radius:10px;padding:10px 12px;}
.cf-em{font-size:20px;line-height:1.4;flex-shrink:0;}
.cf-tx{font-size:13.5px;color:#3b4e84;line-height:1.55;overflow-wrap:anywhere;min-width:0;}
.cf-tx strong{color:#1b2340;}
.ent{display:flex;justify-content:space-between;gap:8px;padding:8px 2px;border-top:1px solid #eef2ff;font-size:14px;}
.ent:first-of-type{border-top:none;}
.ent>span:first-child{min-width:0;overflow-wrap:anywhere;}
.tap{cursor:pointer;color:inherit;text-decoration:underline;text-decoration-color:#c7d2fe;text-underline-offset:2px;}
.foot{text-align:center;color:#94a3b8;font-size:11px;padding:10px;padding-bottom:max(10px,env(safe-area-inset-bottom));}
.dm{position:fixed;inset:0;background:rgba(15,23,42,.45);display:none;align-items:center;justify-content:center;padding:16px;z-index:50;}
.dm-back{position:absolute;inset:0;cursor:pointer;}
.dm-box{position:relative;z-index:1;background:#fff;border-radius:14px;max-width:420px;width:100%;max-height:86vh;overflow:auto;padding:16px 16px 18px;box-shadow:0 18px 44px rgba(0,0,0,.24);}
.dm-head{display:flex;justify-content:space-between;align-items:center;gap:8px;}
.dm-title{font-weight:800;font-size:17px;overflow-wrap:anywhere;min-width:0;}
.dm-x{font-size:22px;line-height:1;color:#94a3b8;cursor:pointer;padding:0 6px;user-select:none;-webkit-user-select:none;}
.dm-sub{font-size:12.5px;color:var(--muted);margin:2px 0 10px;}
.dm-rec{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;text-align:center;background:#f8faff;border:1px solid #e1e9ff;border-radius:10px;padding:10px;margin-bottom:10px;}
.dm-rec b{display:block;font-size:18px;}
.dm-rec span{font-size:11px;color:var(--muted);}
.dm-h{font-size:11px;font-weight:700;color:#6a769f;text-transform:uppercase;letter-spacing:.05em;margin:10px 0 6px;}
.dm-m{border-top:1px solid #e1e9ff;padding:7px 0;font-size:13px;}
.dm-m:first-of-type{border-top:none;}
.dm-mt{display:flex;justify-content:space-between;gap:8px;}
.dm-mt>span:first-child{min-width:0;overflow-wrap:anywhere;}
`;

  function buildViewer(comp) {
    const D = CompStandings.derive(comp);
    // --- detail cards: register first, so every name can link to its card
    const cards = [], idx = {};
    const reg = (key, title) => { if (idx[key] === undefined) { idx[key] = cards.length; cards.push({ key, title }); } };
    if (D.isTeams) {
      comp.teams.forEach(tm => reg("t:" + tm.id, tm.name));
      comp.players.filter(p => p.teamId).forEach(p => reg("p:" + p.id, p.name));
    } else comp.entries.filter(e => e.divisionId).forEach(e => reg("e:" + e.id, e.label));
    const link = (key, text) => idx[key] === undefined ? esc(text) : '<label class="tap" for="d-' + idx[key] + '">' + esc(text) + "</label>";
    const sideLink = (id) => !id || id === "BYE" ? esc(id === "BYE" ? t("ko.bye") : "?") : link((D.isTeams ? "t:" : "e:") + id, D.entryLabel(id));
    const meetingSide = (m, s) => { const id = D.side(m, s); return id ? sideLink(id) : esc(D.sideLabel(m, s)); };
    const playersLink = (ids) => ids.map(id => link("p:" + id, (comp.players.find(p => p.id === id) || { name: "?" }).name)).join(" &amp; ");
    const matchSides = (x, s) => D.isTeams ? playersLink(D.playerIdsOf(x, s)) : meetingSide(D.meetingById[x.meetingId], s);

    // --- header
    const f = (comp.settings.matchFormats || {}).main;
    let head = '<div class="card"><div class="comp-name">' + esc(comp.name || t("comp.untitled")) + "</div>" +
      '<div class="comp-meta">' + esc(fmtSessionDate(comp.dateISO)) + "</div>" +
      '<div class="comp-status">' + esc([f ? CompFormat.describe(f) : "", CompShell.statusLine(comp)].filter(Boolean).join(" · ")) + "</div></div>";

    // --- standings
    let stand = "";
    const bl = blocks(comp, D);
    bl.forEach(function (b) {
      if (b.division && bl.length > 1) stand += '<div class="sec">' + esc(t("share.division", { d: b.division.name })) + "</div>";
      b.stages.forEach(function (st) {
        if (CompStandings.isKO(st)) { stand += '<div class="card"><div class="head">' + esc(stageTitle(D, st)) + "</div>" + bracket(st) + "</div>"; return; }
        st.groups.forEach(function (g) {
          const rows = D.table(st.id, g.id), adv = st.type === "groups" ? st.config.advance : 0, complete = D.groupComplete(st.id, g.id);
          const fm = D.formatFor(st), unit = fm.setType === "games" ? "games" : "points";
          const ptsHead = D.isTeams || st.type === "pointsLeague" || comp.settings.standings.pairs.rankBy !== "wins";
          let h = '<div class="card"><div class="head">' + esc(stageTitle(D, st, g)) + '</div><div class="st-r h"><span>#</span><span>' + esc(D.isTeams ? t("teams.team") : t("standings.entry")) + "</span><span>" + esc(t("standings.w")) + "</span><span>" + esc(ptsHead ? t("standings.pts") : t("standings.l")) + "</span></div>";
          rows.forEach(function (r, i) {
            const sub = [t("standings.p") + " " + r.played].concat(D.isTeams ? [t("teams.d") + " " + r.drawn, t("standings.l") + " " + r.lost, t("teams.matchDiff") + " " + sign(r.matchDiff)] : ptsHead ? [t("standings.l") + " " + r.lost] : [])
              .concat([t("standings.diff." + unit) + " " + sign(r.gameDiff)]);
            h += '<div class="st-r' + (adv && i === adv - 1 && rows.length > adv ? " st-line" : "") + '"><span>' + r.rank + "</span>" +
              '<span class="st-n">' + sideLink(r.id) + (r.qualifies && complete && !r.tiedWith.length ? '<span class="st-q">Q</span>' : "") + '<span class="st-s">' + esc(sub.join(" · ")) + "</span></span>" +
              "<span>" + r.won + "</span><span><b>" + (ptsHead ? r.points : r.lost) + "</b></span></div>";
          });
          stand += h + "</div>";
        });
      });
    });
    if (!stand) stand = '<div class="card muted">' + esc(t("standings.none")) + "</div>";

    function bracket(st) {
      const rounds = {};
      comp.meetings.filter(m => m.stageId === st.id).forEach(m => { const k = m.thirdPlace ? 999 : m.round; (rounds[k] = rounds[k] || []).push(m); });
      return Object.keys(rounds).map(Number).sort((a, b) => a - b).map(function (r) {
        const list = rounds[r].sort((a, b) => a.slot - b.slot);
        return '<div class="ko-r"><div class="ko-h">' + esc(D.meetingLabel(list[0], false).replace(/ \d+$/, "")) + "</div>" + list.map(function (m) {
          const o = D.outcome(m), x = D.matchByMeeting[m.id];
          const note = o.kind === "bye" ? t("ko.byeNote") : D.isTeams ? CompTeamsUI.meetingNote(D, m) : x && x.status === "done" ? setsText(x) : "";
          return '<div class="ko-m"><div class="ko-s' + (o.winner === "A" ? " win" : "") + '">' + meetingSide(m, "A") + '</div><div class="ko-s' + (o.winner === "B" ? " win" : "") + '">' + meetingSide(m, "B") + "</div>" +
            (note ? '<div class="ko-note">' + esc(note) + "</div>" : "") + "</div>";
        }).join("") + "</div>";
      }).join("");
    }

    // --- results, newest first
    let res = "";
    const when = (x) => x.endedAt || x.startedAt || 0;
    const metaOf = (m, x) => [!D.isTeams && comp.divisions.length > 1 ? (D.divisionById[m.stageId && D.stageById[m.stageId].divisionId] || {}).name : "", D.meetingLabel(m, false)].filter(Boolean).join(" · ");
    if (D.isTeams) {
      comp.meetings.map(m => ({ m, ms: (D.matchesOfMeeting[m.id] || []).filter(x => x.status === "done") })).filter(o => o.ms.length || D.outcome(o.m).kind === "override")
        .sort((a, b) => Math.max(0, ...b.ms.map(when)) - Math.max(0, ...a.ms.map(when))).forEach(function (o) {
          const m = o.m, out = D.outcome(m), r = D.teamResult(m);
          res += '<div class="res"><div class="res-top"><div class="res-sides"><span class="' + (out.winner === "A" ? "win" : "") + '">' + meetingSide(m, "A") + '</span><span class="res-vs">' + esc(t("courts.vs")) + '</span><span class="' + (out.winner === "B" ? "win" : "") + '">' + meetingSide(m, "B") + "</span></div>" +
            '<span class="res-score">' + r.matchesA + "–" + r.matchesB + "</span></div>" + '<div class="res-meta">' + esc(metaOf(m) + (out.done ? "" : " · " + t("share.inProgress"))) + "</div>" +
            (D.matchesOfMeeting[m.id] || []).slice().sort((a, b) => a.order - b.order).filter(x => x.status === "done").map(x =>
              '<div class="res-rub"><span>' + esc((D.rubberOf(x).label || "") + " ") + '<span class="' + (x.winner === "A" ? "win" : "") + '">' + matchSides(x, "A") + '</span><span class="res-vs">' + esc(t("courts.vs")) + '</span><span class="' + (x.winner === "B" ? "win" : "") + '">' + matchSides(x, "B") + "</span></span><span>" + esc(setsText(x)) + "</span></div>").join("") + "</div>";
        });
    } else {
      comp.matches.filter(x => x.status === "done" && D.meetingById[x.meetingId]).sort((a, b) => when(b) - when(a)).forEach(function (x) {
        const m = D.meetingById[x.meetingId];
        res += '<div class="res"><div class="res-top"><div class="res-sides"><span class="' + (x.winner === "A" ? "win" : "") + '">' + meetingSide(m, "A") + '</span><span class="res-vs">' + esc(t("courts.vs")) + '</span><span class="' + (x.winner === "B" ? "win" : "") + '">' + meetingSide(m, "B") + "</span></div>" +
          '<span class="res-score">' + esc(setsText(x)) + "</span></div>" + '<div class="res-meta">' + esc(metaOf(m)) + "</div></div>";
      });
    }
    res = res ? '<div class="card">' + res + "</div>" : '<div class="card muted">' + esc(t("results.none")) + "</div>";

    // --- awards and facts
    const nameHtml = (w) => {
      if (w.kind === "entry") return link("e:" + w.id, D.entryLabel(w.id));
      if (w.kind === "team") return link("t:" + w.id, D.entryLabel(w.id));
      if (w.kind === "player") return link("p:" + w.id, CompFacts.whoText(comp, D, w));
      if (w.kind === "pair") return playersLink(w.ids) + (w.team ? " (" + link("t:" + w.team, D.entryLabel(w.team)) + ")" : "");
      if (w.kind === "meeting") { const m = D.meetingById[w.id]; return m ? meetingSide(m, "A") + " " + esc(t("courts.vs")) + " " + meetingSide(m, "B") : "?"; }
      if (w.kind === "match") { const x = comp.matches.find(mm => mm.id === w.id); return x ? matchSides(x, "A") + " " + esc(t("courts.vs")) + " " + matchSides(x, "B") : "?"; }
      return esc(CompFacts.whoText(comp, D, w));
    };
    const aw = CompFacts.awardsHtml(comp, D, nameHtml) + CompFacts.allFactsHtml(comp, D);

    // --- teams / divisions tab
    let fourth = "";
    if (D.isTeams) {
      const tf = CompFacts.teamFacts(comp, D), anyPlayed = CompFacts.collect(comp, D).length > 0;
      comp.teams.forEach(function (tm, i) {
        const roster = comp.players.filter(p => p.teamId === tm.id && !p.subFor);
        fourth += '<div class="card"><div class="comp-name">' + link("t:" + tm.id, tm.name) + (tm.withdrawn ? ' <span class="tag">' + esc(t("entries.withdrawn")) + "</span>" : "") + "</div>" +
          (anyPlayed && tf[i] ? '<div class="cf-fact" style="margin-top:8px"><span class="cf-em">' + tf[i].emoji + '</span><span class="cf-tx">' + tf[i].html + "</span></div>" : "") +
          comp.divisions.map(function (d) {
            const ps = roster.filter(p => p.divisionId === d.id);
            return ps.length ? '<div class="dm-h">' + esc(d.name) + "</div>" + ps.map(p => '<div class="ent"><span>' + link("p:" + p.id, p.name) + (p.role === "reserve" ? ' <span class="tag">' + esc(t("teamEntries.reserve")) + "</span>" : "") + "</span></div>").join("") : "";
          }).join("") + "</div>";
      });
    } else {
      comp.divisions.forEach(function (d) {
        const es = comp.entries.filter(e => e.divisionId === d.id).sort((a, b) => (a.seed || 999) - (b.seed || 999) || a.label.localeCompare(b.label));
        if (!es.length) return;
        fourth += '<div class="card"><div class="head">' + esc(t("share.division", { d: d.name })) + " · " + esc(t("share.pairsN", { n: es.length })) + "</div>" +
          es.map(e => '<div class="ent"><span>' + link("e:" + e.id, e.label) + (e.withdrawn ? ' <span class="tag">' + esc(t("entries.withdrawn")) + "</span>" : "") + "</span>" + (e.seed ? '<span class="muted">' + esc(t("share.seed", { n: e.seed })) + "</span>" : "") + "</div>").join("") + "</div>";
      });
    }

    // --- detail cards
    const matchLine = (r, extra) => {
      const x = r.x, m = r.m, opp = other(r.side);
      const vs = D.isTeams ? matchSides(x, opp) : meetingSide(m, opp);
      return '<div class="dm-m"><div class="dm-mt"><span>' + (extra || "") + esc(t("share.vs")) + " " + vs + '</span><span class="' + (r.won ? "win" : "") + '">' + esc(setsText(x, r.side === "B")) + "</span></div>" +
        '<div class="res-meta">' + esc(D.matchLabel(x, false)) + (r.won ? ' <span class="tag w">' + esc(t("share.won")) + "</span>" : "") + "</div></div>";
    };
    const recordHtml = (rec, third) => '<div class="dm-rec"><div><b>' + rec.w + "</b><span>" + esc(t("share.wins")) + "</span></div><div><b>" + rec.l + "</b><span>" + esc(t("share.losses")) + "</span></div><div><b>" + third[0] + "</b><span>" + esc(third[1]) + "</span></div></div>";
    const modals = cards.map(function (c, n) {
      let body = "";
      const kind = c.key[0], id = c.key.slice(2);
      if (kind === "e") {
        const e = D.entryById[id], list = matchesFor(comp, D, (x, m) => D.side(m, "A") === id ? "A" : D.side(m, "B") === id ? "B" : null), rec = recordOf(list);
        const gf = list.reduce((a, r) => { const tl = CompFormat.tally(D.formatFor(D.stageById[r.m.stageId]), r.x.sets || [], r.x.outcome); return a + (r.side === "A" ? tl.gamesA - tl.gamesB : tl.gamesB - tl.gamesA); }, 0);
        body = '<div class="dm-sub">' + esc([(D.divisionById[e.divisionId] || {}).name, e.seed ? t("share.seed", { n: e.seed }) : ""].filter(Boolean).join(" · ")) + "</div>" +
          recordHtml(rec, [sign(gf), t("share.diff")]) + (list.length ? '<div class="dm-h">' + esc(t("share.matches")) + "</div>" + list.map(r => matchLine(r)).join("") : '<div class="muted">' + esc(t("share.noMatches")) + "</div>");
      } else if (kind === "t") {
        const ms = comp.meetings.filter(m => (D.side(m, "A") === id || D.side(m, "B") === id) && D.outcome(m).done && D.outcome(m).kind !== "bye");
        const s = (m) => D.side(m, "A") === id ? "A" : "B";
        const rec = { w: ms.filter(m => D.outcome(m).winner === s(m)).length, l: ms.filter(m => { const w = D.outcome(m).winner; return w && w !== "draw" && w !== s(m); }).length };
        const roster = comp.players.filter(p => p.teamId === id && !p.subFor);
        const pl = (pid) => recordOf(matchesFor(comp, D, (x) => D.playerIdsOf(x, "A").indexOf(pid) !== -1 ? "A" : D.playerIdsOf(x, "B").indexOf(pid) !== -1 ? "B" : null));
        body = recordHtml(rec, [ms.filter(m => D.outcome(m).winner === "draw").length, t("share.draws")]) +
          (ms.length ? '<div class="dm-h">' + esc(t("share.meetings")) + "</div>" + ms.map(m => { const r = D.teamResult(m), mine = s(m) === "A" ? r.matchesA + "–" + r.matchesB : r.matchesB + "–" + r.matchesA, won = D.outcome(m).winner === s(m);
            return '<div class="dm-m"><div class="dm-mt"><span>' + esc(t("share.vs")) + " " + meetingSide(m, other(s(m))) + '</span><span class="' + (won ? "win" : "") + '">' + mine + '</span></div><div class="res-meta">' + esc(D.meetingLabel(m, false)) + "</div></div>"; }).join("") : "") +
          '<div class="dm-h">' + esc(t("share.players")) + "</div>" + roster.map(p => { const r = pl(p.id); return '<div class="ent"><span>' + link("p:" + p.id, p.name) + "</span><span class=\"muted\">" + esc(t("share.wl", { w: r.w, l: r.l })) + "</span></div>"; }).join("");
      } else {
        const p = comp.players.find(x => x.id === id), list = matchesFor(comp, D, (x) => D.playerIdsOf(x, "A").indexOf(id) !== -1 ? "A" : D.playerIdsOf(x, "B").indexOf(id) !== -1 ? "B" : null), rec = recordOf(list);
        const partners = {};
        list.forEach(r => D.playerIdsOf(r.x, r.side).filter(q => q !== id).forEach(q => { partners[q] = true; }));
        body = '<div class="dm-sub">' + (p && p.teamId ? link("t:" + p.teamId, D.entryLabel(p.teamId)) : "") + esc([p && (D.divisionById[p.divisionId] || {}).name, p && p.role === "reserve" ? t("teamEntries.reserve") : ""].filter(Boolean).map(x => " · " + x).join("")) + "</div>" +
          recordHtml(rec, [list.length, t("share.played")]) +
          (Object.keys(partners).length ? '<div class="dm-h">' + esc(t("share.partners")) + "</div><div>" + playersLink(Object.keys(partners)) + "</div>" : "") +
          (list.length ? '<div class="dm-h">' + esc(t("share.matches")) + "</div>" + list.map(r => matchLine(r, D.rubberOf(r.x).label ? esc(D.rubberOf(r.x).label) + " · " : "")).join("") : '<div class="muted">' + esc(t("share.noMatches")) + "</div>");
      }
      return '<div class="dm dm-' + n + '"><label class="dm-back" for="d-none" aria-label="' + esc(t("wiz.close")) + '"></label><div class="dm-box"><div class="dm-head"><span class="dm-title">' + esc(c.title) + "</span>" +
        '<label class="dm-x" for="d-none" aria-label="' + esc(t("wiz.close")) + '">×</label></div>' + body + "</div></div>";
    }).join("");

    // --- radios first (the :checked ~ selectors need them before .wrap and the cards)
    const TABS = [["st", t("tab.standings")], ["res", t("tab.results")], ["aw", t("award.title")], ["x", D.isTeams ? t("share.teams") : t("share.divisions")]];
    let ctl = TABS.map((tb, i) => '<input type="radio" name="v" id="v-' + tb[0] + '" class="ctl"' + (i === (comp.status === "finished" ? 2 : 0) ? " checked" : "") + ">").join("");
    ctl += '<input type="radio" name="d" id="d-none" class="ctl" checked>' + cards.map((c, n) => '<input type="radio" name="d" id="d-' + n + '" class="ctl">').join("");
    const ACTIVE = "background:#fff;color:#3949ab;border-color:#4f6ef7;box-shadow:0 1px 3px rgba(79,110,247,.18);";
    let css = VIEWER_CSS + TABS.map(tb => "#v-" + tb[0] + ":checked ~ .wrap #vw-" + tb[0] + "{display:block;}\n#v-" + tb[0] + ":checked ~ .wrap .t-" + tb[0] + "{" + ACTIVE + "}\n").join("");
    css += cards.map((c, n) => "#d-" + n + ":checked ~ .dm-" + n + "{display:flex;}").join("\n");
    const title = esc(comp.name || t("comp.untitled")) + " — CourtMixer";
    return '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">\n<meta name="theme-color" content="#4f6fff">\n' +
      "<title>" + title + "</title>\n<style>" + css + "</style>\n</head>\n<body>\n" + ctl + '\n<div class="wrap">\n' +
      '<div class="brand"><a class="brand-link" href="' + APP_URL + '" target="_blank" rel="noopener"><img class="brand-logo" src="data:image/svg+xml;base64,' + CMX_LOGO_B64 + '" alt="CourtMixer"></a><div class="brand-cta">' + esc(t("share.madeWith")) + ' <a href="' + APP_URL + '" target="_blank" rel="noopener">CourtMixer</a></div></div>\n' +
      head + '<div class="tabs">' + TABS.map(tb => '<label class="tab t-' + tb[0] + '" for="v-' + tb[0] + '">' + esc(tb[1]) + "</label>").join("") + "</div>\n" +
      '<section id="vw-st" class="view">' + stand + "</section>\n" +
      '<section id="vw-res" class="view">' + res + "</section>\n" +
      '<section id="vw-aw" class="view">' + aw + "</section>\n" +
      '<section id="vw-x" class="view">' + (fourth || '<div class="card muted">' + esc(t("standings.none")) + "</div>") + "</section>\n" +
      '<div class="foot">' + esc(t("share.foot", { v: APP_VERSION })) + "</div>\n</div>\n" + modals + "\n</body>\n</html>";
  }
  const other = (s) => (s === "A" ? "B" : "A");

  /* ===== PNG (§13.4) ===== */
  // Standings per division/stage, then awards and highlights, in the social image's style.
  // divIds: which divisions (pairs); all of them when omitted. At most 8 divisions in one image.
  const FONT = "Inter, Segoe UI, Roboto, Arial, sans-serif";
  function drawImage(comp, divIds) {
    const D = CompStandings.derive(comp);
    const W = 520, OUT = 13, PAD = 16, CW = W - OUT * 2, L = OUT + PAD, R = W - OUT - PAD, IW = R - L;
    const M = document.createElement("canvas").getContext("2d");
    // Each card is a list of rows { h, draw(ctx, y) }; heights are measured before drawing.
    const cards = [];
    const text = (str, font, color, x, y, align) => (ctx) => { ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align || "left"; ctx.fillText(str, x, y); };
    const fit = (str, font, w) => { M.font = font; return clipText(M, str, w); };
    const heading = (str, color) => ({ h: 24, draw: (ctx, y) => text(str.toUpperCase(), "700 12px " + FONT, color || "#6a769f", L, y + 15)(ctx) });
    const wrapRows = (str, font, color, indent, lineH) => { M.font = font; return wrapText(M, str, IW - indent).map(ln => ({ h: lineH, draw: (ctx, y) => text(ln, font, color, L + indent, y + lineH - 6)(ctx) })); };

    // --- title card
    const f = (comp.settings.matchFormats || {}).main;
    cards.push([
      { h: 26, draw: (ctx, y) => text(fit(comp.name || t("comp.untitled"), "700 18px " + FONT, IW), "700 18px " + FONT, "#1b2340", L, y + 19)(ctx) },
      { h: 20, draw: (ctx, y) => text(fmtSessionDate(comp.dateISO), "600 12.5px " + FONT, "#4f6fff", L, y + 14)(ctx) }
    ].concat(wrapRows([f ? CompFormat.describe(f) : "", CompShell.statusLine(comp)].filter(Boolean).join(" · "), "12.5px " + FONT, "#5f6d94", 0, 18)));

    // --- standings
    const bl = blocks(comp, D).filter(b => !divIds || !b.division || divIds.indexOf(b.division.id) !== -1);
    bl.forEach(function (b) {
      const rows = [];
      if (b.division && comp.divisions.length > 1) rows.push({ h: 28, draw: (ctx, y) => text(t("share.division", { d: b.division.name }), "800 16px " + FONT, "#8d5f1f", L, y + 19)(ctx) });
      b.stages.forEach(function (st) {
        if (CompStandings.isKO(st)) {
          rows.push(heading(stageTitle(D, st)));
          const ms = comp.meetings.filter(m => m.stageId === st.id), last = Math.max.apply(null, ms.map(m => m.round).concat([0]));
          // the last three rounds (and the 3rd-place match) keep big brackets readable
          ms.filter(m => m.round > last - 3 && D.outcome(m).kind !== "bye").sort((a, b) => (b.round - a.round) || ((a.thirdPlace ? 1 : 0) - (b.thirdPlace ? 1 : 0)) || (a.slot - b.slot)).forEach(function (m) {
            const o = D.outcome(m), x = D.matchByMeeting[m.id];
            const score = D.isTeams ? CompTeamsUI.meetingNote(D, m) : x && x.status === "done" ? setsText(x) : "";
            const lab = D.meetingLabel(m, true), a = D.sideLabel(m, "A"), bb = D.sideLabel(m, "B");
            rows.push({ h: 40, draw: function (ctx, y) {
              ctx.fillStyle = "#f5f8ff"; ctx.strokeStyle = "#e1e9ff"; ctx.lineWidth = 1; roundRect(ctx, L, y, IW, 36, 9); ctx.fill(); ctx.stroke();
              text(lab, "600 11px " + FONT, "#6a769f", L + 10, y + 14)(ctx);
              const sw = score ? (ctx.font = "700 13px " + FONT, ctx.measureText(score).width) : 0;
              const nameW = IW - 20 - sw - 10;
              ctx.font = "600 13px " + FONT;
              const aT = clipText(ctx, a, nameW / 2 - 12), bT = clipText(ctx, bb, nameW / 2 - 12);
              text(aT, (o.winner === "A" ? "800 " : "600 ") + "13px " + FONT, o.winner === "A" ? "#16a34a" : "#1b2340", L + 10, y + 29)(ctx);
              ctx.font = "600 13px " + FONT; const aw = ctx.measureText(aT).width;
              text(t("courts.vs"), "12px " + FONT, "#6a769f", L + 16 + aw, y + 29)(ctx);
              text(bT, (o.winner === "B" ? "800 " : "600 ") + "13px " + FONT, o.winner === "B" ? "#16a34a" : "#1b2340", L + 30 + aw, y + 29)(ctx);
              if (score) text(score, "700 13px " + FONT, "#1b2340", R - 10, y + 29, "right")(ctx);
            } });
          });
          return;
        }
        st.groups.forEach(function (g) {
          rows.push(heading(stageTitle(D, st, g)));
          const ptsHead = D.isTeams || st.type === "pointsLeague" || comp.settings.standings.pairs.rankBy !== "wins";
          const cHash = 34, cA = 46, cB = 54, xB = R - cB, xA = xB - cA;
          rows.push({ h: 18, draw: function (ctx, y) {
            text("#", "600 11px " + FONT, "#6a769f", L + cHash / 2, y + 12, "center")(ctx);
            text((D.isTeams ? t("teams.team") : t("standings.entry")).toUpperCase(), "600 11px " + FONT, "#6a769f", L + cHash + 8, y + 12)(ctx);
            text(t("standings.w").toUpperCase(), "600 11px " + FONT, "#6a769f", xA + cA / 2, y + 12, "center")(ctx);
            text((ptsHead ? t("standings.pts") : t("standings.p")).toUpperCase(), "600 11px " + FONT, "#6a769f", xB + cB / 2, y + 12, "center")(ctx);
          } });
          const medals = ["\u{1F947}", "\u{1F948}", "\u{1F949}"], complete = D.groupComplete(st.id, g.id);
          D.table(st.id, g.id).forEach(function (r, i) {
            rows.push({ h: 35, draw: function (ctx, y) {
              ctx.fillStyle = "#f5f8ff"; ctx.strokeStyle = "#e1e9ff"; ctx.lineWidth = 1; roundRect(ctx, L, y, IW, 31, 9); ctx.fill(); ctx.stroke();
              const mid = y + 20;
              if (complete && r.rank <= 3 && !CompStandings.isKO(st) && st.type !== "groups") text(medals[r.rank - 1], "16px " + FONT, "#1b2340", L + cHash / 2, mid + 1, "center")(ctx);
              else text(String(r.rank), "600 13px " + FONT, "#5f6d94", L + cHash / 2, mid, "center")(ctx);
              ctx.font = "700 14px " + FONT;
              text(clipText(ctx, D.entryLabel(r.id), xA - L - cHash - 14), "700 14px " + FONT, "#1b2340", L + cHash + 8, mid)(ctx);
              text(String(r.won), "600 13px " + FONT, "#22a96e", xA + cA / 2, mid, "center")(ctx);
              text(String(ptsHead ? r.points : r.played), "700 14px " + FONT, "#e0901a", xB + cB / 2, mid, "center")(ctx);
            } });
          });
        });
      });
      cards.push(rows);
    });

    // --- awards (placings for the divisions shown) and highlights
    const aws = CompFacts.awardsFor(comp, D).filter(a => !a.scope || !divIds || divIds.indexOf(a.scope) !== -1);
    if (aws.length) {
      const rows = [heading("\u{1F3C6} " + t("award.title"))];
      aws.forEach(function (a) {
        const label = CompFacts.awardLabel(comp, a), who = a.who.map(w => CompFacts.whoText(comp, D, w)).join(" & ");
        const note = CompFacts.awardNote(comp, D, a);
        M.font = "700 14px " + FONT; const wl = wrapText(M, who, IW - 50);
        const noteL = note ? (M.font = "12px " + FONT, wrapText(M, note, IW - 50)) : [];
        const h = 22 + wl.length * 18 + noteL.length * 16 + 8;
        rows.push({ h: h + 6, draw: function (ctx, y) {
          ctx.fillStyle = "#f8faff"; ctx.strokeStyle = "#e1e9ff"; ctx.lineWidth = 1; roundRect(ctx, L, y, IW, h, 9); ctx.fill(); ctx.stroke();
          text(CompFacts.EMOJI[a.key] || "⭐", "18px " + FONT, "#1b2340", L + 12, y + 24)(ctx);
          text(label.toUpperCase(), "700 11px " + FONT, "#6a769f", L + 44, y + 16)(ctx);
          wl.forEach((ln, i) => text(ln, "700 14px " + FONT, "#1b2340", L + 44, y + 34 + i * 18)(ctx));
          noteL.forEach((ln, i) => text(ln, "12px " + FONT, "#5f6d94", L + 44, y + 34 + wl.length * 18 + i * 16)(ctx));
        } });
      });
      cards.push(rows);
    }
    const facts = CompFacts.highlights(comp, D);
    if (facts.length) {
      const rows = [heading(t("facts.title"))], FN = "13px " + FONT, FB = "700 13px " + FONT;
      facts.forEach(function (fc) {
        M.font = FN; const lines = layoutRuns(M, parseRuns(fc.html), IW - 52, FN, FB), h = lines.length * 18 + 16;
        rows.push({ h: h + 6, draw: function (ctx, y) {
          ctx.fillStyle = "#f8faff"; ctx.strokeStyle = "#e1e9ff"; ctx.lineWidth = 1; roundRect(ctx, L, y, IW, h, 9); ctx.fill(); ctx.stroke();
          text(fc.emoji, "16px " + FONT, "#1b2340", L + 12, y + 22)(ctx);
          lines.forEach((ln, i) => drawRunLine(ctx, ln, L + 42, y + 21 + i * 18, FN, FB, "#3b4e84", "#1b2340"));
        } });
      });
      cards.push(rows);
    }

    // --- layout and draw
    const brandH = 52, GAP = 11;
    const cardH = cards.map(rows => rows.reduce((a, r) => a + r.h, 0) + PAD * 2);
    const totalH = OUT + brandH + cardH.reduce((a, h) => a + h + GAP, 0) + OUT;
    // phones limit canvas area (iOS about 16.7 million pixels): scale down tall images instead of failing
    const S = Math.max(1, Math.min(4, Math.floor(Math.sqrt(16000000 / (W * totalH)) * 4) / 4));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(W * S); canvas.height = Math.ceil(totalH * S);
    const ctx = canvas.getContext("2d"); ctx.scale(S, S);
    ctx.fillStyle = "#e7eeff"; ctx.fillRect(0, 0, W, totalH);
    let y = OUT;
    if (_cmxLogoImg && _cmxLogoImg.complete && _cmxLogoImg.naturalWidth) { const lh = 40; ctx.drawImage(_cmxLogoImg, OUT + 4, y + 6, lh * (_cmxLogoImg.naturalWidth / _cmxLogoImg.naturalHeight), lh); }
    else text("CourtMixer", "700 25px " + FONT, "#1b2340", OUT + 4, y + 24)(ctx);
    y += brandH;
    cards.forEach(function (rows, i) {
      drawCard(ctx, OUT, y, CW, cardH[i]);
      let cy = y + PAD;
      rows.forEach(r => { r.draw(ctx, cy); cy += r.h; });
      y += cardH[i] + GAP;
    });
    return canvas;
  }

  /* ===== Share dialog ===== */
  function fileBase(comp, suffix) {
    const nmb = (comp.name || "Competition").trim().replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "") || "Competition";
    return nmb + (suffix ? "-" + suffix.replace(/[^\w-]+/g, "-") : "") + "-" + (comp.dateISO || todayISO());
  }
  // Share files through the share sheet where the phone allows it, otherwise download them.
  function sendFiles(files, title) {
    if (navigator.canShare && navigator.canShare({ files })) { navigator.share({ files, title }).catch(function () {}); return; }
    files.forEach(function (file, i) {
      setTimeout(function () {
        const url = URL.createObjectURL(file), a = document.createElement("a");
        a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
      }, i * 400);
    });
  }
  function canvasFile(canvas, name) {
    return new Promise(function (resolve) { canvas.toBlob(function (blob) { resolve(blob ? new File([blob], name, { type: "image/png" }) : null); }, "image/png"); });
  }
  function shareImage(comp, each) {
    const divs = comp.kind === "teams" ? [null] : comp.divisions.filter(d => comp.stages.some(st => st.divisionId === d.id));
    let jobs;
    try {
      jobs = each ? divs.map(d => ({ canvas: drawImage(comp, d ? [d.id] : null), name: fileBase(comp, d && d.name) + ".png" }))
        : [{ canvas: drawImage(comp, null), name: fileBase(comp) + ".png" }];
    } catch (e) { cmxAlert(t("share.failed")); return; }
    Promise.all(jobs.map(j => canvasFile(j.canvas, j.name))).then(function (files) {
      if (files.some(f => !f)) { cmxAlert(t("share.failed")); return; }
      sendFiles(files, comp.name || t("comp.untitled"));
    });
  }
  function shareHtml(comp) {
    let doc;
    try { doc = buildViewer(comp); } catch (e) { cmxAlert(t("share.failed")); return; }
    sendFiles([new File([new Blob([doc], { type: "text/html" })], fileBase(comp) + ".html", { type: "text/html" })], comp.name || t("comp.untitled"));
  }
  function showShare(comp) {
    if (!comp) return;
    const nDiv = comp.kind === "teams" ? 1 : comp.divisions.filter(d => comp.stages.some(st => st.divisionId === d.id)).length;
    const buttons = [];
    if (nDiv <= 8) buttons.push({ label: t("share.image"), cls: "primary", onClick: function () { shareImage(comp, false); } });
    if (nDiv > 1) buttons.push({ label: t("share.eachDivision"), cls: nDiv > 8 ? "primary" : "secondary", onClick: function () { shareImage(comp, true); } });
    buttons.push({ label: t("share.html"), cls: "secondary", onClick: function () { shareHtml(comp); } });
    buttons.push({ label: t("wiz.cancel"), cls: "ghost", onClick: function () {} });
    cmxShowModal({ title: t("share.title"), bodyHTML: cmxMsgHtml(t("share.text") + (nDiv > 8 ? "\n\n" + t("share.tooMany") : "")), buttons });
  }

  return { encode, decode, payload, showExport, showImport, place, buildViewer, drawImage, showShare, shareImage, shareHtml };
})();
