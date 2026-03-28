const GameRoom = require("../models/GameRoom");
const { getWyrQuestions } = require("../data/wyrQuestions");

// Per-room vote timers
const voteTimers = new Map();

function clearTimer(roomCode) {
  if (voteTimers.has(roomCode)) {
    clearTimeout(voteTimers.get(roomCode));
    voteTimers.delete(roomCode);
  }
}

// ── Build alive players list ──────────────────────────────────────────────────
function alivePlayers(room) {
  return room.players.filter(p => !p.eliminated);
}

// ── Build vote summary ────────────────────────────────────────────────────────
function buildVoteSummary(room) {
  const alive = alivePlayers(room);
  const votes = { A: [], B: [] };
  const voteMap = room.wyrState?.votes || {};
  alive.forEach(p => {
    const v = voteMap[p.userId.toString()];
    if (v === 'A') votes.A.push(p.username);
    else if (v === 'B') votes.B.push(p.username);
  });
  return votes;
}

// ── Process round result ──────────────────────────────────────────────────────
async function processRound(gameNS, room) {
  clearTimer(room.roomCode);
  const alive = alivePlayers(room);
  if (!room.wyrState) room.wyrState = { currentQuestion: 0, votes: {} };
  const votes  = buildVoteSummary(room);
  const countA = votes.A.length;
  const countB = votes.B.length;

  // Draw → replay same question
  if (countA === countB) {
    // Reset votes for current question
    room.wyrState = {
      currentQuestion: room.wyrState?.currentQuestion || 0,
      votes: {},
    };
    room.markModified('wyrState');
    await room.save();

    gameNS.to(room.roomCode).emit('wyrRoundResult', {
      draw:     true,
      votes,
      countA, countB,
      survivors: alive.map(p => ({ userId: p.userId, username: p.username })),
      message:  "It's a draw! Replaying this question…",
    });

    setTimeout(() => startVote(gameNS, room), 3000);
    return;
  }

  // Determine majority and minority
  const majorityVote = countA > countB ? 'A' : 'B';
  const eliminated   = alive.filter(p => {
    const v = room.wyrState?.votes?.[p.userId.toString()];
    return v !== majorityVote && v !== undefined;
  });
  // Players who didn't vote count as minority too
  const didntVote = alive.filter(p => !room.wyrState?.votes?.[p.userId.toString()]);
  const allEliminated = [...eliminated, ...didntVote];

  // Mark them eliminated
  allEliminated.forEach(ep => {
    const player = room.players.find(p => p.userId.toString() === ep.userId.toString());
    if (player) player.eliminated = true;
  });

  const survivors = alivePlayers(room);

  // Advance question index
  room.wyrState = {
    currentQuestion: (room.wyrState?.currentQuestion || 0) + 1,
    votes: {},
  };
  room.markModified('wyrState');
  await room.save();

  gameNS.to(room.roomCode).emit('wyrRoundResult', {
    draw:        false,
    majorityVote,
    votes,
    countA, countB,
    eliminated:  allEliminated.map(p => ({ userId: p.userId, username: p.username })),
    survivors:   survivors.map(p => ({ userId: p.userId, username: p.username })),
    message:     allEliminated.length > 0
      ? `${allEliminated.map(p => p.username).join(', ')} eliminated!`
      : 'Everyone voted majority!',
  });

  setTimeout(async () => {
    // Check end condition: 2 or fewer survivors
    if (survivors.length <= 2) {
      return endWyrGame(gameNS, room, survivors);
    }
    // Next round
    await startVote(gameNS, room);
  }, 4000);
}

// ── Start a vote round ────────────────────────────────────────────────────────
async function startVote(gameNS, room) {
  const questions = room.questions;
  const qIdx      = (room.wyrState && room.wyrState.currentQuestion != null) ? room.wyrState.currentQuestion : 0;

  if (qIdx >= questions.length) {
    // Ran out of questions — survivors all win
    return endWyrGame(gameNS, room, alivePlayers(room));
  }

  const q = questions[qIdx];
  const alive = alivePlayers(room);

  gameNS.to(room.roomCode).emit('wyrNewRound', {
    questionIndex: qIdx,
    question: q,
    alivePlayers: alive.map(p => ({ userId: p.userId, username: p.username })),
    totalPlayers: room.players.length,
    timeLimit: room.questionTimeLimit || 20,
  });

  // Auto-process after time limit
  clearTimer(room.roomCode);
  const timer = setTimeout(async () => {
    const fresh = await GameRoom.findOne({ roomCode: room.roomCode });
    if (fresh && fresh.status === 'in_progress') {
      await processRound(gameNS, fresh);
    }
  }, (room.questionTimeLimit || 20) * 1000);
  voteTimers.set(room.roomCode, timer);
}

