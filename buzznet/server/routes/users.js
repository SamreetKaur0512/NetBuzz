const express = require("express");
const router  = express.Router();
const { verifyToken, optionalAuth } = require("../middleware/auth");
const { upload, handleMulterError }  = require("../middleware/upload");
const {
  getUserById, updateUser, updateNotifications,
  followUser, unfollowUser,
  cancelFollowRequest, getFollowRequests, acceptFollowRequest, rejectFollowRequest,
  blockUser, getBlockedUsers, searchUsers, deleteAccount,
} = require("../controllers/userController");

router.get("/me", verifyToken, async (req, res) => {
  try {
    const User = require("../models/User");
    const user = await User.findById(req.user._id).select("+password -blockedUsers");
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    const userObj = user.toObject();
    userObj.hasPassword = !!userObj.password;
    delete userObj.password;
    res.json({ success: true, user: userObj });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get("/search",                              verifyToken,  searchUsers);
router.get("/blocked",                             verifyToken,  getBlockedUsers);
router.get("/follow-requests",                     verifyToken,  getFollowRequests);
router.put("/follow-requests/:requestId/accept",   verifyToken,  acceptFollowRequest);
router.put("/follow-requests/:requestId/reject",   verifyToken,  rejectFollowRequest);
router.delete("/delete-account",                   verifyToken,  deleteAccount);

// ✅ Specific routes BEFORE generic /:id route
router.put("/update/:id/notifications", verifyToken, updateNotifications);
router.put("/update/:id",     verifyToken,  upload.single("profilePicture"), handleMulterError, updateUser);
router.put("/follow/:id",     verifyToken,  followUser);
router.put("/unfollow/:id",   verifyToken,  unfollowUser);
router.delete("/follow/:id/cancel", verifyToken, cancelFollowRequest);
router.put("/block/:id",      verifyToken,  blockUser);

router.get("/:id",            optionalAuth, getUserById);

module.exports = router;