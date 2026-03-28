const express = require("express");
const router  = express.Router();
const { verifyToken } = require("../middleware/auth");
const {
  createGroup, getMyGroups, getGroupMessages,
  inviteMember, getMyInvites, acceptInvite, declineInvite,
  leaveGroup, removeMember, deleteGroupMessage, deleteGroup,
} = require("../controllers/groupController");

// ── Groups ─────────────────────────────────────────────────────────────────────
router.post("/create",              verifyToken, createGroup);
router.get("/my",                   verifyToken, getMyGroups);
router.get("/:groupId/messages",    verifyToken, getGroupMessages);

// ── Invites ────────────────────────────────────────────────────────────────────
router.post("/:groupId/invite",     verifyToken, inviteMember);
router.get("/invites",              verifyToken, getMyInvites);
router.put("/invites/:inviteId/accept", verifyToken, acceptInvite);
router.put("/invites/:inviteId/decline", verifyToken, declineInvite);

// ── Membership ─────────────────────────────────────────────────────────────────
router.put("/:groupId/leave",       verifyToken, leaveGroup);
router.delete("/:groupId/members/:userId", verifyToken, removeMember);

// ── Messages ───────────────────────────────────────────────────────────────────
router.delete("/:groupId/messages/:messageId", verifyToken, deleteGroupMessage);

// ── Group Management ───────────────────────────────────────────────────────────
router.delete("/:groupId",          verifyToken, deleteGroup);

module.exports = router;
