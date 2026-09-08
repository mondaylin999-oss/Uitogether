'use strict';

/** Competition rules. These endpoints are admin-only at the route level. */

const { body, query } = require('express-validator');
const { paginationRules, optionalSearch } = require('./common.validator');

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

const urlRule = (field) =>
  body(field)
    .optional({ nullable: true, values: 'falsy' })
    .trim()
    .isLength({ max: 500 })
    .withMessage('Image URL is too long')
    .bail()
    .isURL({ protocols: ['http', 'https'], require_protocol: true })
    .withMessage('Image URL must start with http:// or https://');

const createRules = [
  body('title').trim().isLength({ min: 3, max: 150 }).withMessage('Title must be 3-150 characters'),
  body('description').optional({ nullable: true }).trim().isLength({ max: 5000 })
    .withMessage('Description is too long'),
  body('event_date').isDate().withMessage('event_date must be a date (YYYY-MM-DD)'),
  body('event_time').optional({ nullable: true, values: 'falsy' }).matches(TIME_PATTERN)
    .withMessage('event_time must be HH:MM or HH:MM:SS'),
  body('location').optional({ nullable: true }).trim().isLength({ max: 150 })
    .withMessage('Location must be at most 150 characters'),
  body('organizer').optional({ nullable: true }).trim().isLength({ max: 120 })
    .withMessage('Organizer must be at most 120 characters'),
  urlRule('image_url'),
];

const updateRules = [
  body('title').optional().trim().isLength({ min: 3, max: 150 })
    .withMessage('Title must be 3-150 characters'),
  body('description').optional({ nullable: true }).trim().isLength({ max: 5000 })
    .withMessage('Description is too long'),
  body('event_date').optional().isDate().withMessage('event_date must be a date (YYYY-MM-DD)'),
  body('event_time').optional({ nullable: true, values: 'falsy' }).matches(TIME_PATTERN)
    .withMessage('event_time must be HH:MM or HH:MM:SS'),
  body('location').optional({ nullable: true }).trim().isLength({ max: 150 })
    .withMessage('Location must be at most 150 characters'),
  body('organizer').optional({ nullable: true }).trim().isLength({ max: 120 })
    .withMessage('Organizer must be at most 120 characters'),
  urlRule('image_url'),
];

const listRules = [
  ...paginationRules,
  optionalSearch,
  query('scope').optional().isIn(['upcoming', 'past', 'all'])
    .withMessage('scope must be upcoming, past or all'),
  query('sort').optional().isIn(['event_date', 'newest', 'title'])
    .withMessage('sort must be event_date, newest or title'),
];

module.exports = { createRules, updateRules, listRules };
