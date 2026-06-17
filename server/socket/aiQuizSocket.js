const GameRoom = require("../models/GameRoom");
const questionStartTimes = new Map();

function registerAiQuizEvents(gameNS, socket) {
  const userId   = socket.user._id.toString();
  const username = socket.user.username;

  // ── Host sends subcategories fetched from client-side AI ──────────────────
  socket.on('aiQuizSetSubs', async ({ roomCode, subcategories, currentPath }, ack) => {
    try {
      gameNS.to(roomCode).emit('aiQuizSubs', {
        subcategories,
        canDeepen: true,
        currentPath,
      });
      if (typeof ack === 'function') ack({ success: true });
    } catch (err) {
      if (typeof ack === 'function') ack({ success: false, message: err.message });
    }
  });

  // ── Host sends AI-generated questions to store in room ────────────────────
  socket.on('aiQuizSetQuestions', async ({ roomCode, questions, topic, questionCount }, ack) => {
    try {
      const room = await GameRoom.findOne({ roomCode: roomCode?.toUpperCase() });
      if (!room)                             throw new Error('Room not found');
      if (room.hostId.toString() !== userId) throw new Error('Only host can do this');

      room.questions      = questions.map((q, i) => ({ ...q, id: i, points: 10 }));
      room.totalQuestions = questions.length;
      room.wyrState       = { topic, questionCount, generated: true };
      room.markModified('wyrState');
      await room.save();

      gameNS.to(roomCode).emit('aiQuizReady', {
        topic,
        questionCount: questions.length,
        message: `✅ ${questions.length} questions ready about "${topic}"!`,
      });

      if (typeof ack === 'function') ack({ success: true });
    } catch (err) {
      if (typeof ack === 'function') ack({ success: false, message: err.message });
    }
  });

  // ── Broadcast loading state ────────────────────────────────────────────────
  socket.on('aiQuizBroadcastLoading', ({ roomCode, message }) => {
    gameNS.to(roomCode).emit('aiQuizLoading', { message });
  });

  // ── Broadcast error ───────────────────────────────────────────────────────
  socket.on('aiQuizBroadcastError', ({ roomCode, message }) => {
    gameNS.to(roomCode).emit('aiQuizError', { message });
  });

  // ── Start the actual quiz ─────────────────────────────────────────────────
  socket.on('aiQuizStart', async ({ roomCode }, ack) => {
    try {
      const room = await GameRoom.findOne({ roomCode: roomCode?.toUpperCase() });
      if (!room)                  throw new Error('Room not found');
      if (room.hostId.toString() !== userId) throw new Error('Only host can start');
      if (!room.questions?.length) throw new Error('Generate questions first');

      room.status           = 'in_progress';
      room.currentQuestion  = 0;
      room.startedAt        = new Date();
      room.players.forEach(p => { p.score = 0; p.answers = new Map(); p.totalAnswerTime = 0; });
      await room.save();

      questionStartTimes.set(roomCode, Date.now());

      const firstQ = { ...room.questions[0] };
      delete firstQ.answer;
      delete firstQ.explanation;

      gameNS.to(roomCode).emit('startGame', {
        roomCode,
        gameType:       'aiquiz',
        totalQuestions: room.questions.length,
        timeLimit:      room.questionTimeLimit || 20,
        question:       firstQ,
        questionIndex:  0,
        players:        room.players,
        topic:          room.wyrState?.topic,
      });

      // Schedule first question timer
      scheduleQuestion(gameNS, room, 0, questionStartTimes);

      if (typeof ack === 'function') ack({ success: true });
    } catch (err) {
      if (typeof ack === 'function') ack({ success: false, message: err.message });
    }
  });
}

// Reuse the same question scheduling logic as main quiz
function scheduleQuestion(gameNS, room, questionIndex, startTimes) {
  startTimes.set(room.roomCode, Date.now());
  const timer = setTimeout(async () => {
    const fresh = await GameRoom.findOne({ roomCode: room.roomCode });
    if (!fresh || fresh.status !== 'in_progress') return;
    if (fresh.currentQuestion !== questionIndex) return;

    const q = fresh.questions[questionIndex];
    gameNS.to(fresh.roomCode).emit('gameUpdate', {
      event:         'timeUp',
      questionIndex,
      correctAnswer: q.answer,
      explanation:   q.explanation || null,
    });

    setTimeout(async () => {
      const nextIdx = questionIndex + 1;
      if (nextIdx >= fresh.questions.length) {
        // End game
        const leaderboard = [...fresh.players]
          .sort((a, b) => b.score !== a.score ? b.score - a.score : (a.totalAnswerTime||999999) - (b.totalAnswerTime||999999))
          .map((p, i) => ({ rank: i+1, userId: p.userId, username: p.username, score: p.score }));

        fresh.status     = 'finished';
        fresh.finishedAt = new Date();
        if (leaderboard[0]) fresh.winnerId = leaderboard[0].userId;
        await fresh.save();

        gameNS.to(fresh.roomCode).emit('endGame', { leaderboard, winner: leaderboard[0] });
      } else {
        fresh.currentQuestion = nextIdx;
        await fresh.save();

        const nextQ = { ...fresh.questions[nextIdx] };
        delete nextQ.answer;
        delete nextQ.explanation;

        gameNS.to(fresh.roomCode).emit('gameUpdate', {
          event:          'nextQuestion',
          questionIndex:  nextIdx,
          totalQuestions: fresh.questions.length,
          question:       nextQ,
          timeLimit:      fresh.questionTimeLimit || 20,
          leaderboard:    [...fresh.players].sort((a,b) => b.score - a.score).map((p,i) => ({ rank:i+1, userId:p.userId, username:p.username, score:p.score })),
        });

        scheduleQuestion(gameNS, fresh, nextIdx, startTimes);
      }
    }, 2000);
  }, (room.questionTimeLimit || 20) * 1000);
}

module.exports = { registerAiQuizEvents, questionStartTimes };