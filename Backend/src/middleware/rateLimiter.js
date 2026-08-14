const config = require('../config/env');
const HttpError = require('../utils/httpError');

const buckets = new Map();

function getClientKey(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
}

function rateLimiter(req, res, next) {
  const now = Date.now();
  const key = getClientKey(req);
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + config.rateLimitWindowMs });
    return next();
  }

  current.count += 1;
  if (current.count > config.rateLimitMax) {
    res.setHeader('Retry-After', Math.ceil((current.resetAt - now) / 1000));
    return next(new HttpError(429, 'Too many requests. Please try again later.'));
  }

  return next();
}

module.exports = rateLimiter;
