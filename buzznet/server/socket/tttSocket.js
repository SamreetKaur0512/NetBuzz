const GameRoom = require("../models/GameRoom");

// Per-room turn timers
const turnTimers = new Map();
function clearTurnTimer(roomCode) {
  if (turnTimers.has(roomCode)) {
    clearTimeout(turnTimers.get(roomCode));
    turnTimers.delete(roomCode);
  }
}

// ─── Board config by player count ─────────────────────────────────────────────
function getBoardConfig(playerCount) {
  if (playerCount <= 2) return { size: 3, winLen: 3 };
  if (playerCount === 3) return { size: 5, winLen: 4 };
  if (playerCount === 4) return { size: 6, winLen: 4 };
  if (playerCount <= 6) return { size: 7, winLen: 5 };
  return { size: 8, winLen: 5 };
}

const SYMBOLS = ['✕', '○', '△', '□', '★', '♦', '●', '▲'];
const SYMBOL_COLORS = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#e91e63'];

// ─── Check winner on NxN board ────────────────────────────────────────────────
function checkWinner(board, size, winLen) {
  const get = (r, c) => (r >= 0 && r < size && c >= 0 && c < size) ? board[r * size + c] : null;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const sym = get(r, c);
      if (!sym) continue;

      const dirs = [[0,1],[1,0],[1,1],[1,-1]];
      for (const [dr, dc] of dirs) {
        const combo = [[r, c]];
        for (let k = 1; k < winLen; k++) {
          const nr = r + dr * k, nc = c + dc * k;
          if (get(nr, nc) !== sym) break;
          combo.push([nr, nc]);
        }
        if (combo.length === winLen) {
          return {
            winner: sym,
            combo: combo.map(([row, col]) => row * size + col),
          };
        }
      }
    }
  }

  if (board.every(c => c !== null)) return { winner: 'draw', combo: [] };
  return null;
}

// ─── Turn timer ──────────────────────────────────────────────────────────────────
function scheduleTurnTimer(gameNS, roomCode, state) {
  clearTurnTimer(roomCode);
  const timer = setTimeout(async () => {
    // Time up — skip this player's turn
    const GameRoom = require("../models/GameRoom");
    const room = await GameRoom.findOne({ roomCode });
    if (!room || room.status !== 'in_progress') return;
    const rawState = room.wyrState;
    if (!rawState) return;

    const nextIdx = (rawState.currentTurnIdx + 1) % rawState.turnOrder.length;
    const nextState = {
      ...rawState,
      board: [...(rawState.board || [])],
      turnOrder: [...(rawState.turnOrder || [])],
      currentTurnIdx: nextIdx,
      currentTurn: rawState.turnOrder[nextIdx],
    };
    room.wyrState = nextState;
    room.markModified('wyrState');
    await room.save();

    gameNS.to(roomCode).emit('tttTimeUp', {
      skippedPlayer: rawState.currentTurn,
      currentTurn: nextState.currentTurn,
      board: nextState.board,
    });

    scheduleTurnTimer(gameNS, roomCode, nextState);
  }, (state.turnTimeLimit || 20) * 1000);
  turnTimers.set(roomCode, timer);
}

