const Post = require("../models/Post");
const User = require("../models/User");

// ── Helper: find reply recursively in replies tree ───────────────────────────
const findReplyRecursively = (replies, replyId) => {
  for (const reply of replies) {
    if (reply._id.toString() === replyId) return reply;
    if (reply.replies && reply.replies.length > 0) {
      const found = findReplyRecursively(reply.replies, replyId);
      if (found) return found;
    }
  }
  return null;
};

// ── Helper: remove a reply at any depth ──────────────────────────────────────
// Uses splice() instead of .pull() so it works at every nesting level.
// The caller must call post.markModified('comments') after this to ensure
// Mongoose persists the change regardless of nesting depth.
const removeReplyRecursively = (replies, replyId) => {
  for (let i = 0; i < replies.length; i++) {
    if (replies[i]._id.toString() === replyId) {
      replies.splice(i, 1);
      return true;
    }
    if (replies[i].replies && replies[i].replies.length > 0) {
      if (removeReplyRecursively(replies[i].replies, replyId)) return true;
    }
  }
  return false;
};

// ── Shared: build blocked set for a user ─────────────────────────────────────
const buildBlockedSet = async (userId) => {
  const userIdStr = userId.toString();
  const me = await User.findById(userId).select("blockedUsers").lean();
  const blocked = (me?.blockedUsers || []).map(id => id.toString());
  const theyBlocked = await User.find({ blockedUsers: { $in: [userId] } }).select("_id").lean();
  const theyBlockedIds = theyBlocked.map(u => u._id.toString());
  return new Set([...blocked, ...theyBlockedIds]);
};

// ── Shared: filter comments/replies recursively by blocked set ──────────────
const filterCommentsRecursively = (comments, blockedSet) => {
  return (comments || [])
    .filter(c => !blockedSet.has((c.userId?._id || c.userId)?.toString()))
    .map(c => ({
      ...c,
      replies: filterCommentsRecursively(c.replies, blockedSet),
    }));
};

// ─── POST /api/posts/create ───────────────────────────────────────────────────
const createPost = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Media file is required." });
    }

    const mediaType = req.file.mimetype.startsWith("video/") ? "video" : "image";
    const mediaUrl = req.file.cloudinaryUrl;

    const post = await Post.create({
      userId: req.user._id,
      caption: req.body.caption || "",
      mediaUrl,
      mediaType,
    });

    const populated = await post.populate("userId", "username profilePicture");

    res.status(201).json({ success: true, message: "Post created.", post: populated });
  } catch (err) {
    next(err);
  }
};

// ─── DELETE /api/posts/:id ────────────────────────────────────────────────────
const deletePost = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ success: false, message: "Post not found." });
    }
    if (post.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "You can only delete your own posts." });
    }

    // ✅ Delete from Cloudinary if URL is a Cloudinary URL
    if (post.mediaUrl && post.mediaUrl.includes("cloudinary.com")) {
      try {
        const cloudinary = require("cloudinary").v2;
        // Extract public_id from URL
        const parts    = post.mediaUrl.split("/");
        const file     = parts[parts.length - 1];
        const folder   = parts[parts.length - 2];
        const publicId = `${folder}/${file.split(".")[0]}`;
        const isVideo  = post.mediaType === "video";
        await cloudinary.uploader.destroy(publicId, { resource_type: isVideo ? "video" : "image" });
      } catch (e) { console.error("[cloudinary delete]", e.message); }
    }

    await post.deleteOne();
    res.status(200).json({ success: true, message: "Post deleted." });
  } catch (err) {
    next(err);
  }
};

// ─── PUT /api/posts/like/:id ──────────────────────────────────────────────────
const likePost = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ success: false, message: "Post not found." });
    }

    const userId = req.user._id;
    const alreadyLiked = post.likes.includes(userId);

    const update = alreadyLiked
      ? { $pull: { likes: userId } }
      : { $addToSet: { likes: userId } };

    const updated = await Post.findByIdAndUpdate(req.params.id, update, { new: true });

    res.status(200).json({
      success: true,
      message: alreadyLiked ? "Post unliked." : "Post liked.",
      likesCount: updated.likes.length,
      liked: !alreadyLiked,
    });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/posts/comment/:id ─────────────────────────────────────────────
