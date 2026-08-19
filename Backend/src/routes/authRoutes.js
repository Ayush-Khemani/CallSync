const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const config = require('../config/env');
const authMiddleware = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const { exchangeGoogleCode, exchangeOutlookCode, serializeCalendarToken } = require('../services/calendarService');

const router = express.Router();

function validateCredentials(email, password) {
  if (!email || !password) {
    throw new HttpError(400, 'Email and password are required');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, 'Enter a valid email address');
  }
  if (password.length < 8) {
    throw new HttpError(400, 'Password must be at least 8 characters');
  }
}

function isAllowedFrontendOrigin(origin) {
  if (config.frontendUrls.includes(origin)) {
    return true;
  }

  if (!config.frontendOriginRegex) {
    return false;
  }

  try {
    return new RegExp(config.frontendOriginRegex).test(origin);
  } catch (error) {
    return false;
  }
}

function resolveOAuthRedirectUri(req, provider) {
  const configuredRedirectUri = config[provider]?.redirectUri || '';
  const requestOrigin = req.get('origin');

  if (!requestOrigin) {
    if (!configuredRedirectUri) {
      throw new HttpError(500, `${provider} OAuth redirect URI is not configured`);
    }
    return configuredRedirectUri;
  }

  let origin;
  try {
    origin = new URL(requestOrigin).origin;
  } catch (error) {
    throw new HttpError(400, 'Invalid OAuth request origin');
  }

  if (!isAllowedFrontendOrigin(origin)) {
    throw new HttpError(403, 'OAuth request origin is not allowed');
  }

  return `${origin}/auth/${provider}`;
}

router.post('/auth/register', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  validateCredentials(email, password);

  const hashedPassword = await bcrypt.hash(password, 12);

  try {
    await pool.query(
      'INSERT INTO users (email, password) VALUES ($1, $2)',
      [email.toLowerCase(), hashedPassword]
    );
  } catch (error) {
    if (error.code === '23505') {
      throw new HttpError(409, 'Email already exists');
    }
    throw error;
  }

  res.status(201).json({ message: 'User registered successfully' });
}));

router.post('/auth/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  validateCredentials(email, password);

  const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
  const user = result.rows[0];
  if (!user) {
    throw new HttpError(401, 'Invalid email or password');
  }

  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) {
    throw new HttpError(401, 'Invalid email or password');
  }

  const token = jwt.sign({ userId: user.id }, config.getJwtSecret(), { expiresIn: '7d' });
  res.json({ token, userId: user.id, email: user.email });
}));

router.post('/auth/google-callback', authMiddleware, asyncHandler(async (req, res) => {
  if (!req.body.code) {
    throw new HttpError(400, 'Authorization code required');
  }

  const redirectUri = resolveOAuthRedirectUri(req, 'google');
  const tokenBundle = await exchangeGoogleCode(req.body.code, redirectUri);
  await pool.query(
    'UPDATE users SET google_token = $1 WHERE id = $2',
    [serializeCalendarToken(tokenBundle), req.userId]
  );

  res.json({ message: 'Google calendar connected' });
}));

router.post('/auth/outlook-callback', authMiddleware, asyncHandler(async (req, res) => {
  if (!req.body.code) {
    throw new HttpError(400, 'Authorization code required');
  }

  const redirectUri = resolveOAuthRedirectUri(req, 'outlook');
  const tokenBundle = await exchangeOutlookCode(req.body.code, redirectUri);
  await pool.query(
    'UPDATE users SET outlook_token = $1 WHERE id = $2',
    [serializeCalendarToken(tokenBundle), req.userId]
  );

  res.json({ message: 'Outlook calendar connected' });
}));

module.exports = router;
