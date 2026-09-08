'use strict';

/**
 * Role authorisation. ALWAYS mount after `authenticate`:
 *
 *   router.post('/', authenticate, requireAdmin, controller.create);
 *
 * The check reads req.user.role, which auth.middleware re-loaded from the
 * database on this request - not a claim the client sent us.
 */

const ApiError = require('../utils/ApiError');
const { ROLES } = require('../config/constants');

/** @type {import('express').RequestHandler} */
function requireAdmin(req, _res, next) {
  if (!req.user) {
    return next(ApiError.unauthorized('Authentication required'));
  }
  if (req.user.role !== ROLES.ADMIN) {
    return next(ApiError.forbidden('Admin privileges are required for this action'));
  }
  return next();
}

/**
 * Generic variant, e.g. requireRole('admin') or requireRole('student', 'admin').
 * @param {...string} roles
 * @returns {import('express').RequestHandler}
 */
function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized('Authentication required'));
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden('You do not have permission to perform this action'));
    }
    return next();
  };
}

module.exports = { requireAdmin, requireRole };