const commentOnPost = async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim())
      return res.status(400).json({ success: false, message: "Comment text is required." });

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: "Post not found." });

    post.comments.push({ userId: req.user._id, text: text.trim() });
    await post.save();

    const newComment = post.comments[post.comments.length - 1];
    await post.populate("comments.userId", "username userId profilePicture");
    const populated = post.comments.id(newComment._id);

    res.status(201).json({ success: true, comment: populated, commentsCount: post.comments.length });
  } catch (err) { next(err); }
};

// ─── POST /api/posts/:postId/comment/:commentId/reply ─────────────────────────
const replyToComment = async (req, res, next) => {
  try {
    const { text, replyToUser, replyId } = req.body;
    if (!text?.trim()) return res.status(400).json({ success: false, message: "Reply text required." });

    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ success: false, message: "Post not found." });

    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ success: false, message: "Comment not found." });

    const newReply = { userId: req.user._id, text: text.trim(), replyToUser: replyToUser || null };

    // Push the reply and capture its generated _id BEFORE populate
    // IMPORTANT: never reassign .replies to a plain array — always use .push() on the DocumentArray
    // so Mongoose generates a proper _id for the subdocument
    let savedReplyId;
    if (replyId) {
      // Reply to a nested reply
      const parentReply = findReplyRecursively(comment.replies, replyId);
      if (!parentReply) return res.status(404).json({ success: false, message: "Reply not found." });
      // Push into the existing DocumentArray (do NOT reassign)
      parentReply.replies.push(newReply);
      savedReplyId = parentReply.replies[parentReply.replies.length - 1]._id;
    } else {
      // Direct reply to a comment
      comment.replies.push(newReply);
      savedReplyId = comment.replies[comment.replies.length - 1]._id;
    }

    await post.save();

    // Populate user info on the saved post
    await post.populate("comments.replies.userId", "username userId profilePicture");
    await post.populate("comments.replies.replyToUser", "username");
    await post.populate("comments.replies.replies.userId", "username userId profilePicture");
    await post.populate("comments.replies.replies.replyToUser", "username");
    await post.populate("comments.replies.replies.replies.userId", "username userId profilePicture");
    await post.populate("comments.replies.replies.replies.replyToUser", "username");

    // Find the populated reply by its captured _id — always works because _id never changes
    const newReplyPopulated = findReplyRecursively(comment.replies, savedReplyId.toString());

    res.status(201).json({ success: true, reply: newReplyPopulated, parentReplyId: replyId || null });
  } catch (err) { next(err); }
};

// ─── PUT /api/posts/:postId/comment/:commentId/like ───────────────────────────
const likeComment = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ success: false, message: "Post not found." });

    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ success: false, message: "Comment not found." });

    const uid = req.user._id.toString();
    const liked = comment.likes.map(String).includes(uid);
    if (liked) comment.likes.pull(req.user._id);
    else comment.likes.push(req.user._id);
    await post.save();

    res.json({ success: true, liked: !liked, likesCount: comment.likes.length });
  } catch (err) { next(err); }
};

