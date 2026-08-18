const express = require('express');
const cors = require('cors');
const config = require('./config/env');
const healthRoutes = require('./routes/healthRoutes');
const authRoutes = require('./routes/authRoutes');
const calendarRoutes = require('./routes/calendarRoutes');
const meetingRoutes = require('./routes/meetingRoutes');
const followUpRoutes = require('./routes/followUpRoutes');
const outcomeRoutes = require('./routes/outcomeRoutes');
const errorHandler = require('./middleware/errorHandler');
const rateLimiter = require('./middleware/rateLimiter');
const securityHeaders = require('./middleware/securityHeaders');
const { runMigrations } = require('./db/migrate');

const app = express();
let migrationPromise;

function isAllowedCorsOrigin(origin) {
  if (!origin) {
    return true;
  }

  if (config.frontendUrls.includes(origin.replace(/\/$/, ''))) {
    return true;
  }

  if (config.frontendOriginRegex) {
    return new RegExp(config.frontendOriginRegex).test(origin);
  }

  return false;
}

function ensureMigrations() {
  if (!migrationPromise) {
    migrationPromise = runMigrations().catch((error) => {
      migrationPromise = null;
      throw error;
    });
  }

  return migrationPromise;
}

app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (isAllowedCorsOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS origin not allowed: ${origin}`));
  },
}));
app.use(express.json({ limit: '1mb' }));
app.use(securityHeaders);

app.use('/', healthRoutes);
app.use('/api', healthRoutes);

app.use('/api', rateLimiter);

if (config.nodeEnv !== 'test' && process.env.AUTO_RUN_MIGRATIONS !== 'false') {
  app.use(async (req, res, next) => {
    try {
      await ensureMigrations();
      next();
    } catch (error) {
      next(error);
    }
  });
}

app.use('/api', authRoutes);
app.use('/api', calendarRoutes);
app.use('/api', followUpRoutes);
app.use('/api', outcomeRoutes);
app.use('/api', meetingRoutes);

app.use(errorHandler);

module.exports = app;
