'use strict';

const { body, query } = require('express-validator');
const { LOST_FOUND_TYPE, LOST_FOUND_STATUS } = require('../config/constants');
const { paginationRules, optionalSearch } = require('./common.validator');

const TYPES = Object.values(LOST_FOUND_TYPE);
const STATUSES = Object.values(LOST_FOUND_STATUS);

/**
 * Image handling policy:
 * - Images must be uploaded as files (multipart/form-data) and are accepted
 *   by the upload middleware which sets `req.file` and `req.body.image_url`.
 * - Supplying a non-empty plain-text `image_url` in the request body is no
 *   longer allowed and will be rejected unless a file was actually uploaded.
 * - Empty/null/falsy values are accepted to allow removing an existing image.
 */
const imageFileOnlyRule = (field) =>
  body(field)
    .optional({ nullable: true, values: 'falsy' })
    .custom((val, { req }) => {
      // allow empty / null to signal no image or removal
      if (val === undefined || val === null || val === '') return true;
      // if multer processed a file, accept the generated image_url
      if (req && req.file) return true;
      // otherwise reject plain-text URLs
      throw new Error('Image must be uploaded as a file (multipart/form-data). Do not submit an image URL.');
    });

const createRules = [
  body('type').isIn(TYPES).withMessage(`type must be one of: ${TYPES.join(', ')}`),
  body('title').trim().isLength({ min: 3, max: 150 }).withMessage('Title must be 3-150 characters'),
  body('description').optional({ nullable: true }).trim().isLength({ max: 5000 })
    .withMessage('Description is too long'),
  body('location').optional({ nullable: true }).trim().isLength({ max: 150 })
    .withMessage('Location must be at most 150 characters'),
  body('item_date').optional({ nullable: true, values: 'falsy' }).isDate()
    .withMessage('item_date must be a date (YYYY-MM-DD)'),
  imageFileOnlyRule('image_url'),
  body('contact_info').optional({ nullable: true }).trim().isLength({ max: 150 })
    .withMessage('Contact info must be at most 150 characters'),
  body('status').optional().isIn(STATUSES)
    .withMessage(`status must be one of: ${STATUSES.join(', ')}`),
];

const updateRules = [
  body('type').optional().isIn(TYPES).withMessage(`type must be one of: ${TYPES.join(', ')}`),
  body('title').optional().trim().isLength({ min: 3, max: 150 })
    .withMessage('Title must be 3-150 characters'),
  body('description').optional({ nullable: true }).trim().isLength({ max: 5000 })
    .withMessage('Description is too long'),
  body('location').optional({ nullable: true }).trim().isLength({ max: 150 })
    .withMessage('Location must be at most 150 characters'),
  body('item_date').optional({ nullable: true, values: 'falsy' }).isDate()
    .withMessage('item_date must be a date (YYYY-MM-DD)'),
  imageFileOnlyRule('image_url'),
  body('contact_info').optional({ nullable: true }).trim().isLength({ max: 150 })
    .withMessage('Contact info must be at most 150 characters'),
  body('status').optional().isIn(STATUSES)
    .withMessage(`status must be one of: ${STATUSES.join(', ')}`),
];

const statusRules = [
  body('status').isIn(STATUSES).withMessage(`status must be one of: ${STATUSES.join(', ')}`),
];

const listRules = [
  ...paginationRules,
  optionalSearch,
  query('type').optional().isIn(TYPES).withMessage(`type must be one of: ${TYPES.join(', ')}`),
  query('status').optional().isIn(STATUSES)
    .withMessage(`status must be one of: ${STATUSES.join(', ')}`),
  query('mine').optional().isBoolean().withMessage('mine must be true or false').toBoolean(),
  query('sort').optional().isIn(['newest', 'item_date'])
    .withMessage('sort must be newest or item_date'),
];

module.exports = { createRules, updateRules, statusRules, listRules };
