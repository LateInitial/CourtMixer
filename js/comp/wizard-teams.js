// CourtMixer - wizard steps for team competitions (Phase 4, v1.12.0), spec §6.2 steps 6-8, 11, 13.
// Players and pairs per team, the meeting template, how a meeting is won, team standings, and the
// teams version of Review. Format, Match scoring and Courts are shared with pairs.

(function () {
  const U = Wizard.ui, P = Wizard.pairsUtil;
  const ui = { team: null, div: null, editId: null, draft: null, picked: [], pasteText: "" };
  const onOff = (v) => v ? "on" : "";

  function teamOf(comp) {
    if (!ui.team || !comp.teams.some(x => x.id === ui.team)) ui.team = comp.teams[0] && comp.teams[0].id;
    return comp.teams.find(x => x.id === ui.team);
  }
  function divOf(comp) {
    if (!ui.div || !comp.divisions.some(x => x.id === ui.div)) ui.div = comp.divisions[0] && comp.divisions[0].id;
    return comp.divisions.find(x => x.id === ui.div);
  }
  function addPlayer(comp, teamId, divId, name, gender, role) {
    comp.players.push({ id: uid(), name: String(name).trim(), gender: gender === "F" ? "F" : "M", teamId, divisionId: divId, role: role || "regular", withdrawn: false });
  }
  function rosterIn(comp, teamId, divId) { return comp.players.filter(p => p.teamId === teamId && p.divisionId === divId && !p.withdrawn); }
  // "Rina f" -> { name: "Rina", gender: "F" }
  function parsePlayers(text) {
    return String(text || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean).map(function (s) {
      const m = /^(.*\S)\s+([mf])$/i.exec(s);
      return m ? { name: m[1], gender: m[2].toUpperCase() } : { name: s, gender: null };
    });
  }
  function defaultGender(d) { return d && d.category === "WD" ? "F" : "M"; }
  // Pairs registered but used by no rubber (e.g. a 3rd pair added after the template was built).
  function unusedSlots(comp) {
    const tpl = comp.settings.meetingTemplate || [], out = [];
    if (!tpl.length) return out;
    comp.entries.filter(e => e.teamId && e.slot).forEach(function (e) {
      if (!tpl.some(r => r.divisionId === e.divisionId && r.slot === e.slot)) {
        const tm = comp.teams.find(x => x.id === e.teamId);
        out.push(t("review.unusedPair", { team: tm ? tm.name : "?", pair: e.label }));
      }
    });
    return out;
  }
  // After roster changes: if the template was already built and no longer covers every pair,
  // flag Meeting template for review (the wizard's "check this step" marker).
  function flagTemplate(comp) {
    if (comp.wizard.visited.template && unusedSlots(comp).length) comp.wizard.needsReview.template = true;
  }

  /* ===== Step 6: Players and pairs (teams) ===== */
  function teamWarnings(comp, tm) {
    const out = [], names = {};
    comp.divisions.forEach(function (d) {
      const regs = rosterIn(comp, tm.id, d.id).filter(p => p.role === "regular");
      if (regs.length % 2) out.push(t("teamEntries.odd", { div: d.name }));
      comp.entries.filter(e => e.teamId === tm.id && e.divisionId === d.id).forEach(function (e) {
        const g = e.playerIds.map(id => (comp.players.find(p => p.id === id) || {}).gender);
        if ((d.category === "MD" && g.some(x => x !== "M")) || (d.category === "WD" && g.some(x => x !== "F")) || (d.category === "XD" && g[0] === g[1])) {
          out.push(t("entries.warnGender", { pair: e.label + " " + P.labelOf(comp, e), cat: t("cat." + d.category) }));
        }
      });
    });
    comp.players.filter(p => p.teamId === tm.id).forEach(p => { const k = p.name.toLowerCase(); names[k] = (names[k] || 0) + 1; });
    Object.keys(names).forEach(n => { if (names[n] > 1) out.push(t("teamEntries.dup", { name: n })); });
    return out;
  }

  Wizard.register("entries", {
    validate: function (comp) {
      const errs = [];
      if (comp.teams.some(tm => !comp.entries.some(e => e.teamId === tm.id))) errs.push("wiz.err.teamPairs");
      return errs;
    },
    body: function (comp) {
      CompLineups.syncTeamEntries(comp);
      const tm = teamOf(comp), d = divOf(comp);
      if (!tm || !d) return "";
      let h = P.chips("tmTeam", comp.teams.map(x => ({ value: x.id, label: x.name + " (" + comp.players.filter(p => p.teamId === x.id).length + ")" })), tm.id);
      if (comp.divisions.length > 1) h += P.seg("tmDiv", comp.divisions.map(x => ({ value: x.id, label: x.name })), d.id);
      const list = rosterIn(comp, tm.id, d.id);
      h += '<div class="wiz-label">' + esc(t("teamEntries.players", { team: tm.name, div: d.name })) + "</div>";
      if (!list.length) h += '<div class="muted">' + esc(t("teamEntries.none")) + "</div>";
      h += '<div class="wiz-list">' + list.map(p => '<div class="wiz-pair"><span class="wiz-pair-name">' + esc(p.name) + ' <span class="muted">' + p.gender + "</span></span>" +
        '<button type="button" class="wiz-chip ' + onOff(p.role === "reserve") + '" data-act="tmRole" data-id="' + esc(p.id) + '">' + esc(t(p.role === "reserve" ? "teamEntries.reserve" : "teamEntries.regular")) + "</button>" +
        '<button type="button" class="wiz-icon" data-act="tmEdit" data-id="' + esc(p.id) + '" aria-label="' + esc(t("entries.edit")) + '">✎</button>' +
        '<button type="button" class="wiz-icon" data-act="tmRemove" data-id="' + esc(p.id) + '" aria-label="' + esc(t("entries.remove")) + '">✕</button></div>').join("") + "</div>";
      const dr = draft(comp, d);
      h += '<div class="wiz-addpair">' + (ui.editId ? '<div class="wiz-label">' + esc(t("entries.editing", { pair: dr.name })) + "</div>" : "") +
        '<div class="wiz-item"><input type="text" class="wiz-input" data-field="tmName" maxlength="40" placeholder="' + esc(t("teamEntries.name")) + '" value="' + esc(dr.name) + '">' +
        '<span class="gender-toggle wiz-g">' + ["M", "F"].map(g => '<button type="button" class="gender-seg ' + (dr.g === g ? "active" : "") + '" data-act="tmG" data-value="' + g + '">' + g + "</button>").join("") + "</span></div>" +
        '<button type="button" class="primary" data-act="tmAdd">' + esc(t(ui.editId ? "teamEntries.save" : "teamEntries.add")) + "</button>" +
        (ui.editId ? '<button type="button" class="wiz-link" data-act="tmCancel">' + esc(t("entries.cancel")) + "</button>" : "") + "</div>";
      h += '<details class="wiz-adv"><summary>' + esc(t("entries.paste")) + '</summary><div class="muted">' + esc(t("teamEntries.paste.hint")) + "</div>" +
        '<textarea class="wiz-input wiz-text" data-field="tmPaste" rows="5" placeholder="Rina f\nBudi">' + esc(ui.pasteText) + "</textarea>" +
        '<button type="button" class="secondary" data-act="tmPasteAdd">' + esc(t("entries.paste.add")) + "</button></details>";
      if (typeof players !== "undefined" && players.length) {
        h += '<details class="wiz-adv"' + (ui.picked.length ? " open" : "") + '><summary>' + esc(t("entries.roster")) + '</summary><div class="muted">' + esc(t("teamEntries.roster.hint")) + '</div><div class="wiz-roster">' +
          players.map(p => '<button type="button" class="wiz-chip ' + onOff(ui.picked.indexOf(p.id) !== -1) + '" data-act="tmPick" data-value="' + esc(p.id) + '">' + esc(p.name) + "</button>").join("") +
          '</div><button type="button" class="secondary" data-act="tmPickAdd"' + (ui.picked.length ? "" : " disabled") + ">" + esc(t("teamEntries.roster.add", { n: ui.picked.length })) + "</button></details>";
      }
      // registered pairs (slots) for this team and division
      const slots = comp.entries.filter(e => e.teamId === tm.id && e.divisionId === d.id);
      const regs = list.filter(p => p.role === "regular");
      h += '<div class="wiz-label">' + esc(t("teamEntries.pairs")) + '</div><div class="muted">' + esc(t("teamEntries.pairs.hint")) + "</div>";
      if (!slots.length) h += '<div class="muted">' + esc(t("teamEntries.noPairs")) + "</div>";
      h += slots.map(e => '<div class="wiz-item"><span class="wiz-pair-n wide">' + esc(e.label) + "</span>" + [0, 1].map(i =>
        '<select class="wiz-select" data-field="tmSlot" data-id="' + esc(e.id) + '" data-i="' + i + '" aria-label="' + esc(e.label) + '">' +
        regs.map(p => '<option value="' + esc(p.id) + '"' + (e.playerIds[i] === p.id ? " selected" : "") + ">" + esc(p.name) + "</option>").join("") + "</select>").join("") + "</div>").join("");
      const w = teamWarnings(comp, tm).concat(unusedSlots(comp).length ? [t("teamEntries.templateOld")] : []);
      if (w.length) h += '<div class="wiz-warn">' + w.map(x => "<div>" + esc(x) + "</div>").join("") + "</div>";
      flagTemplate(comp);
      return h;
    },
    act: function (comp, act, el, group, value) {
      const d = divOf(comp), tm = teamOf(comp);
      if (act === "tmTeam") { ui.team = el.dataset.value; ui.editId = null; ui.draft = null; U.render(); }
      else if (act === "pick" && group === "tmDiv") { ui.div = value; ui.editId = null; ui.draft = null; U.render(); }
      else if (act === "tmG") { draft(comp, d).g = el.dataset.value; U.render(); }
      else if (act === "tmRole") {
        const p = comp.players.find(x => x.id === el.dataset.id);
        if (p) { p.role = p.role === "reserve" ? "regular" : "reserve"; CompLineups.syncTeamEntries(comp); U.rerender(); }
      }
      else if (act === "tmEdit") { ui.editId = el.dataset.id; ui.draft = null; U.render(); const f = document.querySelector('[data-field="tmName"]'); if (f) f.focus(); }
      else if (act === "tmCancel") { ui.editId = null; ui.draft = null; U.render(); }
      else if (act === "tmRemove") {
        const p = comp.players.find(x => x.id === el.dataset.id);
        if (!p) return;
        cmxConfirm({ title: t("entries.remove"), yes: t("entries.remove"), danger: true, message: t("teamEntries.removeConfirm", { name: p.name }) }, function () {
          comp.players = comp.players.filter(x => x.id !== p.id); CompLineups.syncTeamEntries(comp); U.rerender();
        });
      }
      else if (act === "tmAdd") {
        const dr = draft(comp, d), name = dr.name.trim();
        if (!name) return cmxAlert(t("teamEntries.needName"));
        if (ui.editId) { const p = comp.players.find(x => x.id === ui.editId); if (p) { p.name = name; p.gender = dr.g; } }
        else addPlayer(comp, tm.id, d.id, name, dr.g, "regular");
        const editing = !!ui.editId;
        ui.editId = null; ui.draft = null;
        CompLineups.syncTeamEntries(comp); U.rerender();
        const f = document.querySelector('[data-field="tmName"]'); if (f && !editing) f.focus();
      }
      else if (act === "tmPasteAdd") {
        const ps = parsePlayers(ui.pasteText);
        ps.forEach(x => addPlayer(comp, tm.id, d.id, x.name, x.gender || defaultGender(d), "regular"));
        ui.pasteText = "";
        CompLineups.syncTeamEntries(comp); U.rerender();
        showToast(esc(t("teamEntries.added", { n: ps.length })));
      }
      else if (act === "tmPick") {
        const id = el.dataset.value, at = ui.picked.indexOf(id);
        if (at === -1) ui.picked.push(id); else ui.picked.splice(at, 1);
        U.render();
      }
      else if (act === "tmPickAdd") {
        const sel = ui.picked.map(id => players.find(p => p.id === id)).filter(Boolean);
        sel.forEach(p => addPlayer(comp, tm.id, d.id, p.name, p.gender, "regular"));
        ui.picked = [];
        CompLineups.syncTeamEntries(comp); U.rerender();
        showToast(esc(t("teamEntries.added", { n: sel.length })));
      }
    },
    input: function (comp, f, el) {
      if (f === "tmName") { draft(comp).name = el.value; return false; }
      if (f === "tmPaste") { ui.pasteText = el.value; return false; }
      return false;
    },
    change: function (comp, f, el) {
      if (f !== "tmSlot") return;
      // Picking a player who's in another pair swaps the two of them.
      const e = comp.entries.find(x => x.id === el.dataset.id), i = Number(el.dataset.i), pid = el.value;
      if (!e) return;
      const old = e.playerIds[i];
      const other = comp.entries.find(x => x.teamId === e.teamId && x.divisionId === e.divisionId && x.playerIds.indexOf(pid) !== -1);
      if (other) other.playerIds[other.playerIds.indexOf(pid)] = old;
      e.playerIds[i] = pid;
      U.rerender();
    }
  }, "teams");
  function draft(comp, d) {
    if (ui.draft) return ui.draft;
    const p = ui.editId && comp.players.find(x => x.id === ui.editId);
    ui.draft = p ? { name: p.name, g: p.gender } : { name: "", g: defaultGender(d || divOf(comp)) };
    return ui.draft;
  }

  /* ===== Step 7: Meeting template ===== */
  Wizard.register("template", {
    recommend: function (comp) { CompLineups.syncTeamEntries(comp); comp.settings.meetingTemplate = CompLineups.buildTemplate(comp); },
    validate: function (comp) {
      const tpl = comp.settings.meetingTemplate || [], errs = [];
      if (!tpl.some(r => !r.isDecider)) errs.push("wiz.err.template");
      if (tpl.some(r => !String(r.label || "").trim())) errs.push("wiz.err.rubberName");
      return errs;
    },
    body: function (comp) {
      const s = comp.settings;
      if (!(s.meetingTemplate || []).length) { CompLineups.syncTeamEntries(comp); s.meetingTemplate = CompLineups.buildTemplate(comp); }
      const tpl = s.meetingTemplate;
      let h = '<div class="wiz-label">' + esc(t("template.rubbers", { n: tpl.length })) + '</div><div class="muted">' + esc(t("template.hint")) + '</div><div class="wiz-list">';
      tpl.forEach(function (r, i) {
        h += '<div class="wiz-rubber"><div class="wiz-item"><input type="text" class="wiz-input" maxlength="20" data-field="rbLabel" data-idx="' + i + '" value="' + esc(r.label) + '" aria-label="' + esc(t("template.label")) + '">' +
          '<button type="button" class="wiz-icon" data-act="rbUp" data-idx="' + i + '"' + (i ? "" : " disabled") + ' aria-label="' + esc(t("stand.up")) + '">↑</button>' +
          '<button type="button" class="wiz-icon" data-act="rbDown" data-idx="' + i + '"' + (i < tpl.length - 1 ? "" : " disabled") + ' aria-label="' + esc(t("stand.down")) + '">↓</button>' +
          '<button type="button" class="wiz-icon" data-act="rbRemove" data-idx="' + i + '" aria-label="' + esc(t("template.remove")) + '">✕</button></div>' +
          '<div class="wiz-item"><select class="wiz-select" data-field="rbDiv" data-idx="' + i + '" aria-label="' + esc(t("template.division")) + '">' +
          comp.divisions.map(d => '<option value="' + esc(d.id) + '"' + (d.id === r.divisionId ? " selected" : "") + ">" + esc(d.name) + "</option>").join("") + "</select>" +
          '<select class="wiz-select" data-field="rbCat" data-idx="' + i + '" aria-label="' + esc(t("div.category")) + '">' +
          CompModel.CATEGORIES.map(c => '<option value="' + c + '"' + (r.category === c ? " selected" : "") + ">" + esc(t("cat." + c)) + "</option>").join("") + "</select>" +
          '<button type="button" class="wiz-chip ' + onOff(r.isDecider) + '" data-act="rbDecider" data-idx="' + i + '">' + esc(t("template.decider")) + "</button></div></div>";
      });
      h += '</div><div class="comp-actions"><button type="button" class="secondary small" data-act="rbAdd">' + esc(t("template.add")) + "</button>" +
        '<button type="button" class="secondary small" data-act="rbRebuild">' + esc(t("template.rebuild")) + "</button></div>";
      h += '<div class="wiz-label">' + esc(t("lineupMode")) + "</div>" + U.optionList("lineupMode", [
        { value: "fixed", label: t("lineupMode.fixed"), desc: t("lineupMode.fixed.desc"), recommended: true },
        { value: "flexible", label: t("lineupMode.flexible"), desc: t("lineupMode.flexible.desc") },
        { value: "fixedLastFree", label: t("lineupMode.lastFree"), desc: t("lineupMode.lastFree.desc") }], s.lineup.mode);
      h += '<div class="wiz-label">' + esc(t("lineup.onePer")) + "</div>" + P.seg("onePer", [{ value: "yes", label: t("lineup.onePer.warn") + " ★" }, { value: "no", label: t("lineup.onePer.off") }], s.lineup.onePerMeeting ? "yes" : "no");
      h += '<details class="wiz-adv"><summary>' + esc(t("wiz.advanced")) + '</summary><div class="wiz-label">' + esc(t("lineup.cross")) + "</div>" + U.optionList("crossDiv", [
        { value: "warn", label: t("lineup.cross.warn"), recommended: true }, { value: "block", label: t("lineup.cross.block") }, { value: "allow", label: t("lineup.cross.allow") }], s.lineup.crossDivision) +
        '<div class="wiz-label">' + esc(t("lineup.reservesAny")) + "</div>" + P.seg("reservesAny", [{ value: "yes", label: t("yes") + " ★" }, { value: "no", label: t("no") }], s.lineup.reservesAnyDivision ? "yes" : "no") + "</details>";
      return h;
    },
    act: function (comp, act, el, group, value) {
      const s = comp.settings, tpl = s.meetingTemplate, i = el ? Number(el.dataset.idx) : -1;
      const renum = () => tpl.forEach((r, k) => { r.order = k; });
      const nextSlot = (divId) => Math.max.apply(null, [0].concat(tpl.filter(r => r.divisionId === divId && r.slot).map(r => r.slot))) + 1;
      if (act === "rbUp" || act === "rbDown") { const j = act === "rbUp" ? i - 1 : i + 1; const x = tpl[i]; tpl[i] = tpl[j]; tpl[j] = x; renum(); }
      else if (act === "rbRemove") { tpl.splice(i, 1); renum(); }
      else if (act === "rbDecider") { const on = !tpl[i].isDecider; tpl.forEach(r => { r.isDecider = false; }); tpl[i].isDecider = on; if (on) tpl[i].slot = null; else tpl[i].slot = nextSlot(tpl[i].divisionId); }
      else if (act === "rbAdd") { const d = comp.divisions[0]; tpl.push({ id: uid(), order: tpl.length, label: CompLineups.slotLabel(d, nextSlot(d.id)), divisionId: d.id, category: d.category, isDecider: false, slot: nextSlot(d.id) }); }
      else if (act === "rbRebuild") { CompLineups.syncTeamEntries(comp); s.meetingTemplate = CompLineups.buildTemplate(comp); }
      else if (act === "pick" && group === "lineupMode") s.lineup.mode = value;
      else if (act === "pick" && group === "onePer") s.lineup.onePerMeeting = value === "yes";
      else if (act === "pick" && group === "crossDiv") s.lineup.crossDivision = value;
      else if (act === "pick" && group === "reservesAny") s.lineup.reservesAnyDivision = value === "yes";
      else return;
      U.rerender();
    },
    input: function (comp, f, el) {
      if (f === "rbLabel") { comp.settings.meetingTemplate[Number(el.dataset.idx)].label = el.value; return true; }
      return false;
    },
    change: function (comp, f, el) {
      const r = comp.settings.meetingTemplate[Number(el.dataset.idx)];
      if (!r) return;
      if (f === "rbDiv") {
        r.divisionId = el.value;
        const d = comp.divisions.find(x => x.id === el.value);
        if (d) r.category = d.category;
        if (!r.isDecider) r.slot = Math.max.apply(null, [0].concat(comp.settings.meetingTemplate.filter(x => x !== r && x.divisionId === r.divisionId && x.slot).map(x => x.slot))) + 1;
      } else if (f === "rbCat") r.category = el.value;
      else return;
      U.rerender();
    }
  }, "teams");

  /* ===== Step 8: How a meeting is won ===== */
  Wizard.register("meetingWin", {
    validate: function (comp) {
      const ts = comp.settings.standings.teams;
      return ts.resultMode === "meeting" && ts.splitRule === "decider" && !(comp.settings.meetingTemplate || []).some(r => r.isDecider) ? ["wiz.err.decider"] : [];
    },
    body: function (comp) {
      const ts = comp.settings.standings.teams, dr = comp.settings.deadRubbers;
      let h = U.optionList("resultMode", [
        { value: "meeting", label: t("win.meeting"), desc: t("win.meeting.desc"), recommended: true },
        { value: "tally", label: t("win.tally"), desc: t("win.tally.desc") }], ts.resultMode);
      if (ts.resultMode === "meeting") {
        const mp = ts.meetingPoints;
        h += '<div class="wiz-label">' + esc(t("win.points")) + "</div>" +
          ["win", "draw", "loss"].map(k => '<div class="wiz-row"><span class="wiz-label">' + esc(t("win.points." + k)) + "</span>" + U.stepper("mp:" + k, mp[k], 0, 10) + "</div>").join("");
        h += '<div class="wiz-label">' + esc(t("win.split")) + '</div><div class="muted">' + esc(t("win.split.hint")) + "</div>" + U.optionList("splitRule", [
          { value: "totalGames", label: t("win.split.total"), desc: t("win.split.total.desc"), recommended: true },
          { value: "draw", label: t("win.split.draw"), desc: t("win.split.draw.desc") },
          { value: "decider", label: t("win.split.decider"), desc: t("win.split.decider.desc") }], ts.splitRule);
        h += '<div class="wiz-label">' + esc(t("win.dead")) + '</div><div class="muted">' + esc(t("win.dead.hint")) + "</div>" +
          '<div class="wiz-sub">' + esc(t("win.dead.groups")) + "</div>" + P.seg("deadGroup", [{ value: "playAll", label: t("win.dead.playAll") + " ★" }, { value: "stopWhenDecided", label: t("win.dead.stop") }], dr.groupStage) +
          '<div class="wiz-sub">' + esc(t("win.dead.ko")) + "</div>" + P.seg("deadKo", [{ value: "stopWhenDecided", label: t("win.dead.stop") + " ★" }, { value: "playAll", label: t("win.dead.playAll") }], dr.knockout);
      } else h += '<div class="muted">' + esc(t("win.tally.note")) + "</div>";
      return h;
    },
    act: function (comp, act, el, group, value) {
      const ts = comp.settings.standings.teams, dr = comp.settings.deadRubbers;
      if (act === "pick" && group === "resultMode") ts.resultMode = value;
      else if (act === "pick" && group === "splitRule") {
        ts.splitRule = value;
        // A decider needs a decider rubber: add one if the template has none.
        const tpl = comp.settings.meetingTemplate || [];
        if (value === "decider" && !tpl.some(r => r.isDecider) && comp.status !== "setup") { ts.splitRule = "totalGames"; cmxAlert(t("win.deciderLate")); return; }
        if (value === "decider" && !tpl.some(r => r.isDecider) && comp.divisions.length) {
          const d = comp.divisions[0];
          tpl.push({ id: uid(), order: tpl.length, label: t("template.decider"), divisionId: d.id, category: d.category, isDecider: true, slot: null });
          comp.settings.meetingTemplate = tpl;
          showToast(esc(t("win.deciderAdded")));
        }
      }
      else if (act === "pick" && group === "deadGroup") dr.groupStage = value;
      else if (act === "pick" && group === "deadKo") dr.knockout = value;
      else if (act.indexOf("mp:") === 0) { const k = act.slice(3); ts.meetingPoints[k] = Math.max(0, Math.min(10, ts.meetingPoints[k] + Number(el.dataset.delta))); }
      else return;
      U.rerender();
    }
  }, "teams");

  /* ===== Step 11: Standings (teams) ===== */
  const TB_TEAMS = ["headToHead", "matchDiff", "setDiff", "gameDiff", "manual"];
  Wizard.register("standings", {
    validate: function () { return []; },
    body: function (comp) {
      const ts = comp.settings.standings.teams, f = P.ensureFormat(comp, "main");
      const unit = f.setType === "games" ? "games" : "points";
      let h = '<div class="wiz-preview">' + esc(ts.resultMode === "tally" ? t("stand.teams.tally") : t("stand.teams.meeting", { w: ts.meetingPoints.win, d: ts.meetingPoints.draw, l: ts.meetingPoints.loss })) + "</div>";
      h += '<div class="wiz-label">' + esc(t("stand.tiebreakers")) + '</div><div class="muted">' + esc(t("stand.teams.hint")) + '</div><div class="wiz-list">' +
        ts.tiebreakers.map((tb, i) => '<div class="wiz-pair"><span class="wiz-pair-n">' + (i + 1) + '.</span><span class="wiz-pair-name">' + esc(t("tb." + tb, { unit: t("unit." + unit) })) + "</span>" +
          '<button type="button" class="wiz-icon" data-act="ttUp" data-idx="' + i + '"' + (i ? "" : " disabled") + ">↑</button>" +
          '<button type="button" class="wiz-icon" data-act="ttDown" data-idx="' + i + '"' + (i < ts.tiebreakers.length - 1 ? "" : " disabled") + ">↓</button></div>").join("") + "</div>" +
        '<button type="button" class="wiz-link" data-act="ttReset">' + esc(t("stand.reset")) + "</button>";
      return h;
    },
    act: function (comp, act, el) {
      const a = comp.settings.standings.teams.tiebreakers;
      if (act === "ttUp" || act === "ttDown") { const i = Number(el.dataset.idx), j = act === "ttUp" ? i - 1 : i + 1; const x = a[i]; a[i] = a[j]; a[j] = x; }
      else if (act === "ttReset") comp.settings.standings.teams.tiebreakers = TB_TEAMS.slice();
      else return;
      U.rerender();
    }
  }, "teams");

  /* ===== Step 13: Review (teams) ===== */
  Wizard.register("review", {
    body: function (comp) {
      const name = U.stepName, card = P.reviewCard;
      let h = "";
      const blk = Wizard.blockers(comp), bad = Wizard.invalidSteps(comp);
      if (blk.length) h += '<div class="wiz-warn">' + esc(t("review.needsReview", { steps: blk.map(name).join(", ") })) + "</div>";
      if (bad.length) h += '<div class="wiz-errors">' + bad.map(id => '<div><button type="button" class="wiz-link" data-act="jump" data-step="' + id + '">' + esc(name(id)) + "</button> — " +
        esc(Wizard.validate(comp, id).map(k => t(k)).join(" ")) + "</div>").join("") + "</div>";
      h += card("basics", name("basics"), [comp.name || t("comp.untitled"), comp.dateISO, comp.sport ? t("sport." + comp.sport) : "—"]);
      h += card("divisions", name("divisions"), comp.divisions.map(d => d.name + " · " + t("cat." + d.category)));
      h += card("entries", name("entries"), comp.teams.map(tm => t("review.team", { team: tm.name, players: comp.players.filter(p => p.teamId === tm.id).length,
        pairs: comp.entries.filter(e => e.teamId === tm.id).length })));
      const tpl = comp.settings.meetingTemplate || [], ts = comp.settings.standings.teams;
      h += card("template", name("template"), [tpl.map(r => r.label + (r.isDecider ? " (" + t("template.decider") + ")" : "")).join(", "), t("lineupMode." + (comp.settings.lineup.mode === "fixedLastFree" ? "lastFree" : comp.settings.lineup.mode))]);
      h += card("meetingWin", name("meetingWin"), [ts.resultMode === "tally" ? t("win.tally") : t("review.meetingPts", { w: ts.meetingPoints.win, d: ts.meetingPoints.draw, l: ts.meetingPoints.loss }) + " · " +
        t("win.split." + (ts.splitRule === "totalGames" ? "total" : ts.splitRule))]);
      h += card("format", name("format"), [P.planText(comp, comp.settings.stagePlan.all)]);
      const fs = comp.settings.matchFormats || {};
      h += card("scoring", name("scoring"), [fs.main ? CompFormat.describe(fs.main) : "—"]);
      h += card("courts", name("courts"), [t("review.courts", { n: comp.settings.courtsCount, mode: t("courts." + (comp.settings.courtMode === "homeBorrow" ? "home" : comp.settings.courtMode)) })]);
      // teams missing a pair for a rubber that has fixed players
      const missing = [];
      comp.teams.forEach(tm => tpl.forEach(r => {
        if (!CompLineups.isFreeRubber(comp, r) && !comp.entries.some(e => e.teamId === tm.id && e.divisionId === r.divisionId && e.slot === r.slot)) missing.push(t("review.missingPair", { team: tm.name, rubber: r.label }));
      }));
      const allWarn = missing.concat(unusedSlots(comp));
      if (allWarn.length) h += '<div class="wiz-warn">' + allWarn.map(x => "<div>" + esc(x) + "</div>").join("") + "</div>";
      if (!bad.length) {
        const draw = CompGenerate.generateDraw(comp), est = CompSchedule.estimate(comp, draw);
        const range = P.matchRange(comp, draw);
        const fin = CompSchedule.finishTime(comp.settings.startTime, est.minutes);
        h += '<div class="wiz-card"><div class="wiz-card-head"><span>' + esc(t("review.numbers")) + "</span></div>" +
          '<div class="wiz-card-line">' + esc(t("review.teamMatches", { m: draw.meetings.length, n: draw.matches.length })) + "</div>" +
          '<div class="wiz-card-line">' + esc(t("review.perTeam", { min: range.min, max: range.max })) + "</div>" +
          '<div class="wiz-card-line">' + esc(t("review.duration", { time: CompSchedule.fmtDuration(est.minutes), courts: comp.settings.courtsCount, per: CompSchedule.minutesDefault(comp) })) + (fin ? " · " + esc(t("review.finish", { at: fin })) : "") + "</div></div>";
        if (est.minutes > (comp.settings.timeAvailable || 240)) h += '<div class="wiz-warn">' + esc(t("review.tooLong", { time: CompSchedule.fmtDuration(est.minutes), courts: comp.settings.courtsCount, budget: CompSchedule.fmtDuration(comp.settings.timeAvailable || 240) })) +
          '<div class="comp-actions"><button type="button" class="secondary small" data-act="fixCourt">' + esc(t("review.fix.court")) + '</button><button type="button" class="secondary small" data-act="jump" data-step="scoring">' + esc(t("review.fix.shorter")) + "</button></div></div>";
      }
      const canGo = !blk.length && !bad.length;
      h += '<button type="button" class="primary wiz-generate" data-act="generate"' + (canGo ? "" : " disabled") + ">" + esc(t("review.generate")) + "</button>";
      if (!canGo) h += '<div class="muted">' + esc(t("review.blocked")) + "</div>";
      return h;
    },
    act: function (comp, act) {
      if (act === "fixCourt") { comp.settings.courtsCount = Math.min(16, comp.settings.courtsCount + 1); P.syncCourtNames(comp); U.rerender(); }
      else if (act === "generate") {
        if (Wizard.blockers(comp).length || Wizard.invalidSteps(comp).length) return;
        cmxConfirm({ title: t("review.generate"), yes: t("review.generate"), message: t("review.generateConfirm") }, function () { CompShell.generate(comp); });
      }
    }
  }, "teams");

  Wizard.teamsUtil = { addPlayer, parsePlayers };
})();
