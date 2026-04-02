const express = require("express");
const router  = express.Router();
const { verifyToken } = require("../middleware/auth");
const { upload, handleMulterError } = require("../middleware/upload");
const { uploadToCloud, handleMulterError } = require("../middleware/upload");
const {
  createPost, deletePost, likePost,
  commentOnPost, replyToComment, likeComment, deleteComment, deleteReply, deleteNestedReply,
  getFeed, getExplore, getUserPosts,
} = require("../controllers/postController");

router.get("/feed",                              verifyToken, getFeed);
router.get("/explore",                           verifyToken, getExplore);
router.get("/user/:id",                          verifyToken, getUserPosts);
router.post("/create",                           verifyToken, ...uploadToCloud("media", "buzznet/posts"), handleMulterError, createPost);
router.delete("/:id",                            verifyToken, deletePost);
router.put("/like/:id",                          verifyToken, likePost);
router.post("/comment/:id",                      verifyToken, commentOnPost);
router.post("/:postId/comment/:commentId/reply", verifyToken, replyToComment);
router.put("/:postId/comment/:commentId/like",   verifyToken, likeComment);
router.delete("/:postId/comment/:commentId",     verifyToken, deleteComment);
router.delete("/:postId/comment/:commentId/reply/:replyId", verifyToken, deleteReply);
router.delete("/:postId/comment/:commentId/reply/:replyId/reply/:nestedReplyId", verifyToken, deleteNestedReply);

module.exports = router;