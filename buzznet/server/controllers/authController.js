const jwt    = require("jsonwebtoken");
const User   = require("../models/User");
const Otp    = require("../models/Otp");
const bcrypt = require("bcryptjs");
const fs     = require("fs");
const path   = require("path");
const { sendOtpEmail } = require("../utils/email");

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || "7d" });

const sendTokenResponse = (user, statusCode, res) => {
  const token = signToken(user._id);
  res.status(statusCode).json({
    success: true, token,
    user: {
      _id: user._id, userId: user.userId, username: user.username,
      email: user.email, profilePicture: user.profilePicture,
      bio: user.bio, followers: user.followers, following: user.following,
      isPrivate: user.isPrivate, isVerified: user.isVerified,
      googleId: user.googleId,
      hasPassword: !!user.password,
      createdAt: user.createdAt,
    },
  });
};

// ── POST /api/auth/send-otp ───────────────────────────────────────────────────
// Validates uniqueness, stores pending data, sends OTP email
const sendOtp = async (req, res, next) => {
  try {
    const { userId, username, email, password, bio, isPrivate } = req.body;
    if (!userId)   return res.status(400).json({ success: false, message: "User ID is required." });
    if (!username) return res.status(400).json({ success: false, message: "Display name is required." });
    if (!email)    return res.status(400).json({ success: false, message: "Email is required." });
    if (!password) return res.status(400).json({ success: false, message: "Password is required." });
    if (password.length < 6)
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters." });

    // Check uniqueness before sending OTP
    if (await User.findOne({ email: email.toLowerCase().trim() }))
      return res.status(409).json({ success: false, message: "Email is already taken." });
    if (await User.findOne({ userId }))
      return res.status(409).json({ success: false, message: "User ID is already taken." });
    if (await User.findOne({ username: { $regex: `^${username.trim()}$`, $options: "i" } }))
      return res.status(409).json({ success: false, message: "Display name is already taken. Please choose another." });

    // Generate 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Remove any existing OTP for this email
    await Otp.deleteMany({ email: email.toLowerCase().trim() });

    // Store OTP + pending registration data
    await Otp.create({
      email: email.toLowerCase().trim(),
      otp: otpCode,
      expiresAt,
      pendingData: { userId, username: username.trim(), email: email.toLowerCase().trim(), password, bio: bio || "", isPrivate: isPrivate || false },
    });

    // Send email
    await sendOtpEmail(email, otpCode, username);

    res.json({ success: true, message: "Verification code sent to your email." });
  } catch (err) {
    console.error("[sendOtp error]", err);
    if (err.message?.includes("Invalid login") || err.message?.includes("auth") || err.code === "EAUTH")
      return res.status(500).json({ success: false, message: "Failed to send verification email. Please check your email configuration." });
    next(err);
  }
};

// ── POST /api/auth/verify-otp ─────────────────────────────────────────────────
const verifyOtp = async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp)
      return res.status(400).json({ success: false, message: "Email and OTP are required." });

    const record = await Otp.findOne({ email: email.toLowerCase().trim() });
    if (!record)
      return res.status(400).json({ success: false, message: "No verification code found. Please request a new one." });
    if (new Date() > record.expiresAt)
      return res.status(400).json({ success: false, message: "Verification code has expired. Please request a new one." });
    if (record.otp !== otp.toString().trim())
      return res.status(400).json({ success: false, message: "Invalid verification code." });

    const { userId, username, email: pendingEmail, password, bio, isPrivate } = record.pendingData;

    // Double-check uniqueness (someone may have registered while this OTP was pending)
    if (await User.findOne({ email: pendingEmail }))
      return res.status(409).json({ success: false, message: "Email was just taken. Please register again." });
    if (await User.findOne({ userId }))
      return res.status(409).json({ success: false, message: "User ID was just taken. Please register again." });
    if (await User.findOne({ username: { $regex: `^${username}$`, $options: "i" } }))
      return res.status(409).json({ success: false, message: "Display name was just taken. Please register again." });

    // Profile picture uploaded at verify time
    let profilePicture = "";
    if (req.file) {
      profilePicture = `/${req.file.path.replace(/\\/g, "/")}`;
    }

    const user = await User.create({
      userId, username, email: pendingEmail, password,
      profilePicture,
      bio, isPrivate, isVerified: true,
    });

    // Cleanup OTP record
    await Otp.deleteMany({ email: pendingEmail });

    sendTokenResponse(user, 201, res);
  } catch (err) {
    if (err.name === "ValidationError")
      return res.status(400).json({ success: false, message: Object.values(err.errors).map(e => e.message).join(". ") });
    next(err);
  }
};

// ── POST /api/auth/resend-otp ─────────────────────────────────────────────────
const resendOtp = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email)
      return res.status(400).json({ success: false, message: "Email is required." });

    const record = await Otp.findOne({ email: email.toLowerCase().trim() });
    if (!record || !record.pendingData)
      return res.status(400).json({ success: false, message: "No pending registration found. Please start over." });

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    record.otp = otpCode;
    record.expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await record.save();

    await sendOtpEmail(email, otpCode, record.pendingData.username);
    res.json({ success: true, message: "New verification code sent." });
  } catch (err) {
    console.error("[resendOtp error]", err);
    next(err);
  }
};

