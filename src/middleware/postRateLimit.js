const rateLimit = require('express-rate-limit');

// Per-user (authenticated) limiters, hardcoded to 2/minute
const commonOptions = (message) => ({
  windowMs: 60 * 1000, // 1 minute
  limit: 2,
  standardHeaders: true,
  legacyHeaders: false,
  // These endpoints are auth-protected, so req.user.id should exist
  keyGenerator: (req) => (req.user && req.user.id ? req.user.id : 'anonymous'),
  message: { success: false, message }
});

const commentPostLimiter = rateLimit(commonOptions('Too many comments. Please wait a bit before posting again.'));
const replyPostLimiter = rateLimit(commonOptions('Too many replies. Please wait a bit before posting again.'));

module.exports = { commentPostLimiter, replyPostLimiter };
