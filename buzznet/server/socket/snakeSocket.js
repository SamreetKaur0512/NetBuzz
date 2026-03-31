const GameRoom = require("../models/GameRoom");

const GRID        = 20;   // 20x20 grid
const TICK_MS     = 150;  // game speed ms per tick (default)
const SPEED_MAP   = { slow: 250, normal: 150, fast: 90, extreme: 50 };
const FOOD_COUNT  = 5;    // food items on board at once

const gameLoops   = new Map(); // roomCode → interval
const gameStates  = new Map(); // roomCode → state in memory (not DB for speed)

const COLORS = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#e91e63'];
const DIRS   = { UP:[0,-1], DOWN:[0,1], LEFT:[-1,0], RIGHT:[1,0] };

function rand(n) { return Math.floor(Math.random() * n); }

function spawnFood(snakes) {
  const occupied = new Set();
  snakes.forEach(s => s.body.forEach(([x,y]) => occupied.add(`${x},${y}`)));
  let pos;
  do { pos = [rand(GRID), rand(GRID)]; } while (occupied.has(`${pos[0]},${pos[1]}`));
  return pos;
}

function spawnSnake(index, existing) {
  const occupied = new Set();
  existing.forEach(s => s.body.forEach(([x,y]) => occupied.add(`${x},${y}`)));
  const startPositions = [
    [[2,2],[1,2],[0,2]], [[17,17],[18,17],[19,17]],
    [[2,17],[1,17],[0,17]], [[17,2],[18,2],[19,2]],
    [[10,2],[10,1],[10,0]], [[10,17],[10,18],[10,19]],
    [[2,10],[1,10],[0,10]], [[17,10],[18,10],[19,10]],
  ];
  return startPositions[index % startPositions.length];
}

function initState(players, timeLimit) {
  const snakes = players.map((p, i) => ({
    userId:    p.userId.toString(),
    username:  p.username,
    color:     COLORS[i % COLORS.length],
    body:      spawnSnake(i, []),
    dir:       ['RIGHT','LEFT','RIGHT','LEFT','DOWN','UP','RIGHT','LEFT'][i] ,
    nextDir:   ['RIGHT','LEFT','RIGHT','LEFT','DOWN','UP','RIGHT','LEFT'][i],
    alive:     true,
    score:     0,
    firstFoodTime: null,
    lastFoodTime:  null,
    totalFoodTime: 0,
  }));

  const food = [];
  for (let i = 0; i < FOOD_COUNT; i++) food.push(spawnFood(snakes));

  return {
    snakes,
    food,
    tick:      0,
    timeLimit,
    startTime: Date.now(),
    ended:     false,
  };
}

function gameTick(gameNS, roomCode) {
  const state = gameStates.get(roomCode);
  if (!state || state.ended) return;

  const elapsed = (Date.now() - state.startTime) / 1000;
  if (elapsed >= state.timeLimit) {
    return endSnakeGame(gameNS, roomCode);
  }

  const aliveSnakes = state.snakes.filter(s => s.alive);
  if (aliveSnakes.length === 0) return endSnakeGame(gameNS, roomCode);
  if (aliveSnakes.length === 1 && state.snakes.length > 1) {
    // Only 1 left - keep playing till time ends (they collect more food)
  }

  // Move each snake
  const newHeads = new Map();
  aliveSnakes.forEach(snake => {
    snake.dir = snake.nextDir;
    const [dx, dy] = DIRS[snake.dir];
    const [hx, hy] = snake.body[0];
    newHeads.set(snake.userId, [hx + dx, hy + dy]);
  });

  // Check collisions
  aliveSnakes.forEach(snake => {
    const head = newHeads.get(snake.userId);
    const [hx, hy] = head;

    // Wall collision
    if (hx < 0 || hx >= GRID || hy < 0 || hy >= GRID) {
      snake.alive = false; return;
    }

    // Self collision
    for (let i = 1; i < snake.body.length; i++) {
      if (snake.body[i][0] === hx && snake.body[i][1] === hy) {
        snake.alive = false; return;
      }
    }

    // Other snake collision
    for (const other of aliveSnakes) {
      if (other.userId === snake.userId) continue;
      for (const [bx, by] of other.body) {
        if (bx === hx && by === hy) { snake.alive = false; return; }
      }
      // Head-to-head
      const otherHead = newHeads.get(other.userId);
      if (otherHead && otherHead[0] === hx && otherHead[1] === hy) {
        snake.alive = false; return;
      }
    }
  });

  // Move alive snakes + check food
  aliveSnakes.forEach(snake => {
    if (!snake.alive) return;
    const head = newHeads.get(snake.userId);
    snake.body.unshift(head);

    // Check food eaten
    const foodIdx = state.food.findIndex(([fx,fy]) => fx === head[0] && fy === head[1]);
    if (foodIdx !== -1) {
      snake.score++;
      const now = Date.now();
      if (!snake.firstFoodTime) snake.firstFoodTime = now;
      snake.totalFoodTime = now - state.startTime;
      state.food.splice(foodIdx, 1);
      state.food.push(spawnFood(state.snakes));
    } else {
      snake.body.pop(); // no food = don't grow
    }
  });

  state.tick++;

  // Broadcast state
  gameNS.to(roomCode).emit('snakeTick', {
    snakes: state.snakes.map(s => ({
      userId: s.userId, username: s.username, color: s.color,
      body: s.body, alive: s.alive, score: s.score,
    })),
    food:      state.food,
    timeLeft:  Math.max(0, Math.ceil(state.timeLimit - elapsed)),
    tick:      state.tick,
  });
}

