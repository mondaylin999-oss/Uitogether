'use strict';

/** Rules for the user's own ACCOUNT (users row). */

const { body } = require('express-validator');

const updateAccountRules = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be 2-100 characters'),
  body('academic_year')
    .optional()
    .trim()
    .isLength({ min: 1, max: 30 })
    .withMessage('Academic year must be 1-30 characters'),
  body('tnt')
    .optional()
    .trim()
    .isLength({ min: 2, max: 30 })
    .withMessage('TNT number must be 2-30 characters'),
  // email and role are deliberately not editable through this endpoint.
];

const changePasswordRules = [
  body('current_password').notEmpty().withMessage('Current password is required'),
  body('new_password')
    .isString()
    .withMessage('New password is required')
    .bail()
    .isLength({ min: 8, max: 72 })
    .withMessage('New password must be 8-72 characters')
    .bail()
    .matches(/[A-Za-z]/)
    .withMessage('New password must contain at least one letter')
    .bail()
    .matches(/\d/)
    .withMessage('New password must contain at least one number'),
];

module.exports = { updateAccountRules, changePasswordRules };
