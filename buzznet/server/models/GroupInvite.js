const mongoose = require("mongoose");

const groupInviteSchema = new mongoose.Schema(
  {
    groupId:   { type: mongoose.Schema.Types.ObjectId, ref: "Group",  required: true },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User",   required: true },
    invitedUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status:    { type: String, enum: ["pending","accepted","declined"], default: "pending" },
  },
  { timestamps: true }
);

// Index for fast lookup (not unique — code handles duplicate pending check)
groupInviteSchema.index({ groupId: 1, invitedUser: 1, status: 1 }, { unique: false });

module.exports = mongoose.model("GroupInvite", groupInviteSchema);