// ─── server/jest.config.js ────────────────────────────────────────────────────
module.exports = {
  testEnvironment: "node",
  testMatch:       ["**/tests/**/*.test.js"],
  testTimeout:     30000, // 30s — MongoMemoryServer can be slow to start
  forceExit:       true,
  clearMocks:      true,
  verbose:         true,
};