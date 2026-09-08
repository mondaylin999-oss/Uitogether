'use strict';

/**
 * CENTRALISED ERROR HANDLING - the only place in the app that formats an
 * error response. Controllers and services just `throw`.
 *
 * PostgreSQL driver errors are translated into meaningful HTTP statuses here
 * so that database constraints (unique keys, foreign keys, CHECKs, trigger
 * exceptions) surface as clean 4xx messages instead of a generic 500.
 */

const ApiError = require('../utils/ApiError');
const { sendError } = require('../utils/apiResponse');
const { env } = require('../config/env');
const logger = require('../utils/logger');

/**
 * Friendly text for the constraint names defined in database/migrations.
 * Keys must match the CONSTRAINT names in those files exactly.
 */
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

/**
 * node-postgres reports the violated constraint by name in `error.constraint`,
 * so the MySQL port's regex over the driver's message text is no longer
 * needed. The message text is still searched as a fallback, because a
 * RAISE EXCEPTION from one of our triggers carries no constraint name.
 *
 * @param {any} error
 * @param {string} fallback
 */
function messageForConstraint(error, fallback) {
  if (error.constraint && CONSTRAINT_MESSAGES[error.constraint]) {
    return CONSTRAINT_MESSAGES[error.constraint];
  }

  const text = `${error.message || ''} ${error.detail || ''}`;
  for (const [name, friendly] of Object.entries(CONSTRAINT_MESSAGES)) {
    if (text.includes(name)) return friendly;
  }

  return fallback;
}

/**
 * @param {any} error
 * @returns {ApiError|null} translated error, or null if it is not a DB error
 *
 * The `code` on a pg error is a five-character SQLSTATE, not a MySQL
 * ER_* name. Connection failures still arrive as Node's own errno strings.
 */
function translateDatabaseError(error) {
  switch (error.code) {
    // 23505 unique_violation
    case '23505':
      return ApiError.conflict(messageForConstraint(error, 'This record already exists'));

    // 23503 foreign_key_violation - which side failed depends on the statement
    case '23503':
      return /update or delete/i.test(error.message || '')
        ? ApiError.conflict('This record is still referenced by other data')
        : ApiError.badRequest('A referenced record does not exist');

    // 23514 check_violation
    case '23514':
      return ApiError.unprocessable(
        messageForConstraint(error, 'A database constraint rejected this value')
      );

    // 23502 not_null_violation
    case '23502':
      return ApiError.badRequest(
        `Missing required value${error.column ? `: ${error.column}` : ''}`
      );

    // P0001 raise_exception - our own triggers (previously SIGNAL '45000').
    // The text is ours, so it is safe to show to the client.
    case 'P0001':
      return ApiError.unprocessable(error.message || 'Rejected by a database rule');

    // 22001 string_data_right_truncation
    case '22001':
      return ApiError.unprocessable('One of the submitted values is too long');

    // 3D000 invalid_catalog_name - the database does not exist
    case '3D000':
      return ApiError.internal(
        'The application database does not exist. Run: npm run db:setup'
      );

    // 42P01 undefined_table
    case '42P01':
      return ApiError.internal('Database tables are missing. Run: npm run db:setup');

    // 28P01 invalid_password / 28000 invalid_authorization_specification
    case '28P01':
    case '28000':
      return new ApiError(503, 'Database credentials are invalid. Check backend/.env');

    // 57P03 cannot_connect_now - the server is still starting up
    case '57P03':
    case 'ECONNREFUSED':
    case 'ECONNRESET':
    case 'ETIMEDOUT':
    case 'ENOTFOUND':
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
