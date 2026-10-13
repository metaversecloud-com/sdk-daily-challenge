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

## API (`/api/wordhunt`)

| Method | Path           | Body                 | Returns                                           |
| ------ | -------------- | -------------------- | ------------------------------------------------- |
| GET    | `/game-state`  | –                    | `{ board, game, serverTime }`                     |
| POST   | `/start`       | –                    | New game (or resumes today's game if one is still running) |
| POST   | `/submit-word` | `{ gameId, path }`   | `{ result, word, points, game, serverTime }`      |
| POST   | `/end`         | `{ gameId }`         | Finished game (`endReason: "quit" \| "timeout"`)  |

All responses are `{ success: true, data }`.

## Not yet implemented (quality-of-life features)

Board difficulty rating, badges, and the badges view.
