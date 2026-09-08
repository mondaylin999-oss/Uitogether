'use strict';

/**
 * Auth endpoints. The token is returned in the JSON body (for a separate
 * HTML/JS frontend to store) AND set as an httpOnly cookie (convenient for
 * same-site development). Either transport is accepted by auth.middleware.
 */

const authService = require('../services/auth.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, created } = require('../utils/apiResponse');
const { cookieOptions } = require('../utils/jwt');
const { env } = require('../config/env');

/** POST /api/auth/register */
const register = asyncHandler(async (req, res) => {
  const { name, email, tnt, academic_year: academicYear, password } = req.body;

  const { user, token } = await authService.register({
    name,
    email,
    tnt,
    academic_year: academicYear,
    password,
  });

  res.cookie(env.jwt.cookieName, token, cookieOptions());
  return created(res, 'Account created successfully', { user, token });
});

/** POST /api/auth/login */
const login = asyncHandler(async (req, res) => {
  const { user, token } = await authService.login({
    email: req.body.email,
    password: req.body.password,
  });

  res.cookie(env.jwt.cookieName, token, cookieOptions());
  return sendSuccess(res, { message: 'Logged in successfully', data: { user, token } });
});

/** GET /api/auth/me */
const me = asyncHandler(async (req, res) => {
  const user = await authService.getCurrentUser(req.user.user_id);
  return sendSuccess(res, { message: 'Current user', data: { user } });
});

/**
 * POST /api/auth/logout
 * JWTs are stateless, so logout clears the cookie and the client discards its
 * copy of the token.
 */
const logout = asyncHandler(async (_req, res) => {
  res.clearCookie(env.jwt.cookieName, { ...cookieOptions(), maxAge: undefined });
  return sendSuccess(res, { message: 'Logged out successfully', data: null });
});

module.exports = { register, login, me, logout };
