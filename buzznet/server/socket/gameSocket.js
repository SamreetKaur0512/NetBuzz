const jwt     = require("jsonwebtoken");
const User    = require("../models/User");
const GameRoom = require("../models/GameRoom");
const { getRandomQuestions } = require("../data/questionBank");
const { registerWyrEvents }  = require("./wyrSocket");
const { registerTttEvents }  = require("./tttSocket");
const { registerDrawEvents }  = require("./drawSocket");
const { registerSnakeEvents }  = require("./snakeSocket");
const { registerAiQuizEvents } = require("./aiQuizSocket");

// Per-room timers (question countdown)
const questionTimers    = new Map(); // roomCode → NodeJS.Timeout
const questionStartTimes = new Map(); // roomCode → timestamp when question started

async function authenticateSocket(socket, next) {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.query?.token;
    if (!token) return next(new Error("Token missing"));
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user    = await User.findById(decoded.id).select("-password");
    if (!user) return next(new Error("User not found"));
    socket.user = user;
    next();
  } catch {
    next(new Error("Invalid token"));
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Emit an error event back to the socket only */
const emitError = (socket, msg) =>
  socket.emit("gameError", { message: msg });

/** Strip answer keys before sending questions to clients */
const sanitizeQuestion = ({ answer: _a, ...q }) => q;

/** Advance to the next question or end the game */
async function advanceQuestion(gameNS, room) {
  const nextIdx = room.currentQuestion + 1;

  if (nextIdx >= room.questions.length) {
    return endGame(gameNS, room);
  }

  room.currentQuestion = nextIdx;
  await room.save();
  questionStartTimes.set(room.roomCode, Date.now());

  const q = room.questions[nextIdx];
  gameNS.to(room.roomCode).emit("gameUpdate", {
    event:           "nextQuestion",
    questionIndex:   nextIdx,
    totalQuestions:  room.questions.length,
    question:        sanitizeQuestion(q),
    timeLimit:       room.questionTimeLimit,
    leaderboard:     buildLeaderboard(room),
  });

  scheduleNextQuestion(gameNS, room);
}

/** Schedule the auto-advance timer for the current question */
function scheduleNextQuestion(gameNS, room) {
  clearRoomTimer(room.roomCode);
  const timer = setTimeout(async () => {
    const fresh = await GameRoom.findOne({ roomCode: room.roomCode });
    if (fresh && fresh.status === "in_progress") {
      // Reveal correct answer before advancing
      const q = fresh.questions[fresh.currentQuestion];
      gameNS.to(fresh.roomCode).emit("gameUpdate", {
        event:         "timeUp",
        questionIndex: fresh.currentQuestion,
        correctAnswer: q.answer,
        explanation:   q.explanation || null,
      });
      setTimeout(() => advanceQuestion(gameNS, fresh), 2000);
    }
  }, room.questionTimeLimit * 1000);

  questionTimers.set(room.roomCode, timer);
}

function clearRoomTimer(roomCode) {
  if (questionTimers.has(roomCode)) {
    clearTimeout(questionTimers.get(roomCode));
    questionTimers.delete(roomCode);
  }
}

function buildLeaderboard(room) {
  const sorted = [...room.players].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Tiebreaker: less total answer time = higher rank
    const timeA = a.totalAnswerTime || 999999;
    const timeB = b.totalAnswerTime || 999999;
    return timeA - timeB;
  });

  // Assign equal positions for truly equal score + time
  let currentPos = 1;
  return sorted.map((p, i) => {
    if (i > 0) {
      const prev = sorted[i - 1];
      const sameScore = p.score === prev.score;
      const sameTime  = (p.totalAnswerTime || 999999) === (prev.totalAnswerTime || 999999);
      if (!sameScore || !sameTime) currentPos = i + 1;
    }
    return { rank: currentPos, userId: p.userId, username: p.username, score: p.score };
  });
}

async function endGame(gameNS, room) {
  clearRoomTimer(room.roomCode);

  room.status     = "finished";
  room.finishedAt = new Date();

  const leaderboard = buildLeaderboard(room);
  if (leaderboard.length) {
    room.winnerId = leaderboard[0].userId;
  }
  await room.save();

  gameNS.to(room.roomCode).emit("endGame", {
    roomCode:    room.roomCode,
    leaderboard,
    winner:      leaderboard[0] || null,
    finishedAt:  room.finishedAt,
  });

  console.log(`[Game] 🏁 Room ${room.roomCode} finished. Winner: ${leaderboard[0]?.username}`);
}

