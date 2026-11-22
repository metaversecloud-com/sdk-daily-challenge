# Word Hunt

Single-player, 2-minute word game. Every player gets the same 5x5 board each day; drag across touching letters (including diagonals) to make words of 3+ letters.

## Scoring

| Letters | Points |
| ------- | ------ |
| 3       | 200    |
| 4       | 400    |
| 5       | 800    |
| 6       | 1,000  |
| 7       | 1,200  |
| 8+      | 1,400  |

A "Qu" tile counts as two letters.

## Game modes

Picked on the start screen. Each mode has its own daily board (its own seed), one game per player per day, its own daily leaderboard, and its own analytics. Every route takes `?mode=classic|golden` (missing means classic; unknown is a 400).

- **Classic**: the original game. Its board, saved data, leaderboard (`dailyLeaderboard`), and analytics are unchanged.
- **Golden Letter** (`golden`):
  - **Golden letter**: each day's golden board has a golden letter (`utils/board.ts` → `pickGoldenLetter`): a single-letter tile found in 15–35% of that board's words, preferring consonants and letters on fewer tiles (a random letter would range from 0% to 70%+). Golden tiles are gold with a ★.
  - **Scoring** (`shared/wordhunt/golden.ts`, used by both server and client so instant feedback always matches): a word with the golden letter scores ×2 (once per word). Each golden word in a row adds 0.5×: ×2, ×2.5, ×3, ×3.5, up to ×4. A non-golden word resets the streak; invalid attempts don't. The streak is saved with each word (`game.goldenStreak`).
  - **Goals**: bronze/silver/gold are the points from the board's 8/15/25 easiest words (shortest, then most common), with golden words doubled, rounded to 100 (`getGoals`). Shown on the start screen, during play, and as a medal on the results screen.
  - **Look**: a warm gold theme (tokens in `client/src/styles/tokens.css`).
  - **Golden badges** (in the same Badges tab, under "Golden Letter"): **Gold Rush!** (5 golden words in a row in one game) and **Midas Touch** (10 golden words in one game). Golden games only update two golden bests on the player's stats (`goldenBestStreak`, `goldenMostWords`), so they never count toward the classic badges, games played, scores, or streaks. The pictures are placeholder SVGs in `client/public/badges/`; like the other badges, they're granted from the Topia ecosystem inventory by name, so items named exactly `Gold Rush!` and `Midas Touch` must exist there.
  - **Kept separate from classic**: saved under `<urlSlug>-<sceneDropId>.wordhunt.golden`, ranked on `goldenDailyLeaderboard`, and counted in `wordHuntGoldenAnalytics`.

**Analytics count both modes.** Every game records the shared Topia events (`starts`, `completions`, …), so dashboard totals include both modes; golden games also record prefixed copies (`goldenStarts`, `goldenCompletions`, …) plus golden-only ones (`goldenLetterWordsFound`, `golden<Medal>Goals`), so golden can be viewed on its own (classic alone = shared total minus golden). The admin stats view and `GET /admin/analytics` add both modes together by default (`?mode=all`), or show one mode (`?mode=classic|golden`).

Opening Word Hunt resumes a game in progress in either mode, shows the results once both modes are played today, and otherwise shows the start screen. Admin **Reset my play** resets both modes, **Clear leaderboard** clears both, and the stats view has a mode filter.

## How it works

