// ─── server/middleware/sanitize.js ───────────────────────────────────────────
// Blocks MongoDB NoSQL injection ($-prefixed keys) from req.body/query/params.
// Does NOT strip HTML tags — that would break post captions, messages, and bios
// that users may write with special characters. XSS is handled by the frontend
// (React escapes all output by default).

const sanitizeValue = (value) => {
  if (typeof value === "string") {
    // Only remove null bytes — everything else is safe in MongoDB with Mongoose
    return value.replace(/\x00/g, "");
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
  return value;
};

const sanitizeInputs = (req, res, next) => {
  if (req.body)   req.body   = sanitizeValue(req.body);
  if (req.query)  req.query  = sanitizeValue(req.query);
  if (req.params) req.params = sanitizeValue(req.params);
  next();
};

module.exports = { sanitizeInputs };