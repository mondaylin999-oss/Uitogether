'use strict';

/**
 * Express application (no listening here - see server.js).
 *
 * Middleware order matters:
 *   helmet -> cors -> body parsers -> logger -> rate limit -> routes
 *   -> 404 handler -> centralised error handler (must be LAST)
 */

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');

const routes = require('./routes');
const { env } = require('./config/env');
const { apiLimiter } = require('./middleware/rateLimit.middleware');
const { notFoundHandler, errorHandler } = require('./middleware/error.middleware');
const logger = require('./utils/logger');

const app = express();
const uploadDir = process.env.VERCEL
  ? path.join('/tmp', 'uitogether-uploads')
  : path.join(__dirname, 'public', 'uploads');

// Correct client IPs behind a proxy, so rate limiting is not fooled.
app.set('trust proxy', 1);
app.disable('x-powered-by');

// --- security headers ---
app.use(
  helmet({
    // The API serves JSON only; CSP belongs to the frontend that will be
    // built separately.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// --- CORS: an allow-list, because the frontend is a separate origin ---
const allowedOrigins = new Set(env.clientUrls);
app.use(
  cors({
    origin(origin, callback) {
      // Same-origin / curl / mobile apps send no Origin header.
      if (!origin) return callback(null, true);
      if (allowedOrigins.has(origin)) return callback(null, true);
      logger.warn(`Blocked CORS request from origin: ${origin}`);
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// --- body parsing (size-capped to blunt payload floods) ---
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(cookieParser());

// --- request logging ---
app.use(morgan(env.isProduction ? 'combined' : 'dev'));

// --- rate limiting for the whole API ---
app.use('/api', apiLimiter);

// Serve uploaded files from the current runtime storage directory.
app.use('/uploads', express.static(uploadDir));

// --- routes ---
app.use('/api', routes);

app.get('/', (_req, res) => {
  res.json({
    success: true,
    message: 'UITogether API',
    data: { docs: '/api/health', version: '1.0.0' },
  });
});

// --- 404 then centralised error handling (order is significant) ---
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
