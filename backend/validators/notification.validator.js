'use strict';

const { query } = require('express-validator');
const { NOTIFICATION_TYPE } = require('../config/constants');
const { paginationRules } = require('./common.validator');

const TYPES = Object.values(NOTIFICATION_TYPE);

const listRules = [
  ...paginationRules,
  query('is_read').optional().isBoolean().withMessage('is_read must be true or false').toBoolean(),
  query('type').optional().isIn(TYPES).withMessage(`type must be one of: ${TYPES.join(', ')}`),
];

module.exports = { listRules };
