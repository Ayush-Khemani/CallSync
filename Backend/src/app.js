const express = require('express');
const cors = require('cors');
const config = require('./config/env');
const healthRoutes = require('./routes/healthRoutes');
const authRoutes = require('./routes/authRoutes');
const calendarRoutes = require('./routes/calendarRoutes');
const integrationRoutes = require('./routes/integrationRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const meetingRoutes = require('./routes/meetingRoutes');
const followUpRoutes = require('./routes/followUpRoutes');
const outcomeRoutes = require('./routes/outcomeRoutes');
const intelligenceRoutes = require('./routes/intelligenceRoutes');
const errorHandler = require('./middleware/errorHandler');
const rateLimiter = require('./middleware/rateLimiter');
const securityHeaders = require('./middleware/securityHeaders');
const requestContext = require('./middleware/requestContext');
const HttpError = require('./utils/httpError');
const { isAllowedCorsOrigin } = require('./utils/corsPolicy');
const { runMigrations } = require('./db/migrate');

const app = express();
let migrationPromise;

function ensureMigrations() {
  if (!migrationPromise) {
    migrationPromise = runMigrations().catch((error) => {
      migrationPromise = null;
      throw error;
    });
  }

  return migrationPromise;
}

app.use(requestContext);
app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (isAllowedCorsOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(new HttpError(403, 'CORS origin not allowed'));
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
app.use('/api', integrationRoutes);
app.use('/api', analyticsRoutes);
app.use('/api', followUpRoutes);
app.use('/api', outcomeRoutes);
app.use('/api', intelligenceRoutes);
app.use('/api', meetingRoutes);

app.use(errorHandler);

module.exports = app;
