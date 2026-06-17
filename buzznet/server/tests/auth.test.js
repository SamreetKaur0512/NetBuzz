// ─── server/tests/auth.test.js ────────────────────────────────────────────────
// Tests for auth controller: register, login, OTP flow, Google auth
// Run with: npm test (after adding jest to package.json)
//
// Setup: npm install --save-dev jest supertest mongodb-memory-server
// Add to server/package.json scripts: "test": "jest --runInBand --forceExit"

const request  = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { app } = require("../server");

let mongoServer;

// ── Lifecycle ─────────────────────────────────────────────────────────────────
beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  // Clean all collections between tests so tests don't bleed into each other
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
const validUser = {
  userId:   "testuser1",
  username: "Test User",
  email:    "test@example.com",
  password: "password123",
};

// ── POST /api/auth/register ───────────────────────────────────────────────────
describe("POST /api/auth/register", () => {
  it("should register a new user and return a token", async () => {
    const res = await request(app).post("/api/auth/register").send(validUser);
    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe(validUser.email);
    expect(res.body.user.password).toBeUndefined(); // password must not be returned
  });

  it("should reject registration with missing email", async () => {
    const res = await request(app).post("/api/auth/register").send({
      userId: "testuser2", username: "Test 2", password: "password123",
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("should reject duplicate email", async () => {
    await request(app).post("/api/auth/register").send(validUser);
    const res = await request(app).post("/api/auth/register").send({
      ...validUser, userId: "testuser3", username: "Another User",
    });
    expect(res.statusCode).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it("should reject duplicate userId", async () => {
    await request(app).post("/api/auth/register").send(validUser);
    const res = await request(app).post("/api/auth/register").send({
      ...validUser, email: "other@example.com", username: "Other User",
    });
    expect(res.statusCode).toBe(409);
  });

  it("should reject password shorter than 6 characters", async () => {
    const res = await request(app).post("/api/auth/register").send({
      ...validUser, password: "abc",
    });
    expect(res.statusCode).toBe(400);
  });
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
describe("POST /api/auth/login", () => {
  beforeEach(async () => {
    await request(app).post("/api/auth/register").send(validUser);
  });

  it("should login with correct credentials and return a token", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: validUser.email, password: validUser.password,
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
  });

  it("should reject wrong password", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: validUser.email, password: "wrongpassword",
    });
    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("should reject non-existent email", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: "nobody@example.com", password: "password123",
    });
    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("should reject login with missing fields", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: validUser.email });
    expect(res.statusCode).toBe(400);
  });
});