'use strict';

/**
 * Registration / login input rules.
 *
 * NOTE ON `role`: there is intentionally no rule for it. The field is never
 * read from the body - user.repository.create() hard-codes 'student' - so a
 * client sending {"role":"admin"} simply has it ignored.
 *
 * NOTE ON `email`: any valid domain is accepted. The matching database
 * CHECK lives in migration 009 - the two must always agree.
 */

const { body } = require('express-validator');
const { EMAIL_REGEX } = require('../config/constants');

const emailRule = body('email')
  .trim()
  .toLowerCase()
  .notEmpty()
  .withMessage('Email is required')
  .bail()
  .isLength({ max: 191 })
  .withMessage('Email is too long')
  .bail()
  .matches(EMAIL_REGEX)
  .withMessage('Enter a valid email address, for example you@example.com');

const passwordRule = body('password')
  .isString()
  .withMessage('Password is required')
  .bail()
  .isLength({ min: 8, max: 72 })
  .withMessage('Password must be 8-72 characters')
  .bail()
  .matches(/[A-Za-z]/)
  .withMessage('Password must contain at least one letter')
  .bail()
  .matches(/\d/)
  .withMessage('Password must contain at least one number');

const registerRules = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be 2-100 characters'),
  emailRule,
  body('tnt')
    .trim()
    .isLength({ min: 2, max: 30 })
    .withMessage('TNT number must be 2-30 characters'),
  body('academic_year')
    .trim()
    .isLength({ min: 1, max: 30 })
    .withMessage('Academic year is required (max 30 characters)'),
  passwordRule,
];

const loginRules = [
  body('email').trim().toLowerCase().notEmpty().withMessage('Email is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

module.exports = { registerRules, loginRules, passwordRule };
