// ─── server/tests/message.test.js ────────────────────────────────────────────
// Tests for message controller: send, get, conversations, delete, unseen count

const request  = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { app } = require("../server");

let mongoServer;
let tokenA, tokenB;
let userAId, userBId;
let conversationId, messageId;

const userA = { userId: "msga1", username: "Msg A", email: "msga@example.com", password: "password123" };
const userB = { userId: "msgb1", username: "Msg B", email: "msgb@example.com", password: "password123" };

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const regA = await request(app).post("/api/auth/register").send(userA);
  tokenA  = regA.body.token;
  userAId = regA.body.user._id;

  const regB = await request(app).post("/api/auth/register").send(userB);
  tokenB  = regB.body.token;
  userBId = regB.body.user._id;

  // Accept a chat request so A and B can message each other
  const reqRes = await request(app)
    .post("/api/chat/request")
    .set("Authorization", `Bearer ${tokenA}`)
    .send({ recipientId: userBId });
  const reqId = reqRes.body.request?._id;

  await request(app)
    .put("/api/chat/accept")
    .set("Authorization", `Bearer ${tokenB}`)
    .send({ requestId: reqId });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

// ── POST /api/messages/send ───────────────────────────────────────────────────
describe("POST /api/messages/send", () => {
  it("should send a message to an accepted chat partner", async () => {
    const res = await request(app)
      .post("/api/messages/send")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ receiverId: userBId, text: "Hello from A!" });
    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.message.text).toBe("Hello from A!");
    messageId      = res.body.message._id;
    conversationId = res.body.message.conversationId;
  });

  it("should not send an empty message", async () => {
    const res = await request(app)
      .post("/api/messages/send")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ receiverId: userBId, text: "   " });
    expect(res.statusCode).toBe(400);
  });

  it("should require auth to send a message", async () => {
    const res = await request(app)
      .post("/api/messages/send")
      .send({ receiverId: userBId, text: "No auth" });
    expect(res.statusCode).toBe(401);
  });
});

// ── GET /api/messages/:conversationId ────────────────────────────────────────
describe("GET /api/messages/:conversationId", () => {
  it("should return messages in a conversation", async () => {
    const res = await request(app)
      .get(`/api/messages/${conversationId}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.messages)).toBe(true);
    expect(res.body.messages.length).toBeGreaterThan(0);
  });

  it("should not allow a third party to read a conversation", async () => {
    const regC = await request(app).post("/api/auth/register").send({
      userId: "msgc1", username: "Msg C", email: "msgc@example.com", password: "password123",
    });
    const tokenC = regC.body.token;
    const res = await request(app)
      .get(`/api/messages/${conversationId}`)
      .set("Authorization", `Bearer ${tokenC}`);
    expect(res.statusCode).toBe(403);
  });
});

// ── GET /api/messages/conversations ──────────────────────────────────────────
describe("GET /api/messages/conversations", () => {
  it("should list all conversations for a user", async () => {
    const res = await request(app)
      .get("/api/messages/conversations")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.conversations)).toBe(true);
    expect(res.body.conversations.length).toBeGreaterThan(0);
  });

  it("should require auth", async () => {
    const res = await request(app).get("/api/messages/conversations");
    expect(res.statusCode).toBe(401);
  });
});

// ── GET /api/messages/unseen ──────────────────────────────────────────────────
describe("GET /api/messages/unseen", () => {
  it("should return unseen message count", async () => {
    const res = await request(app)
      .get("/api/messages/unseen")
      .set("Authorization", `Bearer ${tokenB}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.count).toBe("number");
  });
});

// ── DELETE /api/messages/:messageId ──────────────────────────────────────────
describe("DELETE /api/messages/:messageId", () => {
  it("should delete own message", async () => {
    const res = await request(app)
      .delete(`/api/messages/${messageId}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("should not allow deleting someone else's message", async () => {
    const sendRes = await request(app)
      .post("/api/messages/send")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ receiverId: userBId, text: "Another message" });
    const newMsgId = sendRes.body.message._id;

    const res = await request(app)
      .delete(`/api/messages/${newMsgId}`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(res.statusCode).toBe(403);
  });

  it("should return 404 for non-existent message", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .delete(`/api/messages/${fakeId}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.statusCode).toBe(404);
  });
});