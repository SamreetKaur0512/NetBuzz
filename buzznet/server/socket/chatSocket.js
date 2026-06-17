const jwt         = require("jsonwebtoken");
const User        = require("../models/User");
const Message     = require("../models/Message");
const ChatRequest = require("../models/ChatRequest");

// Track online users:  userId → socketId
const onlineUsers = new Map();

/**
 * Authenticate every socket connection using the JWT passed in
 * socket.handshake.auth.token or as a query parameter.
 */
async function authenticateSocket(socket, next) {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.query?.token;

    if (!token) return next(new Error("Authentication token missing"));

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user    = await User.findById(decoded.id).select("-password");
    if (!user) return next(new Error("User not found"));

    socket.user = user;
    next();
  } catch {
    next(new Error("Invalid or expired token"));
  }
}

/**
 * Register all chat-related Socket.io events on the /chat namespace.
 * @param {import("socket.io").Namespace} chatNS
 */
function registerChatSocket(chatNS) {
  chatNS.use(authenticateSocket);

  chatNS.on("connection", (socket) => {
    const userId = socket.user._id.toString();
    onlineUsers.set(userId, socket.id);

    // Personal room so we can push notifications to this user by ID
    socket.join(`user:${userId}`);
    console.log(`[Chat] 🔗 ${socket.user.username} connected (${socket.id})`);

    // Broadcast online status to everyone
    chatNS.emit("userOnline", { userId });

    // ── joinRoom ────────────────────────────────────────────────────────────
    // Client sends { conversationId } to subscribe to a DM thread
    socket.on("joinRoom", async ({ conversationId }, ack) => {
      try {
        if (!conversationId) throw new Error("conversationId required");

        // Verify the requesting user belongs to this conversation
        const [idA, idB] = conversationId.split("_");
        if (userId !== idA && userId !== idB) {
          throw new Error("Access denied to this conversation");
        }

        // Confirm an accepted chat request exists
        const otherId = userId === idA ? idB : idA;
        const allowed = await ChatRequest.findOne({
          $or: [
            { senderId: userId,   receiverId: otherId, status: "accepted" },
            { senderId: otherId,  receiverId: userId,  status: "accepted" },
          ],
        });
        if (!allowed) throw new Error("No accepted chat request found");

        socket.join(conversationId);
        console.log(`[Chat] ${socket.user.username} joined room ${conversationId}`);

        if (typeof ack === "function") ack({ success: true });
      } catch (err) {
        if (typeof ack === "function") ack({ success: false, message: err.message });
      }
    });

    // ── sendMessage ─────────────────────────────────────────────────────────
    // Client sends { receiverId, messageText }
    socket.on("sendMessage", async (data, ack) => {
      try {
        const { receiverId, messageText } = data;
        if (!receiverId || !messageText?.trim()) {
          throw new Error("receiverId and messageText are required");
        }

        // Auth gate
        const allowed = await ChatRequest.findOne({
          $or: [
            { senderId: userId,    receiverId, status: "accepted" },
            { senderId: receiverId, receiverId: userId, status: "accepted" },
          ],
        });
        if (!allowed) throw new Error("Chat not allowed. Accept request first.");

        const conversationId = Message.buildConversationId(userId, receiverId);

        const message = await Message.create({
          senderId: userId,
          receiverId,
          conversationId,
          messageText: messageText.trim(),
          readBy: [userId],
        });

        const populated = await message.populate("senderId", "username profilePicture");

        // Check blocking
        const sender = await User.findById(userId).select("blockedUsers");
        const isBlockedBySender = sender?.blockedUsers?.map(String).includes(receiverId);
        const receiver = await User.findById(receiverId).select("blockedUsers");
        const isBlockedByReceiver = receiver?.blockedUsers?.map(String).includes(userId);

        if (!isBlockedBySender && !isBlockedByReceiver) {
          // Emit ONLY to the conversation room.
          // Both sender (other tabs) and receiver (if they joined the room) get it once.
          chatNS.to(conversationId).emit("receiveMessage", populated);

          // Also emit to receiver's personal room ONLY if they are NOT in the convo room.
          // This avoids double delivery when receiver has the chat open.
          const receiverSockets = await chatNS.in(`user:${receiverId}`).fetchSockets();
          const receiverInRoom  = await chatNS.in(conversationId).fetchSockets();
          const receiverRoomIds = receiverInRoom.map(s => s.id);
          const alreadyInRoom   = receiverSockets.some(s => receiverRoomIds.includes(s.id));

          if (!alreadyInRoom) {
            // Receiver does not have this chat open — send via personal room
            chatNS.to(`user:${receiverId}`).emit("receiveMessage", populated);
          }

         chatNS.to(`user:${receiverId}`).emit("newMessageNotification", {
            conversationId,
            from: { _id: socket.user._id, username: socket.user.username, profilePicture: socket.user.profilePicture },
            preview: messageText.trim().substring(0, 60),
          });

          // ✅ Email notification for new message
          try {
            const User = require("../models/User");
            const receiver = await User.findById(receiverId).select("email username emailNotifications");
            if (receiver?.emailNotifications?.newMessage) {
              const { sendNotificationEmail } = require("../utils/email");
              await sendNotificationEmail(receiver.email, receiver.username, "newMessage", socket.user.username);
            }
          } catch (e) { console.error("[email notify newMessage]", e.message); }
        }

        if (typeof ack === "function") ack({ success: true, message: populated });
      } catch (err) {
        if (typeof ack === "function") ack({ success: false, message: err.message });
      }
    });

    // ── typing indicator ────────────────────────────────────────────────────
    socket.on("typing", ({ conversationId }) => {
      socket.to(conversationId).emit("typing", {
        userId,
        username: socket.user.username,
        conversationId,
      });
    });

    socket.on("stopTyping", ({ conversationId }) => {
      socket.to(conversationId).emit("stopTyping", { userId, conversationId });
    });

    // ── markRead ─────────────────────────────────────────────────────────────
    socket.on("markRead", async ({ conversationId }) => {
      await Message.updateMany(
        { conversationId, receiverId: userId, read: false },
        { $set: { read: true, readAt: new Date() } }
      );

      // Emit to the conversation room (catches sender if they have chat open)
      socket.to(conversationId).emit("messagesRead", { conversationId, readBy: userId });

      // ALSO emit directly to the other person's personal room as a fallback.
      // This ensures the sender sees ✓✓ even if they navigated away from the chat.
      const [idA, idB] = conversationId.split("_");
      const otherUserId = userId === idA ? idB : idA;
      chatNS.to(`user:${otherUserId}`).emit("messagesRead", { conversationId, readBy: userId });
    });

    // ── joinGroup ────────────────────────────────────────────────────────────
    socket.on("joinGroup", async ({ groupId }, ack) => {
      try {
        const Group = require("../models/Group");
        const group = await Group.findById(groupId);
        if (!group) throw new Error("Group not found");
        if (!group.members.map(String).includes(userId)) throw new Error("Not a member");
        socket.join(`group:${groupId}`);
        console.log(`[Chat] ${socket.user.username} joined group room ${groupId}`);
        if (typeof ack === "function") ack({ success: true });
      } catch (err) {
        if (typeof ack === "function") ack({ success: false, message: err.message });
      }
    });

    // ── sendGroupMessage ─────────────────────────────────────────────────────
    socket.on("sendGroupMessage", async ({ groupId, messageText }, ack) => {
      try {
        const Group        = require("../models/Group");
        const GroupMessage = require("../models/GroupMessage");

        const group = await Group.findById(groupId);
        if (!group) throw new Error("Group not found");
        if (!group.members.map(String).includes(userId)) throw new Error("Not a member");
        if (!messageText?.trim()) throw new Error("Message cannot be empty");

        const msg = await GroupMessage.create({
          groupId,
          senderId: userId,
          messageText: messageText.trim(),
          readBy: [userId],
        });
        const populated = await msg.populate("senderId", "username profilePicture");

        // Get users who should not see this message
        const sender = await User.findById(userId).select("blockedUsers");
        const senderBlocked = sender?.blockedUsers?.map(String) || [];
        const blockedBy = await User.find({ blockedUsers: userId }).select("_id");
        const blockedByIds = blockedBy.map(u => u._id.toString());
        const excludedIds = [...new Set([...senderBlocked, ...blockedByIds])];

        // Send to each member except excluded
        group.members.forEach(memberId => {
          const mid = memberId.toString();
          if (!excludedIds.includes(mid)) {
            chatNS.to(`user:${mid}`).emit("receiveGroupMessage", populated);
          }
        });

        if (typeof ack === "function") ack({ success: true, message: populated });
      } catch (err) {
        if (typeof ack === "function") ack({ success: false, message: err.message });
      }
    });

    // ── markGroupRead ────────────────────────────────────────────────────────
    // Client emits ONLY when user is actively viewing the group chat
    // (tab visible + window focused). Marks messages as read and notifies
    // message senders so they can update their "seen by" info in real time.
    socket.on("markGroupRead", async ({ groupId }) => {
      try {
        const GroupMessage = require("../models/GroupMessage");
        const Group        = require("../models/Group");
        const User         = require("../models/User");

        // Verify user is a member
        const group = await Group.findById(groupId);
        if (!group || !group.members.map(String).includes(userId)) return;

        // Find messages NOT yet read by this user
        const unread = await GroupMessage.find({
          groupId,
          readBy: { $ne: userId },
          deletedBy: { $ne: userId },
        }).select("_id senderId");

        if (unread.length === 0) return;

        // Mark them all as read
        await GroupMessage.updateMany(
          { groupId, readBy: { $ne: userId } },
          { $addToSet: { readBy: userId } }
        );

        // Get this user's basic info to send back
        const reader = await User.findById(userId).select("username profilePicture").lean();

        // For each unread message, notify the SENDER that this user has seen it
        // (so their "seen by" list updates live — like WhatsApp)
        const senderIds = [...new Set(unread.map(m => m.senderId.toString()))];
        senderIds.forEach(senderId => {
          const messageIds = unread
            .filter(m => m.senderId.toString() === senderId)
            .map(m => m._id.toString());

          chatNS.to(`user:${senderId}`).emit("groupMessagesSeen", {
            groupId,
            messageIds,
            seenBy: { _id: userId, username: reader.username, profilePicture: reader.profilePicture },
          });
        });

        // Also tell the whole group room (for unread badge updates)
        socket.to(`group:${groupId}`).emit("groupMessagesRead", {
          groupId,
          readBy: userId,
        });
      } catch (err) {
        console.error("[Chat] markGroupRead error:", err.message);
      }
    });

    // ── disconnect ───────────────────────────────────────────────────────────
    socket.on("disconnect", () => {
      onlineUsers.delete(userId);
      chatNS.emit("userOffline", { userId });
      console.log(`[Chat] ✂️  ${socket.user.username} disconnected`);
    });
  });
}

module.exports = registerChatSocket;