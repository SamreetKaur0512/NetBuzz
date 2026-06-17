const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    senderId:       { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    receiverId:     { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    conversationId: { type: String, required: true, index: true },
    messageText:    { type: String, required: true, trim: true, maxlength: 2000 },
    readBy:         [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    // Deletion flags — per-user visibility
    deletedBySender:   { type: Boolean, default: false },
    deletedByReceiver: { type: Boolean, default: false },
  },
  { timestamps: true }
);

messageSchema.index({ conversationId: 1, createdAt: -1 });

messageSchema.statics.buildConversationId = function (idA, idB) {
  return [idA.toString(), idB.toString()].sort().join("_");
};

module.exports = mongoose.model("Message", messageSchema);