const express = require("express");
const router  = express.Router();
const { verifyToken }              = require("../middleware/auth");
const { upload, handleMulterError } = require("../middleware/upload");
const {
  register, login, googleAuth, googleSetup, setPassword, changePassword,
  sendOtp, verifyOtp, resendOtp, forgotPassword, resetPassword,
} = require("../controllers/authController");

// ── Inline rate limiter — no external dependency needed ───────────────────────
const makeLimit = ({ windowMs, max, message }) => {
  const store = new Map();
  setInterval(() => { const now = Date.now(); for (const [k, v] of store) if (now > v.resetAt) store.delete(k); }, windowMs);
  return (req, res, next) => {
    const ip  = req.ip || req.headers["x-forwarded-for"] || "";
    const now = Date.now();
    const e   = store.get(ip);
    if (!e || now > e.resetAt) { store.set(ip, { count: 1, resetAt: now + windowMs }); return next(); }
    if (e.count >= max) return res.status(429).json({ success: false, message });
    e.count++;
    next();
  };
};

const loginLimiter    = makeLimit({ windowMs: 15 * 60 * 1000, max: 10, message: "Too many login attempts. Please wait 15 minutes." });
const registerLimiter = makeLimit({ windowMs: 60 * 60 * 1000, max: 5,  message: "Too many registrations from this IP." });
const forgotLimiter   = makeLimit({ windowMs: 15 * 60 * 1000, max: 5,  message: "Too many password reset requests. Please wait 15 minutes." });
const otpLimiter      = makeLimit({ windowMs: 10 * 60 * 1000, max: 10, message: "Too many OTP requests. Please wait 10 minutes." });

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