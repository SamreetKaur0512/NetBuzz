const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type:        { type: String, enum: ["followAccepted", "newFollower", "messageAccepted"], required: true },
  fromUserId:  { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  fromUsername:{ type: String, required: true },
  fromPicture: { type: String, default: "" },
  read:        { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model("Notification", notificationSchema);