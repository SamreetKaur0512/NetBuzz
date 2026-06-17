const GameRoom  = require("../models/GameRoom");
const { getRandomWord, getWordHint } = require("../data/drawWords");

const roundTimers = new Map();
const turnLocks   = new Map();

function clearTimer(roomCode) {
  if (roundTimers.has(roomCode)) {
    clearTimeout(roundTimers.get(roomCode));
    roundTimers.delete(roomCode);
  }
}

function buildScoreboard(room) {
  return room.players.map(p => ({
    userId: p.userId, username: p.username, score: p.score || 0,
  })).sort((a, b) => b.score - a.score);
}

function applyPendingPoints(room, state) {
  const pending = state.pendingPoints || {};
  Object.keys(pending).forEach(uid => {
    const player = room.players.find(p => p.userId.toString() === uid);
    if (player) player.score = (player.score || 0) + pending[uid];
  });
}

async function endDrawGame(gameNS, room) {
  clearTimer(room.roomCode);
  room.status     = 'finished';
  room.finishedAt = new Date();
  const scoreboard = buildScoreboard(room);
  if (scoreboard.length > 0) room.winnerId = scoreboard[0].userId;
  await room.save();
  gameNS.to(room.roomCode).emit('drawGameEnd', { scoreboard, winner: scoreboard[0] || null });
}

async function startTurn(gameNS, roomCode) {
  if (turnLocks.get(roomCode)) return;
  turnLocks.set(roomCode, true);

  try {
    const room = await GameRoom.findOne({ roomCode });
    if (!room || room.status !== 'in_progress') return;

    const state       = room.wyrState || {};
    const order       = state.turnOrder || room.players.map(p => p.userId.toString());
    const turnIdx     = state.turnIdx   || 0;
    const round       = state.round     || 1;
    const totalRounds = state.totalRounds || 3;

    if (turnIdx >= order.length) {
      if (round >= totalRounds) return endDrawGame(gameNS, room);
      const newState = { ...state, turnIdx: 0, round: round + 1, currentWord: null, guessed: [], pendingPoints: {} };
      room.wyrState = newState;
      room.markModified('wyrState');
      await room.save();
      gameNS.to(roomCode).emit('drawRoundStart', { round: round + 1, totalRounds, scoreboard: buildScoreboard(room) });
      setTimeout(() => startTurn(gameNS, roomCode), 3000);
      return;
    }

    const drawerId       = order[turnIdx];
    const word           = getRandomWord();
    const hint           = getWordHint(word);
    const timeLimit      = state.timeLimit || 60;
    const drawerUsername = room.players.find(p => p.userId.toString() === drawerId)?.username;

    room.wyrState = { ...state, turnOrder: order, turnIdx, round, totalRounds, currentWord: word, drawerId, guessed: [], timeLimit, pendingPoints: {} };
    room.markModified('wyrState');
    await room.save();

    gameNS.to(`user:${drawerId}`).emit('drawYourTurn', { word, hint, timeLimit, round, totalRounds, drawerId, drawerName: drawerUsername });

    setTimeout(() => {
      gameNS.to(roomCode).emit('drawNewTurn', { drawerId, drawerName: drawerUsername, hint, wordLength: word.length, timeLimit, round, totalRounds });
    }, 300);

    clearTimer(roomCode);
    const timer = setTimeout(async () => {
      const fresh = await GameRoom.findOne({ roomCode });
      if (!fresh || fresh.status !== 'in_progress') return;
      const st = fresh.wyrState;
      if (!st || st.drawerId !== drawerId || st.currentWord !== word) return;
      applyPendingPoints(fresh, st);
      await fresh.save();
      gameNS.to(roomCode).emit('drawTurnEnd', { word: st.currentWord, drawerId, timeUp: true, scoreboard: buildScoreboard(fresh), pointsBreakdown: st.pendingPoints || {} });
      fresh.wyrState = { ...st, turnIdx: (st.turnIdx || 0) + 1, currentWord: null, guessed: [], drawerId: null, pendingPoints: {} };
      fresh.markModified('wyrState');
      await fresh.save();
      setTimeout(() => startTurn(gameNS, roomCode), 3000);
    }, timeLimit * 1000);
    roundTimers.set(roomCode, timer);

  } finally {
    setTimeout(() => turnLocks.delete(roomCode), 500);
  }
}

