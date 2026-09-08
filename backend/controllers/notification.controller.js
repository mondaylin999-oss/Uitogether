'use strict';

/** Every handler scopes to req.user.user_id - users only see their own inbox. */

const notificationService = require('../services/notification.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, noContent } = require('../utils/apiResponse');
const { parsePagination } = require('../utils/pagination');

/** GET /api/notifications */
const list = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query);
  const { items, meta } = await notificationService.listForUser(
    req.user.user_id,
    { is_read: req.query.is_read, type: req.query.type },
    pagination
  );
  return sendSuccess(res, { message: 'Notifications', data: { notifications: items }, meta });
});

/** GET /api/notifications/unread-count */
const unreadCount = asyncHandler(async (req, res) => {
  const count = await notificationService.countUnread(req.user.user_id);
  return sendSuccess(res, { message: 'Unread notifications', data: { unread_count: count } });
});

/** PATCH /api/notifications/:id/read */
const markAsRead = asyncHandler(async (req, res) => {
  const notification = await notificationService.markAsRead(req.params.id, req.user.user_id);
  return sendSuccess(res, { message: 'Notification marked as read', data: { notification } });
});

/** PATCH /api/notifications/read-all */
const markAllAsRead = asyncHandler(async (req, res) => {
  const updated = await notificationService.markAllAsRead(req.user.user_id);
  return sendSuccess(res, { message: 'All notifications marked as read', data: { updated } });
});

/** DELETE /api/notifications/:id */
const remove = asyncHandler(async (req, res) => {
  await notificationService.remove(req.params.id, req.user.user_id);
  return noContent(res);
});

module.exports = { list, unreadCount, markAsRead, markAllAsRead, remove };
