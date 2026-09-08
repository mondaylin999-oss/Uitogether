'use strict';

/**
 * Rate limiting. Two tiers:
 *   apiLimiter   - broad protection for every /api route
 *   authLimiter  - tight limit on register/login to slow credential stuffing
 *   writeLimiter - moderate limit on content creation to curb spam posts
 */

const rateLimit = require('express-rate-limit');
const { env } = require('../config/env');
const { sendError } = require('../utils/apiResponse');

const handler = (message) => (_req, res) =>
  sendError(res, { statusCode: 429, message });

const apiLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  handler: handler('Too many requests from this IP, please try again later'),
});

const authLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: handler('Too many authentication attempts, please try again in a few minutes'),
});

const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: handler('You are posting too quickly, please slow down'),
});

module.exports = { apiLimiter, authLimiter, writeLimiter };
