const GameRoom = require("../models/GameRoom");
const { getRandomQuestions } = require("../data/questionBank");

// ─── Generate a unique 6-char room code ───────────────────────────────────────
const generateRoomCode = () =>
  Math.random().toString(36).substring(2, 8).toUpperCase();

// ─── GET /api/games/rooms — list open rooms ───────────────────────────────────
const listRooms = async (req, res, next) => {
  try {
    const { gameType } = req.query;
    const filter = { status: "waiting" };
    if (gameType) filter.gameType = gameType;

    const rooms = await GameRoom.find(filter)
      .select("-questions")
      .populate("hostId", "username profilePicture")
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    res.status(200).json({ success: true, rooms });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/games/create ───────────────────────────────────────────────────
const createRoom = async (req, res, next) => {
  try {
    const { gameType = "quiz", maxPlayers = 8, questionCount = 10, questionTimeLimit = 20 } = req.body;

    let roomCode;
    let exists = true;
    while (exists) {
      roomCode = generateRoomCode();
      exists = await GameRoom.exists({ roomCode });
    }

    const room = await GameRoom.create({
      roomCode,
      hostId: req.user._id,
      gameType,
      maxPlayers,
      totalQuestions: questionCount,
      questionTimeLimit,
      players: [{
        userId: req.user._id,
        username: req.user.username,
        score: 0,
        ready: false,
      }],
    });

    res.status(201).json({ success: true, message: "Room created.", room });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/games/:roomCode ─────────────────────────────────────────────────
const getRoomByCode = async (req, res, next) => {
  try {
    const room = await GameRoom.findOne({ roomCode: req.params.roomCode.toUpperCase() })
      .select("-questions")
      .populate("hostId", "username profilePicture")
      .lean();

    if (!room) {
      return res.status(404).json({ success: false, message: "Room not found." });
    }

    res.status(200).json({ success: true, room });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/games/history — completed games for the current user ────────────
const getGameHistory = async (req, res, next) => {
  try {
    const rooms = await GameRoom.find({
      status: "finished",
      "players.userId": req.user._id,
    })
      .select("roomCode gameType players winnerId startedAt finishedAt")
      .populate("winnerId", "username")
      .sort({ finishedAt: -1 })
      .limit(20)
      .lean();

    res.status(200).json({ success: true, rooms });
  } catch (err) {
    next(err);
  }
};

module.exports = { listRooms, createRoom, getRoomByCode, getGameHistory };