// ── POST /api/auth/register ───────────────────────────────────────────────────
// Supports optional profile picture upload via multipart/form-data
const register = async (req, res, next) => {
  try {
    const { userId, username, email, password, bio, isPrivate } = req.body;
    if (!userId)   return res.status(400).json({ success: false, message: "User ID is required." });
    if (!username) return res.status(400).json({ success: false, message: "Display name is required." });
    if (!email)    return res.status(400).json({ success: false, message: "Email is required." });
    if (!password) return res.status(400).json({ success: false, message: "Password is required." });

    if (await User.findOne({ email }))
      return res.status(409).json({ success: false, message: "Email is already taken." });
    if (await User.findOne({ userId }))
      return res.status(409).json({ success: false, message: "User ID is already taken." });
    if (await User.findOne({ username: { $regex: `^${username.trim()}$`, $options: "i" } }))
      return res.status(409).json({ success: false, message: "Display name is already taken. Please choose another." });

    // Profile picture from file upload (multipart/form-data)
    let profilePicture = "";
    if (req.file) {
      profilePicture = `/${req.file.path.replace(/\\/g, "/")}`;
    }

    const user = await User.create({
      userId, username: username.trim(), email, password,
      profilePicture,
      bio: bio || "", isPrivate: isPrivate || false, isVerified: true,
    });
    sendTokenResponse(user, 201, res);
  } catch (err) {
    if (err.name === "ValidationError")
      return res.status(400).json({ success: false, message: Object.values(err.errors).map(e => e.message).join(". ") });
    next(err);
  }
};

// ── POST /api/auth/login ──────────────────────────────────────────────────────
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ success: false, message: "Email and password are required." });

    const user = await User.findOne({ email }).select("+password");
    if (!user)
      return res.status(401).json({ success: false, message: "Invalid email or password." });

    // Google-only account — no password set yet
    if (!user.password && user.googleId) {
      return res.status(200).json({
        success: false,
        needs_password: true,
        email: user.email,
        message: "This account was created with Google. Please set a password to enable email sign-in.",
      });
    }

    if (!user.password)
      return res.status(401).json({ success: false, message: "Invalid email or password." });

    const isMatch = await user.comparePassword(password);
    if (!isMatch)
      return res.status(401).json({ success: false, message: "Invalid email or password." });

    sendTokenResponse(user, 200, res);
  } catch (err) { next(err); }
};

// ── POST /api/auth/google ─────────────────────────────────────────────────────
const googleAuth = async (req, res, next) => {
  try {
    const { idToken } = req.body;
    if (!idToken)
      return res.status(400).json({ success: false, message: "Google token required." });

    const { OAuth2Client } = require("google-auth-library");
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
    const { sub: googleId, email, name, picture } = ticket.getPayload();

    // Existing user — by googleId or email
    let user = await User.findOne({ $or: [{ googleId }, { email }] }).select("+password");
    if (user) {
      // Link googleId to existing manual account if not linked yet
      if (!user.googleId) {
        user.googleId = googleId;
        user.isVerified = true;
        if (picture && !user.profilePicture) user.profilePicture = picture;
        await user.save();
      }
      // FIX: If user exists but setup was never completed (no userId), treat as new
      if (!user.userId) {
        return res.status(200).json({
          success: false,
          needs_user_id: true,
          googleId,
          email,
          suggestedName: name || "",
          picture: picture || "",
        });
      }
      return sendTokenResponse(user, 200, res);
    }

    // Brand new Google user — frontend must collect full profile
    return res.status(200).json({
      success: false,
      needs_user_id: true,
      googleId,
      email,
      suggestedName: name || "",
      picture: picture || "",
    });
  } catch (err) {
    if (err.message?.includes("Token used too late") || err.message?.includes("Invalid token"))
      return res.status(401).json({ success: false, message: "Google sign-in failed. Please try again." });
    next(err);
  }
};

