'use strict';

/** Study buddy profile + browse rules. */

const { body, query } = require('express-validator');
const { STUDY_STYLES, WANNA_MEET } = require('../config/constants');
const { paginationRules, optionalSearch } = require('./common.validator');

/** Subjects may arrive as "A, B" or ["A","B"] - accept both. */
const subjectsRule = (field) =>
  body(field)
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null || value === '') return true;
      const list = Array.isArray(value) ? value : String(value).split(',');
      if (list.length > 20) throw new Error('At most 20 subjects');
      if (list.join(', ').length > 500) throw new Error('Subject list is too long');
      return true;
    });

const contactRule = (field, label) =>
  body(field)
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage(`${label} must be at most 100 characters`);

const createProfileRules = [
  body('nickname').trim().isLength({ min: 2, max: 60 }).withMessage('Nickname must be 2-60 characters'),
  body('semester').trim().isLength({ min: 1, max: 30 }).withMessage('Semester is required'),
  body('study_style')
    .isIn(STUDY_STYLES)
    .withMessage(`study_style must be one of: ${STUDY_STYLES.join(', ')}`),
  body('wanna_meet')
    .isIn(WANNA_MEET)
    .withMessage(`wanna_meet must be one of: ${WANNA_MEET.join(', ')}`),
  subjectsRule('weak_subjects'),
  subjectsRule('strong_subjects'),
  body('notes').optional({ nullable: true }).trim().isLength({ max: 1000 })
    .withMessage('Notes must be at most 1000 characters'),
  contactRule('telegram', 'Telegram'),
  contactRule('viber', 'Viber'),
];

const updateProfileRules = [
  body('nickname').optional().trim().isLength({ min: 2, max: 60 })
    .withMessage('Nickname must be 2-60 characters'),
  body('semester').optional().trim().isLength({ min: 1, max: 30 })
    .withMessage('Semester must be 1-30 characters'),
  body('study_style').optional().isIn(STUDY_STYLES)
    .withMessage(`study_style must be one of: ${STUDY_STYLES.join(', ')}`),
  body('wanna_meet').optional().isIn(WANNA_MEET)
    .withMessage(`wanna_meet must be one of: ${WANNA_MEET.join(', ')}`),
  subjectsRule('weak_subjects'),
  subjectsRule('strong_subjects'),
  body('notes').optional({ nullable: true }).trim().isLength({ max: 1000 })
    .withMessage('Notes must be at most 1000 characters'),
  contactRule('telegram', 'Telegram'),
  contactRule('viber', 'Viber'),
];

const browseRules = [
  ...paginationRules,
  optionalSearch,
  query('semester').optional().trim().isLength({ max: 30 }),
  query('study_style').optional().isIn(STUDY_STYLES)
    .withMessage(`study_style must be one of: ${STUDY_STYLES.join(', ')}`),
  query('wanna_meet').optional().isIn(WANNA_MEET)
    .withMessage(`wanna_meet must be one of: ${WANNA_MEET.join(', ')}`),
  query('subject').optional().trim().isLength({ max: 60 }),
  query('sort').optional().isIn(['newest', 'updated', 'nickname'])
    .withMessage('sort must be newest, updated or nickname'),
];

module.exports = { createProfileRules, updateProfileRules, browseRules };
