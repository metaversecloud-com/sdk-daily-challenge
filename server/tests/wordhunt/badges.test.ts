import { buildBadgeList, getNewBadgeNames, recordFinishedGame } from "../../wordhunt/utils/badges.js";
import { isValidWord } from "../../wordhunt/utils/dictionary.js";

const makeGame = (date: string, score = 0, words: string[] = []): any => ({
  gameId: `g-${date}`,
  board: { date, size: 5, tiles: [] },
  startedAt: 0,
  endsAt: 0,
  endedAt: 1,
  endReason: "timeout",
  score,
  foundWords: words.map((word) => ({ word, points: 0 })),
});

describe("wordhunt badges", () => {
  test("first game earns Amateur Hunter only", () => {
    const stats = recordFinishedGame(undefined, makeGame("2026-01-01", 100));
    expect(getNewBadgeNames(undefined, stats)).toEqual(["Amateur Hunter"]);
  });

  test("score badges use the best single game; the total badge uses lifetime points", () => {
    let stats = recordFinishedGame(undefined, makeGame("2026-01-01", 10_000));
    expect(getNewBadgeNames(undefined, stats)).toEqual(["Amateur Hunter", "5K Scorer", "10K Scorer"]);
    for (let i = 0; i < 9; i++) stats = recordFinishedGame(stats, makeGame("2026-01-01", 10_000));
    expect(buildBadgeList(stats).find((b) => b.slug === "score-100k-total")?.earned).toBe(true);
    expect(buildBadgeList(stats).find((b) => b.slug === "score-15k")?.earned).toBe(false);
  });

  test("streak counts consecutive board days, ignores repeats, and resets after a gap", () => {
    let stats = recordFinishedGame(undefined, makeGame("2026-02-27"));
    stats = recordFinishedGame(stats, makeGame("2026-02-27"));
    expect(stats.streak.current).toBe(1);
    for (const day of ["2026-02-28", "2026-03-01", "2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05"]) {
      stats = recordFinishedGame(stats, makeGame(day));
    }
    expect(stats.streak).toMatchObject({ current: 7, best: 7 });
    expect(buildBadgeList(stats).find((b) => b.slug === "streak-7-day")?.earned).toBe(true);
    stats = recordFinishedGame(stats, makeGame("2026-03-08"));
    expect(stats.streak).toMatchObject({ current: 1, best: 7 });
  });

  test("Topia and long-word badges come from found words, and Topia is a valid word", () => {
    const stats = recordFinishedGame(undefined, makeGame("2026-01-01", 0, ["topia", "cats", "planets"]));
    expect(stats).toMatchObject({ foundTopia: true, foundLongWord: true });
    expect(isValidWord("Topia")).toBe(true);
  });

  test("a badge already in the inventory shows as earned", () => {
    const badges = buildBadgeList(undefined, ["CROWN!"]);
    expect(badges.find((b) => b.slug === "crown")?.earned).toBe(true);
    expect(badges).toHaveLength(12);
  });
});
