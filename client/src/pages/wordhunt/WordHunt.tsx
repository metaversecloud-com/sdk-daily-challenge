import { useCallback, useContext, useEffect, useRef, useState } from "react";

// components
import { AdminIconButton, Confetti, Loading } from "@/components";
import {
  WordHuntAdminModal,
  WordHuntBadges,
  WordHuntExitModal,
  WordHuntGoldenStatus,
  WordHuntGrid,
  WordHuntResults,
  WordHuntStart,
  WordHuntTab,
  WordHuntTabs,
} from "@/components/wordhunt";

// context
import { GlobalDispatchContext, GlobalStateContext } from "@/context/GlobalContext";
import { ErrorType } from "@/context/types";

// types
import {
  WordHuntBoard,
  WordHuntGame,
  WordHuntGameStateResponse,
  WordHuntMode,
  WordHuntModeStatus,
  WordHuntSubmitResult,
  WordHuntSubmitWordResponse,
  WordHuntWordOfTheDay,
} from "@shared/types/wordhunt/WordHuntTypes";
import { scoreGoldenWord } from "@shared/wordhunt/golden";

// utils
import { backendAPI, setErrorMessage } from "@/utils";

type Phase = "loading" | "start" | "playing" | "ending" | "results";
type Feedback = { type: "success" | "error"; text: string; id: number } | null;

const MIN_WORD_LENGTH = 3;
const TIME_ANNOUNCEMENTS_SECONDS = [60, 30, 10];

const FEEDBACK_MESSAGES: Record<Exclude<WordHuntSubmitResult, "valid">, string> = {
  not_a_word: "Sorry, that is not a valid word.",
  too_short: "Words need at least 3 letters.",
  already_found: "You already found that word.",
  invalid_path: "Letters must touch each other.",
  game_over: "Time's up!",
};

const isFinishedToday = ({ board, game }: WordHuntGameStateResponse) =>
  !!game && !!game.endedAt && game.board.date === board.date;

// Remembers the last mode picked on this device (a convenience only; storage can be unavailable).
const MODE_STORAGE_KEY = "wordhunt-mode";
const loadSavedMode = (): WordHuntMode => {
  try {
    return window.localStorage.getItem(MODE_STORAGE_KEY) === "golden" ? "golden" : "classic";
  } catch {
    return "classic";
  }
};
const saveMode = (mode: WordHuntMode) => {
  try {
    window.localStorage.setItem(MODE_STORAGE_KEY, mode);
  } catch {
    // Ignore: the mode just won't be remembered.
  }
};

const formatTime = (ms: number) => {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
};

