const jwt = require('jsonwebtoken');
const config = require('../config/env');
const HttpError = require('../utils/httpError');

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return next(new HttpError(401, 'No token provided'));
  }

  try {
    const decoded = jwt.verify(token, config.getJwtSecret());
    req.userId = decoded.userId;
    return next();
  } catch (error) {
    return next(new HttpError(401, 'Invalid token'));
  }
}

module.exports = authMiddleware;
