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

## How it works

- **Daily board** (`utils/board.ts`): rolled from the Big Boggle letter dice using a PRNG seeded by the date, so every player and server instance gets the same board. The board rolls over at midnight in `WORDHUNT_TIMEZONE` (default `America/Los_Angeles`). A board is re-rolled (deterministically) until it has at least 150 findable words.
- **Dictionary** (`data/enable1.txt` + `data/blockedWords.ts`): the ENABLE word list, minus profanity, slurs, sexual, and drug-related words so it's appropriate for elementary school players. Add words to `blockedWords.ts` to block more.
- **Validation is server-side**: the client sends the tile path (`[row * 5 + col, ...]`), and the server checks adjacency, builds the word from its own copy of the board, and checks the dictionary.
- **Timer**: the server stores `endsAt` and rejects words more than 3s after it. Games abandoned mid-play are marked finished the next time the player loads the game.

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

All responses are `{ success: true, data }`.

## Not yet implemented (quality-of-life features)

Board difficulty rating.

## Badges

12 badges, pictures in `client/public/badges/<slug>.png` (200x200). Source art, the generator (`badges/art/`) and the readability sheet are in `badges/`.

- Lifetime stats are saved with each finished game at `wordhunt.stats` on the visitor data object (games played, total/best score, day streak, found "Topia", found a 7+ letter word). Earned badges are derived from them (`utils/badges.ts`), granted from the ecosystem inventory by badge **name** (`utils/grantBadges.ts`), and announced with a toast.
- `GET /api/wordhunt/badges` returns the 12 badges with `earned` and `progress`. It also grants any earned badge missing from the player's inventory.
- "Topia" is added to the dictionary so the word can be found.
- **CROWN!** (top of the daily leaderboard) is not awarded yet: the leaderboard keeps no previous-day winner. It shows as earned once the badge is in the player's inventory.
- Ecosystem badge item names must match `BADGES` in `utils/badges.ts`: 7-Day Streak, Amateur Hunter, Novice Hunter, Seasoned Hunter, 5K Scorer, 10K Scorer, 15K Scorer, 20K Scorer, 100K Hoarder, Topia Finder, Big Word Hunter, CROWN!
