const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: [true, "User ID is required"],
      unique: true,
      trim: true,
      minlength: [5, "User ID must be at least 5 characters"],
      maxlength: [30, "User ID cannot exceed 30 characters"],
      match: [/^[a-zA-Z0-9_]+$/, "User ID can only contain letters, numbers and underscores"],
      immutable: true,
    },
    username: {
      type: String,
      required: [true, "Display name is required"],
      unique: true,
      trim: true,
      maxlength: [50, "Display name cannot exceed 50 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email"],
    },
    password: {
      type: String,
      // NOT required — Google-only accounts have no password
      minlength: [6, "Password must be at least 6 characters"],
      select: false,
    },
    googleId: {
      type: String,
      default: null,
      sparse: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    profilePicture: { type: String, default: "" },
    bio:            { type: String, default: "", maxlength: [150, "Bio cannot exceed 150 characters"] },
    followers:      [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    following:      [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    isPrivate:      { type: Boolean, default: false },
    blockedUsers:   [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    emailNotifications: {
      followRequest:   { type: Boolean, default: false },
      followAccepted:  { type: Boolean, default: false },
      messageRequest:  { type: Boolean, default: false },
      messageAccepted: { type: Boolean, default: false },
      newMessage:      { type: Boolean, default: false },
      groupInvite:     { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

// Hash password before saving — only if modified and present
userSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.virtual("followersCount").get(function () { return this.followers.length; });
userSchema.virtual("followingCount").get(function () { return this.following.length; });

userSchema.methods.toSafeObject = function () {
  const obj = this.toObject({ virtuals: true });
  delete obj.password;
  delete obj.blockedUsers;
  return obj;
};

module.exports = mongoose.model("User", userSchema);