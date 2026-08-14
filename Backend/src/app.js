const express = require('express');
const cors = require('cors');
const config = require('./config/env');
const healthRoutes = require('./routes/healthRoutes');
const authRoutes = require('./routes/authRoutes');
const calendarRoutes = require('./routes/calendarRoutes');
const meetingRoutes = require('./routes/meetingRoutes');
const errorHandler = require('./middleware/errorHandler');
const rateLimiter = require('./middleware/rateLimiter');
const securityHeaders = require('./middleware/securityHeaders');

const app = express();

app.use(cors({ origin: config.frontendUrl, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(securityHeaders);
app.use('/api', rateLimiter);

app.use('/api', healthRoutes);
app.use('/api', authRoutes);
app.use('/api', calendarRoutes);
app.use('/api', meetingRoutes);

app.use(errorHandler);

module.exports = app;
