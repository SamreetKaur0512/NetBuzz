const mongoose     = require("mongoose");
const Group        = require("../models/Group");
const GroupMessage = require("../models/GroupMessage");
const GroupInvite  = require("../models/GroupInvite");
const User         = require("../models/User");

// ── Helper: blocked check ─────────────────────────────────────────────────────
const blockedBetween = async (userA, userB) => {
  const a = await User.findById(userA).select("blockedUsers");
  const b = await User.findById(userB).select("blockedUsers");
  return (
    a?.blockedUsers?.some(id => id.toString() === userB.toString()) ||
    b?.blockedUsers?.some(id => id.toString() === userA.toString())
  );
};

// ── Helper: get all descendants of a user in a group ─────────────────────────
// Walks the accepted GroupInvite chain: invitedBy → invitedUser recursively
const getDescendants = async (groupId, ancestorId) => {
  const descendants = new Set();
  const queue = [ancestorId.toString()];

  while (queue.length > 0) {
    const current = queue.shift();
    // Find everyone this user directly invited in this group
    const children = await GroupInvite.find({
      groupId,
      invitedBy:  current,
      status:     "accepted",
    }).select("invitedUser").lean();

    for (const child of children) {
      const cid = child.invitedUser.toString();
      if (!descendants.has(cid)) {
        descendants.add(cid);
        queue.push(cid);
      }
    }
  }
  return descendants; // Set of string IDs
};

// ── Helper: can requester remove target? ─────────────────────────────────────
// Rules:
//   - Creator can remove anyone
//   - Any member can remove their own direct children AND all descendants
//   - Nobody can remove the creator
const canRemove = async (groupId, requesterId, targetId, creatorId) => {
  const rid = requesterId.toString();
  const tid = targetId.toString();
  const cid = creatorId.toString();

  if (tid === cid) return false;           // never remove creator
  if (rid === cid) return true;            // creator can remove anyone

  const descendants = await getDescendants(groupId, rid);
  return descendants.has(tid);
};

// ── POST /api/groups/create ───────────────────────────────────────────────────
const createGroup = async (req, res, next) => {
  try {
    const { name, description } = req.body;
    const creatorId = req.user._id;
    const group = await Group.create({
      name, description,
      createdBy: creatorId,
      members:   [creatorId],
      admins:    [creatorId],
    });
    const populated = await group.populate([
      { path: "members", select: "username profilePicture userId" },
      { path: "admins",  select: "username profilePicture userId" },
    ]);
    res.status(201).json({ success: true, group: populated });
  } catch (err) { next(err); }
};

// ── GET /api/groups ───────────────────────────────────────────────────────────
const getMyGroups = async (req, res, next) => {
  try {
    const groups = await Group.find({ members: req.user._id })
      .populate("members",   "username profilePicture userId")
      .populate("admins",    "username profilePicture userId")
      .populate("createdBy", "username userId")
      .sort({ updatedAt: -1 });

    // Add unread count for each group
    const groupsWithCount = await Promise.all(groups.map(async (group) => {
      const unreadCount = await GroupMessage.countDocuments({
        groupId: group._id,
        readBy: { $ne: req.user._id },
        deletedBy: { $ne: req.user._id }
      });
      return { ...group.toObject(), unreadCount };
    }));

    res.json({ success: true, groups: groupsWithCount });
  } catch (err) { next(err); }
};

// ── GET /api/groups/:groupId/messages ─────────────────────────────────────────
const getGroupMessages = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ success: false, message: "Group not found." });
    if (!group.members.map(String).includes(userId.toString()))
      return res.status(403).json({ success: false, message: "Not a member." });

    const viewer         = await User.findById(userId).select("blockedUsers");
    const myBlocked      = viewer?.blockedUsers?.map(String) || [];
    const theyBlocked    = await User.find({ blockedUsers: userId }).select("_id").lean();
    const theyBlockedIds = theyBlocked.map(u => u._id.toString());
    const hideFromIds    = [...new Set([...myBlocked, ...theyBlockedIds])];

    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 40;
    const msgs  = await GroupMessage.find({ 
      groupId,
      deletedBy: { $ne: userId }
    })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("senderId", "username profilePicture")
      .populate("readBy",   "username profilePicture")   // so sender can see who read
      .lean();

    // NOTE: Do NOT auto-mark as read here.
    // Read receipts are only recorded via socket 'markGroupRead' event,
    // which only fires when the user is actively viewing the app (tab visible + focused).

    const filtered = msgs.filter(m => {
      const sid = (m.senderId?._id || m.senderId)?.toString();
      return !hideFromIds.includes(sid);
    });

    res.json({ success: true, messages: filtered.reverse() });
  } catch (err) { next(err); }
};