export const WordHunt = () => {
  const dispatch = useContext(GlobalDispatchContext);
  const { error, hasInteractiveParams } = useContext(GlobalStateContext);

  const [phase, setPhase] = useState<Phase>("loading");
  const [mode, setMode] = useState<WordHuntMode>(loadSavedMode);
  const [modes, setModes] = useState<Record<WordHuntMode, WordHuntModeStatus> | null>(null);
  const [board, setBoard] = useState<WordHuntBoard | null>(null);
  const [game, setGame] = useState<WordHuntGame | null>(null);
  const [wordOfTheDay, setWordOfTheDay] = useState<WordHuntWordOfTheDay | null>(null);
  const [currentWord, setCurrentWord] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [timeAnnouncement, setTimeAnnouncement] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const [tab, setTab] = useState<WordHuntTab>("play");
  const [newBadges, setNewBadges] = useState<string[]>([]);
  // Confetti plays when a game finishes on this screen, not every time a player reopens today's results.
  const [justFinished, setJustFinished] = useState(false);
  // World admins get testing tools (clear the leaderboard, replay today's board). The server re-checks every action.
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [leaderboardVersion, setLeaderboardVersion] = useState(0);
  const [adminNotice, setAdminNotice] = useState("");
  const adminBarRef = useRef<HTMLDivElement>(null);

  // Difference between the server clock and this device's clock, so the timer matches the server.
  const clockOffsetRef = useRef(0);
  // Words still being saved. Words are sent in parallel; ending the game waits for these first.
  const pendingSubmitsRef = useRef(new Set<Promise<void>>());
  // Today's words and points, so results can be shown before the server answers (the server still checks every word).
  const validWordsRef = useRef<Record<string, number> | null>(null);
  const gameRef = useRef<WordHuntGame | null>(null);
  const isEndingRef = useRef(false);
  const announcedRef = useRef(new Set<number>());

  const applyGameState = (data: WordHuntGameStateResponse) => {
    clockOffsetRef.current = data.serverTime - Date.now();
    gameRef.current = data.game;
    setGame(data.game);
    setBoard(data.board);
    validWordsRef.current = data.validWords ?? null;
    // The server only includes the word of the day once the game has ended.
    if (data.wordOfTheDay) setWordOfTheDay(data.wordOfTheDay);
    if (data.isAdmin !== undefined) setIsAdmin(data.isAdmin);
    if (data.modes) setModes(data.modes);
    if (data.mode) setMode(data.mode);
  };

  const fetchGameState = async (forMode: WordHuntMode) =>
    // The shared game-state route (one for every challenge) with Word Hunt's mode.
    (await backendAPI.get("/game-state", { params: { game: "wordhunt", mode: forMode } })).data.data as WordHuntGameStateResponse;

  /** Admin reset: today's game was deleted, so go back to the start screen as if the player hadn't played. */
  const handlePlayReset = (data: WordHuntGameStateResponse) => {
    applyGameState(data);
    saveMode("classic");
    setWordOfTheDay(null);
    setNewBadges([]);
    setJustFinished(false);
    setFeedback(null);
    setTab("play");
    setPhase("start");
    setLeaderboardVersion((version) => version + 1);
    // The popup belongs to the results screen, so close it and confirm on the start screen instead.
    setShowAdminModal(false);
    setAdminNotice("Your games for today were reset (both modes). Start a new one whenever you're ready.");
  };

  // After a reset the old gear button is gone, so put focus on the start screen's gear.
  useEffect(() => {
    if (adminNotice) adminBarRef.current?.querySelector("button")?.focus();
  }, [adminNotice]);

  /**
   * Adds, removes, or rescores a found word on this device's copy of the game (the score follows the found words).
   * In golden mode the streak can be updated at the same time.
   */
  const updateFoundWords = (
    change: (foundWords: WordHuntGame["foundWords"]) => WordHuntGame["foundWords"],
    goldenStreak?: number,
  ) => {
    const current = gameRef.current;
    if (!current) return;
    const foundWords = change(current.foundWords);
    const next = {
      ...current,
      foundWords,
      score: foundWords.reduce((total, { points }) => total + points, 0),
      ...(goldenStreak !== undefined && { goldenStreak }),
    };
    gameRef.current = next;
    setGame(next);
  };

  const showFeedback = (type: "success" | "error", text: string) => setFeedback({ type, text, id: Date.now() });

  useEffect(() => {
    if (!hasInteractiveParams) return;
    (async () => {
      try {
        let data = await fetchGameState(mode);
        // A game in progress in the other mode (e.g. the drawer was closed mid-game) is resumed first.
        const inProgress = data.modes && (Object.keys(data.modes) as WordHuntMode[]).find((m) => data.modes![m] === "in_progress");
        if (inProgress && inProgress !== data.mode) data = await fetchGameState(inProgress);
        applyGameState(data);

        const isInProgress = data.game && !data.game.endedAt && data.game.endsAt > data.serverTime;
        // One game per mode per day: once both modes are played, go straight to the results; otherwise show the
        // start screen so the player can pick the mode they haven't played yet.
        const allPlayed = data.modes && Object.values(data.modes).every((status) => status === "finished");
        setPhase(isInProgress ? "playing" : allPlayed && isFinishedToday(data) ? "results" : "start");
      } catch (error) {
        setErrorMessage(dispatch, error as ErrorType);
        setPhase("start");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasInteractiveParams]);

  /** Start screen: switch modes and load that mode's board, game, and leaderboard. */
  const handleModeChange = async (nextMode: WordHuntMode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    saveMode(nextMode);
    setWordOfTheDay(null);
    try {
      applyGameState(await fetchGameState(nextMode));
    } catch (error) {
      setErrorMessage(dispatch, error as ErrorType);
    }
  };

  const viewResults = () => {
    setJustFinished(false);
    setTab("play");
    setPhase("results");
  };

  const backToModes = () => {
    setJustFinished(false);
    setNewBadges([]);
    setTab("play");
    setPhase("start");
  };

  const startGame = async () => {
    setIsStarting(true);
    try {
      const response = await backendAPI.post("/wordhunt/start", undefined, { params: { mode } });
      const data = response.data.data as WordHuntGameStateResponse;
      applyGameState(data);
      setTab("play");
      // The server returns today's finished game instead of a new one if the player has already played.
      if (isFinishedToday(data)) {
        setPhase("results");
        return;
      }
      isEndingRef.current = false;
      announcedRef.current = new Set();
      setAdminNotice("");
      setNewBadges([]);
      setFeedback(null);
      setCurrentWord("");
      setTimeAnnouncement("");
      setPhase("playing");
    } catch (error) {
      setErrorMessage(dispatch, error as ErrorType);
    } finally {
      setIsStarting(false);
    }
  };

  const endGame = useCallback(async () => {
    if (isEndingRef.current || !gameRef.current) return;
    isEndingRef.current = true;
    setShowExitModal(false);
    setPhase("ending");

    // Let any words still being saved finish before the game is closed out.
    await Promise.allSettled([...pendingSubmitsRef.current]);
    try {
      const response = await backendAPI.post(
        "/wordhunt/end",
        { gameId: gameRef.current.gameId },
        { params: { mode: gameRef.current.mode ?? "classic" } },
      );
      applyGameState(response.data.data);
      setNewBadges((response.data.data as WordHuntGameStateResponse).newBadges ?? []);
    } catch (error) {
      setErrorMessage(dispatch, error as ErrorType);
    }
    setTab("play");
    setJustFinished(true);
    setPhase("results");
  }, [dispatch]);

  // Countdown timer
  useEffect(() => {
    if (phase !== "playing" || !game) return;

    const tick = () => {
      const remaining = game.endsAt - (Date.now() + clockOffsetRef.current);
      setRemainingMs(remaining);

      const seconds = Math.ceil(remaining / 1000);
      const announcement = TIME_ANNOUNCEMENTS_SECONDS.find(
        (threshold) => seconds <= threshold && !announcedRef.current.has(threshold),
      );
      if (announcement && seconds > 0) {
        TIME_ANNOUNCEMENTS_SECONDS.filter((t) => t >= announcement).forEach((t) => announcedRef.current.add(t));
        setTimeAnnouncement(`${announcement} seconds left`);
      }

      if (remaining <= 0) endGame();
    };

    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [phase, game?.gameId, game?.endsAt, endGame]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePathChange = useCallback(
    (path: number[]) => {
      if (!board) return;
      setCurrentWord(path.map((index) => board.tiles[index]).join(""));
    },
    [board],
  );

  const handleSubmitPath = (path: number[]) => {
    if (!board || !gameRef.current || isEndingRef.current) return;
    const word = path
      .map((index) => board.tiles[index])
      .join("")
      .toLowerCase();
    if (word.length < MIN_WORD_LENGTH) {
      showFeedback("error", FEEDBACK_MESSAGES.too_short);
      return;
    }
    if (gameRef.current.foundWords.some((found) => found.word === word)) {
      showFeedback("error", FEEDBACK_MESSAGES.already_found);
      return;
    }

    // With today's word list, the result is shown right away; otherwise it waits for the server.
    const validWords = validWordsRef.current;
    if (validWords && !(word in validWords)) {
      showFeedback("error", FEEDBACK_MESSAGES.not_a_word);
      return;
    }
    const currentGame = gameRef.current;
    const gameMode = currentGame.mode ?? "classic";
    const showSuccess = (points: number, multiplier = 1) =>
      showFeedback(
        "success",
        multiplier > 1
          ? `★ GOLDEN! ${word.toUpperCase()} ×${multiplier} +${points.toLocaleString()} points!`
          : `${word.toUpperCase()} +${points.toLocaleString()} points!`,
      );
    const isOptimistic = !!validWords;
    const previousStreak = currentGame.goldenStreak ?? 0;
    let optimisticPoints = 0;
    if (isOptimistic) {
      if (gameMode === "golden") {
        // Same shared rules the server uses, so this almost always matches its answer.
        const scored = scoreGoldenWord(word, validWords[word], currentGame.board.goldenLetter, previousStreak);
        optimisticPoints = scored.points;
        updateFoundWords((foundWords) => [...foundWords, { word, points: scored.points }], scored.streak);
        showSuccess(scored.points, scored.multiplier);
      } else {
        optimisticPoints = validWords[word];
        updateFoundWords((foundWords) => [...foundWords, { word, points: optimisticPoints }]);
        showSuccess(optimisticPoints);
      }
    }

    const gameId = currentGame.gameId;
    const undoWord = () =>
      updateFoundWords(
        (foundWords) => foundWords.filter((found) => found.word !== word),
        gameMode === "golden" ? previousStreak : undefined,
      );
    const submit = (async () => {
      try {
        const response = await backendAPI.post("/wordhunt/submit-word", { gameId, path }, { params: { mode: gameMode } });
        const data = response.data.data as WordHuntSubmitWordResponse;
        clockOffsetRef.current = data.serverTime - Date.now();
        if (gameRef.current?.gameId !== gameId) return;

        if (data.result === "valid") {
          if (!isOptimistic) {
            updateFoundWords((foundWords) => [...foundWords, { word: data.word, points: data.points }], data.goldenStreak);
            showSuccess(data.points, data.multiplier);
          } else if (data.points !== optimisticPoints) {
            // Rare (e.g. words sent so fast the server saw them in a different order): use the server's points.
            updateFoundWords(
              (foundWords) => foundWords.map((found) => (found.word === word ? { ...found, points: data.points } : found)),
              data.goldenStreak,
            );
          }
        } else if (data.result !== "already_found" || !isOptimistic) {
          // The server disagreed (rare): take the word back and say why.
          if (isOptimistic) undoWord();
          showFeedback("error", FEEDBACK_MESSAGES[data.result]);
          if (data.result === "game_over") endGame();
        }
      } catch (error) {
        if (isOptimistic) {
          undoWord();
          showFeedback("error", `Couldn't save ${word.toUpperCase()}. Try it again.`);
        }
        setErrorMessage(dispatch, error as ErrorType);
      }
    })();
    pendingSubmitsRef.current.add(submit);
    submit.finally(() => pendingSubmitsRef.current.delete(submit));
  };

  if (phase === "loading") return <Loading />;

  const errorMessage = error && <p className="p3 mt-4 text-center wh-feedback--error">{error}</p>;

  // Only shown between games, so an admin can't reset a game they're in the middle of.
  const adminTools = isAdmin && (
    <>
      <div className="wh-admin-bar" ref={adminBarRef}>
        <AdminIconButton setShowSettings={() => setShowAdminModal(true)} showSettings={false} />
      </div>
      {adminNotice && (
        <p className="wh-panel p3 mb-4" role="status">
          {adminNotice}
        </p>
      )}
      {showAdminModal && (
        <WordHuntAdminModal
          onClose={() => setShowAdminModal(false)}
          onLeaderboardCleared={() => setLeaderboardVersion((version) => version + 1)}
          onPlayReset={handlePlayReset}
        />
      )}
    </>
  );

  // Golden mode gets its own warm gold look (see wordhunt.css).
  const appClass = `wh-app ${mode === "golden" ? "wh-app--golden" : ""}`;

  if (phase === "start" || !board) {
    return (
      <main className={appClass}>
        {adminTools}
        <WordHuntTabs active={tab} onChange={setTab} />
        <div id="wh-tabpanel" role="tabpanel" aria-labelledby={`wh-tab-${tab}`}>
          {tab === "play" ? (
            <WordHuntStart
              mode={mode}
              onModeChange={handleModeChange}
              board={board}
              modes={modes}
              isStarting={isStarting}
              onStart={startGame}
              onViewResults={viewResults}
              leaderboardRefreshKey={String(leaderboardVersion)}
            />
          ) : (
            <WordHuntBadges />
          )}
        </div>
        {errorMessage}
      </main>
    );
  }

  if (phase === "results" && game) {
    return (
      <main className={`${appClass} relative`}>
        {justFinished && <Confetti />}
        {adminTools}
        <WordHuntTabs active={tab} onChange={setTab} playLabel="Results" />
        <div id="wh-tabpanel" role="tabpanel" aria-labelledby={`wh-tab-${tab}`}>
          {tab === "play" ? (
            <>
              {newBadges.length > 0 && (
                <div className="wh-panel mb-4" role="status">
                  <h2 className="h4">
                    {newBadges.length === 1 ? "New badge earned!" : `${newBadges.length} new badges earned!`}
                  </h2>
                  <ul className="wh-new-badges p2">
                    {newBadges.map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                  </ul>
                  <button type="button" className="btn wh-btn wh-btn--outline mt-2" onClick={() => setTab("badges")}>
                    See my badges
                  </button>
                </div>
              )}
              <WordHuntResults
                game={game}
                wordOfTheDay={wordOfTheDay}
                leaderboardRefreshKey={String(leaderboardVersion)}
                onBackToModes={backToModes}
              />
            </>
          ) : (
            <WordHuntBadges refreshKey={game.gameId} />
          )}
        </div>
        {errorMessage}
      </main>
    );
  }

  const isLowTime = remainingMs <= 10_000;

  return (
    <main className={appClass}>
      <h1 className="sr-only">{game?.mode === "golden" ? "Word Hunt: Golden Letter" : "Word Hunt"}</h1>
      <div className="wh-header">
        <button
          type="button"
          className="btn wh-btn wh-btn--outline wh-btn--small"
          onClick={() => setShowExitModal(true)}
          disabled={phase !== "playing"}
        >
          Exit
        </button>
        <p className={`wh-timer ${isLowTime ? "wh-timer--low" : ""}`} role="timer" aria-label="Time remaining">
          {formatTime(remainingMs)}
        </p>
      </div>
      <p className="sr-only" role="status">
        {timeAnnouncement}
      </p>

      <div className="wh-panel wh-score">
        <span>Total Points:</span>
        <span className="wh-score-value">{String(game?.score ?? 0).padStart(4, "0")}</span>
      </div>

      {game?.mode === "golden" && <WordHuntGoldenStatus game={game} />}

      <WordHuntGrid
        tiles={game?.board.tiles ?? board.tiles}
        size={game?.board.size ?? board.size}
        goldenLetter={game?.board.goldenLetter}
        disabled={phase !== "playing"}
        onPathChange={handlePathChange}
        onSubmitPath={handleSubmitPath}
        onHint={(message) => showFeedback("error", message)}
      />

      <div className="wh-panel wh-word" aria-live="off">
        {currentWord ? (
          <p className="wh-word-text">{currentWord.toUpperCase()}</p>
        ) : (
          <p className="wh-word-hint">{phase === "ending" ? "Adding up your points…" : "Connect letters to make a word"}</p>
        )}
      </div>

      <p className={`wh-feedback ${feedback ? `wh-feedback--${feedback.type}` : ""}`} role="status">
        {feedback && (
          <span key={feedback.id} className={`inline-block ${feedback.type === "success" ? "wh-pop" : ""}`}>
            <span aria-hidden="true">{feedback.type === "success" ? "✓ " : "✗ "}</span>
            {feedback.text}
          </span>
        )}
      </p>
      {errorMessage}

      {showExitModal && <WordHuntExitModal onConfirm={endGame} onClose={() => setShowExitModal(false)} />}
    </main>
  );
};

export default WordHunt;
