const express    = require("express");
const http       = require("http");
const mongoose   = require("mongoose");
const cors       = require("cors");
const path       = require("path");
const { Server } = require("socket.io");
require("dotenv").config();

// ─── Security & Rate Limiting ─────────────────────────────────────────────────
const { authLimiter, postLimiter, generalLimiter } = require("./middleware/rateLimit");
const { sanitizeInputs } = require("./middleware/sanitize");

// ─── Simple Security Headers (replaces helmet) ────────────────────────────────
const securityHeaders = (req, res, next) => {
  res.setHeader("X-Content-Type-Options",    "nosniff");
  res.setHeader("X-Frame-Options",           "DENY");
  res.setHeader("X-XSS-Protection",          "1; mode=block");
  res.setHeader("Referrer-Policy",           "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy",        "camera=(), microphone=(), geolocation=()");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' https://accounts.google.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' ws: wss: https://netbuzz.onrender.com https://net-buzz.vercel.app https://accounts.google.com;"
  );
  next();
};

// ─── Route Imports ────────────────────────────────────────────────────────────
const authRoutes    = require("./routes/auth");
const userRoutes    = require("./routes/users");
const postRoutes    = require("./routes/posts");
const chatRoutes    = require("./routes/chat");
const messageRoutes = require("./routes/messages");
const gameRoutes    = require("./routes/games");
const groupRoutes   = require("./routes/groups");
const aiRoutes      = require("./routes/ai");

// ─── Socket Handler Imports ───────────────────────────────────────────────────
const registerChatSocket = require("./socket/chatSocket");
const registerGameSocket = require("./socket/gameSocket");

const app    = express();
const server = http.createServer(app);           // HTTP server wraps Express

// ─── Socket.io Setup ──────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "https://net-buzz.vercel.app",
    methods: ["GET", "POST"],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Make io accessible from req.app.get("io") inside controllers
app.set("io", io);

// ─── Express Middleware ───────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.CLIENT_URL || "https://net-buzz.vercel.app",
  credentials: true,
}));
app.use(securityHeaders);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(sanitizeInputs); // strip XSS & NoSQL injection from all inputs
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ─── REST Routes ──────────────────────────────────────────────────────────────
app.use("/api/auth",     authLimiter,    authRoutes);
app.use("/api/users",    generalLimiter, userRoutes);
app.use("/api/posts",    postLimiter,    postRoutes);
app.use("/api/chat",     chatRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/games",    gameRoutes);
app.use("/api/ai",       aiRoutes);
app.use("/api/groups",   groupRoutes);

app.get("/api/health", (_req, res) =>
  res.json({ status: "OK", message: "Server is running", timestamp: new Date() })
);

// ─── Socket.io Namespaces ─────────────────────────────────────────────────────
const chatNamespace = io.of("/chat");
const gameNamespace = io.of("/game");

registerChatSocket(chatNamespace);
registerGameSocket(gameNamespace);

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  const statusCode = err.statusCode || 500;
  const message    = err.message    || "Internal Server Error";
  console.error(`[Error] ${statusCode} - ${message}`);
  res.status(statusCode).json({
    success: false,
    statusCode,
    message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

// ─── Database + Server Start ──────────────────────────────────────────────────
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ MongoDB connected successfully");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  }
};

const PORT = process.env.PORT || 5000;
connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
    console.log(`🔌 Socket.io ready  → /chat  and  /game namespaces`);
  });
});

module.exports = { app, io };