import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import {
  playSound,
  playMusic,
  stopMusic,
  getMusicVolume,
  setMusicVolume,
} from "./audio";
import "./App.css";
import avatarSprite from "./assets/avatars.svg?raw";


const socket = io(
  import.meta.env.VITE_SERVER_URL || "http://localhost:3010"
);
const avatarNames: Record<string, string> = { detective: "Detective", trickster: "Trickster", phantom: "Phantom", charmer: "Charmer", jester: "Jester", gambler: "Gambler", oracle: "Oracle", mastermind: "Mastermind", bandit: "Bandit", magician: "Magician" };

const avatars = [
  "detective",
  "trickster",
  "phantom",
  "charmer",
  "jester",
  "gambler",
  "oracle",
  "mastermind",
  "bandit",
  "magician",
] as const;

const legacyAvatarIds: Record<string, string> = {
  "🕵️": "detective",
  "🦊": "trickster",
  "🎭": "jester",
  "🕶️": "charmer",
  "🤡": "magician",
};

function avatarId(value: string) {
  return legacyAvatarIds[value] ?? (avatars.includes(value as (typeof avatars)[number]) ? value : "detective");
}

function Avatar({
  avatar,
  className = "",
  label,
}: {
  avatar: string;
  className?: string;
  label?: string;
}) {
  const id = avatarId(avatar);

  return (
    <svg
      className={`avatar-art ${className}`.trim()}
      viewBox="0 0 100 100"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <use href={`#${id}`} />
    </svg>
  );
}


const roundOptions = [3, 5, 7, 10];
const playerOptions = [4, 6, 8, 10];

type Choice = { id: string; text: string; isOwn: boolean };
type Player = { id: string; name: string; avatar: string; score: number };
type Question = { id: string; question: string; category?: string };
type Settings = { totalRounds: number; maxPlayers: number };
type ResultChoice = {
  id: string;
  text: string;
  isReal: boolean;
  authorId: string | null;
  authorIds?: string[];
  votedPlayerIds: string[];
};
type RoundPoints = { playerId: string; points: number };
type RoundAward = { type: "best-bluff"; playerIds: string[]; votes: number };
type RecapAward = { playerIds: string[]; value: number };
type GameRecap = {
  bestBluffer: RecapAward;
  bestDetective: RecapAward;
  mostDangerous: RecapAward;
  mostGullible: RecapAward;
};
type Room = {
  code: string;
  hostId: string;
  viewerId: string;
  settings: Settings;
  players: Player[];
  state: "lobby" | "answering" | "voting" | "results" | "gameover";
  choices: Choice[];
  votedPlayerIds: string[];
  round: number;
  question: Question | null;
  submittedPlayerIds: string[];
  phaseStartedAt: number | null;
  phaseEndsAt: number | null;
  results?: ResultChoice[];
  roundPoints?: RoundPoints[];
  roundAward?: RoundAward | null;
  gameRecap?: GameRecap;
};

type Response = {
  ok: boolean;
  error?: string;
  realAnswer?: boolean;
  bonus?: number;
};

function calculatePhaseProgress(
  phaseStartedAt: number | null,
  phaseEndsAt: number | null
) {
  if (!phaseStartedAt || !phaseEndsAt) {
    return 0;
  }

  const duration = phaseEndsAt - phaseStartedAt;
  return Math.max(0, Math.min(100, ((phaseEndsAt - Date.now()) / duration) * 100));
}

