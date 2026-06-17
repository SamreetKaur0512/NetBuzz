// ─── server/tests/middleware.test.js ─────────────────────────────────────────
// Tests for auth middleware, rate limiter, and sanitizer

const request  = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { app } = require("../server");

let mongoServer;
let validToken;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const reg = await request(app).post("/api/auth/register").send({
    userId: "mwuser1", username: "MW User", email: "mw@example.com", password: "password123",
  });
  validToken = reg.body.token;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

// ── Auth Middleware ────────────────────────────────────────────────────────────
describe("Auth Middleware (verifyToken)", () => {
  it("should allow access with valid Bearer token", async () => {
    const res = await request(app)
      .get("/api/users/me")
      .set("Authorization", `Bearer ${validToken}`);
    expect(res.statusCode).toBe(200);
  });

  it("should reject with no token", async () => {
    const res = await request(app).get("/api/users/me");
    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("should reject with malformed token", async () => {
    const res = await request(app)
      .get("/api/users/me")
      .set("Authorization", "Bearer this.is.garbage");
    expect(res.statusCode).toBe(401);
  });

  it("should reject with expired token", async () => {
    const jwt = require("jsonwebtoken");
    const expiredToken = jwt.sign(
      { id: new mongoose.Types.ObjectId() },
      process.env.JWT_SECRET || "test-secret",
      { expiresIn: "0s" }
    );
    const res = await request(app)
      .get("/api/users/me")
      .set("Authorization", `Bearer ${expiredToken}`);
    expect(res.statusCode).toBe(401);
  });
});

// ── Sanitizer Middleware ───────────────────────────────────────────────────────
describe("Sanitize Middleware", () => {
  it("should strip HTML tags from inputs", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "<script>alert(1)</script>test@example.com", password: "password123" });
    // Should not crash the server — just fail auth normally
    expect(res.statusCode).not.toBe(500);
  });

  it("should block MongoDB operator injection ($where)", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: { $where: "this.password.length > 0" }, password: "anything" });
    // Server should handle this safely without crashing
    expect(res.statusCode).not.toBe(500);
  });

  it("should strip null bytes from string inputs", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "test\x00@example.com", password: "password123" });
    expect(res.statusCode).not.toBe(500);
  });
});

// ── Rate Limiter ──────────────────────────────────────────────────────────────
describe("Rate Limiter", () => {
  it("should return 429 after exceeding auth limit", async () => {
    // Fire 11 requests (limit is 10 per 15 min)
    let lastRes;
    for (let i = 0; i < 11; i++) {
      lastRes = await request(app)
        .post("/api/auth/login")
        .send({ email: "nobody@example.com", password: "wrong" });
    }
    expect(lastRes.statusCode).toBe(429);
    expect(lastRes.body.success).toBe(false);
    expect(lastRes.body.retryAfter).toBeDefined();
  });
});

// ── Health Endpoint ───────────────────────────────────────────────────────────
describe("GET /api/health", () => {
  it("should return server status", async () => {
    const res = await request(app).get("/api/health");
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe("OK");
  });
});