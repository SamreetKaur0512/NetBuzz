const jwt    = require("jsonwebtoken");
const User   = require("../models/User");
const bcrypt = require("bcryptjs");
const fs     = require("fs");
const path   = require("path");

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

// ── POST /api/auth/register ───────────────────────────────────────────────────
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

    const user = await User.create({
      userId, username, email, password,
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

    // Existing user — by googleId or email (manual user signing in with Google)
    let user = await User.findOne({ $or: [{ googleId }, { email }] }).select("+password");
    if (user) {
      // Link googleId to existing manual account
      if (!user.googleId) {
        user.googleId = googleId;
        user.isVerified = true;
        if (picture && !user.profilePicture) user.profilePicture = picture;
        await user.save();
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

    if (await User.findOne({ email }))
      return res.status(409).json({ success: false, message: "An account with this email already exists. Please sign in." });
    if (await User.findOne({ userId }))
      return res.status(409).json({ success: false, message: "User ID is already taken. Please choose another." });
    if (await User.findOne({ username: { $regex: `^${username.trim()}$`, $options: "i" } }))
      return res.status(409).json({ success: false, message: "Display name is already taken. Please choose another." });

    // Profile picture: uploaded file takes priority, then Google picture URL
    let profilePicture = req.body.picture || "";
    if (req.file) {
      profilePicture = `/${req.file.path.replace(/\\/g, "/")}`;
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
// Unauthenticated — for Google-first user who tried manual login
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
      return res.status(400).json({ success: false, message: "A password is already set for this account." });
    if (!user.googleId)
      return res.status(400).json({ success: false, message: "Account not eligible for this flow." });

    user.password = password;
    await user.save();
    sendTokenResponse(user, 200, res);
  } catch (err) { next(err); }
};

// ── POST /api/auth/change-password ────────────────────────────────────────────
// Authenticated — works for ALL users. Google-only: no currentPassword needed first time.
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

module.exports = { register, login, googleAuth, googleSetup, setPassword, changePassword };