function endSnakeGame(gameNS, roomCode) {
  const loop = gameLoops.get(roomCode);
  if (loop) { clearInterval(loop); gameLoops.delete(roomCode); }

  const state = gameStates.get(roomCode);
  if (!state || state.ended) return;
  state.ended = true;

  // Sort: score desc, then totalFoodTime asc (faster = better)
  const results = [...state.snakes].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.totalFoodTime || 999999) - (b.totalFoodTime || 999999);
  });

  // Assign positions — equal score+time = equal pos
  const withPos = [];
  results.forEach((p, i) => {
    let pos = i + 1;
    if (i > 0) {
      const prev = results[i-1];
      if (p.score === prev.score && p.totalFoodTime === prev.totalFoodTime) pos = withPos[i-1].pos;
    }
    withPos.push({ ...p, pos });
  });

  gameNS.to(roomCode).emit('snakeGameEnd', {
    results: withPos.map(p => ({
      userId: p.userId, username: p.username, color: p.color,
      score: p.score, pos: p.pos, alive: p.alive,
    })),
    winner: withPos[0],
  });

  // Save to DB
  GameRoom.findOne({ roomCode }).then(room => {
    if (!room) return;
    room.status     = 'finished';
    room.finishedAt = new Date();
    room.players.forEach(p => {
      const res = results.find(r => r.userId === p.userId.toString());
      if (res) p.score = res.score;
    });
    room.winnerId = results[0]?.userId;
    room.markModified('players');
    room.save();
  });

  gameStates.delete(roomCode);
}

function registerSnakeEvents(gameNS, socket) {
  const userId   = socket.user._id.toString();
  const username = socket.user.username;

  socket.on('snakeStartGame', async ({ roomCode }, ack) => {
    try {
      const room = await GameRoom.findOne({ roomCode: roomCode?.toUpperCase() });
      if (!room)                             throw new Error('Room not found');
      if (room.hostId.toString() !== userId) throw new Error('Only host can start');
      if (room.status !== 'waiting')         throw new Error('Already started');
      // Snake supports single-player practice mode
      // if (room.players.length < 2) throw new Error('Need at least 2 players');

      const timeLimit = room.questionTimeLimit || 120;
      const state     = initState(room.players, timeLimit);
      gameStates.set(roomCode, state);

      room.status    = 'in_progress';
      room.startedAt = new Date();
      await room.save();

      // Send initial board so players can see where snakes are placed
      gameNS.to(roomCode).emit('snakeGameStarted', {
        grid:      GRID,
        timeLimit,
        snakes:    state.snakes.map(s => ({
          userId: s.userId, username: s.username, color: s.color, body: s.body, alive: true, score: 0,
        })),
        food: state.food,
        myUserId: userId,
      });

      // 3-second countdown before movement starts
      let count = 3;
      gameNS.to(roomCode).emit('snakeCountdown', { count });
      const cdInterval = setInterval(() => {
        count--;
        if (count > 0) {
          gameNS.to(roomCode).emit('snakeCountdown', { count });
        } else {
          clearInterval(cdInterval);
          gameNS.to(roomCode).emit('snakeCountdown', { count: 0 }); // "Go!"
          // Start game loop after countdown
          const tickMs = SPEED_MAP[room.snakeSpeed] || TICK_MS;
          const loop = setInterval(() => gameTick(gameNS, roomCode), tickMs);
          gameLoops.set(roomCode, loop);
        }
      }, 1000);

      if (typeof ack === 'function') ack({ success: true });
    } catch (err) {
      if (typeof ack === 'function') ack({ success: false, message: err.message });
    }
  });

  socket.on('snakeDir', ({ roomCode, dir }) => {
    const state = gameStates.get(roomCode?.toUpperCase?.() || roomCode);
    if (!state) return;
    const snake = state.snakes.find(s => s.userId === userId);
    if (!snake || !snake.alive) return;

    // Prevent reversing
    const opposite = { UP:'DOWN', DOWN:'UP', LEFT:'RIGHT', RIGHT:'LEFT' };
    if (dir !== opposite[snake.dir]) snake.nextDir = dir;
  });
}

module.exports = { registerSnakeEvents };