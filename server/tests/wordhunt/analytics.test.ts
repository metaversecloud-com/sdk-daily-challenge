import { buildAnalyticsResponse, getFinishedGameIncrements, getRecentDates } from "../../wordhunt/utils/analyticsSummary.js";

describe("wordhunt analytics summary", () => {
  test("lists the requested days newest first, filling days with no games with zeros", () => {
    expect(getRecentDates("2026-03-02", 3)).toEqual(["2026-03-02", "2026-03-01", "2026-02-28"]);

    const { days } = buildAnalyticsResponse({}, "2026-03-02", 3);
    expect(days.map((day) => day.date)).toEqual(["2026-03-02", "2026-03-01", "2026-02-28"]);
    expect(days[0]).toMatchObject({ gamesStarted: 0, completionRate: null, averageWordsFound: null });
  });

  test("works out rates and per-game averages for each day and for the totals", () => {
    const stored = {
      "2026-03-02": { gamesStarted: 10, gamesCompleted: 8, gamesQuit: 2, gamesTimedOut: 6, wordsFound: 100, pointsScored: 40_000, secondsPlayed: 900, wordOfTheDayFound: 2 },
      "2026-03-01": { gamesStarted: 10, gamesCompleted: 2, gamesTimedOut: 2, wordsFound: 20, pointsScored: 6000, secondsPlayed: 240 },
    };
    const { days, totals } = buildAnalyticsResponse(stored, "2026-03-02", 2);

    expect(days[0]).toMatchObject({
      completionRate: 0.8,
      quitRate: 0.25,
      averageWordsFound: 12.5,
      averageScore: 5000,
      averageSecondsPlayed: 113,
      wordOfTheDayFindRate: 0.25,
    });
    expect(totals).toMatchObject({ gamesStarted: 20, gamesCompleted: 10, completionRate: 0.5, averageWordsFound: 12 });
  });

  test("ignores malformed stored values", () => {
    const { days } = buildAnalyticsResponse({ "2026-03-02": { gamesStarted: "oops", wordsFound: 5 } }, "2026-03-02", 1);
    expect(days[0]).toMatchObject({ gamesStarted: 0, wordsFound: 5 });
  });

  test("a finished game only sends the counters it changes", () => {
    expect(
      getFinishedGameIncrements({
        wordsFound: 0,
        score: 0,
        secondsPlayed: 30,
        endReason: "quit",
        longWordsFound: 0,
        foundWordOfTheDay: false,
      }),
    ).toEqual({ gamesCompleted: 1, gamesQuit: 1, secondsPlayed: 30, gamesWithNoWords: 1 });

    expect(
      getFinishedGameIncrements({
        wordsFound: 12,
        score: 6000,
        secondsPlayed: 120,
        endReason: "timeout",
        longWordsFound: 1,
        foundWordOfTheDay: true,
      }),
    ).toEqual({
      gamesCompleted: 1,
      gamesTimedOut: 1,
      wordsFound: 12,
      pointsScored: 6000,
      secondsPlayed: 120,
      longWordsFound: 1,
      wordOfTheDayFound: 1,
    });
  });
});
