// ─── server/tests/game.test.js ────────────────────────────────────────────────
// Tests for game controller: list rooms, create room, get by code, game history

const request  = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { app } = require("../server");

let mongoServer;
let tokenA, userAId;
let roomCode;

const userA = { userId: "gamea1", username: "Game A", email: "gamea@example.com", password: "password123" };

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const regA = await request(app).post("/api/auth/register").send(userA);
  tokenA  = regA.body.token;
  userAId = regA.body.user._id;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

// ── POST /api/games/create ────────────────────────────────────────────────────
describe("POST /api/games/create", () => {
  it("should create a new game room", async () => {
    const res = await request(app)
      .post("/api/games/create")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ maxPlayers: 4, questionCount: 10, timeLimit: 20 });
    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.room.roomCode).toBeDefined();
    roomCode = res.body.room.roomCode;
  });

  it("should require auth to create a room", async () => {
    const res = await request(app)
      .post("/api/games/create")
      .send({ maxPlayers: 2 });
    expect(res.statusCode).toBe(401);
  });
});

// ── GET /api/games/rooms ──────────────────────────────────────────────────────
describe("GET /api/games/rooms", () => {
  it("should list open game rooms", async () => {
    const res = await request(app)
      .get("/api/games/rooms")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.rooms)).toBe(true);
  });

  it("should require auth", async () => {
    const res = await request(app).get("/api/games/rooms");
    expect(res.statusCode).toBe(401);
  });
});

// ── GET /api/games/:roomCode ──────────────────────────────────────────────────
describe("GET /api/games/:roomCode", () => {
  it("should return room details by code", async () => {
    const res = await request(app)
      .get(`/api/games/${roomCode}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.room.roomCode).toBe(roomCode);
  });

  it("should return 404 for non-existent room code", async () => {
    const res = await request(app)
      .get("/api/games/ZZZZZZ")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.statusCode).toBe(404);
  });
});

// ── GET /api/games/history ────────────────────────────────────────────────────
describe("GET /api/games/history", () => {
  it("should return game history for authenticated user", async () => {
    const res = await request(app)
      .get("/api/games/history")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.games)).toBe(true);
  });

  it("should require auth", async () => {
    const res = await request(app).get("/api/games/history");
    expect(res.statusCode).toBe(401);
  });
});