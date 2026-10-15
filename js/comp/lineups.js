// CourtMixer - team lineups (Phase 4, v1.12.0), spec §5, §6.2 steps 6-7, §10.3 and §11.
// Registered pair slots per team and division, the meeting template built from them, who plays
// each rubber (fixed slot, captain's lineup, or an edit for one match), lineup checks, and the
// lineup editor.

const CompLineups = (function () {
  /* ===== Slots: each team's registered pairs per division (A1, A2, ...) ===== */
  function slotLabel(division, n) {
    const name = division ? division.name : "?";
    return (name.length <= 2 ? name : name + " ") + n;
  }
  function teamPlayers(comp, teamId, divisionId, role) {
    return comp.players.filter(p => p.teamId === teamId && !p.withdrawn && (divisionId === undefined || p.divisionId === divisionId) && (!role || p.role === role));
  }

  // Keeps entries in step with the rosters: existing pairs whose two players are still regulars of
  // that team and division stay; leftover regulars are paired in roster order. Slots renumber 1..n.
  function syncTeamEntries(comp) {
    const teamIds = comp.teams.map(tm => tm.id), divIds = comp.divisions.map(d => d.id);
    // anything that isn't a current team's pair in a current division is left alone (never deleted)
    const keep = comp.entries.filter(e => !(e.teamId && teamIds.indexOf(e.teamId) !== -1 && divIds.indexOf(e.divisionId) !== -1));
    comp.teams.forEach(function (tm) {
      comp.divisions.forEach(function (d) {
        const regs = teamPlayers(comp, tm.id, d.id, "regular").map(p => p.id);
        const used = {};
        const kept = comp.entries.filter(e => e.teamId === tm.id && e.divisionId === d.id && e.playerIds.length === 2 &&
          e.playerIds.every(id => regs.indexOf(id) !== -1 && !used[id]) && e.playerIds[0] !== e.playerIds[1] &&
          (e.playerIds.forEach(id => { used[id] = true; }), true));
        const rest = regs.filter(id => !used[id]);
        for (let i = 0; i + 1 < rest.length; i += 2) kept.push({ id: uid(), divisionId: d.id, teamId: tm.id, playerIds: [rest[i], rest[i + 1]], label: "", seed: null, withdrawn: false });
        kept.forEach((e, i) => { e.slot = i + 1; e.label = slotLabel(d, i + 1); });
        keep.push.apply(keep, kept);
      });
    });
    comp.entries = keep;
  }
  function slotsIn(comp, divisionId) {
    return Math.max.apply(null, [0].concat(comp.teams.filter(tm => !tm.withdrawn).map(tm => comp.entries.filter(e => e.teamId === tm.id && e.divisionId === divisionId).length)));
  }

  /* ===== Meeting template ===== */
  // One rubber per registered pair slot in each division (★ §6.2 step 7). Rubber ids are kept for
  // slots that already had one, so a rebuild doesn't break anything that refers to them.
  function buildTemplate(comp) {
    const old = comp.settings.meetingTemplate || [];
    const out = [];
    comp.divisions.forEach(function (d) {
      const n = Math.max(1, slotsIn(comp, d.id));
      for (let s = 1; s <= n; s++) {
        const prev = old.find(r => r.divisionId === d.id && r.slot === s && !r.isDecider);
        out.push({ id: prev ? prev.id : uid(), order: out.length, label: slotLabel(d, s), divisionId: d.id, category: d.category, isDecider: false, slot: s });
      }
    });
    const dec = old.find(r => r.isDecider);
    if (dec) { dec.order = out.length; out.push(dec); }
    return out;
  }
  function rubberById(comp, id) { return (comp.settings.meetingTemplate || []).find(r => r.id === id) || null; }
  // fixedLastFree: the last regular rubber of each division is the captain's choice.
  function isFreeRubber(comp, rb) {
    if (!rb) return true;
    if (rb.isDecider || !rb.slot) return true;
    const mode = comp.settings.lineup.mode;
    if (mode === "flexible") return true;
    if (mode === "fixedLastFree") {
      const same = comp.settings.meetingTemplate.filter(r => r.divisionId === rb.divisionId && !r.isDecider);
      return same.length > 0 && same[same.length - 1].id === rb.id;
    }
    return false;
  }

  // Who plays one side of a rubber: a lineup entry for that rubber (captain's choice or an edit),
  // else the team's registered pair for the slot (fixed modes). [] means "lineup needed".
  function playersFor(comp, meeting, match, which, teamId) {
    const lineup = (which === "A" ? meeting.lineupA : meeting.lineupB) || {};
    const chosen = lineup[match.rubberId];
    if (chosen && chosen.length === 2 && chosen[0] && chosen[1]) return chosen.slice();
    if (!teamId) return [];
    const rb = rubberById(comp, match.rubberId);
    if (!rb || isFreeRubber(comp, rb)) return [];
    const e = comp.entries.find(x => x.teamId === teamId && x.divisionId === rb.divisionId && x.slot === rb.slot && !x.withdrawn);
    return e ? e.playerIds.slice() : [];
  }

  // Lineup problems for one team in one meeting: { warnings: [], errors: [] } (§6.2 step 7, §11).
  // alreadyPlaying: players of this side in rubbers already on court or finished.
  function check(comp, meeting, which, lineup, alreadyPlaying) {
    const s = comp.settings.lineup, warnings = [], errors = [];
    const count = {};
    (alreadyPlaying || []).forEach(pid => { count[pid] = (count[pid] || 0) + 1; });
    Object.keys(lineup || {}).forEach(function (rid) {
      const rb = rubberById(comp, rid), ids = (lineup[rid] || []).filter(Boolean);
      if (ids.length === 2 && ids[0] === ids[1]) errors.push(t("lineup.err.same", { rubber: rb ? rb.label : "?" }));
      ids.forEach(function (pid) {
        count[pid] = (count[pid] || 0) + 1;
        const p = comp.players.find(x => x.id === pid);
        if (!p || !rb) return;
        const reserveOk = p.role === "reserve" && s.reservesAnyDivision;
        if (p.divisionId !== rb.divisionId && !reserveOk) {
          const msg = t("lineup.crossDivision", { name: p.name, rubber: rb.label });
          if (s.crossDivision === "block") errors.push(msg); else if (s.crossDivision === "warn") warnings.push(msg);
        }
      });
    });
    Object.keys(count).forEach(function (pid) {
      if (count[pid] > 1 && s.onePerMeeting) {
        const p = comp.players.find(x => x.id === pid);
        warnings.push(t("lineup.twice", { name: p ? p.name : "?" }));
      }
    });
    return { warnings, errors };
  }

  /* ===== Lineup editor (§10.3) ===== */
  // Shows every rubber of one team's side of a meeting that hasn't started. Fixed slots are
  // pre-filled; anything changed here is stored as the lineup for this meeting only.
  function edit(comp, meetingId, which) {
    const D = CompStandings.derive(comp), m = D.meetingById[meetingId];
    if (!m) return;
    const teamId = D.side(m, which), team = comp.teams.find(x => x.id === teamId);
    if (!team) return;
    const all = (D.matchesOfMeeting[m.id] || []).slice().sort((a, b) => a.order - b.order);
    const matches = all.filter(x => x.status === "pending");
    const playing = [].concat.apply([], all.filter(x => x.status !== "pending").map(x => D.playerIdsOf(x, which)));
    if (!matches.length) return cmxAlert(t("lineup.nothing"));
    const draft = {};
    matches.forEach(x => { draft[x.rubberId] = D.playerIdsOf(x, which).slice(); while (draft[x.rubberId].length < 2) draft[x.rubberId].push(""); });
    let more = false;
    const roster = comp.players.filter(p => p.teamId === teamId && !p.withdrawn);
    function optionsFor(rb, selected) {
      const s = comp.settings.lineup;
      const list = roster.filter(p => more || p.divisionId === rb.divisionId || (p.role === "reserve" && s.reservesAnyDivision) || p.id === selected);
      return '<option value="">' + esc(t("lineup.pick")) + "</option>" + list.map(p => '<option value="' + esc(p.id) + '"' + (p.id === selected ? " selected" : "") + ">" +
        esc(p.name + (p.role === "reserve" ? " (" + t("lineup.reserve") + ")" : "") + (p.divisionId !== rb.divisionId ? " · " + ((comp.divisions.find(d => d.id === p.divisionId) || {}).name || "") : "")) + "</option>").join("");
    }
    function body() {
      const c = check(comp, m, which, draft, playing);
      return '<p class="cmx-modal-text">' + esc(t("lineup.hint", { team: team.name, vs: D.sideLabel(m, which === "A" ? "B" : "A") })) + "</p>" +
        matches.map(function (x) {
          const rb = rubberById(comp, x.rubberId) || { label: "?", divisionId: x.divisionId };
          return '<div class="wiz-label">' + esc(rb.label) + (rb.isDecider && rb.label !== t("template.decider") ? " · " + esc(t("template.decider")) : "") + '</div><div class="wiz-item">' +
            [0, 1].map(i => '<select class="wiz-select" data-r="' + esc(x.rubberId) + '" data-i="' + i + '" aria-label="' + esc(rb.label) + '">' + optionsFor(rb, draft[x.rubberId][i]) + "</select>").join("") + "</div>";
        }).join("") +
        '<label class="lineup-more"><input type="checkbox" data-more' + (more ? " checked" : "") + "> " + esc(t("lineup.more")) + "</label>" +
        (c.errors.length ? '<div class="wiz-errors">' + c.errors.map(e => "<div>" + esc(e) + "</div>").join("") + "</div>" : "") +
        (c.warnings.length ? '<div class="wiz-warn">' + c.warnings.map(e => "<div>" + esc(e) + "</div>").join("") + "</div>" : "");
    }
    function bind(box) {
      box.querySelectorAll("select[data-r]").forEach(sel => { sel.onchange = function () { draft[sel.dataset.r][Number(sel.dataset.i)] = sel.value; refresh(box); }; });
      const mo = box.querySelector("[data-more]"); if (mo) mo.onchange = function () { more = mo.checked; refresh(box); };
    }
    function refresh(box) { box.querySelector(".cmx-modal-body").innerHTML = body(); bind(box); }
    const prev = previousLineup(D, m, teamId);
    const buttons = [{ label: t("lineup.save"), cls: "primary", onClick: function () {
      const c = check(comp, m, which, draft, playing);
      if (c.errors.length) { cmxAlert(c.errors.join("\n")); return false; }
      save(comp, m.id, which, draft);
    } }];
    if (prev) buttons.push({ label: t("lineup.copyLast"), cls: "secondary", keepOpen: true, onClick: function (box) {
      matches.forEach(x => { const p = prev[x.rubberId]; if (p && p.length === 2) draft[x.rubberId] = p.slice(); });
      refresh(box); return false;
    } });
    buttons.push({ label: t("wiz.cancel"), cls: "ghost", onClick: function () {} });
    cmxShowModal({ title: t("lineup.title", { team: team.name }), bodyHTML: body(), onOpen: bind, buttons });
  }

  function save(comp, meetingId, which, draft) {
    const m = comp.meetings.find(x => x.id === meetingId);
    if (!m) return;
    CompShell.snapshot(t("lineup.title", { team: "" }).trim(), comp);
    const key = which === "A" ? "lineupA" : "lineupB";
    const cur = Object.assign({}, m[key] || {});
    Object.keys(draft).forEach(rid => { const ids = draft[rid].filter(Boolean); if (ids.length === 2) cur[rid] = ids; else delete cur[rid]; });
    m[key] = cur;
    CompStore.save(comp);
    CompShell.render();
    showToast(esc(t("lineup.saved")));
  }

  // The team's lineup from its latest meeting before this one (any stage, knockout included).
  function previousLineup(D, meeting, teamId) {
    const pos = (m) => D.stageById[m.stageId].order * 1000 + m.round;
    let best = null;
    D.comp.meetings.forEach(function (m) {
      if (m.id === meeting.id || pos(m) >= pos(meeting)) return;
      const sd = D.side(m, "A") === teamId ? "lineupA" : D.side(m, "B") === teamId ? "lineupB" : null;
      if (sd && m[sd] && Object.keys(m[sd]).length && (!best || pos(m) > pos(best.m))) best = { m, l: m[sd] };
    });
    return best ? best.l : null;
  }

  // Meetings in the queue whose rubbers wait for a team's lineup (worked out once per derived view).
  function needed(D) {
    if (D._lineupsNeeded) return D._lineupsNeeded;
    const out = [];
    D.comp.meetings.forEach(function (m) {
      const a = D.side(m, "A"), b = D.side(m, "B");
      if (!a || !b || a === "BYE" || b === "BYE" || D.outcome(m).done) return;
      ["A", "B"].forEach(function (sd) {
        const waiting = (D.matchesOfMeeting[m.id] || []).some(x => x.status === "pending" && D.rubberNeeded(x) && D.playerIdsOf(x, sd).length < 2);
        if (waiting) out.push({ meeting: m, side: sd, teamId: sd === "A" ? a : b });
      });
    });
    D._lineupsNeeded = out;
    return out;
  }

  return { slotLabel, teamPlayers, syncTeamEntries, slotsIn, buildTemplate, rubberById, isFreeRubber, playersFor, check, edit, save, needed };
})();
