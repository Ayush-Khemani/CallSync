require('dotenv').config();

const requiredInProduction = ['DATABASE_URL', 'JWT_SECRET', 'TOKEN_ENCRYPTION_KEY', 'FRONTEND_URL'];

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name, fallback = '') {
  return process.env[name] || fallback;
}

const nodeEnv = optionalEnv('NODE_ENV', 'development');

if (nodeEnv === 'production') {
  requiredInProduction.forEach(requireEnv);
}

const jwtSecret = optionalEnv('JWT_SECRET', 'dev-only-change-me');
if (nodeEnv === 'production' && jwtSecret.includes('change')) {
  throw new Error('JWT_SECRET must be a strong production secret');
}

module.exports = {
  nodeEnv,
  port: Number(optionalEnv('PORT', '5000')),
  frontendUrl: optionalEnv('FRONTEND_URL', 'http://localhost:3000').replace(/\/$/, ''),
  databaseUrl: requireEnv('DATABASE_URL'),
  jwtSecret,
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
