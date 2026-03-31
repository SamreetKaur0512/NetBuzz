const fs            = require("fs");
const path          = require("path");
const mongoose      = require("mongoose");
const User          = require("../models/User");
const Post          = require("../models/Post");
const ChatRequest   = require("../models/ChatRequest");
const FollowRequest = require("../models/FollowRequest");
const Message       = require("../models/Message");
const GroupMessage  = require("../models/GroupMessage");
const Group         = require("../models/Group");
const GroupInvite   = require("../models/GroupInvite");

// GET /api/users/:id
const getUserById = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id)
      .select("-blockedUsers")
      .populate("followers", "username userId profilePicture bio isPrivate")
      .populate("following", "username userId profilePicture bio isPrivate");

    if (!user) return res.status(404).json({ success: false, message: "User not found." });

    const viewerId = req.user?._id?.toString();
    const isOwn    = viewerId && viewerId === user._id.toString();

    // Re-fetch with password field only to compute hasPassword
    const userWithPass = await User.findById(req.params.id).select("+password");
    const hasPassword  = !!userWithPass?.password;

    if (viewerId && !isOwn && user.blockedUsers?.some(id => id.toString() === viewerId))
      return res.status(403).json({ success: false, message: "User not found." });

    if (viewerId && !isOwn) {
      const viewer        = await User.findById(viewerId).select("blockedUsers");
      const isBlockedByMe = viewer?.blockedUsers?.some(id => id.toString() === user._id.toString());
      if (isBlockedByMe) {
        const postCount = await Post.countDocuments({ userId: user._id });
        return res.json({
          success: true,
          user: {
            _id: user._id, username: user.username, profilePicture: user.profilePicture,
            isBlockedByMe: true, followers: [], following: [], postCount,
            followerCount: user.followers?.length || 0,
            followingCount: user.following?.length || 0,
          },
        });
      }
    }

    const postCount   = await Post.countDocuments({ userId: user._id });
    const isFollowing = user.followers?.some(f => (f._id || f).toString() === viewerId);
    const canSeePosts = !user.isPrivate || isOwn || isFollowing;
    const userObj     = user.toObject();

    let followRequestStatus = null;
    if (viewerId && !isOwn && user.isPrivate && !isFollowing) {
      const fr = await FollowRequest.findOne({ senderId: viewerId, receiverId: user._id });
      followRequestStatus = fr ? fr.status : null;
    }

    res.json({
      success: true,
      user: { ...userObj, postCount, canSeePosts, followRequestStatus, hasPassword },
    });
  } catch (err) { next(err); }
};

// PUT /api/users/update/:id
const updateUser = async (req, res, next) => {
  try {
    if (req.user._id.toString() !== req.params.id)
      return res.status(403).json({ success: false, message: "You can only update your own profile." });

    const allowed = ["username", "bio", "isPrivate"];
    const updates = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    if (req.file) updates.profilePicture = `/${req.file.path.replace(/\\/g, "/")}`;

    if (updates.username) {
      // Enforce uniqueness for display name (case-insensitive), excluding self
      const exists = await User.findOne({
        username: { $regex: `^${updates.username.trim()}$`, $options: "i" },
        _id: { $ne: new mongoose.Types.ObjectId(req.params.id) },
      });
      if (exists)
        return res.status(409).json({ success: false, message: "Display name is already taken. Please choose another." });
      updates.username = updates.username.trim();
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id, { $set: updates }, { new: true, runValidators: true }
    ).select("-password -blockedUsers");

    // Also return hasPassword so the profile page stays in sync
    const userWithPass = await User.findById(req.params.id).select("+password");
    const userObj = updatedUser.toObject();
    userObj.hasPassword = !!userWithPass?.password;

    res.json({ success: true, message: "Profile updated.", user: userObj });
  } catch (err) {
    if (err.name === "ValidationError")
      return res.status(400).json({ success: false, message: Object.values(err.errors).map(e => e.message).join(". ") });
    next(err);
  }
};

// PUT /api/users/follow/:id
const followUser = async (req, res, next) => {
  try {
    const targetId = req.params.id, currentUserId = req.user._id;
    if (currentUserId.toString() === targetId)
      return res.status(400).json({ success: false, message: "You cannot follow yourself." });

    const targetUser = await User.findById(targetId);
    if (!targetUser) return res.status(404).json({ success: false, message: "User not found." });

    if (targetUser.blockedUsers?.some(id => id.toString() === currentUserId.toString()))
      return res.status(403).json({ success: false, message: "You cannot follow this user." });

    const currentUser = await User.findById(currentUserId).select("blockedUsers");
    if (currentUser.blockedUsers?.some(id => id.toString() === targetId))
      return res.status(403).json({ success: false, message: "Unblock this user first." });

    if (targetUser.followers.map(String).includes(currentUserId.toString()))
      return res.status(400).json({ success: false, message: "Already following." });

    if (targetUser.isPrivate) {
      const existing = await FollowRequest.findOne({ senderId: currentUserId, receiverId: targetId });
      if (existing) {
        if (existing.status === "pending")
          return res.status(400).json({ success: false, message: "Follow request already sent." });
        existing.status = "pending";
        await existing.save();
        return res.json({ success: true, requested: true, message: "Follow request sent." });
      }
      await FollowRequest.create({ senderId: currentUserId, receiverId: targetId });
      return res.json({ success: true, requested: true, message: "Follow request sent." });
    }

    await User.findByIdAndUpdate(targetId,      { $addToSet: { followers: currentUserId } });
    await User.findByIdAndUpdate(currentUserId, { $addToSet: { following: targetId } });
    res.json({ success: true, requested: false, message: `Now following ${targetUser.username}.` });
  } catch (err) { next(err); }
};

