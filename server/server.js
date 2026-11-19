import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { readFileSync } from "fs";

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: [
      "http://localhost:5180",
      "https://bluff.honeyplays.win",
    ],
    methods: ["GET", "POST"],
  },
});

const questions = JSON.parse(
  readFileSync(new URL("./questions.json", import.meta.url))
);

const rooms = {};

const AVATARS = [
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
];

const DEFAULT_AVATAR = "detective";

const ALLOWED_TOTAL_ROUNDS = [
  3,
  5,
  7,
  10,
];

const ALLOWED_MAX_PLAYERS = [
  4,
  6,
  8,
  10,
];

const DEFAULT_SETTINGS = {
  totalRounds: 5,
  maxPlayers: 10,
};

const ANSWERING_DURATION_MS = 60_000;
const VOTING_DURATION_MS = 30_000;

function normalizeAnswer(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/, "")
    .trim();
}

function normalizeAvatar(avatar) {
  return AVATARS.includes(avatar)
    ? avatar
    : DEFAULT_AVATAR;
}

function normalizeSettings(settings) {
  return {
    totalRounds:
      ALLOWED_TOTAL_ROUNDS.includes(
        settings?.totalRounds
      )
        ? settings.totalRounds
        : DEFAULT_SETTINGS.totalRounds,

    maxPlayers:
      ALLOWED_MAX_PLAYERS.includes(
        settings?.maxPlayers
      )
        ? settings.maxPlayers
        : DEFAULT_SETTINGS.maxPlayers,
  };
}

function generateRoomCode() {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let code;

  do {
    code = "";

    for (let i = 0; i < 4; i++) {
      code += chars[
        Math.floor(
          Math.random() * chars.length
        )
      ];
    }
  } while (rooms[code]);

  return code;
}

function createGameStats(players) {
  return Object.fromEntries(
    players.map((player) => [
      player.id,
      {
        fooled: 0,
        truthsFound: 0,
        perfectBluffs: 0,
        fooledBy: 0,
      },
    ])
  );
}

function getPublicGameStats(room) {
  return room.gameStats
    ? room.players.map((player) => ({
        playerId: player.id,
        fooled:
          room.gameStats[player.id]?.fooled || 0,
        truthsFound:
          room.gameStats[player.id]?.truthsFound ||
          0,
        perfectBluffs:
          room.gameStats[player.id]?.perfectBluffs ||
          0,
        fooledBy:
          room.gameStats[player.id]?.fooledBy || 0,
      }))
    : [];
}

function getFinalAwards(room) {
  const stats = getPublicGameStats(room);

  if (!stats.length) {
    return {
      bestBluffer: [],
      bestDetective: [],
      mostDangerous: [],
      mostGullible: [],
    };
  }

  const maxValue = (key) =>
    Math.max(
      0,
      ...stats.map((entry) => entry[key] || 0)
    );

  const getPlayersWithValue = (key) => {
    const maximum = maxValue(key);

    if (maximum <= 0) {
      return [];
    }

    return stats
      .filter(
        (entry) =>
          (entry[key] || 0) === maximum
      )
      .map((entry) => entry.playerId);
  };

  return {
    bestBluffer: getPlayersWithValue("fooled"),
    bestDetective: getPlayersWithValue(
      "truthsFound"
    ),
    mostDangerous: getPlayersWithValue(
      "perfectBluffs"
    ),
    mostGullible: getPlayersWithValue(
      "fooledBy"
    ),
  };
}

