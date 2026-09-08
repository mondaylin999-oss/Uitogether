'use strict';

const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const ApiError = require('./ApiError');

const ISSUER = 'uitogether-api';

/**
 * Sign an access token. The payload deliberately carries only the user id
 * and role - never the email, and obviously never the password hash.
 *
 * @param {{ user_id: number, role: string }} user
 * @returns {string}
 */
function signToken(user) {
  return jwt.sign({ sub: String(user.user_id), role: user.role }, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn,
    issuer: ISSUER,
  });
}

/**
 * @param {string} token
 * @returns {{ sub: string, role: string, iat: number, exp: number }}
 * @throws {ApiError} 401 for an expired or tampered token
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, env.jwt.secret, { issuer: ISSUER });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw ApiError.unauthorized('Session expired, please log in again');
    }
    throw ApiError.unauthorized('Invalid authentication token');
  }
}

/**
 * Cookie options for the optional httpOnly cookie transport.
 * The API also accepts `Authorization: Bearer <token>`, which is what a
 * separate HTML/JS frontend will normally use.
 */
function cookieOptions() {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: env.isProduction ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  };
}

module.exports = { signToken, verifyToken, cookieOptions };
