const crypto = require('crypto');

function cleanRequestId(value) {
  if (typeof value !== 'string') return '';
  const cleaned = value.trim().replace(/[^A-Za-z0-9._:-]/g, '').slice(0, 100);
  return cleaned;
}

function requestContext(req, res, next) {
  const supplied = cleanRequestId(req.get('x-request-id'));
  req.requestId = supplied || crypto.randomUUID();
  res.setHeader('x-request-id', req.requestId);
  next();
}

module.exports = requestContext;
module.exports._test = { cleanRequestId };