function getPublicRoom(room, viewerId = null) {
  const publicRoom = {
    code: room.code,
    hostId: room.hostId,
    viewerId,
    settings: room.settings,

    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      avatar: player.avatar,
      score: player.score,
    })),

    state: room.state,
    round: room.round,

    question: room.currentQuestion
      ? {
          id: room.currentQuestion.id,
          question:
            room.currentQuestion.question,
        }
      : null,

    submittedPlayerIds:
      Object.keys(room.answers),

    votedPlayerIds:
      Object.keys(room.votes),

    phaseStartedAt:
      room.state === "answering" ||
      room.state === "voting"
        ? room.phaseStartedAt
        : null,

    phaseEndsAt:
      room.state === "answering" ||
      room.state === "voting"
        ? room.phaseEndsAt
        : null,

    choices:
      room.state === "voting"
        ? room.choices.map((choice) => ({
            id: choice.id,
            text: choice.text,
            isOwn:
              (choice.ownerIds || []).includes(
                viewerId
              ),
          }))
        : [],
  };

  if (
    room.state === "results" &&
    room.currentQuestion
  ) {
    publicRoom.question.category =
      room.currentQuestion.category;

    publicRoom.results =
      room.choices.map((choice) => {
        const authorIds =
          choice.ownerIds || [];

        return {
          id: choice.id,
          text: choice.text,
          isReal: choice.isReal,

          authorId:
            authorIds[0] ?? null,

          authorIds,

          votedPlayerIds:
            Object.entries(room.votes)
              .filter(
                ([, choiceId]) =>
                  choiceId === choice.id
              )
              .map(
                ([playerId]) =>
                  playerId
              ),
        };
      });

    publicRoom.roundPoints =
      room.players.map((player) => ({
        playerId: player.id,
        points:
          room.roundPoints[player.id] ||
          0,
      }));

    publicRoom.roundAward =
      room.roundAward || null;
  }

  if (room.state === "gameover") {
    publicRoom.gameStats =
      getPublicGameStats(room);

    publicRoom.finalAwards =
      getFinalAwards(room);
  }

  return publicRoom;
}

function sendRoomUpdate(room) {
  for (const player of room.players) {
    io.to(player.id).emit(
      "room:update",
      getPublicRoom(
        room,
        player.id
      )
    );
  }
}

function findRoomBySocket(socketId) {
  return Object.values(rooms).find(
    (room) =>
      room.players.some(
        (player) =>
          player.id === socketId
      )
  );
}

function pickQuestion(room) {
  if (
    room.usedQuestions.length >=
    questions.length
  ) {
    room.usedQuestions = [];
  }

  let available =
    questions.filter(
      (question) =>
        !room.usedQuestions.includes(
          question.id
        )
    );

  if (
    available.length > 1 &&
    room.currentQuestion
  ) {
    const withoutPrevious =
      available.filter(
        (question) =>
          question.id !==
          room.currentQuestion.id
      );

    if (
      withoutPrevious.length > 0
    ) {
      available =
        withoutPrevious;
    }
  }

  const question =
    available[
      Math.floor(
        Math.random() *
          available.length
      )
    ];

  room.usedQuestions.push(
    question.id
  );

  return question;
}

function shuffle(array) {
  const copy = [...array];

  for (
    let i = copy.length - 1;
    i > 0;
    i--
  ) {
    const j =
      Math.floor(
        Math.random() * (i + 1)
      );

    [copy[i], copy[j]] = [
      copy[j],
      copy[i],
    ];
  }

  return copy;
}

function clearPhaseTimer(room) {
  if (room.phaseTimeout) {
    clearTimeout(
      room.phaseTimeout
    );
  }

  room.phaseTimeout = null;
  room.phaseStartedAt = null;
  room.phaseEndsAt = null;
}

function beginTimedPhase(
  room,
  state,
  durationMs,
  onExpire
) {
  clearPhaseTimer(room);

  room.state = state;

  room.phaseStartedAt =
    Date.now();

  room.phaseEndsAt =
    room.phaseStartedAt +
    durationMs;

  const expectedEndsAt =
    room.phaseEndsAt;

  room.phaseTimeout =
    setTimeout(() => {
      if (
        rooms[room.code] !== room ||
        room.state !== state ||
        room.phaseEndsAt !==
          expectedEndsAt
      ) {
        return;
      }

      onExpire(room);
      sendRoomUpdate(room);
    }, durationMs);
}

