# CourtMixer

A simple, self-contained matchmaking app for social **court sports** — badminton, tennis, or padel. Add your players and it generates fair, balanced doubles matches round after round — handling skill balance, rest rotation, game-count fairness, and repeat-pairing avoidance. It runs entirely in the browser with no accounts, no server, and no internet needed after the page loads.

**Live app:** https://lateinitial.github.io/CourtMixer/

## Features

- **Players** — roster with gender (M/F) and an *optional* skill rating; tap the skill box and pick **U** or 1.0–10.0 in half steps (or *Custom* for something like 5.4). Leave it as **U** (unrated) and the player is treated as 3.0 when balancing teams. Add, edit, sort, and a dedicated Edit mode.
- **Player details** — tap any name in the Leaderboard or Match Stats for their games played, win rate, point difference, win/loss/draw record, points scored and conceded, MD/WD/XD split, and every match they played.
- **Priority & Skip** — tap to apply for the next game only, long-press to lock until you clear it.
- **Smart matchmaking** (Americano & Mexicano formats):
  - Balanced teams — similar-skill partners by default, low-high pairings only when they're needed to balance a match
  - Level game counts kept as a strong but soft preference (it won't force a bad match just to equalise)
  - Rest & rotation — favours the most-rested players and won't let anyone play three rounds in a row
  - Never repeats the exact same pair-versus-pair matchup within a session
  - Shares the "low-high" duty across the stronger players so no one is stuck carrying it
- **Courts** — 1 to 4 courts, with men's / women's / mixed doubles (MD/WD/XD) per court, manual slot fill and swap, and per-court Generate / Reroll / Clear.
- **History & scoring** — tap a score box and pick the score from a 0–50 grid (or choose *Custom* to type it); a live leaderboard with four ranking styles: **Points**, **Adjusted Points**, **League**, and **Points per Game**.
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
- Use **Export** to keep a backup, or to hand a half-finished session to someone else to continue.

## Tech

A single `index.html` file — plain HTML, CSS, and JavaScript with no dependencies and no build step. All data is stored locally in your browser via `localStorage`.

> **Data note:** some browsers (notably iOS Safari) clear local storage after a period of inactivity, or when the page is opened as a downloaded file rather than the hosted link. For reliable retention, open the hosted URL, add it to your home screen, and use **Export** to keep a backup.
