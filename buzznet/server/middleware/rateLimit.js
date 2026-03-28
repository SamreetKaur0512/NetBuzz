// ─── server/middleware/rateLimit.js ──────────────────────────────────────────
// Simple in-memory rate limiter (no extra npm package needed)
// Tracks requests per IP per window and blocks if limit exceeded

const store = new Map(); // ip -> { count, resetAt }

/**
 * createRateLimiter({ windowMs, max, message })
 *  windowMs  – time window in milliseconds
 *  max       – max requests allowed in that window
 *  message   – error message to send when blocked
 */
const createRateLimiter = ({ windowMs = 60_000, max = 100, message = "Too many requests. Please try again later." } = {}) => {
  return (req, res, next) => {
    const ip  = req.ip || req.headers["x-forwarded-for"] || req.connection.remoteAddress;
    const now = Date.now();

    const entry = store.get(ip);

    if (!entry || now > entry.resetAt) {
      // First request in this window (or window expired)
      store.set(ip, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (entry.count >= max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader("Retry-After", retryAfter);
      return res.status(429).json({
        success: false,
        message,
        retryAfter,
      });
    }

    entry.count++;
    next();
  };
};

// ── Pre-built limiters for different route groups ─────────────────────────────

// Strict: login / register / OTP — 10 attempts per 15 minutes
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many auth attempts. Please wait 15 minutes before trying again.",
});

// Medium: post creation, comments — 30 per minute
const postLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: "You are posting too fast. Please slow down.",
});

// Loose: general API reads — 200 per minute
const generalLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 200,
  message: "Too many requests. Please try again in a moment.",
});

// Clean up expired entries every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of store.entries()) {
    if (now > entry.resetAt) store.delete(ip);
  }
}, 5 * 60 * 1000);

module.exports = { authLimiter, postLimiter, generalLimiter, createRateLimiter };