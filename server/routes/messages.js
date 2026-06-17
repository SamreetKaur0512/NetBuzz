const express = require("express");
const router  = express.Router();
const { verifyToken } = require("../middleware/auth");
const {
  sendMessage,
  getMessages,
  getConversations,
  deleteMessage,
  getUnseenMessageCount,
} = require("../controllers/messageController");

// GET  /api/messages/conversations — list all DM threads for the current user
router.get("/conversations", verifyToken, getConversations);

// GET  /api/messages/unseen — get count of unseen messages
router.get("/unseen", verifyToken, getUnseenMessageCount);

// POST /api/messages/send          — send a new message (REST fallback)
router.post("/send", verifyToken, sendMessage);

// GET  /api/messages/:conversationId — paginated message history
router.get("/:conversationId", verifyToken, getMessages);

// DELETE /api/messages/:messageId — delete a message
router.delete("/:messageId", verifyToken, deleteMessage);

module.exports = router;