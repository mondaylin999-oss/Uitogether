'use strict';

const express = require('express');
const studyBuddyController = require('../controllers/studyBuddy.controller');
const {
  createProfileRules,
  updateProfileRules,
  browseRules,
} = require('../validators/studyBuddy.validator');
const { idParam } = require('../validators/common.validator');
const validate = require('../middleware/validate.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const { writeLimiter } = require('../middleware/rateLimit.middleware');

const router = express.Router();

router.use(authenticate);

// --- the caller's own profile (one per user) ---
router.post('/profile', writeLimiter, createProfileRules, validate, studyBuddyController.createMyProfile);
router.get('/profile/me', studyBuddyController.getMyProfile);
router.patch('/profile/me', updateProfileRules, validate, studyBuddyController.updateMyProfile);
router.delete('/profile/me', studyBuddyController.deleteMyProfile);

// --- browsing other students (never returns telegram/viber) ---
router.get('/', browseRules, validate, studyBuddyController.browse);

// Declared last so "/profile/me" is not swallowed by "/:userId".
router.get('/:userId', idParam('userId', 'userId'), validate, studyBuddyController.getByUserId);

module.exports = router;
