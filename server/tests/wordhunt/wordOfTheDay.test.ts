import { getDefinition, getWordFrequency } from "../../wordhunt/utils/definitions.js";
import { getRevealedWordOfTheDay, getWordOfTheDay, pickWordOfTheDay } from "../../wordhunt/utils/wordOfTheDay.js";
import { findAllWords, getBoardDate, getDailyBoard } from "../../wordhunt/utils/board.js";

const makeGame = (overrides: object = {}): any => ({
  gameId: "g",
  board: { date: getBoardDate(), size: 5, tiles: [] },
  startedAt: 0,
  endsAt: 0,
  endedAt: 1,
  endReason: "timeout",
  score: 0,
  foundWords: [],
  ...overrides,
});

describe("wordhunt definitions", () => {
  test("defines dictionary words and maps inflected forms to their base word", () => {
    expect(getDefinition("greatness")).toMatchObject({ partOfSpeech: "noun", baseWord: null });
    expect(getDefinition("REMATCHES")).toMatchObject({ partOfSpeech: "noun", baseWord: "rematch" });
    expect(getDefinition("fidgeted")).toMatchObject({ partOfSpeech: "verb", baseWord: "fidget" });
    expect(getDefinition("noisiest")).toMatchObject({ partOfSpeech: "adjective", baseWord: "noisy" });
    expect(getDefinition("rematches")?.text).toBe(getDefinition("rematch")?.text);
  });

  test("gives Topia its own definition and returns null for words WordNet doesn't know", () => {
    expect(getDefinition("topia")?.text).toMatch(/virtual world/);
    expect(getDefinition("schriks")).toBeNull();
  });

  test("ranks more common words higher", () => {
    expect(getWordFrequency("cat")).toBeGreaterThan(getWordFrequency("macadam"));
    expect(getWordFrequency("notaword")).toBe(0);
  });
});

describe("pickWordOfTheDay", () => {
  test("picks the longest word even when shorter words are more common", () => {
    expect(pickWordOfTheDay(["cat", "dog", "macadam"])).toMatchObject({ word: "macadam", points: 1200 });
  });

  test("breaks ties by preferring a word with a definition", () => {
    expect(pickWordOfTheDay(["schriks", "camisas", "macadam"])?.word).toBe("macadam");
  });

  test("breaks ties between defined words by how common they are", () => {
    // All 9 letters; "rondelles" has no definition, and "eagerness" is the most common of the rest.
    expect(pickWordOfTheDay(["rondelles", "grandness", "greatness", "eagerness"])?.word).toBe("eagerness");
  });

  test("falls back to alphabetical order, and still picks a word with no definition", () => {
    expect(pickWordOfTheDay(["retinula", "antiweed"])).toMatchObject({ word: "antiweed", definition: null });
    expect(pickWordOfTheDay([])).toBeNull();
  });

  test("today's word of the day can be made on today's board", () => {
    const wordOfTheDay = getWordOfTheDay();
    const words = findAllWords(getDailyBoard().tiles);
    expect(words.has(wordOfTheDay!.word)).toBe(true);
    expect(Math.max(...[...words].map((word) => word.length))).toBe(wordOfTheDay!.word.length);
  });
});

describe("getRevealedWordOfTheDay", () => {
  test("is only revealed once today's game has ended", () => {
    expect(getRevealedWordOfTheDay(makeGame())).toEqual(getWordOfTheDay());
    expect(getRevealedWordOfTheDay(makeGame({ endedAt: null }))).toBeUndefined();
    expect(getRevealedWordOfTheDay(makeGame({ board: { date: "2020-01-01", size: 5, tiles: [] } }))).toBeUndefined();
    expect(getRevealedWordOfTheDay(null)).toBeUndefined();
  });
});