function advanceToVoting(room) {
  if (
    room.state !== "answering"
  ) {
    return;
  }

  clearPhaseTimer(room);

  const bluffGroups = new Map();

  for (const player of room.players) {
    const text =
      room.answers[player.id];

    if (!text) {
      continue;
    }

    const key =
      normalizeAnswer(text);

    const existing =
      bluffGroups.get(key);

    if (existing) {
      existing.ownerIds.push(
        player.id
      );
    } else {
      bluffGroups.set(key, {
        text,
        ownerIds: [
          player.id,
        ],
      });
    }
  }

  const fakeChoices =
    [...bluffGroups.values()]
      .map((group) => ({
        id: `fake-${group.ownerIds.join(
          "-"
        )}`,
        text: group.text,
        ownerIds:
          group.ownerIds,
        isReal: false,
      }));

  const realChoice = {
    id: `real-${room.currentQuestion.id}`,
    text:
      room.currentQuestion.answer,
    ownerIds: [],
    isReal: true,
  };

  room.choices = shuffle([
    ...fakeChoices,
    realChoice,
  ]);

  room.votes = {};

  beginTimedPhase(
    room,
    "voting",
    VOTING_DURATION_MS,
    advanceToResults
  );
}

function advanceToResults(room) {
  if (
    room.state !== "voting"
  ) {
    return;
  }

  clearPhaseTimer(room);
  revealResults(room);
}

function revealResults(room) {
  if (
    room.state !== "voting"
  ) {
    return;
  }

  room.roundPoints =
    Object.fromEntries(
      room.players.map(
        (player) => [
          player.id,
          room.roundPoints[
            player.id
          ] || 0,
        ]
      )
    );

  /*
   * Process every vote.
   */
  for (
    const [
      voterId,
      choiceId,
    ] of Object.entries(
      room.votes
    )
  ) {
    const choice =
      room.choices.find(
        (item) =>
          item.id === choiceId
      );

    if (!choice) {
      continue;
    }

    /*
     * REAL ANSWER
     *
     * The voter correctly identified
     * the truth.
     */
    if (choice.isReal) {
      room.roundPoints[
        voterId
      ] += 1000;

      if (
        room.gameStats[voterId]
      ) {
        room.gameStats[
          voterId
        ].truthsFound += 1;
      }
    }

    /*
     * BLUFF
     *
     * The voter was fooled.
     */
    else {
      const ownerIds =
        choice.ownerIds || [];

      for (
        const ownerId of ownerIds
      ) {
        room.roundPoints[
          ownerId
        ] =
          (room.roundPoints[
            ownerId
          ] || 0) + 500;

        /*
         * BEST BLUFFER STAT
         *
         * Every player fooled by
         * this bluff counts.
         */
        if (
          room.gameStats[
            ownerId
          ]
        ) {
          room.gameStats[
            ownerId
          ].fooled += 1;
        }
      }

      /*
       * MOST GULLIBLE
       *
       * The voter selected a fake
       * answer.
       */
      if (
        room.gameStats[
          voterId
        ]
      ) {
        room.gameStats[
          voterId
        ].fooledBy += 1;
      }
    }
  }

  /*
   * BEST BLUFF — round award
   */
  const bluffVoteCounts =
    new Map();

  for (
    const choice of room.choices
  ) {
    if (choice.isReal) {
      continue;
    }

    const voteCount =
      Object.values(
        room.votes
      ).filter(
        (choiceId) =>
          choiceId ===
          choice.id
      ).length;

    for (
      const ownerId of
        choice.ownerIds || []
    ) {
      bluffVoteCounts.set(
        ownerId,
        voteCount
      );
    }
  }

  const bestBluffVotes =
    Math.max(
      0,
      ...bluffVoteCounts.values()
    );

  const bestBluffPlayerIds =
    bestBluffVotes > 0
      ? [
          ...bluffVoteCounts.entries(),
        ]
          .filter(
            ([, votes]) =>
              votes ===
              bestBluffVotes
          )
          .map(
            ([playerId]) =>
              playerId
          )
      : [];

  room.roundAward =
    bestBluffPlayerIds.length >
    0
      ? {
          type: "best-bluff",
          playerIds:
            bestBluffPlayerIds,
          votes:
            bestBluffVotes,
        }
      : null;

  /*
   * MOST DANGEROUS
   *
   * A perfect bluff means every player
   * who was eligible to vote for that
   * bluff actually voted for it.
   *
   * The bluff creator cannot vote for
   * their own answer, so the number of
   * eligible voters is:
   *
   * total players - bluff owners
   */
  for (
    const choice of room.choices
  ) {
    if (choice.isReal) {
      continue;
    }

    const ownerIds =
      choice.ownerIds || [];

    const ownerSet =
      new Set(ownerIds);

    const eligibleVoters =
      room.players.filter(
        (player) =>
          !ownerSet.has(
            player.id
          )
      );

    const voteCount =
      Object.values(
        room.votes
      ).filter(
        (choiceId) =>
          choiceId ===
          choice.id
      ).length;

    if (
      eligibleVoters.length > 0 &&
      voteCount ===
        eligibleVoters.length
    ) {
      for (
        const ownerId of ownerIds
      ) {
        if (
          room.gameStats[
            ownerId
          ]
        ) {
          room.gameStats[
            ownerId
          ].perfectBluffs +=
            1;
        }
      }
    }
  }

  /*
   * Add this round's points to
   * cumulative player scores.
   */
  for (
    const player of room.players
  ) {
    player.score +=
      room.roundPoints[
        player.id
      ] || 0;
  }

  room.state = "results";
}