- **Daily board** (`utils/board.ts`): rolled from the Big Boggle letter dice using a PRNG seeded by the date, so every player and server instance gets the same board. The board rolls over at midnight in `WORDHUNT_TIMEZONE` (default `America/Los_Angeles`). A board is re-rolled (deterministically) until it has at least 150 findable words.
- **Dictionary** (`data/enable1.txt` + `data/blockedWords.ts`): the ENABLE word list, minus profanity, slurs, sexual, and drug-related words so it's appropriate for elementary school players. Add words to `blockedWords.ts` to block more.
- **Validation is server-side, feedback is instant**: when a game starts, the server sends today's words and their points (`validWords`), so the client shows ✓/✗ and updates the score immediately; words that aren't on the board never reach the server. Valid words are then sent in parallel as tile paths (`[row * 5 + col, ...]`), and the server checks adjacency, builds the word from its own copy of the board, and checks the dictionary. If the server disagrees, the client takes the word back. The board itself is public, so sending the word list reveals nothing a solver couldn't find.
- **One Topia request per word**: the server keeps each in-progress game in memory (`gameState.ts`), so submitting a word doesn't reload the visitor's data object; only the new word is saved (`game.found.<word>`). Found words are stored as a map so parallel saves never overwrite each other. Games saved in the older `foundWords` list format still load. Set `WORDHUNT_MOCK_LATENCY_MS` on the dev mock server to simulate a slow Topia API.
- **Timer**: the server stores `endsAt` and rejects words more than 3s after it. Games abandoned mid-play are marked finished the next time the player loads the game.
- **Word of the Day** (`utils/wordOfTheDay.ts`): the longest word on the day's board that has a definition (longer words WordNet can't define are skipped), shown with its definition on the results screen. Ties go to the more common word, then alphabetical order. It is only sent to the client once the player's game has ended, so it can't be read from the network mid-game.
- **Definitions** (`data/definitions.tsv`, read by `utils/definitions.ts`): generated from [WordNet 3.1](https://wordnet.princeton.edu/) for the ENABLE words it covers (about 104k of 173k), with inflected forms mapped to their base word ("rematches" → "rematch"). "Topia" has a custom definition. To regenerate after changing `enable1.txt`, run `npm run build:definitions` from `server/` (uses the `wordnet-db` dev dependency; the server itself never loads WordNet). WordNet's license is in `data/WORDNET_LICENSE.txt`.

## Data object

Stored on the visitor data object under the per-world key from `getVisitor`:

```
"${urlSlug}-${sceneDropId}": {
  wordhunt: { game: WordHuntGame }   // see shared/types/wordhunt/WordHuntTypes.ts
}
```

### Daily leaderboard

Stored on the dropped asset's data object (same pattern as the Escape Room leaderboard, `"name|score"` strings keyed by `profileId`):

```
dailyLeaderboard: { date: "YYYY-MM-DD", scores: { [profileId]: "displayName|score" } }
```

Each player keeps their best score of the day. A game is recorded when it ends (quit, timeout, or expired on the next load); the stored scores reset when the board date rolls over.

## API (`/api/wordhunt`)

| Method | Path           | Body                 | Returns                                           |
| ------ | -------------- | -------------------- | ------------------------------------------------- |
| GET    | `/game-state`  | –                    | `{ board, game, serverTime }`                     |
| POST   | `/start`       | –                    | New game (or resumes today's game if one is still running) |
| POST   | `/submit-word` | `{ gameId, path }`   | `{ result, word, points, game, serverTime }`      |
| POST   | `/end`         | `{ gameId }`         | Finished game (`endReason: "quit" \| "timeout"`)  |
| GET    | `/leaderboard` | –                    | `{ date, entries, me }` — today's top 10 scores and the caller's own rank |
| POST   | `/admin/clear-leaderboard` | –        | Today's (now empty) leaderboard. World admins only (403 otherwise) |
| POST   | `/admin/reset-play` | –                | `{ board, game: null }` — deletes the admin's own game for today so they can play again. World admins only |
| GET    | `/admin/analytics?days=7` | –         | Daily stats for the last `days` board days (default 7, max 90), newest first, plus totals. World admins only |

All responses are `{ success: true, data }`.

## Analytics

Recorded two ways, both without slowing down or failing a player's request:

- **Topia analytics events** (Topia dashboard), attached to saves the game already makes, so they cost no extra requests. Each is counted once per game (`uniqueKey: <profileId>-<gameId>`): `starts`, `completions`, `quits` / `timeouts`, `wordsFound` / `pointsScored` / `longWordsFound` (with `incrementBy`), `wordOfTheDayFound`, plus `badgesAwarded` once per player per badge.
- **Per-day counters** on the dropped asset under `wordHuntAnalytics.<board date>` (`utils/analytics.ts`), added with atomic `incrementDataObjectValue` calls in the background: `gamesStarted`, `gamesCompleted`, `gamesQuit`, `gamesTimedOut`, `gamesWithNoWords`, `wordsFound`, `pointsScored`, `secondsPlayed`, `longWordsFound`, `wordOfTheDayFound`.

`GET /admin/analytics` reads the counters and adds `completionRate`, `quitRate`, `averageWordsFound`, `averageScore`, `averageSecondsPlayed`, and `wordOfTheDayFindRate` (averages are per finished game; rates are `null` on days with no games). Games are counted on their board's date. Admin replays (an admin's games after "Reset my play", marked `isReplay`) are left out of both the Topia events and the counters; they still count on the leaderboard and toward the admin's own stats and badges. Admins can see the stats in the admin popup (**View stats**: totals plus a row per day for the last 7, 30, or 90 days). Counters are kept indefinitely (about a dozen numbers per day).

## Admin tools

World admins see a gear button on the start and results screens (not during a game). It opens a popup to **view stats**, **clear today's leaderboard**, or **reset their own play for today**, so they can test the board repeatedly. `GET /game-state` returns `isAdmin`, which only controls whether the button is shown; each admin route checks admin status with Topia (`Visitor.get`) itself. Resetting keeps the admin's lifetime stats and badges, so repeated test games still count toward them. On the dev mock server everyone is an admin unless `WORDHUNT_MOCK_ADMIN=false`.

## Not yet implemented (quality-of-life features)

Board difficulty rating.

## Badges

12 badges, pictures in `client/public/badges/<slug>.png` (200x200). Source art, the generator (`badges/art/`) and the readability sheet are in `badges/`.

- Lifetime stats are saved with each finished game at `wordhunt.stats` on the visitor data object (games played, total/best score, day streak, found "Topia", found a 7+ letter word). Earned badges are derived from them (`utils/badges.ts`), granted from the ecosystem inventory by badge **name** (`utils/grantBadges.ts`), and announced with a toast.
- `GET /api/wordhunt/badges` returns the 12 badges with `earned` and `progress`. It also grants any earned badge missing from the player's inventory.
- "Topia" is added to the dictionary so the word can be found.
- **CROWN!** (top of the daily leaderboard) is not awarded yet: the leaderboard keeps no previous-day winner. It shows as earned once the badge is in the player's inventory.
- Ecosystem badge item names must match `BADGES` in `utils/badges.ts`: 7-Day Streak, Amateur Hunter, Novice Hunter, Seasoned Hunter, 5K Scorer, 10K Scorer, 15K Scorer, 20K Scorer, 100K Hoarder, Topia Finder, Big Word Hunter, CROWN!