function capitalizeFirstLetter(value: string) {
  if (!value) return value;

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function PlayerStatusRail({
  players,
  completedPlayerIds,
  viewerId,
  label,
}: {
  players: Player[];
  completedPlayerIds: string[];
  viewerId: string;
  label: string;
}) {
  return (
    <aside className="player-status-rail" aria-label={label}>
      <div className="player-status-heading"><span>PLAYERS</span><small>{completedPlayerIds.length}/{players.length}</small></div>
      <div className="player-status-list">
        {players.map((player) => {
          const completed = completedPlayerIds.includes(player.id);
          return <div key={player.id} className={`player-status-row ${completed ? "is-complete" : ""} ${player.id === viewerId ? "is-you" : ""}`.trim()}>
            <span className="player-status-mark" aria-hidden="true">{completed ? "✓" : ""}</span>
            <span className="player-status-name">{player.name}</span>
            {player.id === viewerId && <span className="player-status-you">YOU</span>}
          </div>;
        })}
      </div>
    </aside>
  );
}

function PhaseProgress({
  phaseStartedAt,
  phaseEndsAt,
}: {
  phaseStartedAt: number | null;
  phaseEndsAt: number | null;
}) {
  const [progress, setProgress] = useState(() =>
    calculatePhaseProgress(phaseStartedAt, phaseEndsAt)
  );

  useEffect(() => {
    if (!phaseStartedAt || !phaseEndsAt) {
      return;
    }

    const updateProgress = () => {
      const nextProgress = calculatePhaseProgress(phaseStartedAt, phaseEndsAt);
      setProgress(nextProgress);
    };

    const refreshOnVisibility = () => updateProgress();
    const intervalId = window.setInterval(updateProgress, 200);
    window.addEventListener("focus", refreshOnVisibility);
    document.addEventListener("visibilitychange", refreshOnVisibility);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshOnVisibility);
      document.removeEventListener("visibilitychange", refreshOnVisibility);
    };
  }, [phaseStartedAt, phaseEndsAt]);

  if (!phaseStartedAt || !phaseEndsAt) {
    return null;
  }

  const urgency = progress <= 25 ? "urgent" : progress <= 50 ? "warning" : "";

  return (
    <div
      className={`phase-progress ${urgency}`}
      role="progressbar"
      aria-label="Phase time remaining"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress)}
    >
      <span style={{ width: `${progress}%` }} />
    </div>
  );
}



function Game() {
  const avatarSpriteElement = (
    <div
      className="avatar-sprite"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: avatarSprite }}
    />
  );
  const [homeMode, setHomeMode] = useState<"create" | "join" | null>(null);
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [avatar, setAvatar] = useState<(typeof avatars)[number]>(avatars[0]);
  const [totalRounds, setTotalRounds] = useState(5);
  const [maxPlayers, setMaxPlayers] = useState(10);
  const [room, setRoom] = useState<Room | null>(null);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");

  
  const [musicVolume, setMusicVolumeState] = useState(getMusicVolume);

function goHome() {
  socket.emit("room:leave", (response: Response) => {
    if (!response.ok) {
      showResponse(response, "Could not leave room.");
      return;
    }

    stopMusic();

    setRoom(null);
    setAnswer("");
    setRoomCode("");
    setError("");
  });
}



function updateMasterVolume(value: number) {
const volume = value / 100;

setMusicVolumeState(volume);
setMusicVolume(volume);
}

  useEffect(() => {
    const handleRoomUpdate = (updatedRoom: Room) => setRoom(updatedRoom);
    socket.on("room:update", handleRoomUpdate);
    return () => {
      socket.off("room:update", handleRoomUpdate);
    };
  }, []);

  const previousState = useRef<Room["state"] | null>(null);

useEffect(() => {
  if (!room) {
    previousState.current = null;
    return;
  }

  const previous = previousState.current;

  // Only play when entering a different game state.
  if (previous !== room.state) {
    switch (room.state) {
      case "answering":
      case "voting":
        playSound("whoosh");
        break;

      case "results": {
        const bigBluff =
          room.results?.some(
            (choice) =>
              !choice.isReal &&
              choice.authorId !== null &&
              choice.votedPlayerIds.length >= 3
          ) ?? false;

        playSound(bigBluff ? "applause" : "reveal");
        break;
      }

      case "gameover":
        playSound("winning");
        break;
    }
  }

  previousState.current = room.state;
}, [room]);

