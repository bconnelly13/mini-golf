import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase";

type Screen = "home" | "newGame" | "existingGames" | "game";

type Player = {
  id: string;
  name: string;
  sortOrder: number;
};

type GameRecord = {
  id: string;
  name: string;
  playedAt: string;
  numHoles: 9 | 18;
  location: string;
  players: Player[];
  scores: Record<string, Record<number, number | null>>;
  spinnerResults: Record<
    string,
    Record<number, { label: string; description: string | null }>
  >;
  spinnerDefault: string;
};

type GameLayout = "playersRows" | "holesRows";

type ModalState =
  | { type: "score"; playerId: string; holeNumber: number }
  | { type: "spinner"; playerId: string; holeNumber: number }
  | {
      type: "details";
      playerId: string;
      holeNumber: number;
      label: string;
      description: string | null;
    }
  | null;

type GameRow = {
  id: string;
  name: string;
  played_at: string;
  num_holes: number;
  location: string | null;
  spinner_default: string;
};

type PlayerRow = {
  id: string;
  game_id: string;
  name: string;
  sort_order: number;
};

type ScoreRow = {
  game_id: string;
  player_id: string;
  hole_number: number;
  strokes: number;
};

type SpinnerRow = {
  game_id: string;
  player_id: string;
  hole_number: number;
  result_label: string;
  result_description: string | null;
};

const normalizeGames = (
  gameRows: GameRow[],
  playerRows: PlayerRow[],
  scoreRows: ScoreRow[],
  spinnerRows: SpinnerRow[],
): GameRecord[] =>
  gameRows.map((game) => {
    const players = playerRows
      .filter((player) => player.game_id === game.id)
      .sort((left, right) => left.sort_order - right.sort_order)
      .map((player) => ({
        id: player.id,
        name: player.name,
        sortOrder: player.sort_order,
      }));

    const scores = players.reduce<
      Record<string, Record<number, number | null>>
    >((accumulator, player) => {
      accumulator[player.id] = {};
      return accumulator;
    }, {});

    const spinnerResults = players.reduce<
      Record<
        string,
        Record<number, { label: string; description: string | null }>
      >
    >((accumulator, player) => {
      accumulator[player.id] = {};
      return accumulator;
    }, {});

    scoreRows
      .filter((score) => score.game_id === game.id)
      .forEach((score) => {
        if (scores[score.player_id]) {
          scores[score.player_id][score.hole_number] = score.strokes;
        }
      });

    spinnerRows
      .filter((result) => result.game_id === game.id)
      .forEach((result) => {
        if (spinnerResults[result.player_id]) {
          spinnerResults[result.player_id][result.hole_number] = {
            label: result.result_label,
            description: result.result_description,
          };
        }
      });

    return {
      id: game.id,
      name: game.name,
      playedAt: game.played_at,
      numHoles: game.num_holes as 9 | 18,
      location: game.location ?? "",
      players,
      scores,
      spinnerResults,
      spinnerDefault: game.spinner_default || "preset",
    };
  });

const loadGamesFromSupabase = async (
  setGames: (games: GameRecord[]) => void,
  setSelectedGameId: (
    updater: ((current: string | null) => string | null) | string | null,
  ) => void,
  setIsLoading: (value: boolean) => void,
  setStatusMessage: (value: string | null) => void,
) => {
  if (!supabase) {
    setStatusMessage("Supabase is not configured for this app.");
    setIsLoading(false);
    return;
  }

  setIsLoading(true);
  setStatusMessage(null);

  const [gamesResponse, playersResponse, scoresResponse, spinnerResponse] =
    await Promise.all([
      supabase
        .from("games")
        .select("id,name,played_at,num_holes,location,spinner_default")
        .order("played_at", { ascending: false }),
      supabase
        .from("players")
        .select("id,game_id,name,sort_order")
        .order("sort_order", { ascending: true }),
      supabase.from("scores").select("game_id,player_id,hole_number,strokes"),
      supabase
        .from("spinner_results")
        .select("game_id,player_id,hole_number,result_label,result_description"),
    ]);

  if (
    gamesResponse.error ||
    playersResponse.error ||
    scoresResponse.error ||
    spinnerResponse.error
  ) {
    setStatusMessage("Unable to load games from the database right now.");
    setIsLoading(false);
    return;
  }

  const nextGames = normalizeGames(
    (gamesResponse.data as GameRow[]) ?? [],
    (playersResponse.data as PlayerRow[]) ?? [],
    (scoresResponse.data as ScoreRow[]) ?? [],
    (spinnerResponse.data as SpinnerRow[]) ?? [],
  );

  setGames(nextGames);
  setSelectedGameId((current) => current ?? nextGames[0]?.id ?? null);
  setIsLoading(false);
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));

