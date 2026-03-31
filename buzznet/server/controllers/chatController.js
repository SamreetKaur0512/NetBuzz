const ChatRequest = require("../models/ChatRequest");
const User        = require("../models/User");

// ─── POST /api/chat/request ───────────────────────────────────────────────────
// Send a chat request to another user
const sendChatRequest = async (req, res, next) => {
  try {
    const senderId   = req.user._id;
    const { receiverId } = req.body;

    if (!receiverId) {
      return res.status(400).json({ success: false, message: "receiverId is required." });
    }
    if (senderId.toString() === receiverId) {
      return res.status(400).json({ success: false, message: "You cannot send a chat request to yourself." });
    }

    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    // Check if blocked
    if (receiver.blockedUsers?.some(id => id.toString() === senderId.toString())) {
      return res.status(403).json({ success: false, message: "Cannot send request to this user." });
    }

    // Upsert: if rejected before, allow re-sending
    const existing = await ChatRequest.findOne({ senderId, receiverId });
    if (existing) {
      if (existing.status === "pending") {
        return res.status(409).json({ success: false, message: "Chat request already pending." });
      }
      if (existing.status === "accepted") {
        return res.status(409).json({ success: false, message: "Chat already active with this user." });
      }
      // Re-send after rejection
      existing.status = "pending";
      await existing.save();
      return res.status(200).json({ success: true, message: "Chat request re-sent.", request: existing });
    }

    const request = await ChatRequest.create({ senderId, receiverId });

    // Notify receiver via Socket.io if online
    const io = req.app.get("io");
    io.of("/chat").to(`user:${receiverId}`).emit("chatRequest", {
      requestId: request._id,
      from: { _id: req.user._id, username: req.user.username, profilePicture: req.user.profilePicture },
    });

    // Email notification if receiver has it enabled
    try {
      if (receiver.emailNotifications?.messageRequest) {
        const { sendNotificationEmail } = require("../utils/email");
        await sendNotificationEmail(receiver.email, receiver.username, "messageRequest", req.user.username);
      }
    } catch (e) { console.error("[email notify]", e.message); }

    res.status(201).json({ success: true, message: "Chat request sent.", request });
  } catch (err) {
    next(err);
  }
};

// ─── PUT /api/chat/accept ─────────────────────────────────────────────────────
const acceptChatRequest = async (req, res, next) => {
  try {
    const { requestId } = req.body;
    const request = await ChatRequest.findById(requestId);

    if (!request) {
      return res.status(404).json({ success: false, message: "Chat request not found." });
    }
    if (request.receiverId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized." });
    }
    if (request.status !== "pending") {
      return res.status(400).json({ success: false, message: `Request is already ${request.status}.` });
    }

    request.status = "accepted";
    await request.save();

    // Notify the original sender
    const io = req.app.get("io");
    io.of("/chat").to(`user:${request.senderId}`).emit("chatRequestAccepted", {
      requestId: request._id,
      by: { _id: req.user._id, username: req.user.username, profilePicture: req.user.profilePicture },
    });

    // Email notification if sender has it enabled
    try {
      const sender = await User.findById(request.senderId).select("email username emailNotifications");
      if (sender?.emailNotifications?.messageAccepted) {
        const { sendNotificationEmail } = require("../utils/email");
        await sendNotificationEmail(sender.email, sender.username, "messageAccepted", req.user.username);
      }
    } catch (e) { console.error("[email notify]", e.message); }

    res.status(200).json({ success: true, message: "Chat request accepted.", request });
  } catch (err) {
    next(err);
  }
};

// ─── PUT /api/chat/reject ─────────────────────────────────────────────────────
const rejectChatRequest = async (req, res, next) => {
  try {
    const { requestId } = req.body;
    const request = await ChatRequest.findById(requestId);

    if (!request) {
      return res.status(404).json({ success: false, message: "Chat request not found." });
    }
    if (request.receiverId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized." });
    }
    if (request.status !== "pending") {
      return res.status(400).json({ success: false, message: `Request is already ${request.status}.` });
    }

    request.status = "rejected";
    await request.save();

    res.status(200).json({ success: true, message: "Chat request rejected.", request });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/chat/requests ───────────────────────────────────────────────────
// Fetch all incoming pending requests for the logged-in user
const getPendingRequests = async (req, res, next) => {
  try {
    const requests = await ChatRequest.find({
      receiverId: req.user._id,
      status: "pending",
    }).populate("senderId", "username userId profilePicture");

    res.status(200).json({ success: true, requests });
  } catch (err) {
    next(err);
  }
};

module.exports = { sendChatRequest, acceptChatRequest, rejectChatRequest, getPendingRequests };