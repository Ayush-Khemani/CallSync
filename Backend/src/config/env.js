require('dotenv').config();

function optionalEnv(name, fallback = '') {
  return process.env[name] || fallback;
}

function listEnv(name, fallback = '') {
  return optionalEnv(name, fallback)
    .split(',')
    .map((value) => value.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

const nodeEnv = optionalEnv('NODE_ENV', 'development');

const jwtSecret = optionalEnv('JWT_SECRET', 'dev-only-change-me');
const databaseUrl = optionalEnv('DATABASE_URL_V2', optionalEnv('DATABASE_URL', ''));
const databaseUrlSource = process.env.DATABASE_URL_V2 ? 'DATABASE_URL_V2' : 'DATABASE_URL';

function requireRuntimeEnv(name, value) {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function getJwtSecret() {
  if (nodeEnv === 'production' && (!process.env.JWT_SECRET || jwtSecret.includes('change'))) {
    throw new Error('JWT_SECRET must be a strong production secret');
  }

  return requireRuntimeEnv('JWT_SECRET', jwtSecret);
}

module.exports = {
  nodeEnv,
  port: Number(optionalEnv('PORT', '5000')),
  frontendUrl: optionalEnv('FRONTEND_URL', 'http://localhost:3000').replace(/\/$/, ''),
  frontendUrls: listEnv('FRONTEND_URLS', optionalEnv('FRONTEND_URL', 'http://localhost:3000')),
  frontendOriginRegex: optionalEnv('FRONTEND_ORIGIN_REGEX', ''),
  rateLimitWindowMs: Number(optionalEnv('RATE_LIMIT_WINDOW_MS', '900000')),
  rateLimitMax: Number(optionalEnv('RATE_LIMIT_MAX', '100')),
  databaseUrl,
  databaseUrlSource,
  jwtSecret,
  getJwtSecret,
  tokenEncryptionKey: optionalEnv('TOKEN_ENCRYPTION_KEY', ''),
  sendgridApiKey: optionalEnv('SENDGRID_API_KEY', ''),
  emailFrom: optionalEnv('EMAIL_FROM', 'no-reply@callsync.local'),
  google: {
    clientId: optionalEnv('GOOGLE_CLIENT_ID', ''),
    clientSecret: optionalEnv('GOOGLE_CLIENT_SECRET', ''),
    redirectUri: optionalEnv('GOOGLE_REDIRECT_URI', ''),
  },
  outlook: {
    clientId: optionalEnv('OUTLOOK_CLIENT_ID', ''),
    clientSecret: optionalEnv('OUTLOOK_CLIENT_SECRET', ''),
    redirectUri: optionalEnv('OUTLOOK_REDIRECT_URI', ''),
  },
};
