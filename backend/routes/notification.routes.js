'use strict';

/** Notifications - every handler is scoped to the authenticated user's rows. */

const express = require('express');
const notificationController = require('../controllers/notification.controller');
const { listRules } = require('../validators/notification.validator');
const { idParam } = require('../validators/common.validator');
const validate = require('../middleware/validate.middleware');
const { authenticate } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authenticate);

router.get('/', listRules, validate, notificationController.list);
router.get('/unread-count', notificationController.unreadCount);

// Literal path first so it is not captured by "/:id/read".
router.patch('/read-all', notificationController.markAllAsRead);
router.patch(
  '/:id/read',
  idParam('id', 'notification_id'),
  validate,
  notificationController.markAsRead
);
router.delete('/:id', idParam('id', 'notification_id'), validate, notificationController.remove);

module.exports = router;