// ── End game ──────────────────────────────────────────────────────────────────
async function endWyrGame(gameNS, room, winners) {
  clearTimer(room.roomCode);
  room.status     = 'finished';
  room.finishedAt = new Date();
  if (winners.length === 1) room.winnerId = winners[0].userId;
  await room.save();

  gameNS.to(room.roomCode).emit('wyrGameEnd', {
    winners: winners.map(p => ({ userId: p.userId, username: p.username })),
    allPlayers: room.players.map(p => ({
      userId: p.userId, username: p.username,
      eliminated: p.eliminated || false,
    })),
  });
}

// ── Register WYR socket events ────────────────────────────────────────────────
function registerWyrEvents(gameNS, socket) {
  const userId   = socket.user._id.toString();
  const username = socket.user.username;

  // ── wyrStartGame ────────────────────────────────────────────────────────────
  socket.on('wyrStartGame', async ({ roomCode }, ack) => {
    try {
      const room = await GameRoom.findOne({ roomCode: roomCode?.toUpperCase() });
      if (!room)                             throw new Error('Room not found');
      if (room.hostId.toString() !== userId) throw new Error('Only host can start');
      if (room.status !== 'waiting')         throw new Error('Game already started');
      if (room.players.length < 3)           throw new Error('Need at least 3 players for Would You Rather');

      room.questions    = getWyrQuestions(40);
      room.status       = 'in_progress';
      room.startedAt    = new Date();
      room.players.forEach(p => { p.eliminated = false; p.score = 0; });
      room.wyrState     = { currentQuestion: 0, votes: {} };
      await room.save();

      gameNS.to(roomCode).emit('wyrGameStarted', {
        totalPlayers: room.players.length,
        players: room.players.map(p => ({ userId: p.userId, username: p.username })),
      });

      setTimeout(() => startVote(gameNS, room), 1500);
      if (typeof ack === 'function') ack({ success: true });
    } catch (err) {
      if (typeof ack === 'function') ack({ success: false, message: err.message });
    }
  });

  // ── wyrVote ─────────────────────────────────────────────────────────────────
  socket.on('wyrVote', async ({ roomCode, vote }, ack) => {
    try {
      if (vote !== 'A' && vote !== 'B') throw new Error('Invalid vote');
      const room = await GameRoom.findOne({ roomCode: roomCode?.toUpperCase() });
      if (!room)                         throw new Error('Room not found');
      if (room.status !== 'in_progress') throw new Error('Game not in progress');

      const player = room.players.find(p => p.userId.toString() === userId);
      if (!player || player.eliminated)  throw new Error('You are eliminated');

      // Already voted?
      if (room.wyrState?.votes?.[userId]) throw new Error('Already voted');

      // Rebuild wyrState safely
      const currentQ = room.wyrState?.currentQuestion || 0;
      const existingVotes = room.wyrState?.votes || {};
      existingVotes[userId] = vote;
      room.wyrState = { currentQuestion: currentQ, votes: existingVotes };
      room.markModified('wyrState');
      await room.save();

      // Broadcast vote count (without revealing who voted what)
      const alive  = alivePlayers(room);
      const voted  = Object.keys(room.wyrState.votes).length;

      gameNS.to(roomCode).emit('wyrVoteUpdate', {
        voted,
        total: alive.length,
        voterId: userId,
        voterName: username,
      });

      if (typeof ack === 'function') ack({ success: true });

      // All alive players voted → process immediately
      if (voted >= alive.length) {
        clearTimer(roomCode);
        await processRound(gameNS, room);
      }
    } catch (err) {
      if (typeof ack === 'function') ack({ success: false, message: err.message });
    }
  });
}

module.exports = { registerWyrEvents, clearTimer };