const cancelFollowRequest = async (req, res, next) => {
  try {
    await FollowRequest.deleteOne({ senderId: req.user._id, receiverId: req.params.id, status: "pending" });
    res.json({ success: true, message: "Follow request cancelled." });
  } catch (err) { next(err); }
};

const getFollowRequests = async (req, res, next) => {
  try {
    const requests = await FollowRequest.find({ receiverId: req.user._id, status: "pending" })
      .populate("senderId", "username userId profilePicture bio")
      .sort({ createdAt: -1 });
    res.json({ success: true, requests });
  } catch (err) { next(err); }
};

const acceptFollowRequest = async (req, res, next) => {
  try {
    const request = await FollowRequest.findById(req.params.requestId);
    if (!request) return res.status(404).json({ success: false, message: "Request not found." });
    if (request.receiverId.toString() !== req.user._id.toString())
      return res.status(403).json({ success: false, message: "Not your request." });
    request.status = "accepted";
    await request.save();
    await User.findByIdAndUpdate(req.user._id,     { $addToSet: { followers: request.senderId } });
    await User.findByIdAndUpdate(request.senderId, { $addToSet: { following: req.user._id } });

    // Socket notification to the person who sent the follow request
    try {
      const io = req.app.get("io");
      io.of("/chat").to(`user:${request.senderId}`).emit("followRequestAccepted", {
        by: { _id: req.user._id, username: req.user.username, profilePicture: req.user.profilePicture },
      });
    } catch (e) { console.error("[socket notify]", e.message); }

    // Email notification
    try {
      const sender = await User.findById(request.senderId).select("email username emailNotifications");
      if (sender?.emailNotifications?.followAccepted) {
        const { sendNotificationEmail } = require("../utils/email");
        await sendNotificationEmail(sender.email, sender.username, "followAccepted", req.user.username);
      }
    } catch (e) { console.error("[email notify]", e.message); }

    res.json({ success: true, message: "Follow request accepted." });
  } catch (err) { next(err); }
};

const rejectFollowRequest = async (req, res, next) => {
  try {
    const request = await FollowRequest.findById(req.params.requestId);
    if (!request) return res.status(404).json({ success: false, message: "Request not found." });
    if (request.receiverId.toString() !== req.user._id.toString())
      return res.status(403).json({ success: false, message: "Not your request." });
    request.status = "rejected";
    await request.save();
    res.json({ success: true, message: "Follow request rejected." });
  } catch (err) { next(err); }
};

const unfollowUser = async (req, res, next) => {
  try {
    const targetId = req.params.id, currentUserId = req.user._id;
    if (currentUserId.toString() === targetId)
      return res.status(400).json({ success: false, message: "You cannot unfollow yourself." });
    const targetUser = await User.findById(targetId);
    if (!targetUser) return res.status(404).json({ success: false, message: "User not found." });
    if (!targetUser.followers.includes(currentUserId))
      return res.status(400).json({ success: false, message: "Not following this user." });
    await User.findByIdAndUpdate(targetId,      { $pull: { followers: currentUserId } });
    await User.findByIdAndUpdate(currentUserId, { $pull: { following: targetId } });
    res.json({ success: true, message: `Unfollowed ${targetUser.username}.` });
  } catch (err) { next(err); }
};

const blockUser = async (req, res, next) => {
  try {
    const targetId = req.params.id, currentUserId = req.user._id;
    if (currentUserId.toString() === targetId)
      return res.status(400).json({ success: false, message: "You cannot block yourself." });
    const targetUser  = await User.findById(targetId);
    if (!targetUser) return res.status(404).json({ success: false, message: "User not found." });
    const currentUser = await User.findById(currentUserId).select("blockedUsers");
    const isBlocked   = currentUser.blockedUsers?.some(id => id.toString() === targetId);
    if (isBlocked) {
      await User.findByIdAndUpdate(currentUserId, { $pull: { blockedUsers: targetId } });
      return res.json({ success: true, blocked: false, message: `${targetUser.username} unblocked.` });
    }
    await User.findByIdAndUpdate(currentUserId, {
      $addToSet: { blockedUsers: targetId },
      $pull:     { followers: targetId, following: targetId },
    });
    await User.findByIdAndUpdate(targetId, { $pull: { followers: currentUserId, following: currentUserId } });
    await ChatRequest.deleteMany({
      $or: [{ senderId: currentUserId, receiverId: targetId }, { senderId: targetId, receiverId: currentUserId }],
    });
    res.json({ success: true, blocked: true, message: `${targetUser.username} blocked.` });
  } catch (err) { next(err); }
};

