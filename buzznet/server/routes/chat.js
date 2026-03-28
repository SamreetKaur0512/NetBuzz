const express = require("express");
const router  = express.Router();
const { verifyToken } = require("../middleware/auth");
const {
  sendChatRequest,
  acceptChatRequest,
  rejectChatRequest,
  getPendingRequests,
} = require("../controllers/chatController");

// POST /api/chat/request   — send a chat request
router.post("/request", verifyToken, sendChatRequest);

// PUT  /api/chat/accept    — accept a pending chat request
router.put("/accept",  verifyToken, acceptChatRequest);

// PUT  /api/chat/reject    — reject a pending chat request
router.put("/reject",  verifyToken, rejectChatRequest);

// GET  /api/chat/requests  — list incoming pending requests
router.get("/requests", verifyToken, getPendingRequests);

module.exports = router;