// Background music control
useEffect(() => {
if (!room) {
  stopMusic();
  return;
}

if (
  room.state === "answering" ||
  room.state === "voting" ||
  room.state === "results"
) {
  playMusic();
  return;
}

if (room.state === "gameover") {
  stopMusic();
}
}, [room?.state]);

  function showResponse(response: Response, fallback: string) {
    if (!response.ok) {
      setError(response.error || fallback);
    }
  }

  function createRoom() {
    setError("");
    socket.emit(
      "room:create",
      { name, avatar, settings: { totalRounds, maxPlayers } },
      (response: Response & { room?: Room }) => {
        if (!response.ok) {
          showResponse(response, "Could not create room.");
          return;
        }
        setRoom(response.room!);
        playSound("pop");
      }
    );
  }

  function joinRoom() {
    setError("");
    socket.emit(
      "room:join",
      { name, avatar, code: roomCode },
      (response: Response & { room?: Room }) => {
        if (!response.ok) {
          showResponse(response, "Could not join room.");
          return;
        }
        setRoom(response.room!);
        playSound("pop");
      }
    );
  }

  function emitRoomAction(event: "game:start" | "game:next" | "game:play-again", fallback: string) {
    setError("");
    socket.emit(event, (response: Response) => showResponse(response, fallback));
  }

  function submitAnswer() {
  setError("");

  socket.emit("game:answer", { answer }, (response: Response) => {
    if (response.realAnswer) {
      setAnswer("");

      if (response.bonus === 500) {
        setError(
          "🎯 You knew the truth! +500 points. Now make up a believable bluff."
        );
      } else {
        setError(
          "That's the real answer! Try again with a believable bluff."
        );
      }

      playSound("pop");
      return;
    }

    if (!response.ok) {
      showResponse(response, "Could not submit answer.");
      return;
    }

    setAnswer("");
    playSound("pop");
  });
}

  function vote(choiceId: string) {
    setError("");
    socket.emit("game:vote", { choiceId }, (response: Response) => {
  showResponse(response, "Could not submit vote.");

  if (response.ok) {
    playSound("pop");
  }
});
  }

  function getPlayer(playerId: string | null) {
    return room?.players.find((player) => player.id === playerId);
  }

  function getRoundPoints(playerId: string) {
    return room?.roundPoints?.find((entry) => entry.playerId === playerId)?.points || 0;
  }

  function formatPoints(points: number) {
    return points.toLocaleString("en-US");
  }

  function getStandings(players: Player[]) {
    const sorted = [...players].sort((first, second) => second.score - first.score);
    let previousScore: number | null = null;
    let placement = 0;

    return sorted.map((player, index) => {
      if (player.score !== previousScore) {
        placement = index + 1;
        previousScore = player.score;
      }
      return { ...player, placement };
    });
  }

