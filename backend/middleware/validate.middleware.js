'use strict';

/**
 * Turns express-validator results into a single 422 response using the
 * standard error envelope. Mount it as the last item of a validator array.
 */

const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

/** @type {import('express').RequestHandler} */
function validate(req, _res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const errors = result.array({ onlyFirstError: true }).map((error) => ({
    field: error.path ?? error.param,
    message: error.msg,
  }));

  return next(ApiError.unprocessable('Validation failed', errors));
}

module.exports = validate;
