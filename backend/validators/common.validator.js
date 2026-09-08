'use strict';

/** Validation chains reused across resources. */

const { param, query } = require('express-validator');
const { PAGINATION } = require('../config/constants');

/**
 * @param {string} name route parameter name, e.g. 'id'
 * @param {string} label human readable name used in the error message
 */
const idParam = (name = 'id', label = 'id') =>
  param(name)
    .isInt({ min: 1 })
    .withMessage(`${label} must be a positive integer`)
    .toInt();

const paginationRules = [
  query('page').optional().isInt({ min: 1 }).withMessage('page must be >= 1').toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: PAGINATION.MAX_LIMIT })
    .withMessage(`limit must be between 1 and ${PAGINATION.MAX_LIMIT}`)
    .toInt(),
];

const optionalSearch = query('q')
  .optional({ values: 'falsy' })
  .isLength({ max: 100 })
  .withMessage('Search text is too long')
  .trim();

module.exports = { idParam, paginationRules, optionalSearch };
