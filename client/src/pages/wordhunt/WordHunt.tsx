import { useCallback, useContext, useEffect, useRef, useState } from "react";

// components
import { Loading } from "@/components";
import {
  WordHuntBadges,
  WordHuntExitModal,
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
  WordHuntSubmitResult,
  WordHuntSubmitWordResponse,
  WordHuntWordOfTheDay,
} from "@shared/types/wordhunt/WordHuntTypes";

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

const formatTime = (ms: number) => {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
};

export const WordHunt = () => {
  const dispatch = useContext(GlobalDispatchContext);
  const { error, hasInteractiveParams } = useContext(GlobalStateContext);

  const [phase, setPhase] = useState<Phase>("loading");
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
  };

  /** Adds or removes a found word on this device's copy of the game (the score follows the found words). */
  const updateFoundWords = (change: (foundWords: WordHuntGame["foundWords"]) => WordHuntGame["foundWords"]) => {
    const current = gameRef.current;
    if (!current) return;
    const foundWords = change(current.foundWords);
    const next = { ...current, foundWords, score: foundWords.reduce((total, { points }) => total + points, 0) };
    gameRef.current = next;
    setGame(next);
  };

  const showFeedback = (type: "success" | "error", text: string) => setFeedback({ type, text, id: Date.now() });

  useEffect(() => {
    if (!hasInteractiveParams) return;
    backendAPI
      .get("/wordhunt/game-state")
      .then((response) => {
        const data = response.data.data as WordHuntGameStateResponse;
        applyGameState(data);
        const isInProgress = data.game && !data.game.endedAt && data.game.endsAt > data.serverTime;
        // One game per daily board: a player who already finished today's game goes straight to their results.
        setPhase(isInProgress ? "playing" : isFinishedToday(data) ? "results" : "start");
      })
      .catch((error) => {
        setErrorMessage(dispatch, error as ErrorType);
        setPhase("start");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasInteractiveParams]);

  const startGame = async () => {
    setIsStarting(true);
    try {
      const response = await backendAPI.post("/wordhunt/start");
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
      const response = await backendAPI.post("/wordhunt/end", { gameId: gameRef.current.gameId });
      applyGameState(response.data.data);
      setNewBadges((response.data.data as WordHuntGameStateResponse).newBadges ?? []);
    } catch (error) {
      setErrorMessage(dispatch, error as ErrorType);
    }
    setTab("play");
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
    const showSuccess = (points: number) => showFeedback("success", `${word.toUpperCase()} +${points.toLocaleString()} points!`);
    const isOptimistic = !!validWords;
    if (isOptimistic) {
      updateFoundWords((foundWords) => [...foundWords, { word, points: validWords[word] }]);
      showSuccess(validWords[word]);
    }

    const gameId = gameRef.current.gameId;
    const undoWord = () => updateFoundWords((foundWords) => foundWords.filter((found) => found.word !== word));
    const submit = (async () => {
      try {
        const response = await backendAPI.post("/wordhunt/submit-word", { gameId, path });
        const data = response.data.data as WordHuntSubmitWordResponse;
        clockOffsetRef.current = data.serverTime - Date.now();
        if (gameRef.current?.gameId !== gameId) return;

        if (data.result === "valid") {
          if (!isOptimistic) {
            updateFoundWords((foundWords) => [...foundWords, { word: data.word, points: data.points }]);
            showSuccess(data.points);
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

  if (phase === "start" || !board) {
    return (
      <main className="wh-app">
        <WordHuntTabs active={tab} onChange={setTab} />
        <div id="wh-tabpanel" role="tabpanel" aria-labelledby={`wh-tab-${tab}`}>
          {tab === "play" ? <WordHuntStart isStarting={isStarting} onStart={startGame} /> : <WordHuntBadges />}
        </div>
        {errorMessage}
      </main>
    );
  }

  if (phase === "results" && game) {
    return (
      <main className="wh-app">
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
              <WordHuntResults game={game} wordOfTheDay={wordOfTheDay} />
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
    <main className="wh-app">
      <h1 className="sr-only">Word Hunt</h1>
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

      <WordHuntGrid
        tiles={game?.board.tiles ?? board.tiles}
        size={game?.board.size ?? board.size}
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
