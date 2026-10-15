// CourtMixer - wizard steps 6 and 9-13 (Phase 3, v1.11.0), spec §6.2.
// Players and entries (pairs), Format, Match scoring, Standings and tiebreakers, Courts and time,
// Review + Generate draw. Registered into the framework in wizard.js.

(function () {
  const U = Wizard.ui;
  const ui = { entryDiv: null, picked: [], formatDiv: null, fmtSlotOpen: {} };

  /* ===== shared helpers ===== */
  function divisionsOf(comp) { return comp.divisions; }
  function entriesIn(comp, divId) { return comp.entries.filter(e => e.divisionId === divId && !e.withdrawn); }
  function playerById(comp, id) { return comp.players.find(p => p.id === id); }
  function labelOf(comp, e) { return e.playerIds.map(id => (playerById(comp, id) || {}).name || "?").join(" / "); }
  function defaultGenders(category) { return category === "WD" ? ["F", "F"] : category === "XD" ? ["M", "F"] : ["M", "M"]; }
  function onOff(v) { return v ? "on" : ""; }
  function chips(act, items, selected) {
    return '<div class="wiz-chips">' + items.map(it => '<button type="button" class="wiz-chip ' + onOff(it.value === selected) + '" data-act="' + act + '" data-value="' + esc(it.value) + '">' + esc(it.label) + "</button>").join("") + "</div>";
  }
  function seg(group, items, selected) {
    return '<div class="court-segments wiz-seg">' + items.map(it => '<button type="button" class="court-segment ' + (it.value === selected ? "active" : "") + '" data-act="pick" data-group="' + esc(group) + '" data-value="' + esc(it.value) + '">' + esc(it.label) + "</button>").join("") + "</div>";
  }

  function addPair(comp, divId, names, genders) {
    const pl = names.map((n, i) => ({ id: uid(), name: String(n).trim(), gender: genders[i] === "F" ? "F" : "M", teamId: null, divisionId: divId, role: "regular", withdrawn: false }));
    pl.forEach(p => comp.players.push(p));
    const e = { id: uid(), divisionId: divId, teamId: null, playerIds: pl.map(p => p.id), label: "", seed: null, withdrawn: false };
    e.label = labelOf(comp, e);
    comp.entries.push(e);
    return e;
  }
  function removeEntry(comp, id) {
    const e = comp.entries.find(x => x.id === id);
    if (!e) return;
    comp.entries = comp.entries.filter(x => x.id !== id);
    comp.players = comp.players.filter(p => e.playerIds.indexOf(p.id) === -1);
  }
  // One pair per line: "Ann / Ben" ("&", a comma or a tab work too). Genders are optional, either
  // after each name ("Ann f / Ben m") or at the end of the line ("Ann / Ben f / m", "Ann / Ben fm").
  // Returns { pairs: [{ names: [a, b], genders: [g|null, g|null] }], bad: [lines] }.
  function parsePairs(text) {
    const pairs = [], bad = [];
    String(text || "").split(/\r?\n/).forEach(function (line) {
      let s = line.trim(), genders = [null, null];
      if (!s) return;
      const tail = /^(.*?)\s+([mf])\s*(?:[\/,&]\s*|\s+)?([mf])\s*$/i.exec(s);
      if (tail && tail[1].split(/\s*(?:\/|&|,|\t)\s*/).filter(Boolean).length === 2) { s = tail[1]; genders = [tail[2].toUpperCase(), tail[3].toUpperCase()]; }
      const parts = s.split(/\s*(?:\/|&|,|\t)\s*/).filter(Boolean);
      if (parts.length !== 2) { bad.push(line.trim()); return; }
      const names = parts.map(function (n, i) {
        const m = /^(.*\S)\s+([mf])$/i.exec(n);
        if (m && !genders[i]) { genders[i] = m[2].toUpperCase(); return m[1]; }
        return n;
      });
      pairs.push({ names, genders });
    });
    return { pairs, bad };
  }

  /* ===== Step 6: Players and entries (pairs) ===== */
  function entryWarnings(comp, divId) {
    const d = comp.divisions.find(x => x.id === divId), list = entriesIn(comp, divId), out = [];
    if (list.length === 2) out.push(t("entries.warnFew"));
    const names = {};
    list.forEach(function (e) {
      const g = e.playerIds.map(id => (playerById(comp, id) || {}).gender);
      if (d && d.category === "MD" && g.some(x => x !== "M")) out.push(t("entries.warnGender", { pair: e.label, cat: t("cat.MD") }));
      if (d && d.category === "WD" && g.some(x => x !== "F")) out.push(t("entries.warnGender", { pair: e.label, cat: t("cat.WD") }));
      if (d && d.category === "XD" && g[0] === g[1]) out.push(t("entries.warnGender", { pair: e.label, cat: t("cat.XD") }));
      e.playerIds.forEach(id => { const n = ((playerById(comp, id) || {}).name || "").toLowerCase(); if (n) names[n] = (names[n] || 0) + 1; });
    });
    Object.keys(names).forEach(n => { if (names[n] > 1) out.push(t("entries.warnDup", { name: n })); });
    return out;
  }

  Wizard.register("entries", {
    validate: function (comp) {
      const errs = [];
      if (comp.divisions.some(d => entriesIn(comp, d.id).length < 2)) errs.push("wiz.err.pairs");
      if (CompModel.unassigned(comp).entries.length) errs.push("wiz.err.unassigned");
      return errs;
    },
    body: function (comp) {
      if (!ui.entryDiv || !comp.divisions.some(d => d.id === ui.entryDiv)) ui.entryDiv = comp.divisions[0] && comp.divisions[0].id;
      const d = comp.divisions.find(x => x.id === ui.entryDiv);
      let h = "";
      if (comp.divisions.length > 1) h += chips("entryDiv", comp.divisions.map(x => ({ value: x.id, label: x.name + " (" + entriesIn(comp, x.id).length + ")" })), ui.entryDiv);
      const list = entriesIn(comp, ui.entryDiv);
      h += '<div class="wiz-label">' + esc(t("entries.inDivision", { div: d ? d.name : "", n: list.length })) + "</div>";
      if (!list.length) h += '<div class="muted">' + esc(t("entries.none")) + "</div>";
      h += '<div class="wiz-list">' + list.map(function (e, i) {
        const g = e.playerIds.map(id => (playerById(comp, id) || {}).gender || "M");
        return '<div class="wiz-pair"><span class="wiz-pair-n">' + (i + 1) + '.</span><span class="wiz-pair-name">' + esc(e.label) +
          ' <span class="muted">' + esc(g.join("/")) + "</span></span>" +
          '<button type="button" class="wiz-icon" data-act="editPair" data-id="' + esc(e.id) + '" aria-label="' + esc(t("entries.edit")) + '">✎</button>' +
          '<button type="button" class="wiz-icon" data-act="removePair" data-id="' + esc(e.id) + '" aria-label="' + esc(t("entries.remove")) + '">✕</button></div>';
      }).join("") + "</div>";
      const editing = ui.editId && comp.entries.find(e => e.id === ui.editId);
      const dr = draft(comp, d);
      h += '<div class="wiz-addpair">' + (editing ? '<div class="wiz-label">' + esc(t("entries.editing", { pair: editing.label })) + "</div>" : "") + [0, 1].map(i =>
        '<div class="wiz-item"><input type="text" class="wiz-input" data-field="newName' + i + '" maxlength="40" placeholder="' + esc(t("entries.player", { n: i + 1 })) + '" value="' + esc(dr.names[i]) + '">' +
        '<span class="gender-toggle wiz-g">' + ["M", "F"].map(g => '<button type="button" class="gender-seg ' + (dr.g[i] === g ? "active" : "") + '" data-act="newG" data-idx="' + i + '" data-value="' + g + '">' + g + "</button>").join("") + "</span></div>").join("") +
        '<button type="button" class="primary" data-act="addPair">' + esc(editing ? t("entries.save") : t("entries.add")) + "</button>" +
        (editing ? '<button type="button" class="wiz-link" data-act="cancelEdit">' + esc(t("entries.cancel")) + "</button>" : "") + "</div>";
      h += '<details class="wiz-adv"><summary>' + esc(t("entries.paste")) + '</summary><div class="muted">' + esc(t("entries.paste.hint")) + "</div>" +
        '<textarea class="wiz-input wiz-text" data-field="pasteText" rows="5" placeholder="Rina f / Sari f\nBudi / Andi">' + esc(ui.pasteText || "") + "</textarea>" +
        '<button type="button" class="secondary" data-act="pastePairs">' + esc(t("entries.paste.add")) + "</button></details>";
      if (typeof players !== "undefined" && players.length) {
        h += '<details class="wiz-adv"' + (ui.picked.length ? " open" : "") + '><summary>' + esc(t("entries.roster")) + '</summary><div class="muted">' + esc(t("entries.roster.hint")) + '</div><div class="wiz-roster">' +
          players.map(function (p) {
            const at = ui.picked.indexOf(p.id);
            return '<button type="button" class="wiz-chip ' + onOff(at !== -1) + '" data-act="rosterPick" data-value="' + esc(p.id) + '">' + (at !== -1 ? (at + 1) + ". " : "") + esc(p.name) + "</button>";
          }).join("") + '</div><button type="button" class="secondary" data-act="rosterAdd"' + (ui.picked.length >= 2 ? "" : " disabled") + ">" + esc(t("entries.roster.add", { n: Math.floor(ui.picked.length / 2) })) + "</button></details>";
      }
      if (list.length) {
        h += '<details class="wiz-adv"><summary>' + esc(t("entries.seeds")) + '</summary><div class="muted">' + esc(t("entries.seeds.hint")) + "</div>" +
          list.map(e => '<div class="wiz-item"><span class="wiz-pair-name">' + esc(e.label) + '</span><input type="number" min="1" max="64" class="wiz-input wiz-num" data-field="seed" data-id="' + esc(e.id) + '" value="' + (e.seed || "") + '" placeholder="–" aria-label="' + esc(t("entries.seed")) + '"></div>').join("") + "</details>";
      }
      const un = CompModel.unassigned(comp).entries;
      if (un.length) {
        h += '<div class="wiz-warn"><b>' + esc(t("entries.unassigned", { n: un.length })) + "</b>" + un.map(e =>
          '<div class="wiz-item"><span class="wiz-pair-name">' + esc(e.label) + '</span><select class="wiz-select" data-field="assign" data-id="' + esc(e.id) + '"><option value="">' + esc(t("entries.moveTo")) + "</option>" +
          comp.divisions.map(x => '<option value="' + esc(x.id) + '">' + esc(x.name) + "</option>").join("") + '</select><button type="button" class="wiz-icon" data-act="removePair" data-id="' + esc(e.id) + '" aria-label="' + esc(t("entries.remove")) + '">✕</button></div>').join("") + "</div>";
      }
      const w = entryWarnings(comp, ui.entryDiv);
      if (w.length) h += '<div class="wiz-warn">' + w.map(x => "<div>" + esc(x) + "</div>").join("") + "</div>";
      return h;
    },
    act: function (comp, act, el) {
      if (act === "entryDiv") { ui.entryDiv = el.dataset.value; ui.editId = null; ui.draft = null; U.render(); }
      else if (act === "newG") { draft(comp).g[Number(el.dataset.idx)] = el.dataset.value; U.render(); }
      else if (act === "addPair") {
        const dr = draft(comp), n0 = dr.names[0].trim(), n1 = dr.names[1].trim();
        if (!n0 || !n1) return cmxAlert(t("entries.needTwo"));
        const editing = ui.editId && comp.entries.find(e => e.id === ui.editId);
        if (editing) {
          editing.playerIds.forEach((id, i) => { const p = playerById(comp, id); if (p) { p.name = i ? n1 : n0; p.gender = dr.g[i]; } });
          editing.label = labelOf(comp, editing);
        } else addPair(comp, ui.entryDiv, [n0, n1], dr.g);
        ui.editId = null; ui.draft = null;
        U.rerender();
        const f = document.querySelector('[data-field="newName0"]'); if (f && !editing) f.focus();
      }
      else if (act === "editPair") { ui.editId = el.dataset.id; ui.draft = null; U.render(); const f = document.querySelector('[data-field="newName0"]'); if (f) f.focus(); }
      else if (act === "cancelEdit") { ui.editId = null; ui.draft = null; U.render(); }
      else if (act === "removePair") {
        const e = comp.entries.find(x => x.id === el.dataset.id);
        if (!e) return;
        cmxConfirm({ title: t("entries.remove"), yes: t("entries.remove"), danger: true, message: t("entries.removeConfirm", { pair: e.label }) }, function () { removeEntry(comp, e.id); U.rerender(); });
      }
      else if (act === "pastePairs") {
        const ta = el.closest(".wiz").querySelector('[data-field="pasteText"]');
        const r = parsePairs(ta && ta.value);
        const d = comp.divisions.find(x => x.id === ui.entryDiv), gd = defaultGenders(d && d.category);
        r.pairs.forEach(p => addPair(comp, ui.entryDiv, p.names, p.genders.map((g, i) => g || gd[i])));
        ui.pasteText = r.bad.join("\n");
        U.rerender();
        if (r.bad.length) cmxAlert(t("entries.paste.bad", { n: r.pairs.length, lines: r.bad.join("\n") }));
        else showToast(esc(t("entries.paste.done", { n: r.pairs.length })));
      }
      else if (act === "rosterPick") {
        const id = el.dataset.value, at = ui.picked.indexOf(id);
        if (at === -1) ui.picked.push(id); else ui.picked.splice(at, 1);
        U.render();
      }
      else if (act === "rosterAdd") {
        const sel = ui.picked.map(id => players.find(p => p.id === id)).filter(Boolean);
        let n = 0;
        for (let i = 0; i + 1 < sel.length; i += 2) { addPair(comp, ui.entryDiv, [sel[i].name, sel[i + 1].name], [sel[i].gender, sel[i + 1].gender]); n++; }
        ui.picked = sel.length % 2 ? [sel[sel.length - 1].id] : [];
        U.rerender();
        showToast(esc(t("entries.paste.done", { n: n })));
      }
    },
    input: function (comp, f, el) {
      if (f === "newName0" || f === "newName1") { draft(comp).names[f === "newName0" ? 0 : 1] = el.value; return false; }
      if (f === "pasteText") { ui.pasteText = el.value; return false; }
      if (f === "seed") {
        const e = comp.entries.find(x => x.id === el.dataset.id), v = parseInt(el.value, 10);
        if (e) e.seed = v > 0 ? v : null;
        return true;
      }
      return false;
    },
    change: function (comp, f, el) {
      if (f !== "assign" || !el.value) return;
      const e = comp.entries.find(x => x.id === el.dataset.id);
      if (!e) return;
      e.divisionId = el.value;
      e.playerIds.forEach(id => { const p = playerById(comp, id); if (p) p.divisionId = el.value; });
      U.rerender();
    }
  });
  // The add/edit form's names and genders, kept while the step re-renders (gender taps etc.).
  function draft(comp, d) {
    if (ui.draft) return ui.draft;
    const editing = ui.editId && comp.entries.find(e => e.id === ui.editId);
    if (editing) {
      const ps = editing.playerIds.map(id => playerById(comp, id) || {});
      ui.draft = { names: ps.map(p => p.name || ""), g: ps.map(p => p.gender === "F" ? "F" : "M") };
    } else {
      d = d || comp.divisions.find(x => x.id === ui.entryDiv);
      ui.draft = { names: ["", ""], g: defaultGenders(d && d.category) };
    }
    return ui.draft;
  }

  /* ===== Step 9: Format ===== */
  const FORMATS = ["roundRobin", "doubleRoundRobin", "groups", "knockout", "plate", "swiss", "pointsLeague"];
  // Points league is for fixed pairs only (§9.8).
  function unavailable(comp, ty) { return comp.kind === "teams" && ty === "pointsLeague"; }
  // Entrants in the division being planned (or all of them).
  function entrantCount(comp, divId) {
    if (comp.kind === "teams") return comp.teams.filter(x => !x.withdrawn).length;
    return comp.entries.filter(e => !e.withdrawn && e.divisionId && (divId === "all" || !divId || e.divisionId === divId)).length;
  }
  function planKey(comp) { return comp.settings.formatPlan === "perDivision" && ui.formatDiv ? ui.formatDiv : "all"; }
  function currentPlan(comp) {
    const sp = comp.settings.stagePlan, k = planKey(comp);
    return sp[k] || sp.all || { type: "groups" };
  }
  // Estimates are cached on everything they depend on, so taps on the Format step don't
  // regenerate and simulate whole draws again.
  const trialCache = new Map();
  function trial(comp, plan, divId) {
    const s = comp.settings;
    const key = JSON.stringify([comp.id, comp.kind, plan, divId, s.formatPlan, s.formatPlan === "perDivision" ? s.stagePlan : null, s.courtsCount, s.courtMode, s.courtAssign, s.matchFormats,
      comp.entries.map(e => [e.id, e.divisionId, e.seed, e.withdrawn, e.playerIds]), (comp.teams || []).map(tm => [tm.id, tm.withdrawn]),
      s.meetingTemplate, s.lineup]);
    if (trialCache.has(key)) return trialCache.get(key);
    const r = trialUncached(comp, plan, divId);
    if (trialCache.size > 60) trialCache.clear();
    trialCache.set(key, r);
    return r;
  }
  function trialUncached(comp, plan, divId) {
    // estimate for a plan, applied to one division (or all)
    const copy = JSON.parse(JSON.stringify(comp));
    if (divId && divId !== "all") { copy.settings.formatPlan = "perDivision"; copy.settings.stagePlan[divId] = plan; }
    else { copy.settings.formatPlan = "sameForAll"; copy.settings.stagePlan = { all: plan }; }
    const draw = CompGenerate.generateDraw(copy);
    const est = CompSchedule.estimate(copy, draw);
    const range = matchRange(copy, draw);
    return { est, draw, min: range.min, max: range.max };
  }
  // §6.2 step 9: the fairest format that fits the time available (RR -> groups+KO -> knockout).
  // Fewest and most matches (meetings, for teams) an entrant can play: fixed fixtures, plus every
  // knockout round for whoever reaches the final.
  function matchRange(comp, draw) {
    const per = {};
    draw.meetings.forEach(m => [m.sideA.id, m.sideB.id].forEach(id => { if (id) per[id] = (per[id] || 0) + 1; }));
    const dyn = draw.stages.find(s => s.type === "swiss" || s.type === "pointsLeague");
    if (dyn) return { min: dyn.config.rounds, max: dyn.config.rounds }; // everyone plays (or sits out) every round
    const koRounds = draw.stages.filter(s => s.type === "knockout").map(s => Math.log2(s.config.size || 2));
    const direct = draw.stages.some(s => s.type === "knockout" && s.order === 0);
    const counts = entrantIds(comp).map(id => per[id] || 0);
    if (!counts.length) return { min: 0, max: 0 };
    const extra = Math.max.apply(null, koRounds.concat([0]));
    const plate = draw.stages.some(s => s.type === "plate") ? 1 : 0; // first-round losers get at least one more match
    return { min: (direct ? Math.min.apply(null, counts.map(c => Math.max(c, 1))) : Math.min.apply(null, counts)) + plate,
      max: direct ? extra : Math.max.apply(null, counts) + extra };
  }
  // Who the draw is between: pairs, or teams in a team competition.
  function entrantIds(comp) {
    return comp.kind === "teams" ? comp.teams.filter(tm => !tm.withdrawn).map(tm => tm.id) : comp.entries.filter(e => !e.withdrawn && e.divisionId).map(e => e.id);
  }
  function recommendedFormat(comp, divId) {
    if (entrantIds(comp).length < 2 || (comp.kind === "teams" && !(comp.settings.meetingTemplate || []).length)) return null;
    const budget = comp.settings.timeAvailable || 240;
    const order = ["roundRobin", "groups", "swiss", "knockout"]; // fairest first (§6.2 step 9)
    for (const type of order) {
      const r = trial(comp, CompModel.stagePlanFor(type), divId);
      if (r.est.minutes <= budget) return type;
    }
    return "knockout";
  }

  Wizard.register("format", {
    recommend: function (comp) {
      const rec = recommendedFormat(comp, "all");
      const preset = (CompModel.PRESETS[comp.settings.preset] || {}).stage;
      const type = preset && !unavailable(comp, preset) ? preset : (rec || "groups");
      comp.settings.formatPlan = "sameForAll";
      comp.settings.stagePlan = { all: CompModel.stagePlanFor(type) };
    },
    validate: function (comp) {
      const plans = comp.settings.formatPlan === "perDivision" ? comp.divisions.map(d => comp.settings.stagePlan[d.id] || comp.settings.stagePlan.all) : [comp.settings.stagePlan.all];
      return plans.some(p => !p || unavailable(comp, p.type)) ? ["wiz.err.format"] : [];
    },
    body: function (comp) {
      let h = "";
      if (comp.kind === "pairs" && comp.divisions.length > 1) {
        h += seg("formatPlan", [{ value: "sameForAll", label: t("format.same") }, { value: "perDivision", label: t("format.perDivision") }], comp.settings.formatPlan);
        if (comp.settings.formatPlan === "perDivision") {
          if (!ui.formatDiv || !comp.divisions.some(d => d.id === ui.formatDiv)) ui.formatDiv = comp.divisions[0].id;
          h += chips("formatDiv", comp.divisions.map(d => ({ value: d.id, label: d.name })), ui.formatDiv);
        }
      }
      const divId = planKey(comp), plan = currentPlan(comp);
      const rec = recommendedFormat(comp, divId);
      const est = {};
      if (rec) FORMATS.filter(ty => !unavailable(comp, ty)).forEach(ty => {
        const p = ty === plan.type ? plan : CompModel.stagePlanFor(ty);
        est[ty] = trial(comp, p, divId);
      });
      h += optionList(comp, plan.type, rec, est);
      if (!rec) h += '<div class="muted">' + esc(t(comp.kind === "teams" ? "format.addTeams" : "format.addPairs")) + "</div>";
      if (plan.type === "groups") {
        h += '<div class="wiz-row"><span class="wiz-label">' + esc(t("format.groupSize")) + "</span>" + U.stepper("groupSize", plan.groupSize || 4, 3, 6) + "</div>" +
          '<div class="wiz-row"><span class="wiz-label">' + esc(t("format.advance")) + "</span>" + U.stepper("advance", plan.advance || 2, 1, 4) + "</div>" +
          '<div class="wiz-label">' + esc(t("format.seeding")) + "</div>" + seg("seeding", [{ value: "snake", label: t("format.seeding.snake") }, { value: "random", label: t("format.seeding.random") }], plan.seeding || "snake");
      }
      if (plan.type === "groups" || plan.type === "knockout" || plan.type === "plate") {
        h += '<div class="wiz-label">' + esc(t("format.third")) + "</div>" + seg("thirdPlace", [{ value: "yes", label: t("yes") }, { value: "no", label: t("no") }], plan.thirdPlace === false ? "no" : "yes");
      }
      if (plan.type === "groups") {
        h += '<div class="wiz-label">' + esc(t("format.groupPlate")) + '</div><div class="muted">' + esc(t("format.groupPlate.hint")) + "</div>" +
          seg("groupPlate", [{ value: "no", label: t("no") + " \u2605" }, { value: "yes", label: t("yes") }], plan.plate ? "yes" : "no");
      }
      // A plate needs at least two first-round losers (or two non-qualifiers); say so instead of quietly leaving it out.
      if ((plan.type === "plate" || (plan.type === "groups" && plan.plate)) && est[plan.type] && !est[plan.type].draw.stages.some(st => st.type === "plate")) {
        h += '<div class="wiz-warn">' + esc(t("format.plateNone")) + "</div>";
      }
      const n = entrantCount(comp, divId);
      if (plan.type === "swiss" || plan.type === "pointsLeague") {
        const def = CompGenerate.defaultRounds(plan.type, n), rounds = plan.rounds || def;
        const max = plan.type === "swiss" ? Math.max(1, Math.min(9, n - 1)) : 30;
        h += '<div class="wiz-row"><span class="wiz-label">' + esc(t("format.rounds")) + "</span>" + U.stepper("rounds", rounds, 1, max) + "</div>" +
          '<div class="muted">' + esc(t(plan.type === "swiss" ? "format.rounds.swiss" : "format.rounds.league", { n: def })) + "</div>";
        if (plan.type === "swiss") h += '<div class="wiz-label">' + esc(t("format.firstRound")) + "</div>" +
          seg("firstRound", [{ value: "seed", label: t("format.firstRound.seed") + " \u2605" }, { value: "random", label: t("format.seeding.random") }], plan.firstRound || "seed");
        else h += '<div class="wiz-label">' + esc(t("format.pairing")) + "</div>" + U.optionList("pairing", [
          { value: "mexicano", label: t("format.mexicano"), desc: t("format.mexicano.desc"), recommended: true },
          { value: "americano", label: t("format.americano"), desc: t("format.americano.desc") }], plan.pairing || "mexicano");
      }
      h += '<details class="wiz-adv"><summary>' + esc(t("wiz.advanced")) + '</summary><div class="wiz-row"><span class="wiz-label">' + esc(t("format.time")) + "</span>" +
        U.stepper("timeAvailable", Math.round((comp.settings.timeAvailable || 240) / 30) / 2, 1, 12) + '</div><div class="muted">' + esc(t("format.time.hint")) + "</div></details>";
      return h;
    },
    act: function (comp, act, el, group, value) {
      const k = planKey(comp), plan = JSON.parse(JSON.stringify(currentPlan(comp)));
      const put = (p) => { comp.settings.stagePlan[k] = p; };
      if (act === "pick" && group === "fmtType") {
        if (unavailable(comp, value) || value === plan.type) return;
        U.change("format", () => {
          put(CompModel.stagePlanFor(value));
          // points league plays "first to 21 total points" by default (§9.8); back to the sport's format otherwise
          if (!comp.wizard.visited.scoring) {
            const fs = comp.settings.matchFormats = comp.settings.matchFormats || {};
            if (value === "pointsLeague") fs.main = CompFormat.finalize(JSON.parse(JSON.stringify(CompFormat.TOTAL_POINTS)));
            else if (fs.main && fs.main.setType === "totalPoints") delete fs.main;
          }
        });
      }
      else if (act === "pick" && group === "groupPlate") { plan.plate = value === "yes"; put(plan); U.rerender(); }
      else if (act === "pick" && group === "firstRound") { plan.firstRound = value; put(plan); U.rerender(); }
      else if (act === "pick" && group === "pairing") { plan.pairing = value; put(plan); U.rerender(); }
      else if (act === "rounds") {
        const def = CompGenerate.defaultRounds(plan.type, entrantCount(comp, k));
        plan.rounds = Math.max(1, Math.min(plan.type === "swiss" ? Math.max(1, Math.min(9, entrantCount(comp, k) - 1)) : 30, (plan.rounds || def) + Number(el.dataset.delta)));
        put(plan); U.rerender();
      }
      else if (act === "pick" && group === "formatPlan") {
        U.change("format", () => {
          comp.settings.formatPlan = value;
          if (value === "perDivision") comp.divisions.forEach(d => { if (!comp.settings.stagePlan[d.id]) comp.settings.stagePlan[d.id] = JSON.parse(JSON.stringify(comp.settings.stagePlan.all)); });
        });
      }
      else if (act === "pick" && group === "seeding") { plan.seeding = value; put(plan); U.rerender(); }
      else if (act === "pick" && group === "thirdPlace") { plan.thirdPlace = value === "yes"; put(plan); U.rerender(); }
      else if (act === "formatDiv") { ui.formatDiv = el.dataset.value; U.render(); }
      else if (act === "groupSize") { plan.groupSize = Math.max(3, Math.min(6, (plan.groupSize || 4) + Number(el.dataset.delta))); put(plan); U.rerender(); }
      else if (act === "advance") { plan.advance = Math.max(1, Math.min(4, (plan.advance || 2) + Number(el.dataset.delta))); put(plan); U.rerender(); }
      else if (act === "timeAvailable") { comp.settings.timeAvailable = Math.max(60, Math.min(720, (comp.settings.timeAvailable || 240) + 30 * Number(el.dataset.delta))); U.rerender(); }
    }
  });
  function optionList(comp, selected, rec, est) {
    return U.optionList("fmtType", FORMATS.map(function (ty) {
      let desc = t("format." + ty + ".desc");
      if (unavailable(comp, ty)) desc = t("format.pairsOnly");
      else if (est[ty]) desc += " · " + t(comp.kind === "teams" ? "format.estimate.teams" : "format.estimate", { time: CompSchedule.fmtDuration(est[ty].est.minutes), min: est[ty].min, max: est[ty].max });
      return { value: ty, label: t("format." + ty), desc: desc, recommended: ty === rec, disabled: unavailable(comp, ty) };
    }), selected);
  }

  /* ===== Step 10: Match scoring ===== */
  function ensureFormat(comp, slot) {
    const fs = comp.settings.matchFormats = comp.settings.matchFormats || {};
    if (!fs[slot]) fs[slot] = CompFormat.finalize(JSON.parse(JSON.stringify(CompFormat.recommendedFor(comp.sport || "other"))));
    return fs[slot];
  }
  function hasKnockout(comp) {
    const sp = comp.settings.stagePlan || {};
    return Object.keys(sp).some(k => sp[k] && ["groups", "knockout", "plate"].indexOf(sp[k].type) !== -1);
  }
  function capDefault(target) { return target === 21 ? 30 : target === 15 ? 21 : null; }

  function isLeague(comp) { return Object.keys(comp.settings.stagePlan || {}).some(k => (comp.settings.stagePlan[k] || {}).type === "pointsLeague"); }
  function formatEditor(comp, slot) {
    const f = ensureFormat(comp, slot);
    let h = "";
    if (f.setType === "totalPoints") {
      // points league: one game, both sides' points add up to the target (draws possible when even)
      h += '<div class="wiz-row"><span class="wiz-label">' + esc(t("score.totalTarget")) + "</span>" + U.stepper("totalTarget:" + slot, f.target, 5, 99) + "</div>" +
        '<div class="muted">' + esc(t("score.totalHint")) + "</div>" +
        '<button type="button" class="wiz-link" data-act="pick" data-group="sportFormat:' + slot + '" data-value="1">' + esc(t("score.useSport")) + "</button>";
    } else if (comp.sport === "badminton") {
      const pts = [15, 21, 25, 30];
      h += '<div class="wiz-label">' + esc(t("score.winPoint")) + "</div>" +
        seg("winPoint:" + slot, pts.map(n => ({ value: String(n), label: String(n) })).concat([{ value: "custom", label: t("score.custom") }]), pts.indexOf(f.target) !== -1 && !ui["customWin" + slot] ? String(f.target) : "custom");
      if (pts.indexOf(f.target) === -1 || ui["customWin" + slot]) h += '<input type="number" min="1" max="99" class="wiz-input wiz-num" data-field="fmt:' + slot + ':target" value="' + f.target + '" aria-label="' + esc(t("score.winPoint")) + '">';
      h += '<div class="wiz-label">' + esc(t("score.deuce")) + "</div>" + seg("deuce:" + slot, [{ value: "yes", label: t("yes") + " ★" }, { value: "no", label: t("no") }], f.winBy === 2 ? "yes" : "no");
      h += '<div class="wiz-label">' + esc(t("score.cap")) + "</div>" + seg("cap:" + slot, [{ value: "none", label: t("score.noCap") }, { value: "set", label: t("score.capAt") }], f.cap ? "set" : "none");
      if (f.cap) h += '<input type="number" min="1" max="99" class="wiz-input wiz-num" data-field="fmt:' + slot + ':cap" value="' + f.cap + '" aria-label="' + esc(t("score.cap")) + '">';
      if (isLeague(comp)) h += '<button type="button" class="wiz-link" data-act="pick" data-group="totalFormat:' + slot + '" data-value="1">' + esc(t("score.useTotal")) + "</button>";
      h += '<div class="wiz-label">' + esc(t("score.games")) + "</div>" + seg("bestOf:" + slot, [{ value: "1", label: t("score.bo1") + " ★" }, { value: "3", label: t("score.bo3") }, { value: "5", label: t("score.bo5") }], String(f.sets));
    } else {
      const presets = CompFormat.presetsFor(comp.sport || "other");
      const choice = f.id === "custom" || !CompFormat.findPreset(f.id) ? "custom" : f.id;
      h += U.optionList("preset:" + slot, presets.map((p, i) => ({ value: p.id, label: CompFormat.describe(p), desc: t("score.minutes", { n: p.minutes }), recommended: i === 0 }))
        .concat([{ value: "custom", label: t("score.customFormat"), desc: t("score.customFormat.desc") }]), choice);
      if (choice === "custom") h += builder(f, slot);
    }
    h += '<div class="wiz-preview"><b>' + esc(CompFormat.describe(f)) + "</b><br><span class=\"muted\">" + esc(t("score.example", { ex: CompFormat.example(f) })) + "</span></div>";
    return h;
  }
  function builder(f, slot) {
    const num = (key, val, label, min, max) => '<label class="wiz-field"><span class="wiz-label">' + esc(label) + '</span><input type="number" min="' + min + '" max="' + max + '" class="wiz-input wiz-num" data-field="fmt:' + slot + ":" + key + '" value="' + (val == null ? "" : val) + '"></label>';
    let h = '<div class="wiz-builder">';
    h += '<div class="wiz-label">' + esc(t("score.b.bestOf")) + "</div>" + seg("bestOf:" + slot, [{ value: "1", label: "1" }, { value: "3", label: "3" }, { value: "5", label: "5" }], String(f.sets));
    h += '<div class="wiz-label">' + esc(t("score.b.unit")) + "</div>" + seg("unit:" + slot, [{ value: "games", label: t("score.b.games") }, { value: "points", label: t("score.b.points") }, { value: "totalPoints", label: t("score.b.total") }], f.setType);
    h += num("target", f.target, t("score.b.target"), 1, 99);
    h += '<div class="wiz-label">' + esc(t("score.deuce")) + "</div>" + seg("deuce:" + slot, [{ value: "yes", label: t("yes") }, { value: "no", label: t("no") }], f.winBy === 2 ? "yes" : "no");
    if (f.setType === "points") h += num("cap", f.cap, t("score.b.cap"), 0, 99);
    if (f.setType === "games") { h += num("tiebreakAt", f.tiebreakAt, t("score.b.tbAt"), 0, 20); if (f.tiebreakAt) h += num("tiebreakTo", f.tiebreakTo || 7, t("score.b.tbTo"), 1, 20); }
    if (f.sets > 1) {
      h += '<div class="wiz-label">' + esc(t("score.b.final")) + "</div>" + seg("final:" + slot, [{ value: "full", label: t("score.b.full") }, { value: "7", label: t("score.b.mtb", { n: 7 }) }, { value: "10", label: t("score.b.mtb", { n: 10 }) }], f.finalSet === "matchTiebreak" ? String(f.matchTiebreakTo || 10) : "full");
    }
    h += '<div class="wiz-label">' + esc(t("score.b.noAd")) + "</div>" + seg("noAd:" + slot, [{ value: "no", label: t("no") }, { value: "yes", label: t("yes") }], f.noAd ? "yes" : "no");
    return h + "</div>";
  }

  Wizard.register("scoring", {
    recommend: function (comp) { ensureFormat(comp, "main"); },
    validate: function (comp) {
      const f = (comp.settings.matchFormats || {}).main;
      if (!f || !(f.target > 0)) return ["wiz.err.scoring"];
      if (comp.settings.koFormat === "different") { const k = comp.settings.matchFormats.ko; if (!k || !(k.target > 0)) return ["wiz.err.scoring"]; }
      return [];
    },
    body: function (comp) {
      let h = formatEditor(comp, "main");
      if (hasKnockout(comp)) {
        h += '<div class="wiz-label">' + esc(t("score.koDifferent")) + "</div>" + seg("koFormat", [{ value: "same", label: t("no") + " ★" }, { value: "different", label: t("yes") }], comp.settings.koFormat || "same");
        if (comp.settings.koFormat === "different") h += '<div class="wiz-card">' + '<div class="wiz-card-head"><span>' + esc(t("score.koFormat")) + "</span></div>" + formatEditor(comp, "ko") + "</div>";
      }
      h += '<div class="wiz-label">' + esc(t("score.walkover.title")) + '</div><div class="muted">' + esc(t("score.wo.what")) + "</div>" + U.optionList("walkover", [
        { value: "formatMax", label: t("score.wo.max"), desc: t("score.wo.max.desc", { ex: CompFormat.walkoverSets(ensureFormat(comp, "main")).map(s => s.a + "–" + s.b).join(" ") }), recommended: true },
        { value: "winOnly", label: t("score.wo.win"), desc: t("score.wo.win.desc") }], comp.settings.walkoverScore);
      return h;
    },
    act: function (comp, act, el, group, value) {
      if (act.indexOf("totalTarget:") === 0) {
        const f0 = ensureFormat(comp, act.split(":")[1]);
        f0.target = Math.max(5, Math.min(99, f0.target + Number(el.dataset.delta))); f0.id = "totalPoints"; CompFormat.finalize(f0);
        return U.rerender();
      }
      if (act !== "pick" || !group) return;
      if (group.indexOf("sportFormat:") === 0) { comp.settings.matchFormats[group.split(":")[1]] = CompFormat.finalize(JSON.parse(JSON.stringify(CompFormat.recommendedFor(comp.sport || "other")))); return U.rerender(); }
      if (group.indexOf("totalFormat:") === 0) { comp.settings.matchFormats[group.split(":")[1]] = CompFormat.finalize(JSON.parse(JSON.stringify(CompFormat.TOTAL_POINTS))); return U.rerender(); }
      const parts = group.split(":"), key = parts[0], slot = parts[1] || "main";
      if (key === "koFormat") { comp.settings.koFormat = value; if (value === "different") ensureFormat(comp, "ko"); else delete comp.settings.matchFormats.ko; return U.rerender(); }
      if (key === "walkover") { comp.settings.walkoverScore = value; return U.rerender(); }
      const f = ensureFormat(comp, slot);
      if (key === "preset") {
        if (value === "custom") { f.id = "custom"; }
        else { comp.settings.matchFormats[slot] = CompFormat.fromPreset(value); }
      } else if (key === "winPoint") {
        if (value === "custom") ui["customWin" + slot] = true;
        else { ui["customWin" + slot] = false; f.target = Number(value); f.cap = f.winBy === 2 ? capDefault(f.target) : null; }
        f.id = "custom";
      } else if (key === "deuce") { f.winBy = value === "yes" ? 2 : 1; if (f.setType === "points" && f.winBy === 1) f.cap = null; f.id = "custom"; }
      else if (key === "cap") { f.cap = value === "set" ? (capDefault(f.target) || f.target + 9) : null; f.id = "custom"; }
      else if (key === "bestOf") { f.sets = Number(value); f.id = "custom"; }
      else if (key === "unit") { f.setType = value; f.id = "custom"; if (value !== "points") f.cap = null; if (value !== "games") { f.tiebreakAt = null; f.tiebreakTo = null; } if (value === "totalPoints") f.sets = 1; }
      else if (key === "final") { f.finalSet = value === "full" ? "full" : "matchTiebreak"; f.matchTiebreakTo = value === "full" ? null : Number(value); f.id = "custom"; }
      else if (key === "noAd") { f.noAd = value === "yes"; f.id = "custom"; }
      CompFormat.finalize(comp.settings.matchFormats[slot] || f);
      U.rerender();
    },
    input: function () { return false; },
    change: function (comp, field, el) {
      const p = field.split(":");
      if (p[0] !== "fmt") return;
      const f = ensureFormat(comp, p[1]), key = p[2], v = parseInt(el.value, 10);
      if (key === "target" && v > 0) f.target = v;
      else if (key === "cap") f.cap = v > 0 ? v : null;
      else if (key === "tiebreakAt") { f.tiebreakAt = v > 0 ? v : null; if (f.tiebreakAt && !f.tiebreakTo) f.tiebreakTo = 7; }
      else if (key === "tiebreakTo" && v > 0) f.tiebreakTo = v;
      f.id = "custom";
      CompFormat.finalize(f);
      U.rerender();
    }
  });

  /* ===== Step 11: Standings and tiebreakers ===== */
  const TB_ALL = ["headToHead", "setDiff", "gameDiff", "gamesWon", "manual"];
  Wizard.register("standings", {
    validate: function (comp) {
      const f = (comp.settings.matchFormats || {}).main, sp = comp.settings.stagePlan || {};
      const plans = comp.settings.formatPlan === "perDivision" ? comp.divisions.map(d => sp[d.id] || sp.all) : [sp.all];
      if (plans.every(x => x && x.type === "pointsLeague")) return []; // ranked by points scored whatever is picked
      return comp.settings.standings.pairs.rankBy === "score" && (!f || f.sets !== 3) ? ["wiz.err.scoreRank"] : [];
    },
    body: function (comp) {
      const p = comp.settings.standings.pairs, f = ensureFormat(comp, "main");
      const unit = f.setType === "games" ? "games" : "points";
      // A points league always ranks by points scored (§9.8); the choice below is for the other formats.
      const plans = comp.settings.formatPlan === "perDivision" ? comp.divisions.map(d => comp.settings.stagePlan[d.id] || comp.settings.stagePlan.all) : [comp.settings.stagePlan.all];
      const league = plans.filter(x => x && x.type === "pointsLeague").length, allLeague = league && league === plans.length;
      let h = league ? '<div class="muted">' + esc(t("stand.leagueNote")) + "</div>" : "";
      if (!allLeague) h += U.optionList("rankBy", [
        { value: "wins", label: t("stand.wins"), desc: t("stand.wins.desc"), recommended: true },
        { value: "league", label: t("stand.league"), desc: t("stand.league.desc", { w: p.league.win, l: p.league.loss }) },
        { value: "score", label: t("stand.score"), desc: f.sets === 3 ? t("stand.score.desc") : t("stand.score.only3"), disabled: f.sets !== 3 }
      ], p.rankBy);
      if (!allLeague && p.rankBy === "league") {
        h += '<div class="wiz-row"><span class="wiz-label">' + esc(t("stand.ptsWin")) + "</span>" + U.stepper("lgWin", p.league.win, 0, 10) + "</div>" +
          '<div class="wiz-row"><span class="wiz-label">' + esc(t("stand.ptsLoss")) + "</span>" + U.stepper("lgLoss", p.league.loss, 0, 10) + "</div>";
      }
      if (!allLeague && p.rankBy === "score") {
        h += ["2-0", "2-1", "1-2", "0-2"].map(k => '<div class="wiz-row"><span class="wiz-label">' + esc(t("stand.scoreRow", { s: k.replace("-", "–") })) + "</span>" + U.stepper("sbs:" + k, p.pointsByScore[k], 0, 10) + "</div>").join("");
      }
      h += '<div class="wiz-label">' + esc(t("stand.tiebreakers")) + '</div><div class="muted">' + esc(t("stand.tiebreakers.hint")) + '</div><div class="wiz-list">' +
        p.tiebreakers.map((tb, i) => '<div class="wiz-pair"><span class="wiz-pair-n">' + (i + 1) + '.</span><span class="wiz-pair-name">' + esc(t("tb." + tb, { unit: t("unit." + unit) })) + "</span>" +
          '<button type="button" class="wiz-icon" data-act="tbUp" data-idx="' + i + '"' + (i ? "" : " disabled") + ' aria-label="' + esc(t("stand.up")) + '">↑</button>' +
          '<button type="button" class="wiz-icon" data-act="tbDown" data-idx="' + i + '"' + (i < p.tiebreakers.length - 1 ? "" : " disabled") + ' aria-label="' + esc(t("stand.down")) + '">↓</button></div>').join("") + "</div>" +
        '<button type="button" class="wiz-link" data-act="tbReset">' + esc(t("stand.reset")) + "</button>";
      return h;
    },
    act: function (comp, act, el, group, value) {
      const p = comp.settings.standings.pairs;
      if (act === "pick" && group === "rankBy") { p.rankBy = value; }
      else if (act === "lgWin") p.league.win = Math.max(0, Math.min(10, p.league.win + Number(el.dataset.delta)));
      else if (act === "lgLoss") p.league.loss = Math.max(0, Math.min(10, p.league.loss + Number(el.dataset.delta)));
      else if (act.indexOf("sbs:") === 0) { const k = act.slice(4); p.pointsByScore[k] = Math.max(0, Math.min(10, (p.pointsByScore[k] || 0) + Number(el.dataset.delta))); }
      else if (act === "tbUp" || act === "tbDown") {
        const i = Number(el.dataset.idx), j = act === "tbUp" ? i - 1 : i + 1;
        const a = p.tiebreakers; const x = a[i]; a[i] = a[j]; a[j] = x;
      } else if (act === "tbReset") p.tiebreakers = TB_ALL.slice();
      else return;
      U.rerender();
    }
  });

  /* ===== Step 12: Courts and time ===== */
  function syncCourtNames(comp) {
    const s = comp.settings, n = s.courtsCount;
    s.courtNames = (s.courtNames || []).slice(0, n);
    while (s.courtNames.length < n) s.courtNames.push("Court " + (s.courtNames.length + 1));
    Object.keys(s.courtAssign || {}).forEach(k => { s.courtAssign[k] = s.courtAssign[k].filter(i => i < n); });
  }
  Wizard.register("courts", {
    recommend: function (comp) { syncCourtNames(comp); },
    validate: function (comp) {
      const s = comp.settings;
      if (!(s.courtsCount >= 1)) return ["wiz.err.courts"];
      if ((s.courtNames || []).some(n => !String(n || "").trim())) return ["wiz.err.courtName"];
      return [];
    },
    body: function (comp) {
      const s = comp.settings;
      syncCourtNames(comp);
      let h = '<div class="wiz-row"><span class="wiz-label">' + esc(t("courts.count")) + "</span>" + U.stepper("courtCount", s.courtsCount, 1, 16) + '</div><div class="wiz-list">' +
        s.courtNames.map((n, i) => '<input type="text" class="wiz-input" maxlength="24" data-field="courtName" data-idx="' + i + '" value="' + esc(n) + '" aria-label="' + esc(t("courts.name", { n: i + 1 })) + '">').join("") + "</div>";
      h += '<div class="wiz-label">' + esc(t("courts.mode")) + "</div>" + U.optionList("courtMode", [
        { value: "shared", label: t("courts.shared"), desc: t("courts.shared.desc"), recommended: true },
        { value: "dedicated", label: t("courts.dedicated"), desc: t("courts.dedicated.desc") },
        { value: "homeBorrow", label: t("courts.home"), desc: t("courts.home.desc") }], s.courtMode);
      if (s.courtMode !== "shared") {
        s.courtAssign = s.courtAssign || {};
        h += comp.divisions.map(d => '<div class="wiz-colors"><span class="wiz-colors-name">' + esc(d.name) + "</span>" +
          s.courtNames.map((n, i) => '<button type="button" class="wiz-chip ' + onOff((s.courtAssign[d.id] || []).indexOf(i) !== -1) + '" data-act="assignCourt" data-div="' + esc(d.id) + '" data-idx="' + i + '">' + esc(n) + "</button>").join("") + "</div>").join("");
      }
      h += U.field(t("courts.startTime"), '<input type="time" class="wiz-input" data-field="startTime" value="' + esc(s.startTime || "") + '">');
      h += '<div class="wiz-label">' + esc(t("courts.rest")) + "</div>" + U.optionList("restRule", [
        { value: "prefer", label: t("courts.rest.prefer"), desc: t("courts.rest.prefer.desc"), recommended: true },
        { value: "strict", label: t("courts.rest.strict"), desc: t("courts.rest.strict.desc") },
        { value: "off", label: t("courts.rest.off"), desc: t("courts.rest.off.desc") }], s.restRule);
      return h;
    },
    act: function (comp, act, el, group, value) {
      const s = comp.settings;
      if (act === "courtCount") { s.courtsCount = Math.max(1, Math.min(16, s.courtsCount + Number(el.dataset.delta))); syncCourtNames(comp); }
      else if (act === "pick" && group === "courtMode") s.courtMode = value;
      else if (act === "pick" && group === "restRule") s.restRule = value;
      else if (act === "assignCourt") {
        const a = (s.courtAssign[el.dataset.div] = s.courtAssign[el.dataset.div] || []), i = Number(el.dataset.idx), at = a.indexOf(i);
        if (at === -1) a.push(i); else a.splice(at, 1);
      }
      else return;
      U.rerender();
    },
    input: function (comp, f, el) {
      if (f === "courtName") { comp.settings.courtNames[Number(el.dataset.idx)] = el.value; return true; }
      if (f === "startTime") { comp.settings.startTime = /^\d{2}:\d{2}$/.test(el.value) ? el.value : null; return true; }
      return false;
    }
  });

  /* ===== Step 13: Review + Generate ===== */
  function reviewNumbers(comp) {
    const draw = CompGenerate.generateDraw(comp);
    const est = CompSchedule.estimate(comp, draw);
    const range = matchRange(comp, draw);
    return { draw, est, min: range.min, max: range.max, ko: draw.stages.filter(s => s.type === "knockout").length };
  }
  function reviewCard(stepId, title, lines) {
    return '<div class="wiz-card"><div class="wiz-card-head"><span>' + esc(title) + '</span><button type="button" class="wiz-link" data-act="jump" data-step="' + stepId + '">' + esc(t("review.edit")) + "</button></div>" +
      lines.map(l => '<div class="wiz-card-line">' + esc(l) + "</div>").join("") + "</div>";
  }
  function planText(comp, plan) {
    if (!plan) return "—";
    let s = t("format." + plan.type);
    if (plan.type === "groups") s += " · " + t("review.groups", { size: plan.groupSize, adv: plan.advance });
    return s;
  }

  Wizard.register("review", {
    body: function (comp) {
      const name = U.stepName;
      let h = "";
      const blk = Wizard.blockers(comp), bad = Wizard.invalidSteps(comp), later = Wizard.unbuilt(comp);
      if (blk.length) h += '<div class="wiz-warn">' + esc(t("review.needsReview.lead")) + " " + blk.map(id => '<button type="button" class="wiz-link" data-act="jump" data-step="' + id + '">' + esc(name(id)) + "</button>").join(" ") + "</div>";
      if (bad.length) h += '<div class="wiz-errors">' + bad.map(id => '<div><button type="button" class="wiz-link" data-act="jump" data-step="' + id + '">' + esc(name(id)) + "</button> — " +
        esc(Wizard.validate(comp, id).map(k => t(k)).join(" ")) + "</div>").join("") + "</div>";
      h += reviewCard("basics", name("basics"), [comp.name || t("comp.untitled"), comp.dateISO, comp.sport ? t("sport." + comp.sport) : "—"]);
      h += reviewCard("type", name("type"), [t("type." + comp.kind)]);
      h += reviewCard("divisions", name("divisions"), comp.divisions.map(d => d.name + " · " + t("cat." + d.category)));
      if (comp.kind === "teams") h += reviewCard("teams", name("teams"), [comp.teams.map(tm => tm.name).join(", ")]);
      if (!later.length) {
        h += reviewCard("entries", name("entries"), comp.divisions.map(d => t("review.pairsIn", { div: d.name, n: entriesIn(comp, d.id).length })));
        const sp = comp.settings.stagePlan;
        h += reviewCard("format", name("format"), comp.settings.formatPlan === "perDivision" ? comp.divisions.map(d => d.name + ": " + planText(comp, sp[d.id] || sp.all)) : [planText(comp, sp.all)]);
        const fs = comp.settings.matchFormats || {};
        h += reviewCard("scoring", name("scoring"), [fs.main ? CompFormat.describe(fs.main) : "—"].concat(fs.ko ? [t("review.koFormat", { f: CompFormat.describe(fs.ko) })] : []));
        const p = comp.settings.standings.pairs;
        const allLeague = (comp.settings.formatPlan === "perDivision" ? comp.divisions.map(d => sp[d.id] || sp.all) : [sp.all]).every(x => x && x.type === "pointsLeague");
        h += reviewCard("standings", name("standings"), [allLeague ? t("stand.leagueShort") : t("stand." + p.rankBy), p.tiebreakers.map(tb => t("tb." + tb, { unit: t("unit.points") })).join(" › ")]);
        h += reviewCard("courts", name("courts"), [t("review.courts", { n: comp.settings.courtsCount, mode: t("courts." + (comp.settings.courtMode === "homeBorrow" ? "home" : comp.settings.courtMode)) })]);
        if (!bad.length) {
          const r = reviewNumbers(comp);
          const fin = CompSchedule.finishTime(comp.settings.startTime, r.est.minutes);
          h += '<div class="wiz-card"><div class="wiz-card-head"><span>' + esc(t("review.numbers")) + "</span></div>" +
            ['<div class="wiz-card-line">' + esc(t("review.matches", { n: r.est.matches, m: r.est.meetings })) + "</div>",
             '<div class="wiz-card-line">' + esc(t("review.perEntry", { min: r.min, max: r.max })) + "</div>",
             '<div class="wiz-card-line">' + esc(t("review.duration", { time: CompSchedule.fmtDuration(r.est.minutes), courts: comp.settings.courtsCount, per: CompSchedule.minutesDefault(comp) })) + (fin ? " · " + esc(t("review.finish", { at: fin })) : "") + "</div>"].join("") + "</div>";
          const budget = comp.settings.timeAvailable || 240;
          if (r.est.minutes > budget) {
            const alt = comp.settings.stagePlan.all && comp.settings.stagePlan.all.type !== "groups" ? reviewNumbersWith(comp, "groups") : null;
            h += '<div class="wiz-warn">' + esc(t("review.tooLong", { time: CompSchedule.fmtDuration(r.est.minutes), courts: comp.settings.courtsCount, budget: CompSchedule.fmtDuration(budget) })) +
              '<div class="comp-actions">' +
              (alt ? '<button type="button" class="secondary small" data-act="fixGroups">' + esc(t("review.fix.groups", { time: CompSchedule.fmtDuration(alt.minutes) })) + "</button>" : "") +
              '<button type="button" class="secondary small" data-act="fixCourt">' + esc(t("review.fix.court")) + "</button>" +
              '<button type="button" class="secondary small" data-act="jump" data-step="scoring">' + esc(t("review.fix.shorter")) + "</button></div></div>";
          }
        }
      }
      const canGo = !blk.length && !bad.length && !later.length;
      h += '<button type="button" class="primary wiz-generate" data-act="generate"' + (canGo ? "" : " disabled") + ">" + esc(t("review.generate")) + "</button>";
      if (later.length) h += '<div class="muted">' + esc(t("review.teamsLater")) + "</div>";
      else if (!canGo) h += '<div class="muted">' + esc(t("review.blocked")) + "</div>";
      return h;
    },
    act: function (comp, act) {
      if (act === "fixGroups") { U.change("format", () => { comp.settings.formatPlan = "sameForAll"; comp.settings.stagePlan = { all: CompModel.stagePlanFor("groups") }; }); }
      else if (act === "fixCourt") { comp.settings.courtsCount = Math.min(16, comp.settings.courtsCount + 1); syncCourtNames(comp); U.rerender(); }
      else if (act === "generate") {
        if (Wizard.blockers(comp).length || Wizard.invalidSteps(comp).length || Wizard.unbuilt(comp).length) return;
        cmxConfirm({ title: t("review.generate"), yes: t("review.generate"), message: t("review.generateConfirm") }, function () {
          CompShell.generate(comp);
        });
      }
    }
  });
  function reviewNumbersWith(comp, type) {
    const c = JSON.parse(JSON.stringify(comp));
    c.settings.formatPlan = "sameForAll"; c.settings.stagePlan = { all: CompModel.stagePlanFor(type) };
    return CompSchedule.estimate(c, CompGenerate.generateDraw(c));
  }

  Wizard.pairsUtil = { addPair, removeEntry, parsePairs, ensureFormat, recommendedFormat, syncCourtNames, labelOf, defaultGenders,
    reviewCard, planText, entrantIds, matchRange, chips, seg, TB_ALL };
})();