function resetForNextRound(room) {
  clearPhaseTimer(room);

  room.round += 1;

  room.answers = {};
  room.votes = {};
  room.choices = [];
  room.roundPoints = {};

  room.realAnswerBonusPlayerIds =
    [];

  room.roundAward = null;

  room.currentQuestion =
    pickQuestion(room);

  beginTimedPhase(
    room,
    "answering",
    ANSWERING_DURATION_MS,
    advanceToVoting
  );
}

function resetForPlayAgain(room) {
  clearPhaseTimer(room);

  room.state = "lobby";
  room.round = 0;
  room.currentQuestion = null;

  room.answers = {};
  room.votes = {};
  room.choices = [];
  room.roundPoints = {};

  room.realAnswerBonusPlayerIds =
    [];

  room.roundAward = null;

  room.usedQuestions = [];

  room.gameStats =
    createGameStats(
      room.players
    );

  for (
    const player of room.players
  ) {
    player.score = 0;
  }
}

io.on("connection", (socket) => {
  console.log(
    "Connected:",
    socket.id
  );

  socket.on(
    "room:create",
    (
      {
        name,
        avatar,
        settings,
      },
      callback
    ) => {
      const cleanName =
        name?.trim();

      if (!cleanName) {
        return callback?.({
          ok: false,
          error:
            "Enter your name.",
        });
      }

      const code =
        generateRoomCode();

      const players = [
        {
          id: socket.id,
          name: cleanName,
          avatar:
            normalizeAvatar(
              avatar
            ),
          score: 0,
        },
      ];

      rooms[code] = {
        code,
        hostId: socket.id,

        settings:
          normalizeSettings(
            settings
          ),

        players,

        state: "lobby",
        round: 0,
        currentQuestion:
          null,

        answers: {},
        votes: {},
        choices: [],

        roundPoints: {},

        realAnswerBonusPlayerIds:
          [],

        roundAward: null,

        gameStats:
          createGameStats(
            players
          ),

        usedQuestions: [],

        phaseStartedAt: null,
        phaseEndsAt: null,
        phaseTimeout: null,
      };

      socket.join(code);

      callback?.({
        ok: true,
        room: getPublicRoom(
          rooms[code],
          socket.id
        ),
      });

      sendRoomUpdate(
        rooms[code]
      );

      console.log(
        `${cleanName} created room ${code}`
      );
    }
  );

  socket.on(
    "room:join",
    (
      {
        code,
        name,
        avatar,
      },
      callback
    ) => {
      const cleanCode =
        code
          ?.trim()
          .toUpperCase();

      const cleanName =
        name?.trim();

      if (!cleanName) {
        return callback?.({
          ok: false,
          error:
            "Enter your name.",
        });
      }

      const room =
        rooms[cleanCode];

      if (!room) {
        return callback?.({
          ok: false,
          error:
            "Room not found.",
        });
      }

      if (
        room.state !== "lobby"
      ) {
        return callback?.({
          ok: false,
          error:
            "Game already started.",
        });
      }

      if (
        room.players.length >=
        room.settings.maxPlayers
      ) {
        return callback?.({
          ok: false,
          error:
            "Room is full.",
        });
      }

      if (
        room.players.some(
          (player) =>
            player.name.toLowerCase() ===
            cleanName.toLowerCase()
        )
      ) {
        return callback?.({
          ok: false,
          error:
            "That name is already being used.",
        });
      }

      const newPlayer = {
        id: socket.id,
        name: cleanName,
        avatar:
          normalizeAvatar(
            avatar
          ),
        score: 0,
      };

      room.players.push(
        newPlayer
      );

      room.gameStats[
        socket.id
      ] = {
        fooled: 0,
        truthsFound: 0,
        perfectBluffs: 0,
        fooledBy: 0,
      };

      socket.join(
        cleanCode
      );

      callback?.({
        ok: true,
        room: getPublicRoom(
          room,
          socket.id
        ),
      });

      sendRoomUpdate(room);

      console.log(
        `${cleanName} joined room ${cleanCode}`
      );
    }
  );

  socket.on(
    "room:leave",
    (callback) => {
      const room =
        findRoomBySocket(
          socket.id
        );

      if (!room) {
        return callback?.({
          ok: true,
        });
      }

      const wasHost =
        room.hostId ===
        socket.id;

      room.players =
        room.players.filter(
          (player) =>
            player.id !==
            socket.id
        );

      delete room.answers[
        socket.id
      ];

      delete room.votes[
        socket.id
      ];

      delete room.roundPoints[
        socket.id
      ];

      delete room.gameStats[
        socket.id
      ];

      room.realAnswerBonusPlayerIds =
        room.realAnswerBonusPlayerIds.filter(
          (playerId) =>
            playerId !==
            socket.id
        );

      socket.leave(
        room.code
      );

      if (
        room.players.length ===
        0
      ) {
        clearPhaseTimer(room);

        delete rooms[
          room.code
        ];

        return callback?.({
          ok: true,
        });
      }

      if (wasHost) {
        room.hostId =
          room.players[0].id;
      }

      if (
        room.state ===
          "answering" &&
        Object.keys(
          room.answers
        ).length ===
          room.players.length
      ) {
        advanceToVoting(
          room
        );
      } else if (
        room.state ===
          "voting" &&
        Object.keys(
          room.votes
        ).length ===
          room.players.length
      ) {
        advanceToResults(
          room
        );
      }

      sendRoomUpdate(
        room
      );

      callback?.({
        ok: true,
      });
    }
  );

  socket.on(
    "game:start",
    (callback) => {
      const room =
        findRoomBySocket(
          socket.id
        );

      if (!room) {
        return callback?.({
          ok: false,
          error:
            "Room not found.",
        });
      }

      if (
        room.hostId !==
        socket.id
      ) {
        return callback?.({
          ok: false,
          error:
            "Only the host can start the game.",
        });
      }

      if (
        room.state !==
        "lobby"
      ) {
        return callback?.({
          ok: false,
          error:
            "Game has already started.",
        });
      }

      if (
        room.players.length <
        2
      ) {
        return callback?.({
          ok: false,
          error:
            "At least 2 players are required.",
        });
      }

      clearPhaseTimer(
        room
      );

      room.round = 1;

      room.answers = {};
      room.votes = {};
      room.choices = [];
      room.roundPoints = {};

      room.realAnswerBonusPlayerIds =
        [];

      room.roundAward =
        null;

      room.gameStats =
        createGameStats(
          room.players
        );

      room.currentQuestion =
        pickQuestion(
          room
        );

      beginTimedPhase(
        room,
        "answering",
        ANSWERING_DURATION_MS,
        advanceToVoting
      );

      sendRoomUpdate(
        room
      );

      callback?.({
        ok: true,
      });
    }
  );

  socket.on(
    "game:answer",
    (
      { answer },
      callback
    ) => {
      const room =
        findRoomBySocket(
          socket.id
        );

      if (!room) {
        return callback?.({
          ok: false,
          error:
            "Room not found.",
        });
      }

      if (
        room.state !==
        "answering"
      ) {
        return callback?.({
          ok: false,
          error:
            "Answers are closed.",
        });
      }

      if (
        Date.now() >=
        room.phaseEndsAt
      ) {
        advanceToVoting(
          room
        );

        sendRoomUpdate(
          room
        );

        return callback?.({
          ok: false,
          error:
            "Answering time is up.",
        });
      }

      const cleanAnswer =
        answer?.trim();

      if (!cleanAnswer) {
        return callback?.({
          ok: false,
          error:
            "Enter an answer.",
        });
      }

      if (
        room.answers[
          socket.id
        ]
      ) {
        return callback?.({
          ok: false,
          error:
            "You already submitted.",
        });
      }

      if (
        normalizeAnswer(
          cleanAnswer
        ) ===
        normalizeAnswer(
          room.currentQuestion
            ?.answer
        )
      ) {
        const alreadyRewarded =
          room.realAnswerBonusPlayerIds.includes(
            socket.id
          );

        if (
          !alreadyRewarded
        ) {
          room.realAnswerBonusPlayerIds.push(
            socket.id
          );

          room.roundPoints[
            socket.id
          ] =
            (room.roundPoints[
              socket.id
            ] || 0) + 500;
        }

        return callback?.({
          ok: false,
          realAnswer: true,
          bonus:
            alreadyRewarded
              ? 0
              : 500,
        });
      }

      room.answers[
        socket.id
      ] = cleanAnswer;

      if (
        Object.keys(
          room.answers
        ).length ===
        room.players.length
      ) {
        advanceToVoting(
          room
        );
      }

      sendRoomUpdate(
        room
      );

      callback?.({
        ok: true,
      });
    }
  );

  socket.on(
    "game:vote",
    (
      { choiceId },
      callback
    ) => {
      const room =
        findRoomBySocket(
          socket.id
        );

      if (!room) {
        return callback?.({
          ok: false,
          error:
            "Room not found.",
        });
      }

      if (
        room.state !==
        "voting"
      ) {
        return callback?.({
          ok: false,
          error:
            "Voting is closed.",
        });
      }

      if (
        Date.now() >=
        room.phaseEndsAt
      ) {
        advanceToResults(
          room
        );

        sendRoomUpdate(
          room
        );

        return callback?.({
          ok: false,
          error:
            "Voting time is up.",
        });
      }

      if (
        room.votes[
          socket.id
        ]
      ) {
        return callback?.({
          ok: false,
          error:
            "You already voted.",
        });
      }

      const choice =
        room.choices.find(
          (item) =>
            item.id ===
            choiceId
        );

      if (!choice) {
        return callback?.({
          ok: false,
          error:
            "Invalid answer.",
        });
      }

      if (
        (
          choice.ownerIds ||
          []
        ).includes(
          socket.id
        )
      ) {
        return callback?.({
          ok: false,
          error:
            "You cannot vote for your own answer.",
        });
      }

      room.votes[
        socket.id
      ] = choice.id;

      if (
        Object.keys(
          room.votes
        ).length ===
        room.players.length
      ) {
        advanceToResults(
          room
        );
      }

      sendRoomUpdate(
        room
      );

      callback?.({
        ok: true,
      });
    }
  );

  socket.on(
    "game:next",
    (callback) => {
      const room =
        findRoomBySocket(
          socket.id
        );

      if (!room) {
        return callback?.({
          ok: false,
          error:
            "Room not found.",
        });
      }

      if (
        room.hostId !==
        socket.id
      ) {
        return callback?.({
          ok: false,
          error:
            "Only the host can start the next round.",
        });
      }

      if (
        room.state !==
        "results"
      ) {
        return callback?.({
          ok: false,
          error:
            "Results are not ready yet.",
        });
      }

      if (
        room.round >=
        room.settings.totalRounds
      ) {
        clearPhaseTimer(
          room
        );

        room.state =
          "gameover";
      } else {
        resetForNextRound(
          room
        );
      }

      sendRoomUpdate(
        room
      );

      callback?.({
        ok: true,
      });
    }
  );

  socket.on(
    "game:play-again",
    (callback) => {
      const room =
        findRoomBySocket(
          socket.id
        );

      if (!room) {
        return callback?.({
          ok: false,
          error:
            "Room not found.",
        });
      }

      if (
        room.hostId !==
        socket.id
      ) {
        return callback?.({
          ok: false,
          error:
            "Only the host can play again.",
        });
      }

      if (
        room.state !==
        "gameover"
      ) {
        return callback?.({
          ok: false,
          error:
            "The game is not over yet.",
        });
      }

      resetForPlayAgain(
        room
      );

      sendRoomUpdate(
        room
      );

      callback?.({
        ok: true,
      });
    }
  );

  socket.on(
    "disconnect",
    () => {
      console.log(
        "Disconnected:",
        socket.id
      );

      for (
        const code of
          Object.keys(rooms)
      ) {
        const room =
          rooms[code];

        const playerIndex =
          room.players.findIndex(
            (player) =>
              player.id ===
              socket.id
          );

        if (
          playerIndex ===
          -1
        ) {
          continue;
        }

        const wasHost =
          room.hostId ===
          socket.id;

        room.players.splice(
          playerIndex,
          1
        );

        delete room.answers[
          socket.id
        ];

        delete room.votes[
          socket.id
        ];

        delete room.roundPoints[
          socket.id
        ];

        delete room.gameStats[
          socket.id
        ];

        if (
          room.players.length ===
          0
        ) {
          clearPhaseTimer(
            room
          );

          delete rooms[
            code
          ];

          continue;
        }

        if (wasHost) {
          room.hostId =
            room.players[0].id;
        }

        if (
          room.state ===
            "answering" &&
          Object.keys(
            room.answers
          ).length ===
            room.players.length
        ) {
          advanceToVoting(
            room
          );
        } else if (
          room.state ===
            "voting" &&
          Object.keys(
            room.votes
          ).length ===
            room.players.length
        ) {
          advanceToResults(
            room
          );
        }

        sendRoomUpdate(
          room
        );
      }
    }
  );
});

app.get(
  "/api/health",
  (req, res) => {
    res.json({
      status: "ok",
      rooms:
        Object.keys(rooms)
          .length,
    });
  }
);

const PORT = 3010;

httpServer.listen(
  PORT,
  "127.0.0.1",
  () => {
    console.log(
      `Bluff server running on http://localhost:${PORT}`
    );
  }
);