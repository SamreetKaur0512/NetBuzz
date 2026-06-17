const mongoose = require("mongoose");

// ─── Sub-schema: player slot ──────────────────────────────────────────────────
const playerSchema = new mongoose.Schema(
  {
    userId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    username: { type: String, required: true },
    score:    { type: Number, default: 0 },
    ready:    { type: Boolean, default: false },
    // answers indexed by question index
    answers:         { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
    eliminated:      { type: Boolean, default: false },
    totalAnswerTime: { type: Number, default: 0 },
  },
  { _id: false }
);

const gameRoomSchema = new mongoose.Schema(
  {
    roomCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    hostId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    gameType: {
      type: String,
      enum: ["quiz", "puzzle", "wyr", "ttt", "draw", "snake", "aiquiz"],
      required: true,
    },
    status: {
      type: String,
      enum: ["waiting", "in_progress", "finished"],
      default: "waiting",
    },
    players: [playerSchema],
    maxPlayers: {
      type: Number,
      default: 8,
      min: 2,
      max: 20,
    },
    currentQuestion: {
      type: Number,
      default: 0,
    },
    totalQuestions: {
      type: Number,
      default: 10,
    },
    questionTimeLimit: {
      type: Number,      // seconds
      default: 20,
    },
    // snapshot of questions used in this session (generated at startGame)
    questions: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    winnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    wyrState: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    startedAt:  { type: Date, default: null },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

gameRoomSchema.index({ roomCode: 1 });
gameRoomSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("GameRoom", gameRoomSchema);