const express = require("express");
const router  = express.Router();
const { verifyToken } = require("../middleware/auth");
const {
  listRooms,
  createRoom,
  getRoomByCode,
  getGameHistory,
} = require("../controllers/gameController");

// GET  /api/games/rooms          — list open waiting rooms
router.get("/rooms",   verifyToken, listRooms);

// GET  /api/games/history        — current user's finished game history
router.get("/history", verifyToken, getGameHistory);

// POST /api/games/create         — create a new game room (REST; mirrors socket createRoom)
router.post("/create", verifyToken, createRoom);

// GET  /api/games/:roomCode      — get room details by code
router.get("/:roomCode", verifyToken, getRoomByCode);

module.exports = router;
