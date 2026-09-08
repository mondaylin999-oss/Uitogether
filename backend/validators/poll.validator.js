'use strict';

const { body, query } = require('express-validator');
const { POLL_STATUS } = require('../config/constants');
const { paginationRules } = require('./common.validator');

const STATUSES = Object.values(POLL_STATUS);

const createRules = [
  body('question').trim().isLength({ min: 5, max: 255 })
    .withMessage('Question must be 5-255 characters'),
  body('description').optional({ nullable: true }).trim().isLength({ max: 500 })
    .withMessage('Description must be at most 500 characters'),
  body('ends_at').optional({ nullable: true, values: 'falsy' }).isISO8601()
    .withMessage('ends_at must be an ISO date-time'),
  body('options')
    .isArray({ min: 2, max: 10 })
    .withMessage('Provide between 2 and 10 options')
    .bail()
    .custom((options) => {
      const cleaned = options.map((option) => String(option).trim()).filter(Boolean);
      if (cleaned.length !== options.length) throw new Error('Options cannot be empty');
      if (cleaned.some((option) => option.length > 200)) {
        throw new Error('Each option must be at most 200 characters');
      }
      const unique = new Set(cleaned.map((option) => option.toLowerCase()));
      if (unique.size !== cleaned.length) throw new Error('Options must be unique');
      return true;
    }),
];

const updateRules = [
  body('question').optional().trim().isLength({ min: 5, max: 255 })
    .withMessage('Question must be 5-255 characters'),
  body('description').optional({ nullable: true }).trim().isLength({ max: 500 })
    .withMessage('Description must be at most 500 characters'),
  body('ends_at').optional({ nullable: true, values: 'falsy' }).isISO8601()
    .withMessage('ends_at must be an ISO date-time'),
  body('status').optional().isIn(STATUSES)
    .withMessage(`status must be one of: ${STATUSES.join(', ')}`),
];

const voteRules = [
  body('option_id').isInt({ min: 1 }).withMessage('option_id must be a positive integer').toInt(),
];

const listRules = [
  ...paginationRules,
  query('status').optional().isIn(STATUSES)
    .withMessage(`status must be one of: ${STATUSES.join(', ')}`),
  query('sort').optional().isIn(['newest', 'ends_at']).withMessage('sort must be newest or ends_at'),
];

module.exports = { createRules, updateRules, voteRules, listRules };
