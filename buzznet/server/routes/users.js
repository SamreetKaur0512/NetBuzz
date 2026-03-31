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

// ── Specific GET routes first ─────────────────────────────────────────────────
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

router.get("/search",          verifyToken,  searchUsers);
router.get("/blocked",         verifyToken,  getBlockedUsers);
router.get("/follow-requests", verifyToken,  getFollowRequests);

// TEMP DEBUG ROUTE - remove after testing
router.get("/test-email", verifyToken, async (req, res) => {
  try {
    console.log("=== EMAIL TEST START ===");
    console.log("EMAIL_USER:", process.env.EMAIL_USER);
    console.log("EMAIL_PASS exists:", !!process.env.EMAIL_PASS);
    console.log("BREVO_API_KEY exists:", !!process.env.BREVO_API_KEY);

    const User = require("../models/User");
    const user = await User.findById(req.user._id);
    console.log("emailNotifications:", JSON.stringify(user.emailNotifications));

    const { sendNotificationEmail } = require("../utils/email");
    console.log("sendNotificationEmail type:", typeof sendNotificationEmail);

    await sendNotificationEmail(req.user.email, req.user.username, "followAccepted", "TestUser");
    console.log("=== EMAIL SENT SUCCESSFULLY ===");

    res.json({
      success: true,
      message: "Test email sent to " + req.user.email,
      emailNotifications: user.emailNotifications,
      emailUser: process.env.EMAIL_USER,
      brevoKeyExists: !!process.env.BREVO_API_KEY,
      gmailPassExists: !!process.env.EMAIL_PASS,
    });
  } catch (err) {
    console.error("=== EMAIL TEST FAILED ===", err.message);
    res.json({ success: false, error: err.message });
  }
});

// ── PUT routes ────────────────────────────────────────────────────────────────
router.put("/follow-requests/:requestId/accept", verifyToken, acceptFollowRequest);
router.put("/follow-requests/:requestId/reject", verifyToken, rejectFollowRequest);
router.put("/update/:id/notifications", verifyToken, updateNotifications);
router.put("/update/:id",    verifyToken, upload.single("profilePicture"), handleMulterError, updateUser);
router.put("/follow/:id",    verifyToken, followUser);
router.put("/unfollow/:id",  verifyToken, unfollowUser);
router.put("/block/:id",     verifyToken, blockUser);

// ── DELETE routes ─────────────────────────────────────────────────────────────
router.delete("/delete-account",     verifyToken, deleteAccount);
router.delete("/follow/:id/cancel",  verifyToken, cancelFollowRequest);

// ── Generic /:id LAST ─────────────────────────────────────────────────────────
router.get("/:id", optionalAuth, getUserById);

module.exports = router;
