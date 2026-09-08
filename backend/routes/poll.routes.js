'use strict';

/**
 * Polls. Admin creates and manages; students vote.
 * One vote per user per poll is enforced by the UNIQUE key in MySQL.
 */

const express = require('express');
const pollController = require('../controllers/poll.controller');
const { createRules, updateRules, voteRules, listRules } = require('../validators/poll.validator');
const { idParam } = require('../validators/common.validator');
const validate = require('../middleware/validate.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const { requireAdmin } = require('../middleware/admin.middleware');
const { writeLimiter } = require('../middleware/rateLimit.middleware');

const router = express.Router();

router.use(authenticate);

// --- read + vote: any authenticated student ---
router.get('/', listRules, validate, pollController.list);
router.get('/:id', idParam('id', 'poll_id'), validate, pollController.getById);
router.get('/:id/results', idParam('id', 'poll_id'), validate, pollController.getResults);
router.post(
  '/:id/vote',
  writeLimiter,
  idParam('id', 'poll_id'),
  voteRules,
  validate,
  pollController.vote
);

// --- manage: admin only ---
router.post('/', requireAdmin, createRules, validate, pollController.create);
router.patch(
  '/:id',
  requireAdmin,
  idParam('id', 'poll_id'),
  updateRules,
  validate,
  pollController.update
);
router.delete('/:id', requireAdmin, idParam('id', 'poll_id'), validate, pollController.remove);

module.exports = router;
