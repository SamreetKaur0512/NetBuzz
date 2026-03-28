// ─── server/middleware/sanitize.js ───────────────────────────────────────────
// Input sanitization — strips dangerous characters from req.body, req.query,
// req.params to prevent XSS and NoSQL injection attacks.
// No extra npm package needed.

/**
 * Recursively sanitize a value:
 * - Strings: strip HTML tags, trim, remove null bytes, block $-prefixed keys
 * - Objects/Arrays: recurse into them
 * - Everything else: pass through unchanged
 */
const sanitizeValue = (value) => {
  if (typeof value === "string") {
    return value
      .replace(/\x00/g, "")                    // remove null bytes
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "") // strip <script> tags
      .replace(/<[^>]+>/g, "")                  // strip all other HTML tags
      .trim();
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value !== null && typeof value === "object") {
    const sanitized = {};
    for (const key of Object.keys(value)) {
      // Block MongoDB operator injection — keys starting with $
      if (key.startsWith("$")) continue;
      sanitized[key] = sanitizeValue(value[key]);
    }
    return sanitized;
  }
  return value; // numbers, booleans, null — leave alone
};

/**
 * Express middleware — sanitizes req.body, req.query, req.params in-place.
 * Apply globally in server.js after express.json().
 */
const sanitizeInputs = (req, res, next) => {
  if (req.body)   req.body   = sanitizeValue(req.body);
  if (req.query)  req.query  = sanitizeValue(req.query);
  if (req.params) req.params = sanitizeValue(req.params);
  next();
};

module.exports = { sanitizeInputs };