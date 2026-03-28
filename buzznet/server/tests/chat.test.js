// ─── server/tests/chat.test.js ────────────────────────────────────────────────
// Tests for chat controller: send request, accept, reject, get pending

const request  = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { app } = require("../server");

let mongoServer;
let tokenA, tokenB, tokenC;
let userAId, userBId;

const userA = { userId: "chata1", username: "Chat A", email: "chata@example.com", password: "password123" };
const userB = { userId: "chatb1", username: "Chat B", email: "chatb@example.com", password: "password123" };
const userC = { userId: "chatc1", username: "Chat C", email: "chatc@example.com", password: "password123" };

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const regA = await request(app).post("/api/auth/register").send(userA);
  tokenA  = regA.body.token;
  userAId = regA.body.user._id;

  const regB = await request(app).post("/api/auth/register").send(userB);
  tokenB  = regB.body.token;
  userBId = regB.body.user._id;

  const regC = await request(app).post("/api/auth/register").send(userC);
  tokenC  = regC.body.token;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  const ChatRequest = require("../models/ChatRequest");
  await ChatRequest.deleteMany({});
});

// ── POST /api/chat/request ────────────────────────────────────────────────────
describe("POST /api/chat/request", () => {
  it("should send a chat request successfully", async () => {
    const res = await request(app)
      .post("/api/chat/request")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ recipientId: userBId });
    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it("should not send a request to yourself", async () => {
    const res = await request(app)
      .post("/api/chat/request")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ recipientId: userAId });
    expect(res.statusCode).toBe(400);
  });

  it("should not send duplicate chat request", async () => {
    await request(app)
      .post("/api/chat/request")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ recipientId: userBId });
    const res = await request(app)
      .post("/api/chat/request")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ recipientId: userBId });
    expect(res.statusCode).toBe(409);
  });

  it("should require auth", async () => {
    const res = await request(app)
      .post("/api/chat/request")
      .send({ recipientId: userBId });
    expect(res.statusCode).toBe(401);
  });
});

// ── PUT /api/chat/accept ──────────────────────────────────────────────────────
describe("PUT /api/chat/accept", () => {
  let requestId;

  beforeEach(async () => {
    const res = await request(app)
      .post("/api/chat/request")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ recipientId: userBId });
    requestId = res.body.request?._id;
  });

  it("should accept a pending chat request", async () => {
    const res = await request(app)
      .put("/api/chat/accept")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ requestId });
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("should not allow sender to accept their own request", async () => {
    const res = await request(app)
      .put("/api/chat/accept")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ requestId });
    expect(res.statusCode).toBe(403);
  });
});

// ── PUT /api/chat/reject ──────────────────────────────────────────────────────
describe("PUT /api/chat/reject", () => {
  let requestId;

  beforeEach(async () => {
    const res = await request(app)
      .post("/api/chat/request")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ recipientId: userBId });
    requestId = res.body.request?._id;
  });

  it("should reject a pending chat request", async () => {
    const res = await request(app)
      .put("/api/chat/reject")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ requestId });
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ── GET /api/chat/requests ────────────────────────────────────────────────────
describe("GET /api/chat/requests", () => {
  it("should return pending requests for the user", async () => {
    await request(app)
      .post("/api/chat/request")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ recipientId: userBId });

    const res = await request(app)
      .get("/api/chat/requests")
      .set("Authorization", `Bearer ${tokenB}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.requests)).toBe(true);
    expect(res.body.requests.length).toBeGreaterThan(0);
  });

  it("should return empty array when no requests", async () => {
    const res = await request(app)
      .get("/api/chat/requests")
      .set("Authorization", `Bearer ${tokenC}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.requests.length).toBe(0);
  });
});