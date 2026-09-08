'use strict';

/**
 * Lost & Found. Any student may post; a post can be edited or deleted by its
 * OWNER or by an ADMIN moderator - that decision lives in
 * lostFound.service.assertCanModify(), not in the route table.
 */

const express = require('express');
const lostFoundController = require('../controllers/lostFound.controller');
const {
  createRules,
  updateRules,
  statusRules,
  listRules,
} = require('../validators/lostFound.validator');
const { idParam } = require('../validators/common.validator');
const validate = require('../middleware/validate.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const { writeLimiter } = require('../middleware/rateLimit.middleware');
const { singleImage } = require('../middleware/upload.middleware');

const router = express.Router();

router.use(authenticate);

router.get('/', listRules, validate, lostFoundController.list);
router.get('/:id', idParam('id', 'item_id'), validate, lostFoundController.getById);

router.post('/', writeLimiter, singleImage('image'), createRules, validate, lostFoundController.create);
router.patch('/:id', idParam('id', 'item_id'), singleImage('image'), updateRules, validate, lostFoundController.update);
router.patch(
  '/:id/status',
  idParam('id', 'item_id'),
  statusRules,
  validate,
  lostFoundController.updateStatus
);
router.delete('/:id', idParam('id', 'item_id'), validate, lostFoundController.remove);

module.exports = router;
