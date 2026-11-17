import { getGoldenMultiplier, getMedal, isGoldenWord, scoreGoldenWord } from "../../../shared/wordhunt/golden.js";
import { findAllWords, getDailyBoard, getGoals, pickGoldenLetter } from "../../wordhunt/utils/board.js";

describe("golden letter scoring", () => {
  test("doubles a word with the golden letter once, however many times the letter appears", () => {
    expect(scoreGoldenWord("cat", 200, "t", 0)).toEqual({ points: 400, multiplier: 2, streak: 1 });
    expect(scoreGoldenWord("tot", 200, "t", 0)).toEqual({ points: 400, multiplier: 2, streak: 1 });
    expect(isGoldenWord("CAT", "t")).toBe(true);
  });

  test("adds 0.5x for each golden word in a row, up to 4x", () => {
    expect([1, 2, 3, 4, 5, 9].map(getGoldenMultiplier)).toEqual([2, 2.5, 3, 3.5, 4, 4]);
    expect(scoreGoldenWord("cats", 400, "t", 1)).toEqual({ points: 1000, multiplier: 2.5, streak: 2 });
  });

  test("a word without the golden letter scores normally and resets the streak", () => {
    expect(scoreGoldenWord("cab", 200, "t", 4)).toEqual({ points: 200, multiplier: 1, streak: 0 });
  });

  test("medals follow the goals", () => {
    const goals = { bronze: 2000, silver: 4000, gold: 6000 };
    expect([0, 1999, 2000, 4500, 6000].map((score) => getMedal(score, goals))).toEqual([
      null,
      null,
      "bronze",
      "silver",
      "gold",
    ]);
    expect(getMedal(9999, undefined)).toBeNull();
  });
});

describe("golden boards", () => {
  test("a golden board has its own tiles, a golden letter, and rising goals; classic boards don't change", () => {
    const classic = getDailyBoard("2026-11-17", "classic");
    const golden = getDailyBoard("2026-11-17", "golden");

    expect(golden.tiles).not.toEqual(classic.tiles);
    expect(classic.goldenLetter).toBeUndefined();
    expect(golden.goldenLetter).toMatch(/^[a-z]$/);
    expect(golden.tiles.map((tile) => tile.toLowerCase())).toContain(golden.goldenLetter);
    expect(golden.goals!.bronze).toBeLessThan(golden.goals!.silver);
    expect(golden.goals!.silver).toBeLessThan(golden.goals!.gold);
    // Same board for everyone on the same day.
    expect(getDailyBoard("2026-11-17", "golden")).toEqual(golden);
  });

  test("the golden letter is in 15-35% of the board's words on (almost) every day", () => {
    let inRange = 0;
    for (let day = 1; day <= 20; day++) {
      const date = `2026-11-${String(day).padStart(2, "0")}`;
      const board = getDailyBoard(date, "golden");
      const words = [...findAllWords(board.tiles)];
      const share = words.filter((word) => isGoldenWord(word, board.goldenLetter)).length / words.length;
      expect(share).toBeGreaterThan(0);
      if (share >= 0.15 && share <= 0.35) inRange++;
    }
    expect(inRange).toBeGreaterThanOrEqual(18);
  });

  test("picks a consonant in range over a vowel, never the Qu tile, and otherwise the letter closest to 25%", () => {
    // 8 words: "b" is in 2 (25%), "a" in 2 (25%), "z" in 8 (100%).
    const words = new Set(["zab", "zaz", "zbz", "zzz1", "zzz2", "zzz3", "zzz4", "zzz5"]);
    expect(pickGoldenLetter(["A", "B", "Z", "Qu"], words, "seed")).toBe("b");
    // No letter in range: "a" (25% of these 4 words -> 1/4) wins over "z" (100%).
    expect(pickGoldenLetter(["A", "Z"], new Set(["za", "zz", "zzz", "zzzz"]), "seed")).toBe("a");
  });

  test("goals double the golden words among the easiest ones", () => {
    const words = new Set(["cat", "dog", "bird"]);
    // Easiest first: cat (golden, 2 x 200), dog (200), bird (400) -> all under 8 words, so every goal counts all.
    const goals = getGoals(words, "t");
    expect(goals.bronze).toBe(1000);
    expect(goals.silver).toBeGreaterThan(goals.bronze);
    expect(goals.gold).toBeGreaterThan(goals.silver);
  });
});
