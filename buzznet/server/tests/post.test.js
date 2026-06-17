// ─── server/tests/post.test.js ────────────────────────────────────────────────
// Tests for post controller: create, delete, like, comment, reply, feed

const request  = require("supertest");
const mongoose = require("mongoose");
const path     = require("path");
const fs       = require("fs");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { app } = require("../server");

let mongoServer;
let token;
let userId;
let postId;

// ── Lifecycle ─────────────────────────────────────────────────────────────────
beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  // Register + login a user to get token
  const reg = await request(app).post("/api/auth/register").send({
    userId: "poster1", username: "Poster One",
    email: "poster@example.com", password: "password123",
  });
  token  = reg.body.token;
  userId = reg.body.user._id;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

// ── Helper: create a test image file ─────────────────────────────────────────
const getTestImage = () => {
  // Minimal valid 1x1 white JPEG — no external file needed
  const buf = Buffer.from(
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U" +
    "HRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgN" +
    "DRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy" +
    "MjL/wAARCAABAAEDASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAABgUE/8QAIBAA" +
    "AgIBBQEAAAAAAAAAAAAAAQIDBAUREiExQf/EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAU" +
    "EQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCFPjXKbluHHFv1ib5dYl2vX1XQA" +
    "AAAB/9k=",
    "base64"
  );
  const tmpPath = path.join(__dirname, "test-image.jpg");
  fs.writeFileSync(tmpPath, buf);
  return tmpPath;
};

// ── POST /api/posts/create ────────────────────────────────────────────────────
describe("POST /api/posts/create", () => {
  it("should create a post with media", async () => {
    const imgPath = getTestImage();
    const res = await request(app)
      .post("/api/posts/create")
      .set("Authorization", `Bearer ${token}`)
      .attach("media", imgPath)
      .field("caption", "Hello BuzzNet!");
    fs.unlinkSync(imgPath);
    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.post).toBeDefined();
    postId = res.body.post._id;
  });

  it("should reject post creation without auth", async () => {
    const res = await request(app).post("/api/posts/create").send({ caption: "No auth" });
    expect(res.statusCode).toBe(401);
  });

  it("should reject post creation without media", async () => {
    const res = await request(app)
      .post("/api/posts/create")
      .set("Authorization", `Bearer ${token}`)
      .send({ caption: "No media" });
    expect(res.statusCode).toBe(400);
  });
});

// ── PUT /api/posts/like/:id ───────────────────────────────────────────────────
describe("PUT /api/posts/like/:id", () => {
  it("should toggle like on a post", async () => {
    const res = await request(app)
      .put(`/api/posts/like/${postId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.liked).toBe("boolean");
  });

  it("should unlike when liked again (toggle)", async () => {
    // like
    await request(app).put(`/api/posts/like/${postId}`).set("Authorization", `Bearer ${token}`);
    // unlike
    const res = await request(app).put(`/api/posts/like/${postId}`).set("Authorization", `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.liked).toBe(false);
  });
});

// ── POST /api/posts/comment/:id ───────────────────────────────────────────────
describe("POST /api/posts/comment/:id", () => {
  let commentId;

  it("should add a comment to a post", async () => {
    const res = await request(app)
      .post(`/api/posts/comment/${postId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ text: "Great post!" });
    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.comment.text).toBe("Great post!");
    commentId = res.body.comment._id;
  });

  it("should reject empty comment", async () => {
    const res = await request(app)
      .post(`/api/posts/comment/${postId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ text: "   " });
    expect(res.statusCode).toBe(400);
  });

  it("should add a reply to a comment", async () => {
    const res = await request(app)
      .post(`/api/posts/${postId}/comment/${commentId}/reply`)
      .set("Authorization", `Bearer ${token}`)
      .send({ text: "Nice reply!" });
    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.reply.text).toBe("Nice reply!");
  });
});

// ── DELETE /api/posts/:id ─────────────────────────────────────────────────────
describe("DELETE /api/posts/:id", () => {
  it("should delete own post", async () => {
    const res = await request(app)
      .delete(`/api/posts/${postId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("should reject deleting non-existent post", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .delete(`/api/posts/${fakeId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.statusCode).toBe(404);
  });
});

// ── GET /api/posts/feed ───────────────────────────────────────────────────────
describe("GET /api/posts/feed", () => {
  it("should return feed for authenticated user", async () => {
    const res = await request(app)
      .get("/api/posts/feed")
      .set("Authorization", `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.posts)).toBe(true);
  });

  it("should reject feed request without auth", async () => {
    const res = await request(app).get("/api/posts/feed");
    expect(res.statusCode).toBe(401);
  });
});