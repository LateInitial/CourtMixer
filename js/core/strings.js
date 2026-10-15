// CourtMixer - Competition-mode strings table (Phase 2, v1.10.0), spec §14.1.
// All Competition-mode UI text goes through t(key, params) with {name}-style placeholders.
// A Bahasa Indonesia table (STR.id) and a language switch can be added later; only English now.

const STR = { lang: "en", missing: {} };

STR.en = {
  // mode chip and band
  "chip.toComp": "Competition",
  "chip.toSocial": "↩ Social",
  "chip.toComp.aria": "Switch to Competition mode",
  "chip.toSocial.aria": "Switch back to Social mode",
  "comp.mode": "Competition",
  "comp.untitled": "Untitled competition",
  "band.court": "{n} court",
  "band.courts": "{n} courts",
  "status.setup": "Setting up",
  "status.live": "Live",
  "status.finished": "Finished",
  "status.archived": "Archived",

  // welcome and placeholders
  "welcome.title": "Run a competition",
  "welcome.text": "Fixed pairs or teams, groups, knockouts and standings — all from this phone. Your social session stays exactly as it is.",
  "welcome.start": "Start a competition",
  "welcome.import": "Import a competition code",
  "welcome.saved": "Saved competitions",
  "import.later": "Competition codes arrive in a later update.",
  "tab.entries": "Entries",
  "tab.courts": "Courts",
  "tab.standings": "Standings",
  "tab.results": "Results",
  "tab.placeholder": "This tab arrives in the next update.",
  "finished.title": "{name} is finished",
  "finished.text": "Results and awards arrive in a later update.",

  // Competition menu
  "menu.title": "Competition menu",
  "menu.switch": "Switch competition",
  "menu.new": "Start a new competition",
  "menu.archive": "Archive",
  "menu.delete": "Delete",
  "switch.none": "No saved competitions yet.",
  "archive.confirm": "Archive “{name}”? It leaves the list of active competitions; open it again from Switch competition.",
  "archive.done": "Archived “{name}”.",
  "delete.confirm": "Delete “{name}” and everything in it?",
  "delete.yes": "Delete",
  "delete.done": "Deleted “{name}”.",
  "undo.done": "Restored — {what} was undone.",

  // wizard framework
  "wiz.stepOf": "Step {n} of {total} — {name}",
  "wiz.stepList": "Setup steps",
  "wiz.back": "Back",
  "wiz.next": "Next",
  "wiz.close": "Close",
  "wiz.recommended": "Recommended",
  "wiz.advanced": "Advanced",
  "wiz.more": "More",
  "wiz.fewer": "Fewer",
  "wiz.useRecommended": "Use recommended for the rest",
  "wiz.needsReview": "Check",
  "wiz.reviewThis": "An earlier answer changed. Check this step still looks right, then press Next.",
  "wiz.invalidate.title": "Change this?",
  "wiz.invalidate.yes": "Change it",
  "wiz.invalidate": "Changing this affects: {steps}. Your existing answers are kept where they still fit.",
  "wiz.placeholder": "This step arrives in Phase {phase}. For now the recommended settings are used — you'll be able to change them here.",
  "wiz.err.name": "Give the competition a name.",
  "wiz.err.date": "Pick a date.",
  "wiz.err.sport": "Choose a sport — it sets the score formats.",
  "wiz.err.type": "Choose pairs or teams.",
  "wiz.err.divisions": "Add at least one division.",
  "wiz.err.divisionName": "Every division needs a name.",
  "wiz.err.teams": "Add at least two teams.",
  "wiz.err.teamName": "Every team needs a name.",

  // step names
  "step.start": "Start",
  "step.basics": "Basics",
  "step.type": "Competition type",
  "step.divisions": "Divisions",
  "step.teams": "Teams",
  "step.entries": "Players and entries",
  "step.template": "Meeting template",
  "step.meetingWin": "How a meeting is won",
  "step.format": "Format",
  "step.scoring": "Match scoring",
  "step.standings": "Standings and tiebreakers",
  "step.courts": "Courts and time",
  "step.review": "Review",

  // "why this matters" helper lines
  "why.start": "A preset fills in sensible answers for every later step. You can still change anything.",
  "why.basics": "The sport decides which score formats are offered.",
  "why.type": "Pairs play their own matches; teams play meetings made of several doubles matches.",
  "why.divisions": "Divisions keep similar levels playing each other.",
  "why.teams": "Each team gets players in every division.",
  "why.entries": "Who plays, and with whom.",
  "why.template": "Which matches make up one team meeting.",
  "why.meetingWin": "How matches add up to a meeting result.",
  "why.format": "How many matches everyone gets, and how long the day runs.",
  "why.scoring": "What counts as a finished match.",
  "why.standings": "How the table is ordered, and how ties are broken.",
  "why.courts": "Courts and match length decide the finish time.",
  "why.review": "Check everything, then generate the draw.",

  // step 1 - start
  "start.preset": "Start from a preset",
  "start.preset.desc": "Pick the closest kind of event; everything stays changeable.",
  "start.duplicate": "Duplicate a previous competition",
  "start.duplicate.desc": "Keeps settings and players, clears results.",
  "start.duplicate.none": "No saved competitions to copy yet.",
  "start.import": "Import a competition code",
  "start.import.later": "Arrives in a later update.",
  "start.pickPreset": "Preset",
  "start.pickSource": "Copy which competition?",
  "preset.pairsGroupsKo": "Pairs — groups + knockout",
  "preset.pairsGroupsKo.desc": "Groups first, then the best pairs play a knockout.",
  "preset.pairsRoundRobin": "Pairs — round robin",
  "preset.pairsRoundRobin.desc": "Everyone plays everyone.",
  "preset.pairsKnockout": "Pairs — knockout",
  "preset.pairsKnockout.desc": "Lose and you're out. Quickest.",
  "preset.pairsPoints": "Pairs — points league",
  "preset.pairsPoints.desc": "Americano/Mexicano style with fixed partners.",
  "preset.teamsFixed": "Team battle — fixed pairs",
  "preset.teamsFixed.desc": "Teams register their pairs in each division.",
  "preset.teamsFlexible": "Team battle — flexible lineup",
  "preset.teamsFlexible.desc": "Captains choose pairs before each meeting.",
  "preset.custom": "Custom",
  "preset.custom.desc": "No pre-fill; answer every step yourself.",

  // step 2 - basics
  "basics.name": "Competition name",
  "basics.name.ph": "e.g. Club Championship",
  "basics.date": "Date",
  "basics.sport": "Sport",
  "sport.badminton": "Badminton",
  "sport.badminton.desc": "Games to 21 by default, or 15, 25, 30 or custom \u2014 you choose in Match scoring.",
  "sport.padel": "Padel",
  "sport.padel.desc": "Games and sets, golden point.",
  "sport.tennis": "Tennis",
  "sport.tennis.desc": "Games and sets, tiebreaks.",
  "sport.other": "Other",
  "sport.other.desc": "Set your own score format.",

  // step 3 - type
  "type.pairs": "Pairs",
  "type.pairs.desc": "Fixed doubles pairs compete in their division.",
  "type.teams": "Teams",
  "type.teams.desc": "Teams of players compete; each meeting is several doubles matches.",

  // step 4 - divisions
  "div.count": "Number of divisions",
  "div.count.hint": "Recommended: {n}. Most events use 5 or fewer.",
  "div.naming": "Names",
  "div.naming.letters": "A / B / C …",
  "div.naming.metals": "Gold / Silver / Bronze …",
  "div.naming.levels": "Advanced / Intermediate / Beginner …",
  "div.naming.custom": "Custom names",
  "div.name": "Division {n} name",
  "div.category": "Category",
  "div.unassigned": "{n} player(s) or pair(s) are in no division now. You'll be asked to place them at Players and entries.",
  "cat.open": "Open",
  "cat.MD": "Men's doubles (MD)",
  "cat.WD": "Women's doubles (WD)",
  "cat.XD": "Mixed doubles (XD)",

  // step 5 - teams
  "teams.count": "Number of teams",
  "teams.count.hint": "Recommended: 4.",
  "teams.name": "Team {n} name",
  "teams.colors.hint": "Optional team colours.",
  "teams.noColor": "No colour",

  // step 13 - review
  "review.edit": "Edit",
  "review.later": "Using recommended settings",
  "review.needsReview": "Check these steps first: {steps}.",
  "review.generate": "Generate draw",
  "review.generateLater": "Generating the draw arrives in Phase 3. Your setup is saved as a draft.",
  "review.blocked": "Check the steps marked above before generating."
};

// t("wiz.stepOf", { n: 4, total: 10, name: "Divisions" }) -> "Step 4 of 10 — Divisions".
// A missing key returns the key itself and is recorded in STR.missing (self-tests check it).
function t(key, params) {
  const table = STR[STR.lang] || STR.en;
  let s = table[key];
  if (s === undefined) s = STR.en[key];
  if (s === undefined) { STR.missing[key] = true; return key; }
  if (params) s = s.replace(/\{(\w+)\}/g, function (m, k) { return params[k] === undefined ? m : String(params[k]); });
  return s;
}
