'use strict';

/**
 * Competitions / university events.
 * Students READ. Only ADMIN can create, edit or delete - every write route
 * mounts BOTH `authenticate` and `requireAdmin`, so hiding a button on the
 * frontend is irrelevant to the actual permission.
 */

const express = require('express');
const competitionController = require('../controllers/competition.controller');
const { createRules, updateRules, listRules } = require('../validators/competition.validator');
const { idParam } = require('../validators/common.validator');
const validate = require('../middleware/validate.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const { requireAdmin } = require('../middleware/admin.middleware');

const router = express.Router();

router.use(authenticate);

// --- read: any authenticated student ---
router.get('/', listRules, validate, competitionController.list);
router.get('/:id', idParam('id', 'competition_id'), validate, competitionController.getById);

// --- write: admin only ---
router.post('/', requireAdmin, createRules, validate, competitionController.create);
router.put(
  '/:id',
  requireAdmin,
  idParam('id', 'competition_id'),
  updateRules,
  validate,
  competitionController.update
);
router.delete(
  '/:id',
  requireAdmin,
  idParam('id', 'competition_id'),
  validate,
  competitionController.remove
);

module.exports = router;
