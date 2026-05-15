const rateLimit = require('express-rate-limit');

// validate.xForwardedForHeader=false stops the rate limiter throwing on Cloudflare's X-Forwarded-For
const LIMITER_BASE = { standardHeaders: true, legacyHeaders: false, validate: { xForwardedForHeader: false } };

const apiLimiter = rateLimit({
  ...LIMITER_BASE,
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { success: false, error: 'Too many requests, please try again later.' },
});

const scrapeLimiter = rateLimit({
  ...LIMITER_BASE,
  windowMs: 60 * 1000,
  max: 5,
  message: { success: false, error: 'Scraping rate limit hit. Please wait a moment.' },
});

const aiLimiter = rateLimit({
  ...LIMITER_BASE,
  windowMs: 60 * 1000,
  max: 20,
  message: { success: false, error: 'AI generation rate limit hit. Please slow down.' },
});

module.exports = { apiLimiter, scrapeLimiter, aiLimiter };