function registerDrawEvents(gameNS, socket) {
  const userId   = socket.user._id.toString();
  const username = socket.user.username;

  socket.on('drawStartGame', async ({ roomCode }, ack) => {
    try {
      const room = await GameRoom.findOne({ roomCode: roomCode?.toUpperCase() });
      if (!room)                             throw new Error('Room not found');
      if (room.hostId.toString() !== userId) throw new Error('Only host can start');
      if (room.status !== 'waiting')         throw new Error('Game already started');
      if (room.players.length < 2)           throw new Error('Need at least 2 players');

      const order = room.players.map(p => p.userId.toString());
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }

      room.players.forEach(p => p.score = 0);
      room.status    = 'in_progress';
      room.startedAt = new Date();
      room.wyrState  = { turnOrder: order, turnIdx: 0, round: 1, totalRounds: room.totalQuestions || 3, timeLimit: room.questionTimeLimit || 60, currentWord: null, drawerId: null, guessed: [], pendingPoints: {} };
      room.markModified('wyrState');
      await room.save();

      gameNS.to(roomCode).emit('drawGameStarted', {
        players: room.players.map(p => ({ userId: p.userId, username: p.username, score: 0 })),
        totalRounds: room.wyrState.totalRounds,
      });

      setTimeout(() => startTurn(gameNS, roomCode), 1500);
      if (typeof ack === 'function') ack({ success: true });
    } catch (err) {
      if (typeof ack === 'function') ack({ success: false, message: err.message });
    }
  });

  socket.on('drawStroke', ({ roomCode, stroke }) => {
    socket.to(roomCode).emit('drawStroke', { stroke, userId });
  });

  socket.on('drawClear', ({ roomCode }) => {
    socket.to(roomCode).emit('drawClear');
  });

  socket.on('drawGuess', async ({ roomCode, guess }, ack) => {
    try {
      const room = await GameRoom.findOne({ roomCode: roomCode?.toUpperCase() });
      if (!room || room.status !== 'in_progress') return;

      const state = room.wyrState;
      if (!state?.currentWord) return;
      if (state.drawerId === userId) return;
      if ((state.guessed || []).includes(userId)) return;

      const correct = guess.trim().toLowerCase() === state.currentWord.toLowerCase();

      if (!correct) {
        gameNS.to(roomCode).emit('drawMessage', { userId, username, text: guess, correct: false, isSystem: false });
      }

      if (correct) {
        const guessedCount = (state.guessed || []).length;
        const points       = Math.max(50, 100 - guessedCount * 10);
        if (!state.pendingPoints) state.pendingPoints = {};
        state.pendingPoints[userId]         = points;
        state.pendingPoints[state.drawerId] = (state.pendingPoints[state.drawerId] || 0) + 20;
        state.guessed = [...(state.guessed || []), userId];
        room.wyrState = state;
        room.markModified('wyrState');
        await room.save();

        gameNS.to(`user:${userId}`).emit('drawYouGuessed', { points, guessedCount: state.guessed.length, total: room.players.length - 1 });
        gameNS.to(roomCode).emit('drawGuessCount', { guessed: state.guessed.length, total: room.players.length - 1, guesserName: username });

        if (state.guessed.length >= room.players.length - 1) {
          clearTimer(roomCode);
          applyPendingPoints(room, state);
          await room.save();
          gameNS.to(roomCode).emit('drawTurnEnd', { word: state.currentWord, drawerId: state.drawerId, timeUp: false, scoreboard: buildScoreboard(room), pointsBreakdown: state.pendingPoints });
          room.wyrState = { ...state, turnIdx: (state.turnIdx || 0) + 1, currentWord: null, guessed: [], drawerId: null, pendingPoints: {} };
          room.markModified('wyrState');
          await room.save();
          setTimeout(() => startTurn(gameNS, roomCode), 4000);
        }
      }

      if (typeof ack === 'function') ack({ success: true, correct });
    } catch (err) {
      if (typeof ack === 'function') ack({ success: false });
    }
  });
}

module.exports = { registerDrawEvents };
