// ─── server/tests/user.test.js ────────────────────────────────────────────────
// Tests for user controller: profile, follow/unfollow, block, search

const request  = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { app } = require("../server");

let mongoServer;
let tokenA, tokenB;
let userAId, userBId;

const userA = { userId: "usera1", username: "User A", email: "usera@example.com", password: "password123" };
const userB = { userId: "userb1", username: "User B", email: "userb@example.com", password: "password123" };

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const regA = await request(app).post("/api/auth/register").send(userA);
  tokenA  = regA.body.token;
  userAId = regA.body.user._id;

  const regB = await request(app).post("/api/auth/register").send(userB);
  tokenB  = regB.body.token;
  userBId = regB.body.user._id;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

// ── GET /api/users/:id ────────────────────────────────────────────────────────
describe("GET /api/users/:id", () => {
  it("should return public profile of a user", async () => {
    const res = await request(app)
      .get(`/api/users/${userBId}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.user.username).toBe(userB.username);
    expect(res.body.user.password).toBeUndefined();
    expect(res.body.user.email).toBeUndefined(); // email should not be exposed
  });

  it("should return 404 for non-existent user", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .get(`/api/users/${fakeId}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.statusCode).toBe(404);
  });
});

// ── PUT /api/users/follow/:id ─────────────────────────────────────────────────
describe("PUT /api/users/follow/:id", () => {
  it("should follow another user", async () => {
    const res = await request(app)
      .put(`/api/users/follow/${userBId}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("should not follow yourself", async () => {
    const res = await request(app)
      .put(`/api/users/follow/${userAId}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.statusCode).toBe(400);
  });
});

// ── PUT /api/users/unfollow/:id ───────────────────────────────────────────────
describe("PUT /api/users/unfollow/:id", () => {
  it("should unfollow a followed user", async () => {
    // Follow first
    await request(app).put(`/api/users/follow/${userBId}`).set("Authorization", `Bearer ${tokenA}`);
    const res = await request(app)
      .put(`/api/users/unfollow/${userBId}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ── PUT /api/users/block/:id ──────────────────────────────────────────────────
describe("PUT /api/users/block/:id", () => {
  it("should block a user", async () => {
    const res = await request(app)
      .put(`/api/users/block/${userBId}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("should unblock when blocked again (toggle)", async () => {
    await request(app).put(`/api/users/block/${userBId}`).set("Authorization", `Bearer ${tokenA}`);
    const res = await request(app)
      .put(`/api/users/block/${userBId}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("should not block yourself", async () => {
    const res = await request(app)
      .put(`/api/users/block/${userAId}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.statusCode).toBe(400);
  });
});

// ── GET /api/users/search ─────────────────────────────────────────────────────
describe("GET /api/users/search", () => {
  it("should find users by username", async () => {
    const res = await request(app)
      .get("/api/users/search?q=User")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(res.body.users.length).toBeGreaterThan(0);
  });

  it("should return empty array for no match", async () => {
    const res = await request(app)
      .get("/api/users/search?q=xyznonexistent999")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.users.length).toBe(0);
  });

  it("should require auth to search", async () => {
    const res = await request(app).get("/api/users/search?q=User");
    expect(res.statusCode).toBe(401);
  });
});

// ── GET /api/users/me ─────────────────────────────────────────────────────────
describe("GET /api/users/me", () => {
  it("should return current user profile", async () => {
    const res = await request(app)
      .get("/api/users/me")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.user.email).toBe(userA.email);
    expect(res.body.user.password).toBeUndefined();
  });

  it("should reject without token", async () => {
    const res = await request(app).get("/api/users/me");
    expect(res.statusCode).toBe(401);
  });
});