// ── POST /api/groups/:groupId/invite — ANY member can invite ──────────────────
const inviteMember = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const { userId }  = req.body;
    const inviterId   = req.user._id;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ success: false, message: "Group not found." });

    // Must be a member to invite
    if (!group.members.map(String).includes(inviterId.toString()))
      return res.status(403).json({ success: false, message: "Only members can invite." });

    // Find target by userId field OR username fallback
    const cleanId    = (userId || "").toString().trim().replace(/^@/, "");
    const targetUser = await User.findOne({
      $or: [{ userId: cleanId }, { username: cleanId }],
    });

    console.log("[inviteMember] looking for:", cleanId, "→ found:", targetUser?.username || "NULL");

    if (!targetUser)
      return res.status(404).json({ success: false, message: "User not found. Check the User ID." });

    const targetMongoId = targetUser._id;

    if (group.members.map(String).includes(targetMongoId.toString()))
      return res.status(400).json({ success: false, message: "User is already a member." });

    if (await blockedBetween(inviterId, targetMongoId))
      return res.status(403).json({ success: false, message: "Cannot invite this user." });

    const existing = await GroupInvite.findOne({ groupId, invitedUser: targetMongoId, status: "pending" });
    if (existing) return res.status(400).json({ success: false, message: "Invite already sent." });

    // Remove any old declined/accepted invites so re-inviting always works
    await GroupInvite.deleteMany({ groupId, invitedUser: targetMongoId, status: { $in: ["declined", "accepted"] } });

    const invite = await GroupInvite.create({
      groupId,
      invitedBy:   inviterId,
      invitedUser: targetMongoId,
    });

    const populated = await invite.populate([
      { path: "groupId",     select: "name" },
      { path: "invitedBy",   select: "username profilePicture" },
      { path: "invitedUser", select: "username profilePicture" },
    ]);

    const io = req.app.get("io");
    io.of("/chat").to(`user:${targetMongoId}`).emit("groupInvite", populated);

    res.json({ success: true, message: `Invite sent to ${targetUser.username}.`, invite: populated });
  } catch (err) { next(err); }
};

// ── GET /api/groups/invites ───────────────────────────────────────────────────
const getMyInvites = async (req, res, next) => {
  try {
    const invites = await GroupInvite.find({ invitedUser: req.user._id, status: "pending" })
      .populate("groupId",   "name description members")
      .populate("invitedBy", "username profilePicture")
      .sort({ createdAt: -1 });
    res.json({ success: true, invites });
  } catch (err) { next(err); }
};

// ── PUT /api/groups/invites/:inviteId/accept ──────────────────────────────────
const acceptInvite = async (req, res, next) => {
  try {
    const invite = await GroupInvite.findById(req.params.inviteId);
    if (!invite) return res.status(404).json({ success: false, message: "Invite not found." });
    if (invite.invitedUser.toString() !== req.user._id.toString())
      return res.status(403).json({ success: false, message: "Not your invite." });
    if (invite.status !== "pending")
      return res.status(400).json({ success: false, message: "Invite already responded to." });

    invite.status = "accepted";
    await invite.save();

    const group = await Group.findByIdAndUpdate(
      invite.groupId,
      { $addToSet: { members: req.user._id } },
      { new: true }
    ).populate("members", "username profilePicture userId")
     .populate("admins",  "username profilePicture userId");

    res.json({ success: true, message: "Joined group!", group });
  } catch (err) { next(err); }
};

// ── PUT /api/groups/invites/:inviteId/decline ─────────────────────────────────
const declineInvite = async (req, res, next) => {
  try {
    const invite = await GroupInvite.findById(req.params.inviteId);
    if (!invite) return res.status(404).json({ success: false, message: "Invite not found." });
    if (invite.invitedUser.toString() !== req.user._id.toString())
      return res.status(403).json({ success: false, message: "Not your invite." });
    invite.status = "declined";
    await invite.save();
    res.json({ success: true, message: "Invite declined." });
  } catch (err) { next(err); }
};

// ── DELETE /api/groups/:groupId/leave ─────────────────────────────────────────
const leaveGroup = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id.toString();
    const group  = await Group.findById(groupId);
    if (!group) return res.status(404).json({ success: false, message: "Group not found." });
    group.members = group.members.filter(m => m.toString() !== userId);
    group.admins  = group.admins.filter(a => a.toString() !== userId);
    await group.save();
    res.json({ success: true, message: "Left group." });
  } catch (err) { next(err); }
};