const getBlockedUsers = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select("blockedUsers").populate("blockedUsers", "username profilePicture");
    res.json({ success: true, blockedUsers: user.blockedUsers || [] });
  } catch (err) { next(err); }
};

const searchUsers = async (req, res, next) => {
  try {
    const q = req.query.q?.trim();
    if (!q) return res.json({ success: true, users: [] });

    const me             = await User.findById(req.user._id).select("blockedUsers");
    const myBlockedIds   = me.blockedUsers?.map(String) || [];
    const theyBlockedMe  = await User.find({ blockedUsers: req.user._id }).select("_id").lean();
    const theyBlockedIds = theyBlockedMe.map(u => u._id.toString());
    const excludeIds     = [...new Set([...myBlockedIds, ...theyBlockedIds, req.user._id.toString()])];

    const users = await User.find({
      _id: { $nin: excludeIds },
      $or: [
        { username: { $regex: q, $options: "i" } },
        { userId:   { $regex: q, $options: "i" } },
      ],
    }).select("userId username profilePicture bio followers isPrivate").limit(20).lean();

    res.json({ success: true, users });
  } catch (err) { next(err); }
};

// DELETE /api/users/delete-account
const deleteAccount = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const posts = await Post.find({ userId }).select("mediaUrl");
    for (const post of posts) {
      if (post.mediaUrl) {
        const filePath = path.join(__dirname, "..", post.mediaUrl.replace(/^\//, ""));
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
    }
    await Post.deleteMany({ userId });
    await Post.updateMany({}, { $pull: { likes: userId, comments: { userId } } });
    await Post.updateMany({ "comments.likes": userId }, { $pull: { "comments.$[].likes": userId } });
    await Message.deleteMany({ $or: [{ senderId: userId }, { receiverId: userId }] });
    await GroupMessage.deleteMany({ senderId: userId });

    const soloGroups = await Group.find({ createdBy: userId, members: { $size: 1 } });
    for (const g of soloGroups) {
      await GroupMessage.deleteMany({ groupId: g._id });
      await GroupInvite.deleteMany({ groupId: g._id });
      await g.deleteOne();
    }
    const sharedGroups = await Group.find({ members: userId, _id: { $nin: soloGroups.map(g => g._id) } });
    for (const g of sharedGroups) {
      g.members = g.members.filter(m => m.toString() !== userId.toString());
      g.admins  = g.admins.filter(a => a.toString() !== userId.toString());
      if (g.createdBy.toString() === userId.toString() && g.members.length > 0) {
        g.createdBy = g.members[0];
        if (!g.admins.includes(g.members[0])) g.admins.push(g.members[0]);
      }
      await g.save();
    }

    await GroupInvite.deleteMany({ $or: [{ invitedUser: userId }, { invitedBy: userId }] });
    await ChatRequest.deleteMany({ $or: [{ senderId: userId }, { receiverId: userId }] });
    await FollowRequest.deleteMany({ $or: [{ senderId: userId }, { receiverId: userId }] });
    await User.updateMany({}, { $pull: { followers: userId, following: userId, blockedUsers: userId } });

    const userDoc = await User.findById(userId).select("profilePicture email");
    if (userDoc?.profilePicture && !userDoc.profilePicture.startsWith("http")) {
      const avatarPath = path.join(__dirname, "..", userDoc.profilePicture.replace(/^\//, ""));
      if (fs.existsSync(avatarPath)) fs.unlinkSync(avatarPath);
    }

    await User.findByIdAndDelete(userId);
    res.json({ success: true, message: "Account permanently deleted." });
  } catch (err) { next(err); }
};

// ── PUT /api/users/update/:id/notifications ──────────────────────────────────
const updateNotifications = async (req, res, next) => {
  try {
    if (req.user._id.toString() !== req.params.id)
      return res.status(403).json({ success: false, message: "Not authorized." });

    const keys = ["followRequest","followAccepted","messageRequest","messageAccepted","newMessage","groupInvite"];
    const updates = {};
    keys.forEach(k => {
      if (req.body[k] !== undefined) {
        updates[`emailNotifications.${k}`] = req.body[k] === true || req.body[k] === "true";
      }
    });

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true }
    );

    res.json({ success: true, message: "Notification settings saved.", user: updatedUser });
  } catch (err) { next(err); }
};

// Also add follow request accepted socket emit + email
module.exports = {
  getUserById, updateUser, updateNotifications, followUser, unfollowUser,
  cancelFollowRequest, getFollowRequests, acceptFollowRequest, rejectFollowRequest,
  blockUser, getBlockedUsers, searchUsers, deleteAccount,
};