// ─── Register TTT events ──────────────────────────────────────────────────────
function registerTttEvents(gameNS, socket) {
  const userId   = socket.user._id.toString();
  const username = socket.user.username;

  // ── tttStartGame ────────────────────────────────────────────────────────────
  socket.on('tttStartGame', async ({ roomCode }, ack) => {
    try {
      const room = await GameRoom.findOne({ roomCode: roomCode?.toUpperCase() });
      if (!room)                             throw new Error('Room not found');
      if (room.hostId.toString() !== userId) throw new Error('Only host can start');
      if (room.status !== 'waiting')         throw new Error('Game already started');
      if (room.players.length < 2)           throw new Error('Need at least 2 players');

      const { size, winLen } = getBoardConfig(room.players.length);

      // Assign symbols to players
      const playerSymbols = {};
      const playerColors  = {};
      room.players.forEach((p, i) => {
        playerSymbols[p.userId.toString()] = SYMBOLS[i];
        playerColors[p.userId.toString()]  = SYMBOL_COLORS[i];
      });

      const turnTimeLimit = room.questionTimeLimit || 20;

      const state = {
        board:         Array(size * size).fill(null),
        size,
        winLen,
        playerSymbols,
        playerColors,
        turnOrder:     room.players.map(p => p.userId.toString()),
        currentTurnIdx: 0,
        currentTurn:   room.players[0].userId.toString(),
        turnTimeLimit,
      };

      room.status    = 'in_progress';
      room.startedAt = new Date();
      room.wyrState  = state;
      room.markModified('wyrState');
      await room.save();

      // Start timer for first turn
      scheduleTurnTimer(gameNS, room.roomCode, state);

      gameNS.to(roomCode).emit('tttGameStarted', {
        board:         state.board,
        size,
        winLen,
        playerSymbols,
        playerColors,
        currentTurn:   state.currentTurn,
        turnTimeLimit: state.turnTimeLimit,
        players:       room.players.map(p => ({
          userId: p.userId, username: p.username,
          symbol: playerSymbols[p.userId.toString()],
          color:  playerColors[p.userId.toString()],
        })),
      });

      if (typeof ack === 'function') ack({ success: true });
    } catch (err) {
      if (typeof ack === 'function') ack({ success: false, message: err.message });
    }
  });

  // ── tttMove ─────────────────────────────────────────────────────────────────
  socket.on('tttMove', async ({ roomCode, index }, ack) => {
    try {
      const room = await GameRoom.findOne({ roomCode: roomCode?.toUpperCase() });
      if (!room)                         throw new Error('Room not found');
      if (room.status !== 'in_progress') throw new Error('Game not in progress');

      // Rebuild state from Mixed type safely
      const rawState = room.wyrState;
      if (!rawState)                     throw new Error('Game state missing');

      const state = {
        board:           [...(rawState.board || [])],
        size:            rawState.size,
        winLen:          rawState.winLen,
        playerSymbols:   rawState.playerSymbols || {},
        playerColors:    rawState.playerColors  || {},
        turnOrder:       [...(rawState.turnOrder || [])],
        currentTurnIdx:  rawState.currentTurnIdx || 0,
        currentTurn:     rawState.currentTurn?.toString ? rawState.currentTurn.toString() : rawState.currentTurn,
      };

      if (state.currentTurn !== userId)  throw new Error("Not your turn");
      if (state.board[index] !== null)   throw new Error("Cell already taken");

      const symbol = state.playerSymbols[userId];
      if (!symbol) throw new Error("Symbol not found for player");
      state.board[index] = symbol;

      gameNS.to(roomCode).emit('tttMoveMade', {
        index, symbol, userId, username,
        board: state.board,
        color: state.playerColors[userId],
      });

      // Check result
      const result = checkWinner(state.board, state.size, state.winLen);

      if (result) {
        // End game
        const winner = result.winner === 'draw' ? null :
          room.players.find(p => state.playerSymbols[p.userId.toString()] === result.winner);

        clearTurnTimer(roomCode);
        if (winner) room.winnerId = winner.userId;
        room.status     = 'finished';
        room.finishedAt = new Date();
        room.wyrState   = state;
        room.markModified('wyrState');
        await room.save();

        gameNS.to(roomCode).emit('tttGameEnd', {
          draw:    result.winner === 'draw',
          winner:  winner ? { userId: winner.userId, username: winner.username, symbol: result.winner } : null,
          combo:   result.combo,
          board:   state.board,
          players: room.players.map(p => ({
            userId: p.userId, username: p.username,
            symbol: state.playerSymbols[p.userId.toString()],
            color:  state.playerColors[p.userId.toString()],
          })),
        });

      } else {
        // Next turn
        const nextIdx = (state.currentTurnIdx + 1) % state.turnOrder.length;
        state.currentTurnIdx = nextIdx;
        state.currentTurn    = state.turnOrder[nextIdx];
        const nextState = {
          board:          state.board,
          size:           state.size,
          winLen:         state.winLen,
          playerSymbols:  state.playerSymbols,
          playerColors:   state.playerColors,
          turnOrder:      state.turnOrder,
          currentTurnIdx: nextIdx,
          currentTurn:    state.turnOrder[nextIdx],
        };
        room.wyrState = nextState;
        room.markModified('wyrState');
        await room.save();

        gameNS.to(roomCode).emit('tttTurnChange', {
          currentTurn: nextState.currentTurn,
          board: nextState.board,
        });
        scheduleTurnTimer(gameNS, roomCode, nextState);
      }

      if (typeof ack === 'function') ack({ success: true });
    } catch (err) {
      if (typeof ack === 'function') ack({ success: false, message: err.message });
    }
  });
}

module.exports = { registerTttEvents };