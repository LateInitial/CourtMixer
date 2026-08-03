# CourtMixer

A simple, self-contained matchmaking app for social **court sports** — badminton, tennis, or padel. Add your players and it generates fair, balanced doubles matches round after round — handling skill balance, rest rotation, game-count fairness, and repeat-pairing avoidance. It runs entirely in the browser with no accounts, no server, and no internet needed after the page loads.

**Live app:** https://lateinitial.github.io/CourtMixer/

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
- **Backup / handover** — Export the entire session (roster, history, scores, and settings) to a JSON file and Import it on another device to continue from the exact same point.

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

A single `index.html` file — plain HTML, CSS, and JavaScript with no dependencies and no build step. All data is stored locally in your browser via `localStorage`. The version is shown in the footer, and stamped into anything you share or export. Adding `?selftest` to the URL runs the built-in test suite.

> **Data note:** some browsers (notably iOS Safari) clear local storage after a period of inactivity, or when the page is opened as a downloaded file rather than the hosted link. For reliable retention, open the hosted URL, add it to your home screen (it installs with its own name and icon), and use **Export** to keep a backup.
>
> **Sharing note:** the interactive `.html` leaderboard opens in any browser, but iPhones can't open an `.html` attachment directly — save it to Files first, then tap it. Send the image if in doubt.
