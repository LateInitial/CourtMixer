// CourtMixer - competition setup wizard (Phase 2, v1.10.0), spec §6.
// Framework: step list, Back/Next with per-step validation, jump to visited steps, draft
// autosave, "Use recommended for the rest", and invalidation (later steps marked needsReview,
// data kept and adapted). Steps 1-5 are real; steps 6-12 are placeholders until Phases 3-4.

const Wizard = (function () {
  // Internal step ids stay fixed; visible numbering depends on the competition type.
  const STEPS = ["start", "basics", "type", "divisions", "teams", "entries", "template", "meetingWin",
                 "format", "scoring", "standings", "courts", "review"];
  const TEAMS_ONLY = { teams: true, template: true, meetingWin: true };
  // Steps not built yet, per competition type (the phase that brings them).
  const PLACEHOLDER = { pairs: {}, teams: { entries: 4, template: 4, meetingWin: 4 } };
  function placeholderPhase(comp, id) { return (PLACEHOLDER[comp.kind] || {})[id] || 0; }
  // Steps registered by other files (wizard-pairs.js): { body, validate, recommend, act, input, change }
  const EXT = {};
  function register(id, def) { EXT[id] = def; }
  // Which later steps an answer on this step can affect (§6.1 invalidation).
  const AFFECTS = {
    start: ["type", "divisions", "teams", "template", "format"],
    basics: ["scoring"],
    type: ["divisions", "teams", "entries", "template", "meetingWin", "format", "standings"],
    divisions: ["entries", "template", "format", "courts"],
    teams: ["entries", "template"]
  };

  /* ===== Pure navigation logic (no DOM) ===== */
  function visibleSteps(comp) { return STEPS.filter(id => comp.kind === "teams" || !TEAMS_ONLY[id]); }
  function position(comp, id) {
    const vis = visibleSteps(comp);
    return { n: vis.indexOf(id) + 1, total: vis.length };
  }
  function current(comp) {
    const vis = visibleSteps(comp);
    return vis.indexOf(comp.wizard.currentStep) === -1 ? vis[0] : comp.wizard.currentStep;
  }
  function furthest(comp) {
    const vis = visibleSteps(comp);
    let f = vis.indexOf(current(comp));
    vis.forEach((id, i) => { if (comp.wizard.visited[id] && i > f) f = i; });
    return f;
  }
  function canJump(comp, id) {
    const i = visibleSteps(comp).indexOf(id);
    return i !== -1 && (comp.wizard.visited[id] || i <= furthest(comp));
  }
  function arrive(comp, id) { comp.wizard.currentStep = id; comp.wizard.visited[id] = true; }

  // Errors block Next; they are strings-table keys.
  function validate(comp, id) {
    const errs = [];
    if (EXT[id] && EXT[id].validate && !placeholderPhase(comp, id)) EXT[id].validate(comp).forEach(e => errs.push(e));
    if (id === "basics") {
      if (!String(comp.name || "").trim()) errs.push("wiz.err.name");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(comp.dateISO || "")) errs.push("wiz.err.date");
      if (CompModel.SPORTS.indexOf(comp.sport) === -1) errs.push("wiz.err.sport");
    } else if (id === "type") {
      if (comp.kind !== "pairs" && comp.kind !== "teams") errs.push("wiz.err.type");
    } else if (id === "divisions") {
      if (comp.divisions.length < 1) errs.push("wiz.err.divisions");
      if (comp.divisions.some(d => !String(d.name || "").trim())) errs.push("wiz.err.divisionName");
    } else if (id === "teams") {
      if (comp.teams.length < CompModel.MIN_TEAMS) errs.push("wiz.err.teams");
      if (comp.teams.some(tm => !String(tm.name || "").trim())) errs.push("wiz.err.teamName");
    }
    return errs;
  }

  function next(comp) {
    const id = current(comp);
    const errs = validate(comp, id);
    if (errs.length) return errs;
    comp.wizard.visited[id] = true;
    delete comp.wizard.needsReview[id];
    const vis = visibleSteps(comp), i = vis.indexOf(id);
    if (i < vis.length - 1) arrive(comp, vis[i + 1]);
    return [];
  }
  function back(comp) {
    const vis = visibleSteps(comp), i = vis.indexOf(current(comp));
    if (i > 0) comp.wizard.currentStep = vis[i - 1];
  }
  function jump(comp, id) {
    if (!canJump(comp, id)) return false;
    arrive(comp, id);
    return true;
  }

  // Recommended defaults for a step the user skipped. Settings already hold the recommended
  // values (CompModel.defaultSettings), so only steps that create records need work here.
  function applyRecommended(comp, id) {
    if (id === "divisions" && comp.divisions.length === 0) CompModel.setDivisionCount(comp, CompModel.recommendedDivisionCount(comp.kind));
    if (id === "teams" && comp.teams.length < CompModel.MIN_TEAMS) CompModel.setTeamCount(comp, 4);
    if (EXT[id] && EXT[id].recommend) EXT[id].recommend(comp);
  }
  // Fills every remaining step the user hasn't answered yet, then goes to Review. Steps the
  // user already visited keep their answers.
  function useRecommended(comp) {
    const vis = visibleSteps(comp), i = vis.indexOf(current(comp));
    const errs = validate(comp, vis[i]);
    if (errs.length) return errs;
    comp.wizard.visited[vis[i]] = true;
    vis.slice(i + 1).forEach(function (id) {
      if (!comp.wizard.visited[id]) { applyRecommended(comp, id); comp.wizard.visited[id] = true; }
    });
    arrive(comp, "review");
    return [];
  }

  // Visited later steps an answer on stepId would affect (and that aren't flagged yet).
  function affected(comp, stepId) {
    const vis = visibleSteps(comp), at = vis.indexOf(stepId);
    return (AFFECTS[stepId] || []).filter(id => {
      const i = vis.indexOf(id);
      return i > at && comp.wizard.visited[id] && !comp.wizard.needsReview[id];
    });
  }
  function markReview(comp, ids) { ids.forEach(id => { comp.wizard.needsReview[id] = true; }); }
  function blockers(comp) { return visibleSteps(comp).filter(id => comp.wizard.needsReview[id]); }
  // Steps whose answers don't validate (Review lists them and blocks Generate).
  function invalidSteps(comp) { return visibleSteps(comp).filter(id => id !== "review" && validate(comp, id).length); }
  // Built steps not yet available for this competition type.
  function unbuilt(comp) { return visibleSteps(comp).filter(id => placeholderPhase(comp, id)); }

  /* ===== Rendering ===== */
  let comp = null;      // the competition being edited
  let host = null;      // container element
  let errors = [];      // validation errors shown on the current step
  let single = null;    // settings mode: { step, onDone } shows one step with a Done button

  function stepName(id) { return t("step." + id); }
  // The step whose controls are on screen (the settings step, or the wizard's current step).
  function activeStep() { return single ? single.step : current(comp); }

  function optionList(group, options, selected) {
    return '<div class="wiz-options" role="radiogroup">' + options.map(function (o) {
      const on = o.value === selected;
      return '<button type="button" class="wiz-opt' + (on ? " on" : "") + '" role="radio" aria-checked="' + on + '"' +
        ' data-act="pick" data-group="' + esc(group) + '" data-value="' + esc(o.value) + '"' + (o.disabled ? " disabled" : "") + '>' +
        '<span class="wiz-opt-title">' + esc(o.label) + (o.recommended ? ' <span class="wiz-rec">' + esc(t("wiz.recommended")) + "</span>" : "") + "</span>" +
        (o.desc ? '<span class="wiz-opt-desc">' + esc(o.desc) + "</span>" : "") + "</button>";
    }).join("") + "</div>";
  }
  function stepper(act, value, min, max) {
    return '<div class="wiz-stepper"><button type="button" class="wiz-step-btn" data-act="' + act + '" data-delta="-1"' + (value <= min ? " disabled" : "") + ' aria-label="' + esc(t("wiz.fewer")) + '">−</button>' +
      '<span class="wiz-step-val">' + value + "</span>" +
      '<button type="button" class="wiz-step-btn" data-act="' + act + '" data-delta="1"' + (value >= max ? " disabled" : "") + ' aria-label="' + esc(t("wiz.more")) + '">+</button></div>';
  }
  function field(label, inner) { return '<label class="wiz-field"><span class="wiz-label">' + esc(label) + "</span>" + inner + "</label>"; }

  const BODY = {
    start: function () {
      const others = CompStore.list().filter(e => e.id !== comp.id);
      const src = comp.settings.startFrom || "preset";
      let h = optionList("startFrom", [
        { value: "preset", label: t("start.preset"), desc: t("start.preset.desc"), recommended: true },
        { value: "duplicate", label: t("start.duplicate"), desc: others.length ? t("start.duplicate.desc") : t("start.duplicate.none"), disabled: !others.length },
        { value: "import", label: t("start.import"), desc: t("start.import.later"), disabled: true }
      ], src);
      if (src === "duplicate" && others.length) {
        h += '<div class="wiz-sub">' + esc(t("start.pickSource")) + "</div>" + optionList("dupSource", others.map(e => ({
          value: e.id, label: e.name || t("comp.untitled"), desc: (e.dateISO || "") + " · " + t("status." + e.status)
        })), null);
      } else {
        h += '<div class="wiz-sub">' + esc(t("start.pickPreset")) + "</div>" + optionList("preset", CompModel.PRESET_ORDER.map(id => ({
          value: id, label: t("preset." + id), desc: t("preset." + id + ".desc"), recommended: id === CompModel.RECOMMENDED_PRESET
        })), comp.settings.preset);
      }
      return h;
    },
    basics: function () {
      return field(t("basics.name"), '<input type="text" class="wiz-input" data-field="name" maxlength="80" value="' + esc(comp.name) + '" placeholder="' + esc(t("basics.name.ph")) + '">') +
        field(t("basics.date"), '<input type="date" class="wiz-input" data-field="dateISO" value="' + esc(comp.dateISO) + '">') +
        '<div class="wiz-label">' + esc(t("basics.sport")) + "</div>" +
        optionList("sport", CompModel.SPORTS.map(s => ({ value: s, label: t("sport." + s), desc: t("sport." + s + ".desc") })), comp.sport);
    },
    type: function () {
      const rec = (CompModel.PRESETS[comp.settings.preset] || {}).kind || "pairs";
      return optionList("kind", [
        { value: "pairs", label: t("type.pairs"), desc: t("type.pairs.desc"), recommended: rec === "pairs" },
        { value: "teams", label: t("type.teams"), desc: t("type.teams.desc"), recommended: rec === "teams" }
      ], comp.kind);
    },
    divisions: function () {
      const n = comp.divisions.length, rec = CompModel.recommendedDivisionCount(comp.kind);
      const naming = comp.settings.divisionNaming || "letters";
      let h = '<div class="wiz-row"><span class="wiz-label">' + esc(t("div.count")) + '</span>' + stepper("divCount", n, 1, CompModel.MAX_DIVISIONS) + "</div>" +
        '<div class="muted">' + esc(t("div.count.hint", { n: rec })) + "</div>" +
        '<div class="wiz-label">' + esc(t("div.naming")) + "</div>" +
        optionList("naming", ["letters", "metals", "levels", "custom"].map(s => ({ value: s, label: t("div.naming." + s), recommended: s === "letters" })), naming) +
        '<div class="wiz-list">';
      comp.divisions.forEach(function (d, i) {
        h += '<div class="wiz-item"><input type="text" class="wiz-input" data-field="divName" data-idx="' + i + '" maxlength="30" value="' + esc(d.name) + '" aria-label="' + esc(t("div.name", { n: i + 1 })) + '">' +
          '<select class="wiz-select" data-field="divCategory" data-idx="' + i + '" aria-label="' + esc(t("div.category")) + '">' +
          CompModel.CATEGORIES.map(c => '<option value="' + c + '"' + (d.category === c ? " selected" : "") + ">" + esc(t("cat." + c)) + "</option>").join("") +
          "</select></div>";
      });
      h += "</div>";
      const un = CompModel.unassigned(comp);
      if (un.players.length || un.entries.length) h += '<div class="wiz-warn">' + esc(t("div.unassigned", { n: un.players.length + un.entries.length })) + "</div>";
      return h;
    },
    teams: function () {
      let h = '<div class="wiz-row"><span class="wiz-label">' + esc(t("teams.count")) + "</span>" + stepper("teamCount", comp.teams.length, CompModel.MIN_TEAMS, CompModel.MAX_TEAMS) + "</div>" +
        '<div class="muted">' + esc(t("teams.count.hint")) + '</div><div class="wiz-list">';
      comp.teams.forEach(function (tm, i) {
        h += '<div class="wiz-item"><span class="wiz-swatch" style="background:' + esc(tm.color || "#eef2ff") + '"></span>' +
          '<input type="text" class="wiz-input" data-field="teamName" data-idx="' + i + '" maxlength="30" value="' + esc(tm.name) + '" aria-label="' + esc(t("teams.name", { n: i + 1 })) + '"></div>';
      });
      h += '</div><details class="wiz-adv"><summary>' + esc(t("wiz.advanced")) + "</summary>" +
        '<div class="muted">' + esc(t("teams.colors.hint")) + "</div>";
      comp.teams.forEach(function (tm, i) {
        h += '<div class="wiz-colors"><span class="wiz-colors-name">' + esc(tm.name) + "</span>" +
          ['<button type="button" class="wiz-color none' + (!tm.color ? " on" : "") + '" data-act="teamColor" data-idx="' + i + '" data-value="" aria-label="' + esc(t("teams.noColor")) + '">×</button>']
            .concat(CompModel.TEAM_COLORS.map(c => '<button type="button" class="wiz-color' + (tm.color === c ? " on" : "") + '" style="background:' + c + '" data-act="teamColor" data-idx="' + i + '" data-value="' + c + '" aria-label="' + esc(c) + '"></button>')).join("") +
          "</div>";
      });
      return h + "</details>";
    }
  };

  function placeholderBody(id) {
    return '<div class="wiz-placeholder">' + esc(t("wiz.placeholder", { phase: placeholderPhase(comp, id) })) + "</div>";
  }
  function bodyOf(id) {
    if (placeholderPhase(comp, id)) return placeholderBody(id);
    if (EXT[id] && EXT[id].body) return EXT[id].body(comp);
    return BODY[id] ? BODY[id]() : placeholderBody(id);
  }

  function render() {
    if (!host || !comp) return;
    if (single) {
      host.innerHTML = '<div class="card wiz"><div class="wiz-progress-text">' + esc(t("settings.title", { name: stepName(single.step) })) + "</div>" +
        '<div class="wiz-body">' + bodyOf(single.step) + "</div>" +
        (errors.length ? '<div class="wiz-errors" role="alert">' + errors.map(k => "<div>" + esc(t(k)) + "</div>").join("") + "</div>" : "") +
        '<div class="wiz-nav"><button type="button" class="secondary" data-act="singleCancel">' + esc(t("wiz.cancel")) + '</button><button type="button" class="primary" data-act="singleDone">' + esc(t("wiz.done")) + "</button></div></div>";
      return;
    }
    const id = current(comp), pos = position(comp, id), vis = visibleSteps(comp);
    const pct = Math.round(100 * pos.n / pos.total);
    let h = '<div class="card wiz">' +
      '<button type="button" class="wiz-progress" data-act="stepList" aria-label="' + esc(t("wiz.stepList")) + '">' +
      '<span class="wiz-progress-text">' + esc(t("wiz.stepOf", { n: pos.n, total: pos.total, name: stepName(id) })) + "</span>" +
      '<span class="wiz-bar"><span style="width:' + pct + '%"></span></span></button>' +
      '<div class="muted wiz-why">' + esc(t("why." + id)) + "</div>";
    if (comp.wizard.needsReview[id]) h += '<div class="wiz-warn">' + esc(t("wiz.reviewThis")) + "</div>";
    h += '<div class="wiz-body">' + bodyOf(id) + "</div>";
    if (errors.length) h += '<div class="wiz-errors" role="alert">' + errors.map(k => "<div>" + esc(t(k)) + "</div>").join("") + "</div>";
    h += '<div class="wiz-nav">' +
      (pos.n > 1 ? '<button type="button" class="secondary" data-act="back">' + esc(t("wiz.back")) + "</button>" : "<span></span>") +
      (id !== "review" ? '<button type="button" class="primary" data-act="next">' + esc(t("wiz.next")) + "</button>" : "") +
      "</div>";
    if (vis.indexOf(id) >= 3 && id !== "review") h += '<button type="button" class="wiz-link wiz-rest" data-act="useRecommended">' + esc(t("wiz.useRecommended")) + "</button>";
    h += "</div>";
    host.innerHTML = h;
  }

  function persist() { CompStore.save(comp); }
  function rerender() { persist(); render(); if (typeof CompShell !== "undefined") CompShell.renderBand(); }

  // Runs a change that may affect later answers: confirm first if any visited step depends on it.
  function change(stepId, apply) {
    const hit = single ? [] : affected(comp, stepId);
    if (!hit.length) { apply(); rerender(); return; }
    cmxConfirm({ title: t("wiz.invalidate.title"), yes: t("wiz.invalidate.yes"),
      message: t("wiz.invalidate", { steps: hit.map(stepName).join(", ") }) },
      function () { apply(); markReview(comp, hit); rerender(); });
  }

  function showStepList() {
    const vis = visibleSteps(comp), cur = current(comp);
    const rows = vis.map(function (id, i) {
      const state = id === cur ? "current" : comp.wizard.needsReview[id] ? "review" : comp.wizard.visited[id] ? "done" : "todo";
      const icon = { current: "●", review: "●", done: "✓", todo: "○" }[state];
      return '<button type="button" class="wiz-steprow ' + state + '" data-step="' + id + '"' + (canJump(comp, id) ? "" : " disabled") + ">" +
        '<span class="wiz-stepicon">' + icon + "</span><span>" + (i + 1) + ". " + esc(stepName(id)) + "</span>" +
        (state === "review" ? '<span class="wiz-rec amber">' + esc(t("wiz.needsReview")) + "</span>" : "") + "</button>";
    }).join("");
    cmxShowModal({ title: t("wiz.stepList"), bodyHTML: '<div class="wiz-steplist">' + rows + "</div>",
      buttons: [{ label: t("wiz.close"), cls: "ghost", onClick: function () {} }],
      onOpen: function (box) {
        box.querySelectorAll(".wiz-steprow").forEach(b => { b.onclick = function () { if (jump(comp, b.dataset.step)) { errors = []; cmxCloseModal(); rerender(); scrollTop(); } }; });
      } });
  }
  function scrollTop() { try { host.scrollIntoView({ block: "start" }); } catch (e) {} }

  function onClick(e) {
    const el = e.target.closest("[data-act]");
    if (!el || !host.contains(el) || el.disabled || !host.querySelector(".wiz")) return;
    const act = el.dataset.act;
    if (act === "singleDone") {
      errors = validate(comp, single.step);
      if (errors.length) return render();
      const s = single; const r = s.onDone(comp);
      if (r && r.length) { errors = r; return render(); }
      single = null; persist(); if (typeof CompShell !== "undefined") CompShell.render();
      return;
    }
    if (act === "singleCancel") { const s = single; single = null; if (s.onCancel) s.onCancel(); return; }
    if (act === "next") { errors = next(comp); rerender(); if (!errors.length) scrollTop(); }
    else if (act === "back") { errors = []; back(comp); rerender(); scrollTop(); }
    else if (act === "useRecommended") { errors = useRecommended(comp); rerender(); if (!errors.length) scrollTop(); }
    else if (act === "stepList") showStepList();
    else if (act === "jump") { if (jump(comp, el.dataset.step)) { errors = []; rerender(); scrollTop(); } }
    else if (act === "divCount") {
      const n = comp.divisions.length + Number(el.dataset.delta);
      change("divisions", () => CompModel.setDivisionCount(comp, n));
    }
    else if (act === "teamCount") {
      const n = comp.teams.length + Number(el.dataset.delta);
      change("teams", () => CompModel.setTeamCount(comp, n));
    }
    else if (act === "teamColor") { comp.teams[Number(el.dataset.idx)].color = el.dataset.value || null; rerender(); }
    else if (act === "pick") pick(el.dataset.group, el.dataset.value);
    else { const ext = EXT[activeStep()]; if (ext && ext.act) ext.act(comp, act, el); }
  }

  function pick(group, value) {
    if (group === "startFrom") { comp.settings.startFrom = value; rerender(); }
    else if (group === "preset") { if (value !== comp.settings.preset) change("start", () => CompModel.applyPreset(comp, value)); }
    else if (group === "dupSource") {
      const src = CompStore.load(value);
      if (!src) return;
      const copy = CompModel.duplicate(src);
      const draftId = comp.id;
      CompStore.save(copy); CompStore.setActive(copy.id);
      CompStore.remove(draftId);
      CompStore.flush();
      if (typeof CompShell !== "undefined") CompShell.render();
    }
    else if (group === "sport") { if (value !== comp.sport) change("basics", () => { comp.sport = value; if (!comp.wizard.visited.scoring && EXT.scoring && EXT.scoring.recommend) { comp.settings.matchFormats = {}; EXT.scoring.recommend(comp); } }); }
    else if (group === "kind") { if (value !== comp.kind) change("type", () => { comp.kind = value; if (value === "teams" && comp.teams.length < CompModel.MIN_TEAMS && !comp.wizard.visited.teams) CompModel.setTeamCount(comp, 4); }); }
    else if (group === "naming") { CompModel.renameDivisions(comp, value); rerender(); }
    else { const ext = EXT[activeStep()]; if (ext && ext.act) ext.act(comp, "pick", null, group, value); }
  }

  // Text and select fields save as you type, without re-rendering (keeps the keyboard open).
  function onInput(e) {
    const el = e.target, f = el.dataset && el.dataset.field;
    if (!f || !host.querySelector(".wiz")) return;
    const i = Number(el.dataset.idx);
    if (f === "name") comp.name = el.value;
    else if (f === "dateISO") comp.dateISO = el.value;
    else if (f === "divName") { comp.divisions[i].name = el.value; if (comp.settings.divisionNaming !== "custom") comp.settings.divisionNaming = "custom"; }
    else if (f === "teamName") comp.teams[i].name = el.value;
    else { const ext = EXT[activeStep()]; if (!ext || !ext.input || ext.input(comp, f, el) === false) return; }
    persist();
    if (typeof CompShell !== "undefined") CompShell.renderBand();
  }
  function onChange(e) {
    const el = e.target;
    if (!host.querySelector(".wiz")) return;
    if (el.dataset && el.dataset.field && el.dataset.field !== "divCategory") {
      const ext = EXT[activeStep()];
      if (ext && ext.change) ext.change(comp, el.dataset.field, el);
      return;
    }
    if (!el.dataset || el.dataset.field !== "divCategory") return;
    const i = Number(el.dataset.idx), v = el.value;
    if (CompModel.CATEGORIES.indexOf(v) === -1) return;
    change("divisions", () => { comp.divisions[i].category = v; });
    render(); // reverts the select if the change was cancelled
  }

  function mount(el, c, opts) {
    host = el; comp = c; errors = [];
    single = opts && opts.single ? { step: opts.single, onDone: opts.onDone, onCancel: opts.onCancel } : null;
    if (!el._wizBound) {
      el.addEventListener("click", onClick);
      el.addEventListener("input", onInput);
      el.addEventListener("change", onChange);
      el._wizBound = true;
    }
    if (!single && !comp.wizard.visited[current(comp)]) arrive(comp, current(comp));
    render();
  }

  function editing() { return comp; }
  function isSingle() { return !!single; }
  return { STEPS, mount, render, visibleSteps, position, current, furthest, canJump, validate, next, back, jump,
    useRecommended, affected, markReview, blockers, invalidSteps, unbuilt, register, applyRecommended,
    ui: { optionList, stepper, field, change: (stepId, fn) => change(stepId, fn), rerender: () => rerender(), render: () => render(), stepName, editing, isSingle } };
})();