// ── POST /api/auth/google-setup ───────────────────────────────────────────────
const googleSetup = async (req, res, next) => {
  try {
    const { googleId, email, userId, username, bio, isPrivate } = req.body;

    if (!googleId || !email)
      return res.status(400).json({ success: false, message: "Missing Google credentials." });
    if (!userId)
      return res.status(400).json({ success: false, message: "User ID is required." });
    if (!username || !username.trim())
      return res.status(400).json({ success: false, message: "Display name is required." });
    if (userId.length < 5)
      return res.status(400).json({ success: false, message: "User ID must be at least 5 characters." });
    if (!/^[a-zA-Z0-9_]+$/.test(userId))
      return res.status(400).json({ success: false, message: "User ID can only contain letters, numbers and underscores." });

    // Check if a complete account already exists with this email/googleId
    const existingByEmail = await User.findOne({ email });
    if (existingByEmail && existingByEmail.userId) {
      // Account fully set up — just sign them in
      return sendTokenResponse(existingByEmail, 200, res);
    }

    if (await User.findOne({ userId }))
      return res.status(409).json({ success: false, message: "User ID is already taken. Please choose another." });
    if (await User.findOne({ username: { $regex: `^${username.trim()}$`, $options: "i" } }))
      return res.status(409).json({ success: false, message: "Display name is already taken. Please choose another." });

    // Profile picture: uploaded file takes priority, then Google picture URL
    let profilePicture = req.body.picture || "";
    if (req.file) {
      profilePicture = `/${req.file.path.replace(/\\/g, "/")}`;
    }

    // If a partial account exists (no userId), update it instead of creating new
    if (existingByEmail) {
      existingByEmail.userId = userId;
      existingByEmail.username = username.trim();
      existingByEmail.googleId = googleId;
      existingByEmail.bio = bio || "";
      existingByEmail.isPrivate = isPrivate === "true" || isPrivate === true;
      existingByEmail.isVerified = true;
      if (profilePicture) existingByEmail.profilePicture = profilePicture;
      await existingByEmail.save();
      return sendTokenResponse(existingByEmail, 200, res);
    }

    const user = await User.create({
      userId, username: username.trim(), email, googleId,
      profilePicture,
      bio: bio || "",
      isPrivate: isPrivate === "true" || isPrivate === true,
      isVerified: true,
    });
    sendTokenResponse(user, 201, res);
  } catch (err) { next(err); }
};

// ── POST /api/auth/set-password ───────────────────────────────────────────────
// Unauthenticated — for Google-first user who tried manual login and has NO password yet
const setPassword = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ success: false, message: "Email and password are required." });
    if (password.length < 6)
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters." });

    const user = await User.findOne({ email }).select("+password");
    if (!user)
      return res.status(404).json({ success: false, message: "No account found with this email." });
    if (user.password)
      return res.status(400).json({ success: false, message: "A password is already set. Use 'Change Password' from your profile instead." });
    if (!user.googleId)
      return res.status(400).json({ success: false, message: "Account not eligible for this flow." });

    user.password = password;
    await user.save();
    sendTokenResponse(user, 200, res);
  } catch (err) { next(err); }
};

// ── POST /api/auth/change-password ────────────────────────────────────────────
// Authenticated — works for ALL users, supports multiple changes.
// Google-only users: no currentPassword needed on FIRST set.
// After first set: currentPassword always required.
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword)
      return res.status(400).json({ success: false, message: "New password is required." });
    if (newPassword.length < 6)
      return res.status(400).json({ success: false, message: "New password must be at least 6 characters." });

    const user = await User.findById(req.user._id).select("+password");
    if (!user)
      return res.status(404).json({ success: false, message: "User not found." });

    // Verify current password only if account already has one
    if (user.password) {
      if (!currentPassword)
        return res.status(400).json({ success: false, message: "Current password is required." });
      const isMatch = await user.comparePassword(currentPassword);
      if (!isMatch)
        return res.status(401).json({ success: false, message: "Current password is incorrect." });
    }

    user.password = newPassword;
    await user.save();
    res.json({ success: true, message: "Password updated successfully.", hasPassword: true });
  } catch (err) { next(err); }
};

// ── POST /api/auth/forgot-password ───────────────────────────────────────────
// Send a 6-digit OTP to the user's email for password reset
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Email is required." });

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    // Always respond success to avoid email enumeration attacks
    if (!user) return res.json({ success: true, message: "If an account exists, a reset code has been sent." });

    const otpCode  = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Reuse Otp model — store with pendingData = null to distinguish from registration OTPs
    await Otp.deleteMany({ email: email.toLowerCase().trim() });
    await Otp.create({
      email: email.toLowerCase().trim(),
      otp: otpCode,
      expiresAt,
      pendingData: null,
    });

    const { sendPasswordResetEmail } = require("../utils/email");
    await sendPasswordResetEmail(email, otpCode, user.username);

    res.json({ success: true, message: "Password reset code sent to your email." });
  } catch (err) {
    console.error("[forgotPassword error]", err);
    next(err);
  }
};

// ── POST /api/auth/reset-password ────────────────────────────────────────────
// Verify OTP and set the new password (unauthenticated)
const resetPassword = async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword)
      return res.status(400).json({ success: false, message: "Email, OTP and new password are required." });
    if (newPassword.length < 6)
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters." });

    const record = await Otp.findOne({ email: email.toLowerCase().trim() });
    if (!record)
      return res.status(400).json({ success: false, message: "No reset code found. Please request a new one." });
    if (new Date() > record.expiresAt)
      return res.status(400).json({ success: false, message: "Reset code has expired. Please request a new one." });
    if (record.otp !== otp.toString().trim())
      return res.status(400).json({ success: false, message: "Invalid reset code." });

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select("+password");
    if (!user)
      return res.status(404).json({ success: false, message: "Account not found." });

    user.password = newPassword;
    await user.save();

    // Clean up OTP
    await Otp.deleteMany({ email: email.toLowerCase().trim() });

    sendTokenResponse(user, 200, res);
  } catch (err) { next(err); }
};

module.exports = { register, login, googleAuth, googleSetup, setPassword, changePassword, sendOtp, verifyOtp, resendOtp, forgotPassword, resetPassword };