// ─── GET /api/posts/feed ──────────────────────────────────────────────────────
const getFeed = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const currentUser = await User.findById(req.user._id);
    const feedUserIds = [req.user._id, ...currentUser.following];

    const posts = await Post.find({ userId: { $in: feedUserIds } })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("userId", "username userId profilePicture isPrivate")
      .populate("comments.userId", "username userId profilePicture")
      .populate("comments.replies.userId", "username userId profilePicture")
      .populate("comments.replies.replyToUser", "username")
      .populate("comments.replies.replies.userId", "username userId profilePicture")
      .populate("comments.replies.replies.replyToUser", "username")
      .populate("comments.replies.replies.replies.userId", "username userId profilePicture")
      .populate("comments.replies.replies.replies.replyToUser", "username")
      .populate("comments.replies.replies.replies.replies.userId", "username userId profilePicture")
      .populate("comments.replies.replies.replies.replies.replyToUser", "username")
      .populate("comments.replies.replies.replies.replies.replies.userId", "username userId profilePicture")
      .populate("comments.replies.replies.replies.replies.replies.replyToUser", "username")
      .lean();

    // Filter out posts from private accounts the user doesn't follow
    const filtered = posts.filter((post) => {
      if (!post.userId.isPrivate) return true;
      return currentUser.following.some((id) => id.toString() === post.userId._id.toString())
        || post.userId._id.toString() === req.user._id.toString();
    });

    // Filter out posts from blocked users
    const blockedSet = await buildBlockedSet(req.user._id);
    const blockedFiltered = filtered.filter((post) => 
      !blockedSet.has(post.userId._id.toString())
    );

    // Add isLiked flag + filter blocked users comments
    const myId = req.user._id.toString();

    const enriched = blockedFiltered.map((post) => ({
      ...post,
      likesCount:    post.likes.length,
      commentsCount: post.comments.length,
      isLiked:       post.likes.some((id) => id.toString() === myId),
      comments:      filterCommentsRecursively(post.comments, blockedSet),
    }));

    const total = await Post.countDocuments({ userId: { $in: feedUserIds } });

    res.status(200).json({
      success: true,
      posts: enriched,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/posts/user/:id ──────────────────────────────────────────────────
const getUserPosts = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip = (page - 1) * limit;

    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    // Private account guard
    const isOwnProfile = req.user && req.user._id.toString() === req.params.id;
    const isFollowing = req.user && targetUser.followers.includes(req.user._id);

    // Check if blocked (either direction)
    const viewer = await User.findById(req.user._id).select("blockedUsers");
    if (viewer.blockedUsers.some(id => id.toString() === req.params.id) ||
        targetUser.blockedUsers.some(id => id.toString() === req.user._id.toString())) {
      return res.status(403).json({ success: false, message: "Access denied due to blocking." });
    }

    const posts = await Post.find({ userId: req.params.id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("userId", "username userId profilePicture")
      .populate("comments.userId", "username userId profilePicture")
      .populate("comments.replies.userId", "username userId profilePicture")
      .populate("comments.replies.replyToUser", "username")
      .populate("comments.replies.replies.userId", "username userId profilePicture")
      .populate("comments.replies.replies.replyToUser", "username")
      .populate("comments.replies.replies.replies.userId", "username userId profilePicture")
      .populate("comments.replies.replies.replies.replyToUser", "username")
      .populate("comments.replies.replies.replies.replies.userId", "username userId profilePicture")
      .populate("comments.replies.replies.replies.replies.replyToUser", "username")
      .populate("comments.replies.replies.replies.replies.replies.userId", "username userId profilePicture")
      .populate("comments.replies.replies.replies.replies.replies.replyToUser", "username")
      .lean();
    const postsLean = posts;

    const total = await Post.countDocuments({ userId: req.params.id });

    const myId = req.user._id.toString();
    const blockedSet = await buildBlockedSet(req.user._id);
    const enriched = postsLean.map(post => ({
      ...post,
      likesCount:    post.likes.length,
      commentsCount: post.comments.length,
      isLiked:       post.likes.some(id => id.toString() === myId),
      comments:      filterCommentsRecursively(post.comments, blockedSet),
    }));

    res.status(200).json({
      success: true,
      posts: enriched,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/posts/explore ──────────────────────────────────────────────────
const getExplore = async (req, res, next) => {
  try {
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip  = (page - 1) * limit;

    const currentUser = await User.findById(req.user._id).select("following blockedUsers");
    const blockedIds  = currentUser.blockedUsers?.map(String) || [];
    const followingIds = (currentUser.following || []).map(String);

    // Get users who blocked me
    const theyBlocked    = await User.find({ blockedUsers: req.user._id }).select("_id").lean();
    const theyBlockedIds = theyBlocked.map(u => u._id.toString());
    const hideIds        = [...new Set([...blockedIds, ...theyBlockedIds])];

    const myId = req.user._id.toString();

    // Show: all public posts + private posts from followed users + own posts
    // Exclude: blocked users in both directions
    const posts = await Post.find({ userId: { $nin: hideIds } })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("userId", "username userId profilePicture isPrivate")
      .populate("comments.userId", "username userId profilePicture")
      .populate("comments.replies.userId", "username userId profilePicture")
      .populate("comments.replies.replyToUser", "username")
      .populate("comments.replies.replies.userId", "username userId profilePicture")
      .populate("comments.replies.replies.replyToUser", "username")
      .populate("comments.replies.replies.replies.userId", "username userId profilePicture")
      .populate("comments.replies.replies.replies.replyToUser", "username")
      .populate("comments.replies.replies.replies.replies.userId", "username userId profilePicture")
      .populate("comments.replies.replies.replies.replies.replyToUser", "username")
      .populate("comments.replies.replies.replies.replies.replies.userId", "username userId profilePicture")
      .populate("comments.replies.replies.replies.replies.replies.replyToUser", "username")
      .lean();

    // Filter: show public posts + followed private + own
    const filtered = posts.filter(p => {
      const ownerId = (p.userId?._id || p.userId)?.toString();
      if (ownerId === myId) return true;                          // own posts
      if (!p.userId?.isPrivate) return true;                     // all public
      return followingIds.includes(ownerId);                     // private but followed
    });

    const blockedSet = await buildBlockedSet(req.user._id);
    const enriched = filtered.map(post => ({
      ...post,
      likesCount:    post.likes.length,
      commentsCount: post.comments.length,
      isLiked:       post.likes.some(id => id.toString() === myId),
      comments:      filterCommentsRecursively(post.comments, blockedSet),
    }));

    res.json({ success: true, posts: enriched });
  } catch (err) { next(err); }
};

// ─── DELETE /api/posts/:postId/comment/:commentId ─────────────────────────────
const deleteComment = async (req, res, next) => {
  try {
    const { postId, commentId } = req.params;
    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ success: false, message: "Post not found." });

    const comment = post.comments.id(commentId);
    if (!comment) return res.status(404).json({ success: false, message: "Comment not found." });

    const isCommentOwner = comment.userId.toString() === req.user._id.toString();
    const isPostOwner    = post.userId.toString()    === req.user._id.toString();
    if (!isCommentOwner && !isPostOwner)
      return res.status(403).json({ success: false, message: "Not authorized." });

    comment.deleteOne();
    await post.save();
    res.json({ success: true, message: "Comment deleted.", commentsCount: post.comments.length });
  } catch (err) { next(err); }
};

// ─── DELETE /api/posts/:postId/comment/:commentId/reply/:replyId ──────────────
const deleteReply = async (req, res, next) => {
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const { postId, commentId, replyId } = req.params;

      const post = await Post.findById(postId);
      if (!post) return res.status(404).json({ success: false, message: "Post not found." });

      const comment = post.comments.id(commentId);
      if (!comment) return res.status(404).json({ success: false, message: "Comment not found." });

      const reply = findReplyRecursively(comment.replies, replyId);
      if (!reply) return res.status(404).json({ success: false, message: "Reply not found." });

      const isReplyOwner = reply.userId.toString() === req.user._id.toString();
      const isPostOwner  = post.userId.toString()  === req.user._id.toString();
      if (!isReplyOwner && !isPostOwner)
        return res.status(403).json({ success: false, message: "Not authorized." });

      removeReplyRecursively(comment.replies, replyId);
      post.markModified('comments');
      await post.save();
      return res.json({ success: true, message: "Reply deleted." });
    } catch (err) {
      // Retry on Mongoose VersionError (concurrent save conflict)
      if (err.name === 'VersionError' && attempt < MAX_RETRIES - 1) continue;
      return next(err);
    }
  }
};

// ─── DELETE /api/posts/:postId/comment/:commentId/reply/:replyId/reply/:nestedReplyId ──────────────
const deleteNestedReply = async (req, res, next) => {
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const { postId, commentId, replyId, nestedReplyId } = req.params;
      const post = await Post.findById(postId);
      if (!post) return res.status(404).json({ success: false, message: "Post not found." });

      const comment = post.comments.id(commentId);
      if (!comment) return res.status(404).json({ success: false, message: "Comment not found." });

      const nestedReply = findReplyRecursively(comment.replies, nestedReplyId);
      if (!nestedReply) return res.status(404).json({ success: false, message: "Nested reply not found." });

      const isReplyOwner = nestedReply.userId.toString() === req.user._id.toString();
      const isPostOwner  = post.userId.toString()  === req.user._id.toString();
      if (!isReplyOwner && !isPostOwner)
        return res.status(403).json({ success: false, message: "Not authorized." });

      removeReplyRecursively(comment.replies, nestedReplyId);
      post.markModified('comments');
      await post.save();
      return res.json({ success: true, message: "Nested reply deleted." });
    } catch (err) {
      if (err.name === 'VersionError' && attempt < MAX_RETRIES - 1) continue;
      return next(err);
    }
  }
};

module.exports = { createPost, deletePost, likePost, commentOnPost, replyToComment, likeComment, getFeed, getExplore, getUserPosts, deleteComment, deleteReply, deleteNestedReply };