// ─── Main registration function ───────────────────────────────────────────────

/**
 * @param {import("socket.io").Namespace} gameNS
 */
function registerGameSocket(gameNS) {
  gameNS.use(authenticateSocket);

  gameNS.on("connection", (socket) => {
    const userId   = socket.user._id.toString();
    const username = socket.user.username;
    console.log(`[Game] 🔗 ${username} connected (${socket.id})`);

    // ── createRoom ──────────────────────────────────────────────────────────
    // { gameType, maxPlayers, questionCount, questionTimeLimit }
    socket.on("createRoom", async (data, ack) => {
      try {
        const {
          gameType         = "quiz",
          maxPlayers       = 8,
          questionCount    = 10,
          questionTimeLimit = 20,
        } = data || {};

        // Generate unique code
        let roomCode, exists = true;
        while (exists) {
          roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
          exists   = await GameRoom.exists({ roomCode });
        }

        const room = await GameRoom.create({
          roomCode,
          hostId: userId,
          gameType,
          maxPlayers,
          totalQuestions: questionCount,
          questionTimeLimit,
          players: [{ userId, username, score: 0, ready: false }],
        });

        socket.join(roomCode);
        socket.roomCode = roomCode;

        gameNS.to(roomCode).emit("roomCreated", {
          roomCode: room.roomCode,
          gameType: room.gameType,
          host:     { userId, username },
          players:  room.players,
          maxPlayers: room.maxPlayers,
        });

        console.log(`[Game] 🆕 Room ${roomCode} created by ${username}`);
        if (typeof ack === "function") ack({ success: true, roomCode });
      } catch (err) {
        emitError(socket, err.message);
        if (typeof ack === "function") ack({ success: false, message: err.message });
      }
    });

    // ── joinRoom ─────────────────────────────────────────────────────────────
    // { roomCode }
    socket.on("joinRoom", async (data, ack) => {
      try {
        const roomCode = data?.roomCode?.toUpperCase();
        if (!roomCode) throw new Error("roomCode required");

        const room = await GameRoom.findOne({ roomCode });
        if (!room) throw new Error("Room not found");

        // Check if this user is already a player in this room
        const alreadyIn = room.players.some((p) => p.userId.toString() === userId);

        // If game is in progress or finished, only allow existing players to rejoin (reconnect)
        if (room.status !== "waiting") {
          if (alreadyIn) {
            // Existing player reconnecting mid-game — restore their socket session
            socket.join(roomCode);
            socket.roomCode = roomCode;
            if (typeof ack === "function") ack({
              success: true,
              alreadyIn: true,
              status: room.status,
              room: { roomCode, players: room.players, gameType: room.gameType, maxPlayers: room.maxPlayers, totalQuestions: room.totalQuestions, questionTimeLimit: room.questionTimeLimit, hostId: room.hostId },
            });
          } else {
            if (typeof ack === "function") ack({ success: false, message: "Game already started or finished" });
          }
          return;
        }

        if (room.players.length >= room.maxPlayers) throw new Error("Room is full");

        if (alreadyIn) {
          // Already in room waiting — just rejoin the socket room and return current state
          socket.join(roomCode);
          socket.roomCode = roomCode;
          if (typeof ack === "function") ack({
            success: true,
            alreadyIn: true,
            status: room.status,
            room: { roomCode, players: room.players, gameType: room.gameType, maxPlayers: room.maxPlayers, totalQuestions: room.totalQuestions, questionTimeLimit: room.questionTimeLimit, hostId: room.hostId },
          });
          return;
        }

        room.players.push({ userId, username, score: 0, ready: false });
        await room.save();

        // Join socket room first so the new player is in it before the emit
        socket.join(roomCode);
        socket.roomCode = roomCode;

        // Deduplicate players list before broadcasting (safety net)
        const seen = new Set();
        const uniquePlayers = room.players.filter(p => {
          const id = p.userId.toString();
          if (seen.has(id)) return false;
          seen.add(id); return true;
        });

        // Notify everyone already in the room (excluding the new joiner)
        socket.to(roomCode).emit("playerJoined", {
          player:  { userId, username },
          players: uniquePlayers,
          roomCode,
        });

        // Send directly to the new joiner so their screen updates instantly
        socket.emit("playerJoined", {
          player:  { userId, username },
          players: uniquePlayers,
          roomCode,
        });

        console.log(`[Game] ➡️  ${username} joined room ${roomCode}`);
        if (typeof ack === "function") ack({
          success: true,
          alreadyIn: false,
          room: { roomCode, players: room.players, gameType: room.gameType, maxPlayers: room.maxPlayers, totalQuestions: room.totalQuestions, questionTimeLimit: room.questionTimeLimit, hostId: room.hostId },
        });
      } catch (err) {
        // Don't emit gameError for expected user-facing errors like "Room is full"
        const silentErrors = ["Room is full", "Game already started or finished", "Room not found"];
        if (!silentErrors.includes(err.message)) {
          emitError(socket, err.message);
        }
        if (typeof ack === "function") ack({ success: false, message: err.message });
      }
    });

    // ── invitePlayer ─────────────────────────────────────────────────────────
    // { roomCode, inviteeId }
    socket.on("invitePlayer", async ({ roomCode, inviteeId }) => {
      const room = await GameRoom.findOne({ roomCode: roomCode?.toUpperCase() });
      if (!room) return emitError(socket, "Room not found");
      if (room.hostId.toString() !== userId) return emitError(socket, "Only the host can invite players");

      // Send to invitee's personal socket room if online
      gameNS.to(`user:${inviteeId}`).emit("gameInvite", {
        roomCode: room.roomCode,
        gameType: room.gameType,
        from:     { userId, username },
        players:  room.players.length,
        maxPlayers: room.maxPlayers,
      });
    });

    // ── playerReady ──────────────────────────────────────────────────────────
    socket.on("playerReady", async ({ roomCode }, ack) => {
      try {
        const code = roomCode?.toUpperCase();
        const room = await GameRoom.findOne({ roomCode: code });
        if (!room) throw new Error("Room not found");

        const player = room.players.find((p) => p.userId.toString() === userId);
        if (player) { player.ready = true; }
        await room.save();

        gameNS.to(code).emit("gameUpdate", {
          event:   "playerReady",
          userId,
          username,
          players: room.players,
          allReady: room.players.every((p) => p.ready),
        });

        if (typeof ack === "function") ack({ success: true });
      } catch (err) {
        if (typeof ack === "function") ack({ success: false, message: err.message });
      }
    });

    // ── startGame ────────────────────────────────────────────────────────────
    // Only the host may fire this. { roomCode }
    socket.on("startGame", async (data, ack) => {
      try {
        const roomCode = data?.roomCode?.toUpperCase();
        const room     = await GameRoom.findOne({ roomCode });

        if (!room)                                         throw new Error("Room not found");
        if (room.hostId.toString() !== userId)             throw new Error("Only the host can start the game");
        if (room.status !== "waiting")                     throw new Error("Game is already running or finished");
        // quiz, puzzle, aiquiz support single-player practice mode
        const soloAllowed = ['quiz', 'puzzle', 'aiquiz'].includes(room.gameType);
        if (!soloAllowed && room.players.length < 2)       throw new Error("Need at least 2 players to start");

        // Generate questions and lock them into the room document
        room.questions      = getRandomQuestions(room.gameType, room.totalQuestions);
        room.status         = "in_progress";
        room.currentQuestion = 0;
        room.startedAt      = new Date();
        // Reset scores
        room.players.forEach((p) => { p.score = 0; p.answers = new Map(); p.totalAnswerTime = 0; });
        await room.save();

        questionStartTimes.set(roomCode, Date.now());
        const firstQ = room.questions[0];

        gameNS.to(roomCode).emit("startGame", {
          roomCode,
          gameType:       room.gameType,
          totalQuestions: room.questions.length,
          timeLimit:      room.questionTimeLimit,
          question:       sanitizeQuestion(firstQ),
          questionIndex:  0,
          players:        room.players,
        });

        scheduleNextQuestion(gameNS, room);

        console.log(`[Game] ▶️  Room ${roomCode} started (${room.gameType}, ${room.questions.length} questions)`);
        if (typeof ack === "function") ack({ success: true });
      } catch (err) {
        emitError(socket, err.message);
        if (typeof ack === "function") ack({ success: false, message: err.message });
      }
    });

    // ── submitAnswer ─────────────────────────────────────────────────────────
    // { roomCode, questionIndex, answer (0-3 option index) }
    socket.on("submitAnswer", async (data, ack) => {
      try {
        const { roomCode, questionIndex, answer } = data;
        const room = await GameRoom.findOne({ roomCode: roomCode?.toUpperCase() });

        if (!room)                           throw new Error("Room not found");
        if (room.status !== "in_progress")   throw new Error("Game is not in progress");
        if (questionIndex !== room.currentQuestion) {
          throw new Error("Answer submitted for wrong question");
        }

        const player = room.players.find((p) => p.userId.toString() === userId);
        if (!player) throw new Error("You are not in this room");

        // Prevent double-answering
        if (player.answers.has(String(questionIndex))) {
          throw new Error("Already answered this question");
        }

        const q         = room.questions[questionIndex];
        const isCorrect = answer === q.answer;
        const points    = isCorrect ? (q.points || 10) : 0;

        const answerTime = Date.now() - (questionStartTimes.get(roomCode) || Date.now());
        player.answers.set(String(questionIndex), { answer, correct: isCorrect, time: answerTime });
        if (isCorrect) {
          player.score += points;
          player.totalAnswerTime = (player.totalAnswerTime || 0) + answerTime;
        }
        await room.save();

        // Confirm to the answering player
        if (typeof ack === "function") {
          ack({ success: true, correct: isCorrect, points, correctAnswer: isCorrect ? null : q.answer });
        }

        // Broadcast updated leaderboard
        gameNS.to(roomCode).emit("gameUpdate", {
          event:       "answerSubmitted",
          userId,
          username,
          correct:     isCorrect,
          leaderboard: buildLeaderboard(room),
        });

        // If ALL players answered, advance immediately
        const allAnswered = room.players.every((p) =>
          p.answers.has(String(questionIndex))
        );
        if (allAnswered) {
          clearRoomTimer(roomCode);
          gameNS.to(roomCode).emit("gameUpdate", {
            event:         "allAnswered",
            questionIndex,
            correctAnswer: q.answer,
          });
          setTimeout(() => advanceQuestion(gameNS, room), 2000);
        }
      } catch (err) {
        emitError(socket, err.message);
        if (typeof ack === "function") ack({ success: false, message: err.message });
      }
    });

    // ── leaveRoom ────────────────────────────────────────────────────────────
    socket.on("leaveRoom", async ({ roomCode }) => {
      const code = roomCode?.toUpperCase();
      const room = await GameRoom.findOne({ roomCode: code });
      if (!room) return;

      room.players = room.players.filter((p) => p.userId.toString() !== userId);

      if (room.players.length === 0) {
        clearRoomTimer(code);
        await GameRoom.deleteOne({ roomCode: code });
      } else {
        // Transfer host if host left
        if (room.hostId.toString() === userId && room.players.length > 0) {
          room.hostId = room.players[0].userId;
        }
        await room.save();
      }

      socket.leave(code);
      gameNS.to(code).emit("playerLeft", { userId, username, players: room.players });
      console.log(`[Game] ⬅️  ${username} left room ${code}`);
    });

    // ── disconnect ───────────────────────────────────────────────────────────
    socket.on("disconnect", () => {
      console.log(`[Game] ✂️  ${username} disconnected`);
    });

    // ── WYR events ──────────────────────────────────────────────────────────
    registerWyrEvents(gameNS, socket);

    // ── TTT events ──────────────────────────────────────────────────────────
    registerTttEvents(gameNS, socket);

    // ── Draw & Guess events ─────────────────────────────────────────────────
    registerDrawEvents(gameNS, socket);

    // ── Snake events ─────────────────────────────────────────────────────────
    registerSnakeEvents(gameNS, socket);

    // ── AI Quiz events ───────────────────────────────────────────────────────
    registerAiQuizEvents(gameNS, socket);

    // Join personal notification room
    socket.join(`user:${userId}`);
  });
}

module.exports = registerGameSocket;