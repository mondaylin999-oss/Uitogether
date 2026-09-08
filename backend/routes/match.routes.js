'use strict';

/**
 * Mutual matches. These are the ONLY list endpoints that return another
 * student's Telegram / Viber links, because every row here is backed by an
 * accepted buddy request.
 */

const express = require('express');
const buddyRequestController = require('../controllers/buddyRequest.controller');
const { idParam, paginationRules } = require('../validators/common.validator');
const validate = require('../middleware/validate.middleware');
const { authenticate } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authenticate);

router.get('/', paginationRules, validate, buddyRequestController.listMatches);
router.get('/:userId', idParam('userId', 'userId'), validate, buddyRequestController.getMatch);

module.exports = router;
