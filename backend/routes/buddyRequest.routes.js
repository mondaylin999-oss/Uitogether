'use strict';

const express = require('express');
const buddyRequestController = require('../controllers/buddyRequest.controller');
const { createRequestRules, listRules } = require('../validators/buddyRequest.validator');
const { idParam } = require('../validators/common.validator');
const validate = require('../middleware/validate.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const { writeLimiter } = require('../middleware/rateLimit.middleware');

const router = express.Router();

router.use(authenticate);

// "Interested"
router.post('/', writeLimiter, createRequestRules, validate, buddyRequestController.sendRequest);

// Literal paths before /:id
router.get('/incoming', listRules, validate, buddyRequestController.listIncoming);
router.get('/outgoing', listRules, validate, buddyRequestController.listOutgoing);
router.get('/pending-count', buddyRequestController.pendingCount);

// Only the RECEIVER can accept or reject (enforced in buddyRequest.service).
router.patch('/:id/accept', idParam('id', 'request_id'), validate, buddyRequestController.accept);
router.patch('/:id/reject', idParam('id', 'request_id'), validate, buddyRequestController.reject);

// Only the SENDER can cancel, and only while pending.
router.delete('/:id', idParam('id', 'request_id'), validate, buddyRequestController.cancel);

module.exports = router;
