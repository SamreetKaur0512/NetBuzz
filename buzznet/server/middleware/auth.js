const express = require("express");
const router  = express.Router();
const { verifyToken }              = require("../middleware/auth");
const { upload, handleMulterError } = require("../middleware/upload");
const { createRateLimiter }         = require("../middleware/rateLimit");
const {
  register, login, googleAuth, googleSetup, setPassword, changePassword,
  sendOtp, verifyOtp, resendOtp, forgotPassword, resetPassword,
} = require("../controllers/authController");

// Separate limiters per route so forgot-password doesn't share
// the login/register quota (users often try multiple times)
const loginLimiter        = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10,  message: "Too many login attempts. Please wait 15 minutes." });
const registerLimiter     = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 5,   message: "Too many registrations from this IP." });
const forgotLimiter       = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 5,   message: "Too many password reset requests. Please wait 15 minutes." });
const otpLimiter          = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 10,  message: "Too many OTP requests. Please wait 10 minutes." });

router.post("/register",        registerLimiter, upload.single("profilePicture"), handleMulterError, register);
router.post("/login",           loginLimiter,    login);
router.post("/google",          googleAuth);
router.post("/google-setup",    upload.single("profilePicture"), handleMulterError, googleSetup);
router.post("/set-password",    setPassword);
router.post("/change-password", verifyToken, changePassword);

// OTP-based registration
router.post("/send-otp",        otpLimiter,    sendOtp);
router.post("/verify-otp",      otpLimiter,    upload.single("profilePicture"), handleMulterError, verifyOtp);
router.post("/resend-otp",      otpLimiter,    resendOtp);

// Forgot / reset password — separate generous limiter so users aren't blocked
router.post("/forgot-password", forgotLimiter, forgotPassword);
router.post("/reset-password",  forgotLimiter, resetPassword);

module.exports = router;