const soundToggle = (
  <div className="audio-controls">
    <div className="music-slider-wrap">
      <span aria-hidden="true">🔊</span>

      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(musicVolume * 100)}
        onChange={(e) => updateMasterVolume(Number(e.target.value))}
        aria-label="Volume"
        title="Volume"
      />
    </div>
  </div>
);

  if (room?.state === "gameover") {
    const standings = getStandings(room.players);
    const winners = standings.filter((player) => player.placement === 1);
    const tied = winners.length > 1;
    const recap = room.gameRecap;

    const recapCards = recap
      ? [
          {
            key: "bestBluffer",
            title: "BEST BLUFFER",
            description: "Fooled",
            award: recap.bestBluffer,
          },
          {
            key: "bestDetective",
            title: "BEST DETECTIVE",
            description: "Found truths",
            award: recap.bestDetective,
          },
          {
            key: "mostDangerous",
            title: "MOST DANGEROUS",
            description: "Perfect bluffs",
            award: recap.mostDangerous,
          },
          {
            key: "mostGullible",
            title: "MOST GULLIBLE",
            description: "Got fooled",
            award: recap.mostGullible,
          },
        ]
      : [];

    return (
      <main className="app">
        {avatarSpriteElement}
        {soundToggle}
        <section className="panel game gameover-screen">
          <h1 className="gameover-title">GAME COMPLETE</h1>

          <div className="winner-showcase">
            <div className="winner-avatars">
              {winners.map((winner) => (
                <span key={winner.id}>
                  <Avatar avatar={winner.avatar} label={winner.name} />
                </span>
              ))}
            </div>
            <h2>
              {tied
                ? "IT'S A TIE!"
                : winners[0]?.name.toUpperCase() + " WINS!"}
            </h2>
            {tied && (
              <p>
                {winners.map((winner) => winner.name).join(" & ")}
              </p>
            )}
            <strong>
              {formatPoints(winners[0]?.score || 0)} PTS
            </strong>
          </div>

          {recapCards.length > 0 && (
            <section
              className="game-recap"
              aria-label="Game recap"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: "12px",
                margin: "24px 0",
              }}
            >
              {recapCards.map(({ key, title, description, award }) => {
                const players = award.playerIds
                  .map((playerId) => getPlayer(playerId))
                  .filter((player): player is Player => Boolean(player));

                return (
                  <article
                    key={key}
                    className="recap-card"
                    style={{
                      padding: "16px",
                      borderRadius: "14px",
                      textAlign: "center",
                    }}
                  >
                    <p
                      style={{
                        margin: "0 0 8px",
                        fontWeight: 800,
                        letterSpacing: "0.08em",
                        fontSize: "12px",
                      }}
                    >
                      {title}
                    </p>

                    {players.length > 0 ? (
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "center",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: "8px",
                        }}
                      >
                        {players.map((player) => (
                          <span
                            key={player.id}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "7px",
                              fontWeight: 700,
                            }}
                          >
                            <span
                              className="player-avatar"
                              style={{ width: "30px", height: "30px" }}
                            >
                              <Avatar
                                avatar={player.avatar}
                                label={player.name}
                              />
                            </span>
                            {player.name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <strong>—</strong>
                    )}

                    <p
                      style={{
                        margin: "9px 0 0",
                        opacity: 0.7,
                        fontSize: "12px",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {award.value > 0
                        ? `${description.toUpperCase()} ${award.value}`
                        : "NO AWARD THIS GAME"}
                    </p>
                  </article>
                );
              })}
            </section>
          )}

          <section className="leaderboard final-leaderboard">
            <h2>FINAL LEADERBOARD</h2>
            {standings.map((player) => (
              <div className="score-row final-score-row" key={player.id}>
                <span className="placement">
                  {player.placement === 1
                    ? "🥇"
                    : player.placement === 2
                      ? "🥈"
                      : player.placement === 3
                        ? "🥉"
                        : player.placement}
                </span>
                <span className="player-identity">
                  <span className="player-avatar">
                    <Avatar avatar={player.avatar} label={player.name} />
                  </span>
                  {player.name}
                  {player.id === room.viewerId && <small>YOU</small>}
                </span>
                <strong>{formatPoints(player.score)}</strong>
              </div>
            ))}
          </section>

          <div className="final-actions">
            {room.hostId === room.viewerId && (
              <button
                className="primary"
                onClick={() =>
                  emitRoomAction(
                    "game:play-again",
                    "Could not reset the game."
                  )
                }
              >
                PLAY AGAIN
              </button>
            )}

            <button
              type="button"
              className="secondary"
              onClick={goHome}
            >
              HOME
            </button>
          </div>

          {error && <p className="error">{error}</p>}
        </section>
      </main>
    );
  }

  if (room?.state === "results") {
    const leaderboard = getStandings(room.players);
    const isFinalRound = room.round === room.settings.totalRounds;

    return (
      <main className="app">
        {avatarSpriteElement}
        {soundToggle}
        <section className="panel game results-screen">
          <div className="round-header"><span>ROUND {room.round} / {room.settings.totalRounds}</span><span>THE TRUTH IS OUT</span></div>
          <p className="eyebrow">REVEAL TIME</p>
          {room.question?.category && <span className="category-badge">{room.question.category}</span>}
          <h1 className="question">{room.question?.question}</h1>

          <div className="result-choices">
            {room.results?.map((choice) => {
              const authorIds =
                choice.authorIds?.length
                  ? choice.authorIds
                  : choice.authorId
                    ? [choice.authorId]
                    : [];
              const authors = authorIds
                .map((playerId) => getPlayer(playerId))
                .filter((player): player is Player => Boolean(player));
              const voters = choice.votedPlayerIds
                .map((playerId) => getPlayer(playerId)?.name)
                .filter((playerName): playerName is string => Boolean(playerName));
              const voteCount = voters.length;
              const isSuccessfulBluff = !choice.isReal && voteCount > 0;
              const cardClass = choice.isReal
                ? "result-card truth"
                : isSuccessfulBluff
                  ? "result-card bluff-hit"
                  : "result-card bluff-miss";

              return (
                <article key={choice.id} className={cardClass}>
                  <div className="result-title">
                    <span>{choice.text}</span>
                    {choice.isReal && <span className="truth-label">TRUE ANSWER</span>}
                  </div>

                  {choice.isReal ? (
                    voteCount > 0 ? (
                      <div className="result-outcome truth-hit">
                        <p className="outcome-label">GOT IT RIGHT — {voteCount}</p>
                        <p className="outcome-names">{voters.join("  ")}</p>
                      </div>
                    ) : (
                      <p className="result-outcome outcome-empty">NOBODY GOT IT RIGHT</p>
                    )
                  ) : (
                    <>
                      <p className="result-author">
                        Written by{" "}
                        {authors.length > 0
                          ? authors.map((author, index) => {
                              const separator =
                                index === 0
                                  ? ""
                                  : index === authors.length - 1
                                    ? authors.length === 2
                                      ? " & "
                                      : ", & "
                                    : ", ";
                              return (
                                <span key={author.id}>
                                  {separator && <span className="author-sep">{separator}</span>}
                                  <span className="author-chip">
                                    <Avatar avatar={author.avatar} className="inline-avatar-art" />
                                    {author.name}
                                  </span>
                                </span>
                              );
                            })
                          : "Unknown"}
                      </p>
                      {isSuccessfulBluff ? (
                        <div className="result-outcome bluff-success">
                          <p className="outcome-label">
                            FOOLED {voteCount} {voteCount === 1 ? "PLAYER" : "PLAYERS"}
                          </p>
                          <p className="outcome-names">{voters.join("  ")}</p>
                        </div>
                      ) : (
                        <p className="result-outcome outcome-empty bluff-fail">
                          NO ONE FELL FOR IT
                        </p>
                      )}
                    </>
                  )}
                </article>
              );
            })}
          </div>

          {room.roundAward?.type === "best-bluff" && room.roundAward.playerIds.length > 0 && (
            <section className="round-award" aria-label="Round award">
              <div className="round-award-icon">🏆</div>
              <div className="round-award-copy">
                <p className="round-award-title">BEST BLUFF</p>
                <div className="round-award-players">
                  {room.roundAward.playerIds.map((playerId) => {
                    const player = getPlayer(playerId);
                    return player ? (
                      <span className="round-award-player" key={player.id} style={{ display: "inline-flex", alignItems: "center", gap: "7px" }}>
                        <span className="player-avatar" style={{ width: "30px", height: "30px" }}><Avatar avatar={player.avatar} label={player.name} /></span>
                        <strong>{player.name}</strong>
                      </span>
                    ) : null;
                  })}
                </div>
                <p className="round-award-detail" style={{ margin: "8px 0 0", opacity: 0.7, fontSize: "12px", letterSpacing: "0.08em" }}>FOOLED {room.roundAward.votes} {room.roundAward.votes === 1 ? "PLAYER" : "PLAYERS"}</p>
              </div>
            </section>
          )}

          <section className="leaderboard">
            <h2>LEADERBOARD</h2>
            {leaderboard.map((player) => <div className="score-row" key={player.id}><span className="player-identity"><span className="player-avatar"><Avatar avatar={player.avatar} label={player.name} /></span>{player.name}{player.id === room.viewerId && <small>YOU</small>}</span><span><small>+{getRoundPoints(player.id)}</small><strong>{formatPoints(player.score)}</strong></span></div>)}
          </section>

          {room.hostId === room.viewerId ? <button className="primary" onClick={() => emitRoomAction("game:next", "Could not continue.")}>{isFinalRound ? "VIEW FINAL RESULTS" : "NEXT ROUND"}</button> : <p className="waiting">Waiting for the host...</p>}
          {error && <p className="error">{error}</p>}
        </section>
      </main>
    );
  }

  if (room?.state === "voting") {
    const voted = room.votedPlayerIds.includes(room.viewerId);
    return (
      <main className="app">
        {avatarSpriteElement}
        {soundToggle}
        <section className="panel game game-with-status">
        <div className="game-main">
        <div className="round-header"><span>ROUND {room.round} / {room.settings.totalRounds}</span><span>{room.votedPlayerIds.length}/{room.players.length} VOTED</span></div>
        <PhaseProgress key={`${room.phaseStartedAt}-${room.phaseEndsAt}`} phaseStartedAt={room.phaseStartedAt} phaseEndsAt={room.phaseEndsAt} />
        <p className="eyebrow">SPOT THE TRUTH</p><h1 className="question">{room.question?.question}</h1>
        {!voted ? <><p className="vote-instruction">Which answer is real?</p><div className="choices">{room.choices.map((choice) => <button key={choice.id} className={choice.isOwn ? "choice own-choice" : "choice"} disabled={choice.isOwn} onClick={() => vote(choice.id)}><span>{choice.text}</span>{choice.isOwn && <span className="own-label">YOUR ANSWER</span>}</button>)}</div></> : <div className="submitted"><h2>VOTE LOCKED!</h2><p>Waiting for everyone else...</p><strong>{room.votedPlayerIds.length} / {room.players.length} voted</strong></div>}
        {error && <p className="error">{error}</p>}
        </div>
        <PlayerStatusRail players={room.players} completedPlayerIds={room.votedPlayerIds} viewerId={room.viewerId} label="Voting status" />
      </section></main>
    );
  }

  if (room?.state === "answering") {
    const submitted = room.submittedPlayerIds.includes(room.viewerId);
    return (
      <main className="app">
        {avatarSpriteElement}
        {soundToggle}
        <section className="panel game game-with-status">
        <div className="game-main">
        <div className="round-header"><span>ROUND {room.round} / {room.settings.totalRounds}</span><span>{room.submittedPlayerIds.length}/{room.players.length} IN</span></div>
        <PhaseProgress key={`${room.phaseStartedAt}-${room.phaseEndsAt}`} phaseStartedAt={room.phaseStartedAt} phaseEndsAt={room.phaseEndsAt} />
        <p className="eyebrow">MAKE UP A BELIEVABLE ANSWER</p><h1 className="question">{room.question?.question}</h1>
        {!submitted ? <><textarea className="answer-input" value={answer} maxLength={100} placeholder="Type your fake answer..." onChange={(event) =>
  setAnswer(capitalizeFirstLetter(event.target.value))
} /><button className="primary" onClick={submitAnswer}>LOCK IT IN</button></> : <div className="submitted"><h2>ANSWER LOCKED!</h2><p>Waiting for everyone else...</p><strong>{room.submittedPlayerIds.length} / {room.players.length} submitted</strong></div>}
        {error && <p className="error">{error}</p>}
        </div>
        <PlayerStatusRail players={room.players} completedPlayerIds={room.submittedPlayerIds} viewerId={room.viewerId} label="Answer submission status" />
      </section></main>
    );
  }

  if (room) {
    const amHost = room.hostId === room.viewerId;
    return (
        <>
          {avatarSpriteElement}

          <main className="app home">
  {soundToggle}<section className="panel lobby">
        <p className="eyebrow">ROOM CODE</p><div className="lobby-code-row"><h1 className="room-code">{room.code}</h1><button type="button" className="copy-code" onClick={() => { navigator.clipboard.writeText(room.code); playSound("pop"); }}>COPY</button></div><p className="muted">Share this code with your team.</p>
        <div className="room-settings-summary"><span>{room.settings.totalRounds} ROUNDS</span><span>MAX {room.settings.maxPlayers} PLAYERS</span></div>
        <div className="player-heading"><h2>PLAYERS</h2><span>{room.players.length} / {room.settings.maxPlayers}</span></div>
        <div className="players">{room.players.map((player) => <div className="player" key={player.id}><span className="player-identity"><span className="player-avatar"><Avatar avatar={player.avatar} label={player.name} /></span>{player.name}</span><span className="player-badges">{player.id === room.hostId && <span className="host">HOST</span>}{player.id === room.viewerId && <span className="you">YOU</span>}</span></div>)}</div>
        {amHost ? <button className="primary start-button" onClick={() => emitRoomAction("game:start", "Could not start game.")}>START GAME</button> : <p className="waiting">Waiting for the host to start...</p>}
        {error && <p className="error">{error}</p>}
      </section></main>
        </>
    );
  }

  return (
    <>
      {avatarSpriteElement}
      <main className="app home">
        {soundToggle}
      <div className="floaties" aria-hidden="true"><span>?</span><span>!</span><span>✦</span><span>?</span><span>✦</span><span>!</span></div>

      <section className="home-shell">
        <header className="brand home-brand">
          <div className="brand-title"><span className="brand-crown" aria-hidden="true">♛</span><h1>BLUFF!</h1><span className="beta-tag">BETA</span></div>
          <p>Fool them. Find the truth.</p>
          <div className="game-loop"><span>LIE</span><b>•</b><span>VOTE</span><b>•</b><span>FOOL YOUR FRIENDS</span></div>
        </header>

        {homeMode === null ? (
          <section className="home-mode-picker">
            <button type="button" className="home-mode-card" onClick={() => { setHomeMode("create"); setError(""); }}>
              <span className="home-mode-icon">＋</span>
              <span><strong>START GAME</strong><small>Create a room and invite your friends.</small></span>
              <b>→</b>
            </button>
            <button type="button" className="home-mode-card" onClick={() => { setHomeMode("join"); setError(""); }}>
              <span className="home-mode-icon">→</span>
              <span><strong>JOIN GAME</strong><small>Got a room code? Jump right in.</small></span>
              <b>→</b>
            </button>
          </section>
        ) : (
          <section className="home-setup">
            <div className="setup-heading">
              <button type="button" className="setup-back" onClick={() => { setHomeMode(null); setError(""); }}>← BACK</button>
              <div><span>{homeMode === "create" ? "HOST A GAME" : "JOIN A GAME"}</span><h2>{homeMode === "create" ? "Set up your room" : "Enter the room"}</h2></div>
            </div>

            <section className="identity-card">
              <p className="section-title"><span>✦</span>WHO ARE YOU?</p>
              <div className="identity-layout">
                <div className="avatars" role="group" aria-label="Choose an avatar">
                  {avatars.map((item) => (
                    <button key={item} type="button" className={avatar === item ? "avatar active" : "avatar"} onClick={() => setAvatar(item)} aria-label={`Choose ${item} avatar`} title={avatarNames[item] ?? item}>
                      <Avatar avatar={item} />
                    </button>
                  ))}
                </div>
                <input type="text" value={name} maxLength={20} placeholder="Enter your display name" autoComplete="off" onChange={(event) => setName(event.target.value)} />
              </div>
              <p className="avatar-selection-name">Selected: <strong>{avatarNames[avatar] ?? avatar}</strong></p><p className="identity-help">Pick your disguise. This is how everyone sees you.</p>
            </section>

            {homeMode === "create" ? (
              <section className="setup-card">
                <div className="setup-card-copy"><div className="option-icon">＋</div><div><h2>CREATE A ROOM</h2><p className="option-description">Choose your game settings, then open the lobby.</p></div></div>
                <div className="setting-control"><label>ROUNDS</label><div className="segment-picker">{roundOptions.map((option) => <button key={option} type="button" className={totalRounds === option ? "active" : ""} onClick={() => setTotalRounds(option)}>{option}</button>)}</div></div>
                <div className="setting-control"><label>MAX PLAYERS</label><div className="segment-picker">{playerOptions.map((option) => <button key={option} type="button" className={maxPlayers === option ? "active" : ""} onClick={() => setMaxPlayers(option)}>{option}</button>)}</div></div>
                <div className="room-preview"><div><span className="preview-icon">◉</span><span><small>ROUNDS</small><strong>{totalRounds}</strong></span></div><div><span className="preview-icon">♟</span><span><small>PLAYERS</small><strong>Up to {maxPlayers}</strong></span></div></div>
                <button className="game-cta" disabled={!name.trim()} onClick={createRoom}>CREATE GAME<span>→</span></button>
              </section>
            ) : (
              <section className="setup-card">
                <div className="setup-card-copy"><div className="option-icon">→</div><div><h2>JOIN A ROOM</h2><p className="option-description">Enter the 4-character code from your host.</p></div></div>
                <label className="code-label">ROOM CODE</label>
                <div className="code-slots">
                  {[0, 1, 2, 3].map((index) => <div key={index} className={roomCode[index] ? "code-slot filled" : "code-slot"}>{roomCode[index] || ""}</div>)}
                  <input className="code-real-input" value={roomCode} maxLength={4} autoComplete="off" aria-label="Room code" onChange={(event) => setRoomCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))} />
                </div>
                <p className="code-help">Enter the room code shown on the host's lobby screen.</p>
                <button className="game-cta" disabled={!name.trim() || roomCode.length !== 4} onClick={joinRoom}>JOIN GAME<span>→</span></button>
              </section>
            )}

            {error && <p className="error">{error}</p>}
          </section>
        )}

        <footer className="home-footer"><span />Best with 3–10 players</footer>
      </section>
      </main>
    </>
  );
}

function App() {
  return <Game />;
}

export default App;