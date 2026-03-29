const express = require("express");
const router  = express.Router();
const { verifyToken }              = require("../middleware/auth");
const { upload, handleMulterError } = require("../middleware/upload");
const {
  register, login, googleAuth, googleSetup, setPassword, changePassword,
  sendOtp, verifyOtp, resendOtp, forgotPassword, resetPassword,
} = require("../controllers/authController");

// --- Rate Limiters removed to prevent crash since rateLimit.js was deleted ---

router.post("/register",        upload.single("profilePicture"), handleMulterError, register);
router.post("/login",           login);
router.post("/google",          googleAuth);
router.post("/google-setup",    upload.single("profilePicture"), handleMulterError, googleSetup);
router.post("/set-password",    setPassword);
router.post("/change-password", verifyToken, changePassword);

// OTP-based registration
router.post("/send-otp",        sendOtp);
router.post("/verify-otp",      upload.single("profilePicture"), handleMulterError, verifyOtp);
router.post("/resend-otp",      resendOtp);

// Forgot / reset password
router.post("/forgot-password", forgotPassword);
router.post("/reset-password",  resetPassword);

module.exports = router;