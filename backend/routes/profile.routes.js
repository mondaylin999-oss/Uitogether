'use strict';

const express = require('express');
const profileController = require('../controllers/profile.controller');
const { updateAccountRules, changePasswordRules } = require('../validators/profile.validator');
const { idParam } = require('../validators/common.validator');
const validate = require('../middleware/validate.middleware');
const { authenticate } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authenticate);

router.get('/me', profileController.getMe);
router.patch('/me', updateAccountRules, validate, profileController.updateMe);
router.patch('/me/password', changePasswordRules, validate, profileController.changePassword);

// Keep the literal /me routes above this parameterised one.
router.get('/:userId', idParam('userId', 'userId'), validate, profileController.getPublicUser);

module.exports = router;
