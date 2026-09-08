'use strict';

/**
 * CENTRALISED ERROR HANDLING - the only place in the app that formats an
 * error response. Controllers and services just `throw`.
 *
 * MySQL driver errors are translated into meaningful HTTP statuses here so
 * that database constraints (unique keys, foreign keys, CHECKs, trigger
 * SIGNALs) surface as clean 4xx messages instead of a generic 500.
 */

const ApiError = require('../utils/ApiError');
const { sendError } = require('../utils/apiResponse');
const { env } = require('../config/env');
const logger = require('../utils/logger');

/** Friendly text for the constraint names defined in database/migrations. */
const CONSTRAINT_MESSAGES = {
  uq_users_email: 'An account with this email already exists',
  uq_users_tnt: 'An account with this TNT number already exists',
  uq_profiles_user_id: 'You already have a study buddy profile',
  uq_requests_pair: 'You have already sent a request to this student',
  uq_votes_one_per_poll: 'You have already voted in this poll',
  uq_options_poll_text: 'This poll already has an option with that text',
  chk_users_email_format: 'Enter a valid email address, for example you@example.com',
  chk_profiles_has_contact: 'Provide at least one contact method (Telegram or Viber)',
};

/** @param {string} message driver message, e.g. "... for key 'uq_users_email'" */
function messageForConstraint(message, fallback) {
  const match = /'([^']*?)'/g;
  let found;
  while ((found = match.exec(message)) !== null) {
    const key = found[1].split('.').pop();
    if (CONSTRAINT_MESSAGES[key]) return CONSTRAINT_MESSAGES[key];
  }
  return fallback;
}

/**
 * @param {any} error
 * @returns {ApiError|null} translated error, or null if it is not a DB error
 */
function translateDatabaseError(error) {
  switch (error.code) {
    case 'ER_DUP_ENTRY':
      return ApiError.conflict(
        messageForConstraint(error.sqlMessage || '', 'This record already exists')
      );

    case 'ER_NO_REFERENCED_ROW':
    case 'ER_NO_REFERENCED_ROW_2':
      return ApiError.badRequest('A referenced record does not exist');

    case 'ER_ROW_IS_REFERENCED':
    case 'ER_ROW_IS_REFERENCED_2':
      return ApiError.conflict('This record is still referenced by other data');

    case 'ER_CHECK_CONSTRAINT_VIOLATED':
      return ApiError.unprocessable(
        messageForConstraint(error.sqlMessage || '', 'A database constraint rejected this value')
      );

    // SIGNAL SQLSTATE '45000' raised by our own triggers - the text is ours,
    // so it is safe to show it to the client.
    case 'ER_SIGNAL_EXCEPTION':
      return ApiError.unprocessable(error.sqlMessage || 'Rejected by a database rule');

    case 'ER_DATA_TOO_LONG':
      return ApiError.unprocessable('One of the submitted values is too long');

    case 'ER_BAD_DB_ERROR':
      return ApiError.internal(
        'Database "uitogether_db" does not exist. Run: npm run db:setup'
      );

    case 'ER_NO_SUCH_TABLE':
      return ApiError.internal('Database tables are missing. Run: npm run db:setup');

    case 'ER_ACCESS_DENIED_ERROR':
      return new ApiError(503, 'Database credentials are invalid. Check backend/.env');

    case 'ECONNREFUSED':
    case 'PROTOCOL_CONNECTION_LOST':
    case 'ETIMEDOUT':
      return new ApiError(503, 'Database is unavailable, please try again shortly');

    default:
      return null;
  }
}

/** 404 for any unmatched route. Mount AFTER all routers. */
function notFoundHandler(req, _res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

/**
 * Express error handler. MUST keep the 4-argument signature.
 * @type {import('express').ErrorRequestHandler}
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  let error = err;

  // Malformed JSON body from express.json()
  if (error instanceof SyntaxError && 'body' in error) {
    error = ApiError.badRequest('Request body is not valid JSON');
  }

  if (!(error instanceof ApiError)) {
    const translated = translateDatabaseError(error);
    if (translated) error = translated;
  }

  if (!(error instanceof ApiError)) {
    // Unexpected -> log the full stack, tell the client nothing about it.
    logger.error(`Unhandled error on ${req.method} ${req.originalUrl}`, err);
    error = ApiError.internal();
  } else if (error.statusCode >= 500) {
    logger.error(`${error.statusCode} on ${req.method} ${req.originalUrl}`, err.message);
  } else {
    logger.debug(`${error.statusCode} on ${req.method} ${req.originalUrl} - ${error.message}`);
  }

  const body = {
    statusCode: error.statusCode,
    message: error.message,
    errors: error.errors || [],
  };

  if (!env.isProduction && err.stack && error.statusCode >= 500) {
    return res.status(error.statusCode).json({
      success: false,
      message: body.message,
      errors: body.errors,
      stack: err.stack.split('\n').slice(0, 6),
    });
  }

  return sendError(res, body);
}

module.exports = { notFoundHandler, errorHandler, translateDatabaseError };
