const mongoose = require("mongoose");

const replySchema = new mongoose.Schema(
  {
    userId:      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text:        { type: String, required: true, trim: true, maxlength: 500 },
    replyToUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    replies:     [],
  },
  { timestamps: true }
);

replySchema.add({ replies: [replySchema] });

const commentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text:   { type: String, required: true, trim: true, maxlength: 500 },
    likes:  [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    replies: [replySchema],
  },
  { timestamps: true }
);

const postSchema = new mongoose.Schema(
  {
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    caption:   { type: String, default: "", trim: true, maxlength: 2200 },
    mediaUrl:  { type: String, required: true },
    mediaType: { type: String, enum: ["image","video"], default: "image" },
    likes:     [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    comments:  [commentSchema],
  },
  { timestamps: true }
);

postSchema.virtual("likesCount").get(function () { return this.likes.length; });
postSchema.virtual("commentsCount").get(function () { return this.comments.length; });
postSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("Post", postSchema);