const formatHoleLabel = (holeNumber: number) => `Hole ${holeNumber}`;

function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [games, setGames] = useState<GameRecord[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [modalState, setModalState] = useState<ModalState>(null);
  const [spinRotation, setSpinRotation] = useState(0);
  const [spinInProgress, setSpinInProgress] = useState(false);
  const [newGameName, setNewGameName] = useState("");
  const [numPlayers, setNumPlayers] = useState(4);
  const [numHoles, setNumHoles] = useState<9 | 18>(9);
  const [location, setLocation] = useState("");
  const [spinnerDefault, setSpinnerDefault] = useState<"preset" | "random">("preset");
  const [playerNames, setPlayerNames] = useState<string[]>(["", "", "", ""]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [gameLayout, setGameLayout] = useState<GameLayout>("holesRows");

  const [selectedMode, setSelectedMode] = useState<"preset" | "random">("preset");
  const [spinnerOptions, setSpinnerOptions] = useState<{ label: string; description: string | null }[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);

  useEffect(() => {
    void loadGamesFromSupabase(
      setGames,
      setSelectedGameId,
      setIsLoading,
      setStatusMessage,
    );
  }, []);

  const activeGame = useMemo(
    () => games.find((game) => game.id === selectedGameId) ?? null,
    [games, selectedGameId],
  );

  // Sync selectedMode with activeGame.spinnerDefault when spinner modal opens
  useEffect(() => {
    if (modalState?.type === "spinner" && activeGame) {
      setSelectedMode((activeGame.spinnerDefault as "preset" | "random") || "preset");
    }
  }, [modalState?.type, activeGame?.spinnerDefault]);

  // Fetch options dynamically from Supabase
  useEffect(() => {
    if (modalState?.type !== "spinner" || !activeGame) {
      return;
    }

    const fetchOptions = async () => {
      if (!supabase) return;
      setOptionsLoading(true);
      try {
        if (selectedMode === "preset") {
          const optionNum = modalState.holeNumber % 9;
          const { data, error } = await supabase.rpc("get_option", { option_num: optionNum });
          if (error) {
            console.error("Error fetching preset option:", error);
          } else if (data) {
            setSpinnerOptions(data as { label: string; description: string | null }[]);
          }
        } else {
          const { data, error } = await supabase.rpc("get_random", { n: 6 });
          if (error) {
            console.error("Error fetching random options:", error);
          } else if (data) {
            setSpinnerOptions(data as { label: string; description: string | null }[]);
          }
        }
      } catch (err) {
        console.error("Exception fetching options:", err);
      } finally {
        setOptionsLoading(false);
      }
    };

    void fetchOptions();
  }, [modalState?.type, modalState?.holeNumber, selectedMode, activeGame?.id]);

  const updateGame = (
    gameId: string,
    updater: (game: GameRecord) => GameRecord,
  ) => {
    setGames((currentGames) =>
      currentGames.map((game) => (game.id === gameId ? updater(game) : game)),
    );
  };

  const goHome = () => {
    setScreen("home");
    setModalState(null);
  };

  const handleCreateGame = async () => {
    if (!supabase) {
      window.alert("Supabase is not configured.");
      return;
    }

    const trimmedNames = playerNames
      .slice(0, numPlayers)
      .map((name) => name.trim())
      .filter(Boolean);

    if (!newGameName.trim()) {
      window.alert("Please name your game.");
      return;
    }

    if (trimmedNames.length < 2) {
      window.alert("Please add at least two player names.");
      return;
    }

    const players = trimmedNames.map((name, index) => ({
      name,
      sortOrder: index + 1,
    }));

    const { data: gameData, error: gameError } = await supabase
      .from("games")
      .insert({
        name: newGameName.trim(),
        num_holes: numHoles,
        location: location.trim() || null,
        spinner_default: spinnerDefault,
      })
      .select("id, spinner_default")
      .single();

    if (gameError || !gameData) {
      window.alert("Unable to create the game in the database.");
      return;
    }

    const { data: insertedPlayers, error: playersError } = await supabase
      .from("players")
      .insert(
        players.map((player) => ({
          game_id: gameData.id,
          name: player.name,
          sort_order: player.sortOrder,
        })),
      )
      .select();

    if (playersError) {
      window.alert(
        "The game was created, but the player list could not be stored.",
      );
      return;
    }

    const newGame: GameRecord = {
      id: gameData.id,
      name: newGameName.trim(),
      playedAt: new Date().toISOString(),
      numHoles,
      location: location.trim(),
      players: (insertedPlayers ?? []).map((player) => ({
        id: player.id as string,
        name: player.name as string,
        sortOrder: player.sort_order as number,
      })),
      scores: Object.fromEntries(
        (insertedPlayers ?? []).map((player) => [player.id, {}]),
      ) as Record<string, Record<number, number | null>>,
      spinnerResults: Object.fromEntries(
        (insertedPlayers ?? []).map((player) => [player.id, {}]),
      ) as Record<
        string,
        Record<number, { label: string; description: string | null }>
      >,
      spinnerDefault: gameData.spinner_default || "preset",
    };

    const nextGames = [newGame, ...games];
    setGames(nextGames);
    setSelectedGameId(newGame.id);
    setScreen("game");
    setNewGameName("");
    setNumPlayers(4);
    setNumHoles(9);
    setLocation("");
    setPlayerNames(["", "", "", ""]);
  };

  const handleDeleteGame = async (gameId: string) => {
    if (!supabase) {
      window.alert("Supabase is not configured.");
      return;
    }

    if (!window.confirm("Delete this game?")) {
      return;
    }

    const { error } = await supabase.from("games").delete().eq("id", gameId);

    if (error) {
      window.alert("Unable to delete the game from the database.");
      return;
    }

    const nextGames = games.filter((game) => game.id !== gameId);
    setGames(nextGames);
    if (selectedGameId === gameId) {
      setSelectedGameId(nextGames[0]?.id ?? null);
    }
  };

  const handleScoreSelect = async (
    playerId: string,
    holeNumber: number,
    value: number,
  ) => {
    if (!activeGame || !supabase) {
      return;
    }

    updateGame(activeGame.id, (game) => ({
      ...game,
      scores: {
        ...game.scores,
        [playerId]: {
          ...game.scores[playerId],
          [holeNumber]: value,
        },
      },
    }));

    const { error } = await supabase.from("scores").upsert(
      {
        game_id: activeGame.id,
        player_id: playerId,
        hole_number: holeNumber,
        strokes: value,
      },
      { onConflict: "player_id,hole_number" },
    );

    if (error) {
      window.alert("The score could not be saved.");
      return;
    }

    setModalState(null);
  };

  const handleSpinnerSelect = async (
    playerId: string,
    holeNumber: number,
    label: string,
    description: string | null = null,
  ) => {
    if (!activeGame || !supabase) {
      return;
    }

    updateGame(activeGame.id, (game) => ({
      ...game,
      spinnerResults: {
        ...game.spinnerResults,
        [playerId]: {
          ...game.spinnerResults[playerId],
          [holeNumber]: { label, description },
        },
      },
    }));

    const { error } = await supabase.from("spinner_results").upsert(
      {
        game_id: activeGame.id,
        player_id: playerId,
        hole_number: holeNumber,
        result_label: label,
        result_description: description,
      },
      { onConflict: "player_id,hole_number" },
    );

    if (error) {
      window.alert("The spinner result could not be saved.");
      return;
    }

    setModalState(null);
  };

  const triggerSpin = (playerId: string, holeNumber: number) => {
    if (!activeGame || spinnerOptions.length === 0) {
      return;
    }

    setSpinInProgress(true);
    const winnerOption = spinnerOptions[Math.floor(Math.random() * spinnerOptions.length)];
    setSpinRotation(
      (current) => current + 360 * 5 + Math.round(Math.random() * 360),
    );

    window.setTimeout(() => {
      void handleSpinnerSelect(playerId, holeNumber, winnerOption.label, winnerOption.description);
      setSpinInProgress(false);
    }, 2200);
  };

  const renderHomeScreen = () => (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-8 sm:px-6">
      <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-2xl shadow-slate-950/50 backdrop-blur">
        <div className="mb-6 text-center">
          <p className="text-sm uppercase tracking-[0.35em] text-emerald-300">
            Mini Golf Spinner
          </p>
          <h1 className="mt-3 text-4xl font-semibold text-white">
            Track every hole, keep the fun rolling.
          </h1>
          <p className="mt-3 text-sm text-slate-300">
            Create a game, keep your scorecard handy, and spin a challenge for
            each player-hole pair.
          </p>
        </div>

        <div className="grid gap-3">
          <button
            onClick={() => setScreen("newGame")}
            className="rounded-2xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-4 text-left text-lg font-semibold text-emerald-200 transition hover:bg-emerald-500/25"
          >
            New Game
          </button>
          <button
            onClick={() => setScreen("existingGames")}
            className="rounded-2xl border border-slate-700 bg-slate-800/70 px-4 py-4 text-left text-lg font-semibold text-slate-200 transition hover:bg-slate-700"
          >
            Existing Games
          </button>
        </div>
      </div>
    </div>
  );

  const renderNewGameScreen = () => (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-6 sm:px-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.35em] text-emerald-300">
            Setup
          </p>
          <h2 className="text-2xl font-semibold text-white">
            Start a new round
          </h2>
        </div>
        <button
          onClick={goHome}
          className="rounded-full border border-slate-700 px-3 py-2 text-sm text-slate-300"
        >
          Back
        </button>
      </div>

      <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-4 shadow-2xl shadow-slate-950/50">
        <label className="mb-3 block">
          <span className="mb-2 block text-sm font-medium text-slate-300">
            Game name
          </span>
          <input
            value={newGameName}
            onChange={(event) => setNewGameName(event.target.value)}
            placeholder="Saturday morning round"
            className="w-full rounded-2xl border border-slate-700 bg-slate-950/70 px-3 py-3 text-white outline-none ring-0"
          />
        </label>

        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <label>
            <span className="mb-2 block text-sm font-medium text-slate-300">
              Players
            </span>
            <select
              value={numPlayers}
              onChange={(event) => {
                const nextValue = Number(event.target.value);
                setNumPlayers(nextValue);
                setPlayerNames((current) => [
                  ...current.slice(0, nextValue),
                  ...Array(Math.max(0, nextValue - current.length)).fill(""),
                ]);
              }}
              className="w-full rounded-2xl border border-slate-700 bg-slate-950/70 px-3 py-3 text-white"
            >
              {[2, 3, 4, 5, 6, 7, 8].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="mb-2 block text-sm font-medium text-slate-300">
              Holes
            </span>
            <select
              value={numHoles}
              onChange={(event) =>
                setNumHoles(Number(event.target.value) as 9 | 18)
              }
              className="w-full rounded-2xl border border-slate-700 bg-slate-950/70 px-3 py-3 text-white"
            >
              <option value={9}>9 holes</option>
              <option value={18}>18 holes</option>
            </select>
          </label>
        </div>

        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <label>
            <span className="mb-2 block text-sm font-medium text-slate-300">
              Location
            </span>
            <input
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="White Oaks"
              className="w-full rounded-2xl border border-slate-700 bg-slate-950/70 px-3 py-3 text-white"
            />
          </label>

          <div>
            <span className="mb-2 block text-sm font-medium text-slate-300">
              Default Spinner Mode
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSpinnerDefault("preset")}
                className={`rounded-2xl py-3 px-3 text-sm font-semibold border transition ${
                  spinnerDefault === "preset"
                    ? "bg-emerald-500/20 text-emerald-200 border-emerald-500"
                    : "bg-slate-950/70 text-slate-400 border-slate-700 hover:text-white"
                }`}
              >
                Preset
              </button>
              <button
                type="button"
                onClick={() => setSpinnerDefault("random")}
                className={`rounded-2xl py-3 px-3 text-sm font-semibold border transition ${
                  spinnerDefault === "random"
                    ? "bg-emerald-500/20 text-emerald-200 border-emerald-500"
                    : "bg-slate-950/70 text-slate-400 border-slate-700 hover:text-white"
                }`}
              >
                Random
              </button>
            </div>
          </div>
        </div>

        <div className="mb-4">
          <p className="mb-2 text-sm font-medium text-slate-300">
            Player names
          </p>
          <div className="grid gap-2">
            {Array.from({ length: numPlayers }).map((_, index) => (
              <input
                key={index}
                value={playerNames[index] ?? ""}
                onChange={(event) => {
                  const next = [...playerNames];
                  next[index] = event.target.value;
                  setPlayerNames(next);
                }}
                placeholder={`Player ${index + 1}`}
                className="w-full rounded-2xl border border-slate-700 bg-slate-950/70 px-3 py-3 text-white"
              />
            ))}
          </div>
        </div>

        <button
          onClick={handleCreateGame}
          className="w-full rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400"
        >
          Continue
        </button>
      </div>
    </div>
  );

  const renderExistingGamesScreen = () => (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-6 sm:px-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.35em] text-emerald-300">
            Past rounds
          </p>
          <h2 className="text-2xl font-semibold text-white">
            Open an existing game
          </h2>
        </div>
        <button
          onClick={goHome}
          className="rounded-full border border-slate-700 px-3 py-2 text-sm text-slate-300"
        >
          Back
        </button>
      </div>

      <div className="space-y-3">
        {statusMessage ? (
          <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            {statusMessage}
          </div>
        ) : null}
        {isLoading ? (
          <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 text-center text-slate-400">
            Loading games from Supabase…
          </div>
        ) : games.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-900/60 p-6 text-center text-slate-400">
            No games yet. Create one to get started.
          </div>
        ) : (
          games.map((game) => (
            <div
              key={game.id}
              className="flex items-center justify-between rounded-3xl border border-white/10 bg-slate-900/80 p-4"
            >
              <button
                onClick={() => {
                  setSelectedGameId(game.id);
                  setScreen("game");
                }}
                className="flex-1 text-left"
              >
                <p className="font-semibold text-white">{game.name}</p>
                <p className="text-sm text-slate-400">
                  {formatDate(game.playedAt)} · {game.players.length} players ·{" "}
                  {game.numHoles} holes
                </p>
              </button>
              <button
                onClick={() => handleDeleteGame(game.id)}
                className="rounded-full border border-rose-400/30 px-3 py-2 text-sm text-rose-200"
              >
                Delete
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const renderGameScreen = () => {
    if (!activeGame) {
      return null;
    }

    const holeNumbers = Array.from(
      { length: activeGame.numHoles },
      (_, index) => index + 1,
    );
    const totals = activeGame.players.reduce<Record<string, number>>(
      (accumulator, player) => {
        const playerScore = Object.values(
          activeGame.scores[player.id] ?? {},
        ).reduce<number>((sum, value) => sum + (value ?? 0), 0);
        accumulator[player.id] = playerScore;
        return accumulator;
      },
      {},
    );

    return (
      <div className="min-h-screen bg-slate-950/95 px-2 py-3 sm:px-4">
        <div className="mx-auto max-w-6xl rounded-3xl border border-white/10 bg-slate-900/90 p-3 shadow-2xl shadow-slate-950/40 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm uppercase tracking-[0.35em] text-emerald-300">
                Game card
              </p>
              <h2 className="text-2xl font-semibold text-white">
                {activeGame.name}
              </h2>
              <p className="text-sm text-slate-400">
                {activeGame.location || "No location"}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  setGameLayout((current) =>
                    current === "playersRows" ? "holesRows" : "playersRows",
                  )
                }
                className="rounded-full border border-emerald-400/35 bg-emerald-500/15 px-3 py-2 text-sm font-medium text-emerald-200"
              >
                Layout:{" "}
                {gameLayout === "playersRows"
                  ? "Players as rows"
                  : "Players as columns"}
              </button>
              <button
                onClick={goHome}
                className="rounded-full border border-slate-700 px-3 py-2 text-sm text-slate-300"
              >
                Home
              </button>
              <button
                onClick={() => setScreen("existingGames")}
                className="rounded-full border border-slate-700 px-3 py-2 text-sm text-slate-300"
              >
                Games
              </button>
            </div>
          </div>

          <div className="overflow-x-auto pb-2">
            {gameLayout === "playersRows" ? (
              <div className="min-w-[640px] rounded-2xl border border-slate-800 bg-slate-950/70 p-2">
                <div
                  className="grid gap-2"
                  style={{
                    gridTemplateColumns: `85px repeat(${activeGame.numHoles}, minmax(92px, 1fr)) 94px`,
                  }}
                >
                  <div className="sticky left-0 z-30 rounded-xl bg-slate-900/95 px-2 py-3 text-sm font-semibold text-slate-300">
                    Player
                  </div>
                  {holeNumbers.map((holeNumber) => (
                    <div
                      key={holeNumber}
                      className="rounded-xl bg-slate-900/95 px-2 py-3 text-center text-sm font-semibold text-slate-300"
                    >
                      {formatHoleLabel(holeNumber)}
                    </div>
                  ))}
                  <div className="sticky right-0 z-30 rounded-xl bg-slate-900/95 px-3 py-3 text-center text-sm font-semibold text-emerald-200">
                    Total
                  </div>

                  {activeGame.players.map((player) => (
                    <Fragment key={`row-${player.id}`}>
                      <div
                        key={`${player.id}-name`}
                        className="sticky left-0 z-20 rounded-xl border border-slate-800 bg-slate-900/90 px-2 py-3 text-xs font-semibold text-white"
                      >
                        {player.name}
                      </div>
                      {holeNumbers.map((holeNumber) => {
                        const spinnerValue =
                          activeGame.spinnerResults[player.id]?.[holeNumber];
                        const spinnerLabel = spinnerValue ? spinnerValue.label : "";
                        const scoreValue =
                          activeGame.scores[player.id]?.[holeNumber];
                        return (
                          <div
                            key={`${player.id}-${holeNumber}`}
                            className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/70"
                          >
                            <button
                              onClick={() => {
                                if (spinnerValue) {
                                  setModalState({
                                    type: "details",
                                    playerId: player.id,
                                    holeNumber,
                                    label: spinnerValue.label,
                                    description: spinnerValue.description,
                                  });
                                } else {
                                  setModalState({
                                    type: "spinner",
                                    playerId: player.id,
                                    holeNumber,
                                  });
                                }
                              }}
                              className="flex-1 rounded-t-xl px-2 py-2 text-left text-xs text-slate-200 hover:bg-slate-800"
                            >
                              {spinnerLabel ? (
                                <span className="font-semibold text-emerald-300">
                                  {spinnerLabel}
                                </span>
                              ) : (
                                <span className="text-slate-500">🎰 Spin</span>
                              )}
                            </button>
                            <button
                              onClick={() =>
                                setModalState({
                                  type: "score",
                                  playerId: player.id,
                                  holeNumber,
                                })
                              }
                              className="flex-1 rounded-b-xl border-t border-slate-800 px-2 py-2 text-left text-sm font-semibold text-emerald-200 hover:bg-slate-800"
                            >
                              {scoreValue === null || scoreValue === undefined
                                ? "—"
                                : scoreValue}
                            </button>
                          </div>
                        );
                      })}
                      <div
                        key={`${player.id}-total`}
                        className="sticky right-0 z-20 rounded-xl border border-slate-800 bg-slate-900/95 px-3 py-3 text-center text-sm font-semibold text-emerald-200"
                      >
                        {totals[player.id] ?? 0}
                      </div>
                    </Fragment>
                  ))}
                </div>
              </div>
            ) : (
              <div className="min-w-[640px] rounded-2xl border border-slate-800 bg-slate-950/70 p-2">
                <div
                  className="grid gap-2"
                  style={{
                    gridTemplateColumns: `85px repeat(${activeGame.players.length}, minmax(92px, 1fr))`,
                  }}
                >
                  <div className="sticky left-0 z-30 rounded-xl bg-slate-900/95 px-2 py-3 text-sm font-semibold text-slate-300">
                    Hole
                  </div>
                  {activeGame.players.map((player) => (
                    <div
                      key={`${player.id}-header`}
                      className="rounded-xl bg-slate-900/95 px-2 py-3 text-center text-xs font-semibold text-white"
                    >
                      {player.name}
                    </div>
                  ))}

                  {holeNumbers.map((holeNumber) => (
                    <Fragment key={`hole-row-${holeNumber}`}>
                      <div
                        key={`hole-${holeNumber}`}
                        className="sticky left-0 z-20 rounded-xl border border-slate-800 bg-slate-900/90 px-2 py-3 text-sm font-semibold text-slate-300"
                      >
                        {formatHoleLabel(holeNumber)}
                      </div>
                      {activeGame.players.map((player) => {
                        const spinnerValue =
                          activeGame.spinnerResults[player.id]?.[holeNumber];
                        const spinnerLabel = spinnerValue ? spinnerValue.label : "";
                        const scoreValue =
                          activeGame.scores[player.id]?.[holeNumber];
                        return (
                          <div
                            key={`${holeNumber}-${player.id}`}
                            className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/70"
                          >
                            <button
                              onClick={() => {
                                if (spinnerValue) {
                                  setModalState({
                                    type: "details",
                                    playerId: player.id,
                                    holeNumber,
                                    label: spinnerValue.label,
                                    description: spinnerValue.description,
                                  });
                                } else {
                                  setModalState({
                                    type: "spinner",
                                    playerId: player.id,
                                    holeNumber,
                                  });
                                }
                              }}
                              className="flex-1 rounded-t-xl px-2 py-2 text-left text-xs text-slate-200 hover:bg-slate-800"
                            >
                              {spinnerLabel ? (
                                <span className="font-semibold text-emerald-300">
                                  {spinnerLabel}
                                </span>
                              ) : (
                                <span className="text-slate-500">🎰 Spin</span>
                              )}
                            </button>
                            <button
                              onClick={() =>
                                setModalState({
                                  type: "score",
                                  playerId: player.id,
                                  holeNumber,
                                })
                              }
                              className="flex-1 rounded-b-xl border-t border-slate-800 px-2 py-2 text-left text-sm font-semibold text-emerald-200 hover:bg-slate-800"
                            >
                              {scoreValue === null || scoreValue === undefined
                                ? "—"
                                : scoreValue}
                            </button>
                          </div>
                        );
                      })}
                    </Fragment>
                  ))}

                  <div className="sticky left-0 z-30 rounded-xl border border-slate-800 bg-slate-900/95 px-2 py-3 text-sm font-semibold text-emerald-200">
                    Total
                  </div>
                  {activeGame.players.map((player) => (
                    <div
                      key={`${player.id}-footer-total`}
                      className="rounded-xl border border-slate-800 bg-slate-900/95 px-3 py-3 text-center text-sm font-semibold text-emerald-200"
                    >
                      {totals[player.id] ?? 0}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {modalState?.type === "score" && activeGame ? (
          <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/70 px-3 pb-3 pt-12">
            <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-4 shadow-2xl">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.35em] text-emerald-300">
                    Score
                  </p>
                  <h3 className="text-lg font-semibold text-white">
                    {
                      activeGame.players.find(
                        (player) => player.id === modalState.playerId,
                      )?.name
                    }{" "}
                    · Hole {modalState.holeNumber}
                  </h3>
                </div>
                <button
                  onClick={() => setModalState(null)}
                  className="rounded-full border border-slate-700 px-3 py-2 text-sm text-slate-300"
                >
                  Close
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3, 4, 5, 6].map((value) => (
                  <button
                    key={value}
                    onClick={() =>
                      handleScoreSelect(
                        modalState.playerId,
                        modalState.holeNumber,
                        value,
                      )
                    }
                    className="rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 font-semibold text-white"
                  >
                    {value}
                  </button>
                ))}
              </div>
              <button
                onClick={() =>
                  handleScoreSelect(
                    modalState.playerId,
                    modalState.holeNumber,
                    0,
                  )
                }
                className="mt-3 w-full rounded-2xl border border-emerald-500/30 bg-emerald-500/15 px-4 py-3 font-semibold text-emerald-200"
              >
                Mark as 0
              </button>
            </div>
          </div>
        ) : null}

        {modalState?.type === "spinner" && activeGame ? (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 px-4 py-6">
            <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-4 shadow-2xl">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.35em] text-emerald-300">
                    Challenge spin
                  </p>
                  <h3 className="text-lg font-semibold text-white">
                    {
                      activeGame.players.find(
                        (player) => player.id === modalState.playerId,
                      )?.name
                    }{" "}
                    · Hole {modalState.holeNumber}
                  </h3>
                </div>
                <button
                  onClick={() => setModalState(null)}
                  className="rounded-full border border-slate-700 px-3 py-2 text-sm text-slate-300"
                >
                  Close
                </button>
              </div>

              {/* Toggles */}
              <div className="mb-4 grid grid-cols-2 gap-2 w-full">
                <button
                  onClick={() => setSelectedMode("preset")}
                  className={`rounded-2xl py-2 px-3 text-sm font-semibold border transition ${
                    selectedMode === "preset"
                      ? "bg-emerald-500/20 text-emerald-200 border-emerald-500"
                      : "bg-slate-950/70 text-slate-400 border-slate-700 hover:text-white"
                  }`}
                >
                  Preset
                </button>
                <button
                  onClick={() => setSelectedMode("random")}
                  className={`rounded-2xl py-2 px-3 text-sm font-semibold border transition ${
                    selectedMode === "random"
                      ? "bg-emerald-500/20 text-emerald-200 border-emerald-500"
                      : "bg-slate-950/70 text-slate-400 border-slate-700 hover:text-white"
                  }`}
                >
                  Random
                </button>
              </div>

              <div className="flex flex-col items-center gap-4">
                <div
                  className="flex h-44 w-44 items-center justify-center rounded-full border border-emerald-400/50 bg-gradient-to-br from-emerald-500/20 to-slate-800 transition-transform duration-[2200ms]"
                  style={{ transform: `rotate(${spinRotation}deg)` }}
                >
                  <div className="rounded-full border border-white/20 bg-slate-950 px-5 py-3 text-center text-sm text-white">
                    {spinInProgress ? "Spinning…" : "Tap to spin"}
                  </div>
                </div>

                <button
                  onClick={() =>
                    triggerSpin(modalState.playerId, modalState.holeNumber)
                  }
                  disabled={spinInProgress || optionsLoading || spinnerOptions.length === 0}
                  className="w-full rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {spinInProgress ? "Spinning..." : optionsLoading ? "Loading pool..." : spinnerOptions.length === 0 ? "No options available" : "Spin the wheel"}
                </button>

                <div className="w-full rounded-2xl border border-slate-800 bg-slate-950/70 p-3 text-sm text-slate-400">
                  <p className="mb-2 font-semibold text-slate-200">
                    Option pool ({selectedMode === "preset" ? "Preset" : "Random"})
                  </p>
                  {optionsLoading ? (
                    <p className="text-xs text-slate-500">Loading options from DB...</p>
                  ) : spinnerOptions.length === 0 ? (
                    <p className="text-xs text-slate-500">No options found in database.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                      {spinnerOptions.map((option) => (
                        <div
                          key={option.label}
                          className="rounded-full border border-slate-700 px-2.5 py-1 text-xs text-slate-300 flex flex-col"
                        >
                          <span className="font-semibold text-slate-200">{option.label}</span>
                          {option.description && (
                            <span className="text-[10px] text-slate-500 leading-tight mt-0.5">{option.description}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {modalState?.type === "details" && activeGame ? (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 px-4 py-6">
            <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.35em] text-emerald-300">
                    Challenge Details
                  </p>
                  <h3 className="text-xl font-bold text-white mt-1">
                    {modalState.label}
                  </h3>
                </div>
                <button
                  onClick={() => setModalState(null)}
                  className="rounded-full border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 transition"
                >
                  Close
                </button>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                    Player & Hole
                  </p>
                  <p className="text-base font-semibold text-slate-200">
                    {
                      activeGame.players.find(
                        (player) => player.id === modalState.playerId,
                      )?.name
                    }{" "}
                    · Hole {modalState.holeNumber}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                    Description
                  </p>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    {modalState.description || "No description provided for this challenge."}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(52,211,153,0.18),_transparent_45%)]">
      {screen === "home" && renderHomeScreen()}
      {screen === "newGame" && renderNewGameScreen()}
      {screen === "existingGames" && renderExistingGamesScreen()}
      {screen === "game" && renderGameScreen()}
    </div>
  );
}

export default App;
