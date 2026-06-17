const Message     = require("../models/Message");
const ChatRequest = require("../models/ChatRequest");

// ─── Guard: ensure an accepted ChatRequest exists in either direction ─────────
const assertChatAllowed = async (userA, userB) => {
  const request = await ChatRequest.findOne({
    $or: [
      { senderId: userA, receiverId: userB, status: "accepted" },
      { senderId: userB, receiverId: userA, status: "accepted" },
    ],
  });
  if (!request) {
    const err = new Error("Chat not allowed. Accept the chat request first.");
    err.statusCode = 403;
    throw err;
  }
};

// ─── POST /api/messages/send ──────────────────────────────────────────────────
const sendMessage = async (req, res, next) => {
  try {
    const { receiverId, messageText } = req.body;
    const senderId = req.user._id;

    if (!receiverId || !messageText?.trim()) {
      return res.status(400).json({ success: false, message: "receiverId and messageText are required." });
    }

    await assertChatAllowed(senderId, receiverId);

    const conversationId = Message.buildConversationId(senderId, receiverId);

    const message = await Message.create({
      senderId,
      receiverId,
      conversationId,
      messageText: messageText.trim(),
      readBy: [senderId],
    });

    const populated = await message.populate("senderId", "username profilePicture");

    // Push via Socket.io to the conversation room
    const io = req.app.get("io");
    io.of("/chat").to(conversationId).emit("receiveMessage", populated);

    res.status(201).json({ success: true, message: populated });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    next(err);
  }
};

// ─── GET /api/messages/:conversationId ───────────────────────────────────────
const getMessages = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id.toString();

    const [idA, idB] = conversationId.split("_");
    if (userId !== idA && userId !== idB) {
      return res.status(403).json({ success: false, message: "Access denied to this conversation." });
    }

    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 30;
    const skip  = (page - 1) * limit;

    const filter = { conversationId };
    if (userId === idA) {
      filter.deletedBySender = { $ne: true };
    } else {
      filter.deletedByReceiver = { $ne: true };
    }

    // Mark incoming messages as read BEFORE fetching so returned data is accurate
    await Message.updateMany(
      { conversationId, receiverId: req.user._id, readBy: { $ne: req.user._id } },
      { $addToSet: { readBy: req.user._id } }
    );

    const messages = await Message.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("senderId", "username profilePicture")
      .lean();

    const total = await Message.countDocuments(filter);

    // Compute a boolean 'read' field for the client:
    // A DM is read when the receiver's ID appears in the readBy array.
    const messagesWithRead = messages.map(msg => ({
      ...msg,
      read: msg.readBy?.some(id => id.toString() === msg.receiverId?.toString()) ?? false,
    }));

    res.status(200).json({
      success: true,
      messages: messagesWithRead.reverse(),
      pagination: {
        page, limit, total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/messages/conversations ─────────────────────────────────────────
const getConversations = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const accepted = await require("../models/ChatRequest").find({
      $or: [
        { senderId: userId, status: "accepted" },
        { receiverId: userId, status: "accepted" },
      ],
    }).lean();

    const seen = new Set();
    const partnerIds = [];
    for (const r of accepted) {
      const partnerId = r.senderId.toString() === userId.toString() ? r.receiverId : r.senderId;
      const key = partnerId.toString();
      if (!seen.has(key)) { seen.add(key); partnerIds.push(partnerId); }
    }

    const conversations = await Promise.all(
      partnerIds.map(async (partnerId) => {
        const convId = Message.buildConversationId(userId, partnerId);
        const last = await Message.findOne({ conversationId: convId })
          .sort({ createdAt: -1 })
          .populate("senderId", "username profilePicture")
          .lean();

        // FIX: Use readBy array (there is no standalone `read` field on Message)
        // Count messages sent TO this user that don't have userId in readBy
        const unread = await Message.countDocuments({
          conversationId: convId,
          receiverId: userId,
          readBy: { $ne: userId },
          deletedByReceiver: { $ne: true },
        });

        const User = require("../models/User");
        const partnerInfo = await User.findById(partnerId).select("username userId profilePicture").lean();
        return { conversationId: convId, partnerId, partnerInfo, lastMessage: last, unreadCount: unread };
      })
    );

    conversations.sort((a, b) => {
      const tA = a.lastMessage?.createdAt || 0;
      const tB = b.lastMessage?.createdAt || 0;
      return new Date(tB) - new Date(tA);
    });

    res.status(200).json({ success: true, conversations });
  } catch (err) {
    next(err);
  }
};

// ─── DELETE /api/messages/:messageId ─────────────────────────────────────────
const deleteMessage = async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const { scope } = req.body;
    const userId = req.user._id;

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ success: false, message: "Message not found." });

    const conversationId = message.conversationId;
    const [idA, idB] = conversationId.split("_");
    if (userId.toString() !== idA && userId.toString() !== idB) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    if (scope === "everyone") {
      if (message.senderId.toString() !== userId.toString()) {
        return res.status(403).json({ success: false, message: "Only sender can delete for everyone." });
      }
      // FIX: Check readBy array instead of missing `read` field
      if (message.readBy.some(id => id.toString() === message.receiverId.toString())) {
        return res.status(403).json({ success: false, message: "Cannot delete for everyone after the message has been seen." });
      }
      await Message.findByIdAndDelete(messageId);

      const io = req.app.get("io");
      if (io) {
        const chatNS = io.of("/chat");
        chatNS.to(message.conversationId).emit("messageDeleted", {
          messageId,
          conversationId: message.conversationId,
          scope: "everyone",
        });
        chatNS.to(`user:${message.receiverId.toString()}`).emit("messageDeleted", {
          messageId,
          conversationId: message.conversationId,
          scope: "everyone",
        });
        chatNS.to(`user:${message.senderId.toString()}`).emit("messageDeleted", {
          messageId,
          conversationId: message.conversationId,
          scope: "everyone",
        });
      }
    } else if (scope === "self") {
      if (message.senderId.toString() === userId.toString()) {
        message.deletedBySender = true;
      } else {
        message.deletedByReceiver = true;
      }
      await message.save();
    } else {
      return res.status(400).json({ success: false, message: "Invalid scope." });
    }

    res.json({ success: true, message: "Message deleted." });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/messages/unseen ─────────────────────────────────────────────────
const getUnseenMessageCount = async (req, res, next) => {
  try {
    const userId = req.user._id;

    // FIX: Use readBy array — count DMs sent to me that I haven't read
    const unseenDMs = await Message.countDocuments({
      receiverId: userId,
      readBy: { $ne: userId },
      deletedByReceiver: { $ne: true },
    });

    const Group = require("../models/Group");
    const GroupMessage = require("../models/GroupMessage");

    const userGroups = await Group.find({ members: userId }).select("_id");
    const groupIds = userGroups.map(g => g._id);

    const unseenGroups = await GroupMessage.countDocuments({
      groupId: { $in: groupIds },
      senderId: { $ne: userId },           // don't count own messages
      readBy: { $ne: userId },
      deletedBy: { $ne: userId },
    });

    res.json({ success: true, unseenDMs, unseenGroups, total: unseenDMs + unseenGroups });
  } catch (err) {
    next(err);
  }
};

module.exports = { sendMessage, getMessages, getConversations, deleteMessage, getUnseenMessageCount };