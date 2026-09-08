'use strict';

const { body, query } = require('express-validator');
const { REQUEST_STATUS } = require('../config/constants');
const { paginationRules } = require('./common.validator');

const createRequestRules = [
  body('receiver_id')
    .isInt({ min: 1 })
    .withMessage('receiver_id must be a positive integer')
    .toInt(),
];

const listRules = [
  ...paginationRules,
  query('status')
    .optional()
    .isIn(Object.values(REQUEST_STATUS))
    .withMessage(`status must be one of: ${Object.values(REQUEST_STATUS).join(', ')}`),
];

module.exports = { createRequestRules, listRules };
