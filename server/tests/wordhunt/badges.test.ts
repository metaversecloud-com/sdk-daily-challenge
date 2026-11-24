import { buildBadgeList, getNewBadgeNames, recordFinishedGame, recordFinishedGoldenGame } from "../../wordhunt/utils/badges.js";
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
    expect(badges).toHaveLength(14);
  });

  const goldenGame = (foundWords: string[], goldenBestStreak: number): any => ({
    ...makeGame("2026-01-01", 0, foundWords),
    mode: "golden",
    goldenBestStreak,
    board: { date: "2026-01-01", size: 5, tiles: [], goldenLetter: "t" },
  });

  test("Gold Rush! needs 5 golden words in a row; Midas Touch needs 10 golden words in one game", () => {
    const tenGolden = ["cat", "tab", "bat", "rat", "mat", "hat", "sat", "pat", "fat", "vat", "dog"];
    let stats = recordFinishedGoldenGame(undefined, goldenGame(tenGolden.slice(0, 4), 4));
    expect(getNewBadgeNames(undefined, stats)).toEqual([]);
    expect(buildBadgeList(stats).find((b) => b.slug === "gold-rush")?.progress).toEqual({ current: 4, target: 5 });

    const next = recordFinishedGoldenGame(stats, goldenGame(tenGolden, 5));
    expect(getNewBadgeNames(stats, next)).toEqual(["Gold Rush!", "Midas Touch"]);
    stats = next;
    // Bests never go down.
    expect(recordFinishedGoldenGame(stats, goldenGame(["cat"], 1))).toMatchObject({ goldenBestStreak: 5, goldenMostWords: 10 });
  });

  test("golden games only change the golden bests, never the classic stats", () => {
    const classic = recordFinishedGame(undefined, makeGame("2026-01-01", 5000, ["planets"]));
    const after = recordFinishedGoldenGame(classic, goldenGame(["cat", "tab"], 2));
    expect(after).toEqual({ ...classic, goldenBestStreak: 2, goldenMostWords: 2 });
    // ...and classic games keep the golden bests.
    expect(recordFinishedGame(after, makeGame("2026-01-02", 100))).toMatchObject({ goldenBestStreak: 2, goldenMostWords: 2 });
  });

  test("each badge says which game mode earns it", () => {
    const badges = buildBadgeList(undefined);
    expect(badges.filter((b) => b.mode === "golden").map((b) => b.name)).toEqual(["Gold Rush!", "Midas Touch"]);
    expect(badges.filter((b) => b.mode === "classic")).toHaveLength(12);
  });

  test("the golden badges are in their own group with their own pictures", () => {
    const golden = buildBadgeList(undefined).filter((b) => b.category === "golden");
    expect(golden.map((b) => [b.name, b.image])).toEqual([
      ["Gold Rush!", "/badges/gold-rush.svg"],
      ["Midas Touch", "/badges/midas-touch.svg"],
    ]);
    expect(buildBadgeList(undefined).find((b) => b.slug === "crown")?.image).toBe("/badges/crown.png");
  });
});

