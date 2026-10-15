# CourtMixer

A simple, self-contained matchmaking app for social **court sports** — badminton, tennis, or padel. Add your players and it generates fair, balanced doubles matches round after round — handling skill balance, rest rotation, game-count fairness, and repeat-pairing avoidance. It runs entirely in the browser with no accounts, no server, and no internet needed after the page loads.

**Live app:** https://courtmixer.late-initial.workers.dev/ (cloud sync included). The old address, https://lateinitial.github.io/CourtMixer/, still works and offers to move your data across.

## Features

- **Players** — roster with gender (M/F) and an *optional* skill rating; tap the skill box and pick **U** or 1.0–10.0 in half steps (or *Custom* for something like 5.4). Leave it as **U** (unrated) and the player is treated as 3.0 when balancing teams. Add, edit, sort, and a dedicated Edit mode.
- **Player details** — tap any name in the Leaderboard or Match Stats for their games played, win rate, point difference, win/loss/draw record, points scored and conceded, MD/WD/XD split, and every match they played.
- **Priority & Skip** — tap to apply for the next game only, long-press to lock until you clear it.
- **Smart matchmaking** (Americano & Mexicano formats):
  - Balanced teams — similar-skill partners by default, low-high pairings only when they're needed to balance a match
  - Mixes partners and opponents across the whole session, not just your last game, so far more people play with and against each other
  - Level game counts kept as a strong but soft preference (it won't force a bad match just to equalise)
  - Rest & rotation — favours the most-rested players and won't let anyone play three rounds in a row
  - Never repeats the exact same pair-versus-pair matchup within a session
  - Shares the "low-high" duty across the stronger players so no one is stuck carrying it
- **Courts** — 1 to 4 courts, with men's / women's / mixed doubles (MD/WD/XD) per court, manual slot fill and swap, and per-court Generate / Reroll / Clear. A generated lineup is kept if the page reloads before you confirm it.
- **History & scoring** — tap a score box and pick the score from a 0–50 grid (or choose *Custom* to type it). Unfinished matches sit in an amber card so you can see at a glance what still needs a score. Tap either score on a finished match to correct it — both sides stay editable until you press *Save*, and *Revert* puts them back.
- **Leaderboard** — four ranking styles: **Points**, **Adjusted Points**, **League**, and **Points per Game**. *Adjusted Points* and *Points per Game* count only games that actually have a score, so an unfinished game never drags a rating down.
- **Undo** — deleting a match or a player, resetting, importing and starting a new session all offer an *Undo* button for a few seconds.
- **Did You Know?** — automatically surfaces fun facts about the session (streaks, upsets, rivalries, and more).
- **Sharing** — name your session and share the leaderboard as an **image** (`.png`), or as an **interactive** `.html` file the other person can open offline: switch ranking styles, browse match history and sortable match stats, and tap a name for that player's full card.
- **Competition mode** — tap **🏆 Competition** in the header to run a fixed-pairs event: a step-by-step setup (divisions, pairs — typed, pasted as a list or picked from your roster — format, score format, standings and courts), then round robin, double round robin, groups + knockout (with an optional 3rd-place match, and an optional plate for those who don't go through), a straight knockout, knockout + plate (anyone who loses their first match plays a second bracket), Swiss (each round drawn from the results so far, never the same opponent twice) or a points league (Mexicano or Americano pairings, ranked by total points scored, with a "first to 21 total points" score format). The Courts screen suggests the next match for each free court, scores are checked against the format (badminton points, tennis/padel games and tiebreaks — unusual scores only warn), and standings with tiebreakers update by themselves. Walkovers, retirements, withdrawals and late entries are handled, and correcting a result clears any later knockout result it affected, with Undo. **Team competitions** work the same way: teams register players (with reserves) and pairs per division, each meeting is a set of doubles matches (rubbers) from a template you can edit, with fixed pairs or captains' lineups, meeting results or a match tally, an optional decider, and matches that can no longer change the result skipped if you like. Team standings, meeting cards and each player's own record update by themselves. An **Awards** view (champion, runner-up and third, MVP, best pair, iron player, match, comeback and upset of the day) and **Did you know?** facts — only ever positive, and in team events exactly one for every team — update as results come in and are frozen when you finish the competition. **Share results** sends the standings, awards and facts as an **image**, or as an **interactive `.html` page** (standings, brackets, results, awards and a card for every pair, team and player) that, like the social one, contains no JavaScript. **Export code** turns the whole competition into a `CMXC1:` text code that another phone pastes into *Import a competition code* to carry on from the same point.
- **Cloud sync** (on the Cloudflare-hosted site) — turn it on from **🏆 ☰ → Cloud sync** or the sync button on the **History** tab, and your social session and competitions are kept in the cloud and on every phone or tablet you link. No account: a 20-character **sync code** links devices (scan its QR code, open its link or type it). It works offline first — everything is saved on the device and sent when there's a connection; if the same thing was changed on two devices you choose which copy stays (or keep both, for competitions). *Turn off on this device* keeps the cloud copy; *Delete my cloud data* removes it.
- **Backup / handover** — *Export* turns the whole session (roster, history, scores and settings) into a text code starting `CMXS1:` that you copy or share in a chat; *Import History* on another phone pastes it to continue from the exact same point. *Export Roster* / *Import Roster* do the same for just the players (`CMXR1:`). Pasting the whole chat message is fine — the text around the code is ignored.

## How to use

1. Open the app — it starts empty with a short guide. Add your players (or tap *Load sample players* to try it out), giving each an optional skill rating from 1 to 10. Leave skill blank for unrated (**U**).
2. Go to **Match**, choose a format and number of courts, and tap **Generate**.
3. Tap **Confirm start** once a lineup looks good, then play the game.
4. Tap each team's score box, pick the score, then **Finish & save score**.
5. Watch the **Leaderboard** update, and repeat.

**Tips**
- In **Edit mode**, *Save as default* stores your roster so *Reset Data* always restarts a clean session with the same players.
- Use **Export** to keep a backup, or to hand a half-finished session to someone else to continue. *Import History* is on the **History** tab and works even before you've added any players, so a backup can be restored on a brand-new device.
- Got a score wrong? Tap it in **History**, fix both sides, then *Save*.
- Open a session left over from a previous day and the **Leaderboard** offers to start a fresh one, keeping your players.

## Tech

Plain HTML, CSS and JavaScript — no framework, no bundler, no build step needed to run it. `index.html` holds the markup and loads the stylesheets in `css/` and the scripts in `js/`. All data is stored locally in your browser via `localStorage`, always through one small storage layer (`js/core/store.js`), which keeps working in memory if the browser blocks storage. The version is shown in the footer, and stamped into anything you share or export. Adding `?selftest` to the URL runs the built-in test suite. Switching to Competition mode never changes your social session.

Each release also attaches a single self-contained `CourtMixer-vX.Y.Z.html` built by `tools/build-single-file.py`, for running the app straight from a downloaded file.

The shared interactive `.html` leaderboard contains no JavaScript at all — every table and player card is written into the file, and the tabs, ranking styles, sorting and player cards run on CSS alone. That means it works identically on iPhone and Android, including in previews that switch scripting off.

### Hosting on Cloudflare (cloud sync)

The same files also run as a Cloudflare Worker, which adds the cloud-sync API (`worker/index.js`, routes under `/api/*`) on top of the static app. `wrangler.jsonc` publishes the repo root as the site (`.assetsignore` keeps `worker/`, `migrations/`, `tools/` and the config files out), binds a **D1** database (`DB`, schema in `migrations/0001_init.sql`) and a per-IP rate limit, and the secret **`SYNC_PEPPER`** turns sync codes into account ids — the server never stores a code. Deploys come from GitHub through Cloudflare's Git integration (or `npx wrangler deploy`); `npm run dev` runs it all locally. Limits per sync code: 30 documents, 256 KB each, 500 saves a day. When the app is opened anywhere without the API (GitHub Pages, a downloaded file), cloud sync simply doesn't appear. Users of the old GitHub Pages address see a banner that carries their data to the new address in one tap (a `CMXT1:` transfer link).

> **Data note:** some browsers (notably iOS Safari) clear local storage after a period of inactivity, or when the page is opened as a downloaded file rather than the hosted link. For reliable retention, open the hosted URL, add it to your home screen (it installs with its own name and icon), and use **Export** to keep a backup.
