// ─── server/tests/group.test.js ───────────────────────────────────────────────
// Tests for group controller: create, invite, accept/decline, messages, leave, delete

const request  = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { app } = require("../server");

let mongoServer;
let tokenA, tokenB, tokenC;
let userAId, userBId, userCId;
let groupId, inviteId, groupMsgId;

const userA = { userId: "grpa1", username: "Grp A", email: "grpa@example.com", password: "password123" };
const userB = { userId: "grpb1", username: "Grp B", email: "grpb@example.com", password: "password123" };
const userC = { userId: "grpc1", username: "Grp C", email: "grpc@example.com", password: "password123" };

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
  userCId = regC.body.user._id;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

// ── POST /api/groups/create ───────────────────────────────────────────────────
describe("POST /api/groups/create", () => {
  it("should create a new group", async () => {
    const res = await request(app)
      .post("/api/groups/create")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "Test Group", memberIds: [userBId] });
    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.group.name).toBe("Test Group");
    groupId = res.body.group._id;
  });

  it("should require a group name", async () => {
    const res = await request(app)
      .post("/api/groups/create")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ memberIds: [userBId] });
    expect(res.statusCode).toBe(400);
  });

  it("should require auth", async () => {
    const res = await request(app)
      .post("/api/groups/create")
      .send({ name: "No Auth Group" });
    expect(res.statusCode).toBe(401);
  });
});

// ── GET /api/groups/my ────────────────────────────────────────────────────────
describe("GET /api/groups/my", () => {
  it("should return groups the user belongs to", async () => {
    const res = await request(app)
      .get("/api/groups/my")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.groups)).toBe(true);
    expect(res.body.groups.length).toBeGreaterThan(0);
  });
});

// ── POST /api/groups/:groupId/invite ─────────────────────────────────────────
describe("POST /api/groups/:groupId/invite", () => {
  it("should invite a user to the group", async () => {
    const res = await request(app)
      .post(`/api/groups/${groupId}/invite`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ userId: userCId });
    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it("should not invite a non-existent user", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .post(`/api/groups/${groupId}/invite`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ userId: fakeId });
    expect(res.statusCode).toBe(404);
  });
});

// ── GET /api/groups/invites ───────────────────────────────────────────────────
describe("GET /api/groups/invites", () => {
  it("should return pending group invites for the user", async () => {
    const res = await request(app)
      .get("/api/groups/invites")
      .set("Authorization", `Bearer ${tokenC}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.invites)).toBe(true);
    inviteId = res.body.invites[0]?._id;
  });
});

// ── PUT /api/groups/invites/:inviteId/accept ──────────────────────────────────
describe("PUT /api/groups/invites/:inviteId/accept", () => {
  it("should accept a group invite", async () => {
    const res = await request(app)
      .put(`/api/groups/invites/${inviteId}/accept`)
      .set("Authorization", `Bearer ${tokenC}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ── GET /api/groups/:groupId/messages ─────────────────────────────────────────
describe("GET /api/groups/:groupId/messages", () => {
  it("should return messages for a group member", async () => {
    const res = await request(app)
      .get(`/api/groups/${groupId}/messages`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.messages)).toBe(true);
  });

  it("should not allow non-member to read group messages", async () => {
    const regD = await request(app).post("/api/auth/register").send({
      userId: "grpd1", username: "Grp D", email: "grpd@example.com", password: "password123",
    });
    const tokenD = regD.body.token;
    const res = await request(app)
      .get(`/api/groups/${groupId}/messages`)
      .set("Authorization", `Bearer ${tokenD}`);
    expect(res.statusCode).toBe(403);
  });
});

// ── PUT /api/groups/:groupId/leave ────────────────────────────────────────────
describe("PUT /api/groups/:groupId/leave", () => {
  it("should allow a member to leave the group", async () => {
    const res = await request(app)
      .put(`/api/groups/${groupId}/leave`)
      .set("Authorization", `Bearer ${tokenC}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("should not allow creator to leave without transferring ownership", async () => {
    const res = await request(app)
      .put(`/api/groups/${groupId}/leave`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.statusCode).toBe(400);
  });
});

// ── DELETE /api/groups/:groupId/members/:userId ───────────────────────────────
describe("DELETE /api/groups/:groupId/members/:userId", () => {
  it("should allow creator to remove a member", async () => {
    const res = await request(app)
      .delete(`/api/groups/${groupId}/members/${userBId}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("should not allow non-creator to remove members", async () => {
    // Reinvite B first
    const inv = await request(app)
      .post(`/api/groups/${groupId}/invite`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ userId: userBId });
    const newInvId = inv.body.invite?._id;
    await request(app).put(`/api/groups/invites/${newInvId}/accept`).set("Authorization", `Bearer ${tokenB}`);

    const res = await request(app)
      .delete(`/api/groups/${groupId}/members/${userBId}`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(res.statusCode).toBe(403);
  });
});

// ── DELETE /api/groups/:groupId ───────────────────────────────────────────────
describe("DELETE /api/groups/:groupId", () => {
  it("should not allow non-creator to delete group", async () => {
    const res = await request(app)
      .delete(`/api/groups/${groupId}`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(res.statusCode).toBe(403);
  });

  it("should allow creator to delete the group", async () => {
    const res = await request(app)
      .delete(`/api/groups/${groupId}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });
});