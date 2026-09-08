'use strict';

/**
 * JWT authentication.
 *
 * The token is accepted from either
 *   Authorization: Bearer <token>      (what a separate HTML/JS frontend uses)
 *   or the httpOnly cookie set at login (convenient for same-site dev)
 *
 * After verifying the signature we RE-LOAD the user from MySQL, so a deleted
 * account or a role change takes effect immediately instead of living on
 * inside an unexpired token.
 */

const { verifyToken } = require('../utils/jwt');
const { env } = require('../config/env');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const userRepository = require('../repositories/user.repository');

/** @param {import('express').Request} req */
function extractToken(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    const token = header.slice(7).trim();
    if (token) return token;
  }
  if (req.cookies && req.cookies[env.jwt.cookieName]) {
    return req.cookies[env.jwt.cookieName];
  }
  return null;
}

/** Hard gate - 401 when there is no valid session. */
const authenticate = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) throw ApiError.unauthorized('Authentication required');

  const payload = verifyToken(token);
  const user = await userRepository.findById(Number(payload.sub));
  if (!user) throw ApiError.unauthorized('This account no longer exists');

  req.user = { user_id: user.user_id, role: user.role, name: user.name, email: user.email };
  req.token = token;
  return next();
});

/**
 * Soft gate - attaches req.user when a valid token is present, but never
 * rejects. Used by public list endpoints that add "is this mine?" hints.
 */
const optionalAuth = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) return next();

  try {
    const payload = verifyToken(token);
    const user = await userRepository.findById(Number(payload.sub));
    if (user) {
      req.user = { user_id: user.user_id, role: user.role, name: user.name, email: user.email };
      req.token = token;
    }
  } catch {
    // An invalid token on a public route is simply treated as "anonymous".
  }
  return next();
});

module.exports = { authenticate, optionalAuth, extractToken };