// ── DELETE /api/groups/:groupId/members/:targetId ────────────────────────────
// Parent-child tree rule: you can only remove your own children & their descendants
const removeMember = async (req, res, next) => {
  try {
    const { groupId, userId: targetId } = req.params;
    const requesterId = req.user._id;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ success: false, message: "Group not found." });

    // Must be a member
    if (!group.members.map(String).includes(requesterId.toString()))
      return res.status(403).json({ success: false, message: "You are not a member of this group." });

    // Cannot remove yourself via this endpoint (use leave)
    if (targetId === requesterId.toString())
      return res.status(400).json({ success: false, message: "Use the Leave button to exit the group." });

    // Check parent-child permission
    const allowed = await canRemove(groupId, requesterId, targetId, group.createdBy);
    if (!allowed)
      return res.status(403).json({ success: false, message: "You can only remove members you invited (or their descendants)." });

    // Remove from group
    group.members = group.members.filter(m => m.toString() !== targetId);
    group.admins  = group.admins.filter(a => a.toString() !== targetId);
    await group.save();

    const populated = await group.populate([
      { path: "members", select: "username profilePicture userId" },
      { path: "admins",  select: "username profilePicture userId" },
    ]);

    res.json({ success: true, group: populated });
  } catch (err) { next(err); }
};

// ── DELETE /api/groups/messages/:messageId ────────────────────────────────────
const deleteGroupMessage = async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const { scope } = req.body; // 'self' or 'everyone'
    const userId = req.user._id;

    const message = await GroupMessage.findById(messageId);
    if (!message) return res.status(404).json({ success: false, message: "Message not found." });

    const group = await Group.findById(message.groupId);
    if (!group) return res.status(404).json({ success: false, message: "Group not found." });
    if (!group.members.map(String).includes(userId.toString()))
      return res.status(403).json({ success: false, message: "Not a member." });

    if (scope === 'everyone') {
      // Delete for ALL members (only possible if no one has seen it yet)
      if (message.senderId.toString() !== userId.toString())
        return res.status(403).json({ success: false, message: "Only sender can delete for everyone." });

      const otherMembers = group.members.filter(id => id.toString() !== userId.toString());
      const readByIds    = message.readBy.map(id => id.toString());
      const anyoneSeen   = otherMembers.some(mid => readByIds.includes(mid.toString()));
      if (anyoneSeen)
        return res.status(403).json({ success: false, message: "Some members already saw this message. Use 'Delete for unseen' instead." });

      await GroupMessage.findByIdAndDelete(messageId);

      // Notify all members in real time
      const io = req.app.get("io");
      if (io) {
        group.members.forEach(mid => {
          io.of("/chat").to(`user:${mid.toString()}`).emit("groupMessageDeleted", {
            messageId, groupId: message.groupId.toString(), scope: "everyone",
          });
        });
      }

    } else if (scope === 'unseen') {
      // Delete ONLY for members who have NOT yet seen the message.
      // Members who already saw it keep seeing it.
      if (message.senderId.toString() !== userId.toString())
        return res.status(403).json({ success: false, message: "Only sender can do this." });

      const otherMembers = group.members.filter(id => id.toString() !== userId.toString());
      const readByIds    = message.readBy.map(id => id.toString());

      // Mark as deleted for each unseen member
      const unseenMembers = otherMembers.filter(mid => !readByIds.includes(mid.toString()));
      if (unseenMembers.length === 0)
        return res.status(400).json({ success: false, message: "All members have already seen this message." });

      await GroupMessage.findByIdAndUpdate(messageId, {
        $addToSet: { deletedBy: { $each: unseenMembers } },
      });

      // Notify only unseen members to remove message from their screen
      const io = req.app.get("io");
      if (io) {
        unseenMembers.forEach(mid => {
          io.of("/chat").to(`user:${mid.toString()}`).emit("groupMessageDeleted", {
            messageId, groupId: message.groupId.toString(), scope: "unseen",
          });
        });
      }

      // Tell sender: message deleted for X unseen members
      const User = require("../models/User");
      const unseenUsers = await User.find({ _id: { $in: unseenMembers } }).select("username profilePicture").lean();
      io.of("/chat").to(`user:${userId.toString()}`).emit("groupMessageDeletedUnseen", {
        messageId,
        groupId: message.groupId.toString(),
        unseenCount: unseenMembers.length,
        unseenUsers,
      });

    } else if (scope === 'self') {
      await GroupMessage.findByIdAndUpdate(messageId, { $addToSet: { deletedBy: userId } });
    } else {
      return res.status(400).json({ success: false, message: "Invalid scope." });
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/groups/:groupId ───────────────────────────────────────────────
const deleteGroup = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ success: false, message: "Group not found." });
    if (group.createdBy.toString() !== userId.toString())
      return res.status(403).json({ success: false, message: "Only creator can delete the group." });

    // Delete all messages and invites
    await GroupMessage.deleteMany({ groupId });
    await GroupInvite.deleteMany({ groupId });
    await Group.findByIdAndDelete(groupId);

    res.json({ success: true, message: "Group deleted." });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createGroup, getMyGroups, getGroupMessages,
  inviteMember, getMyInvites, acceptInvite, declineInvite,
  leaveGroup, removeMember, deleteGroupMessage, deleteGroup,
};