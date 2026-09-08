'use strict';

/**
 * Notification creation + the user's own inbox.
 *
 * Notifications are a SIDE EFFECT: if writing one fails, the action that
 * triggered it (accepting a request, publishing an event...) must still
 * succeed. Every emit* helper therefore swallows and logs its own errors.
 */

const notificationRepository = require('../repositories/notification.repository');
const userRepository = require('../repositories/user.repository');
const { NOTIFICATION_TYPE, REFERENCE_TYPE } = require('../config/constants');
const { toNotification } = require('../utils/serializers');
const { buildMeta } = require('../utils/pagination');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

/** Never let a notification failure bubble into the caller's response. */
async function safely(label, task) {
  try {
    return await task();
  } catch (error) {
    logger.error(`Failed to create notification (${label})`, error.message);
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Emitters - called by the other services
 * ------------------------------------------------------------------ */

function emitBuddyRequest({ receiverId, senderName, requestId }) {
  return safely('buddy_request', () =>
    notificationRepository.create({
      user_id: receiverId,
      type: NOTIFICATION_TYPE.BUDDY_REQUEST,
      title: 'New buddy request',
      message: `${senderName} sent you a study buddy request.`,
      reference_type: REFERENCE_TYPE.BUDDY_REQUEST,
      reference_id: requestId,
    })
  );
}

function emitBuddyRequestAccepted({ senderId, receiverName, requestId }) {
  return safely('buddy_request_accepted', () =>
    notificationRepository.create({
      user_id: senderId,
      type: NOTIFICATION_TYPE.BUDDY_REQUEST_ACCEPTED,
      title: 'You have a new match!',
      message: `${receiverName} accepted your request. Their contact is now unlocked.`,
      reference_type: REFERENCE_TYPE.BUDDY_REQUEST,
      reference_id: requestId,
    })
  );
}

function emitBuddyRequestRejected({ senderId, receiverName, requestId }) {
  return safely('buddy_request_rejected', () =>
    notificationRepository.create({
      user_id: senderId,
      type: NOTIFICATION_TYPE.BUDDY_REQUEST_REJECTED,
      title: 'Request declined',
      message: `${receiverName} declined your study buddy request.`,
      reference_type: REFERENCE_TYPE.BUDDY_REQUEST,
      reference_id: requestId,
    })
  );
}

/** Broadcast to every user except the author. */
async function broadcast(authorUserId, payload, label) {
  return safely(label, async () => {
    const recipients = await userRepository.findAllIdsExcept(authorUserId);
    return notificationRepository.createMany(recipients, payload);
  });
}

function emitNewCompetition({ adminUserId, competition }) {
  return broadcast(
    adminUserId,
    {
      type: NOTIFICATION_TYPE.NEW_COMPETITION,
      title: 'New event posted',
      message: `${competition.title} - ${competition.event_date}`,
      reference_type: REFERENCE_TYPE.COMPETITION,
      reference_id: competition.competition_id,
    },
    'new_competition'
  );
}

function emitNewLostFound({ authorUserId, item }) {
  return broadcast(
    authorUserId,
    {
      type: NOTIFICATION_TYPE.NEW_LOST_FOUND,
      title: item.type === 'lost' ? 'Someone lost an item' : 'Someone found an item',
      message: `${item.title}${item.location ? ` - ${item.location}` : ''}`,
      reference_type: REFERENCE_TYPE.LOST_FOUND,
      reference_id: item.item_id,
    },
    'new_lost_found'
  );
}

function emitNewPoll({ adminUserId, poll }) {
  return broadcast(
    adminUserId,
    {
      type: NOTIFICATION_TYPE.NEW_POLL,
      title: 'New poll is open',
      message: poll.question,
      reference_type: REFERENCE_TYPE.POLL,
      reference_id: poll.poll_id,
    },
    'new_poll'
  );
}

/* ------------------------------------------------------------------ *
 * Inbox - always scoped to the authenticated user
 * ------------------------------------------------------------------ */

async function listForUser(userId, filters, pagination) {
  const { rows, total } = await notificationRepository.listForUser(userId, filters, pagination);
  return { items: rows.map(toNotification), meta: buildMeta(pagination, total) };
}

function countUnread(userId) {
  return notificationRepository.countUnread(userId);
}

async function markAsRead(notificationId, userId) {
  const updated = await notificationRepository.markAsRead(notificationId, userId);
  if (!updated) {
    // Either it does not exist or it belongs to someone else - same answer,
    // so we never leak the existence of another user's notification.
    const existing = await notificationRepository.findOwnedById(notificationId, userId);
    if (!existing) throw ApiError.notFound('Notification not found');
  }
  const row = await notificationRepository.findOwnedById(notificationId, userId);
  return toNotification(row);
}

function markAllAsRead(userId) {
  return notificationRepository.markAllAsRead(userId);
}

async function remove(notificationId, userId) {
  const deleted = await notificationRepository.remove(notificationId, userId);
  if (!deleted) throw ApiError.notFound('Notification not found');
  return true;
}

module.exports = {
  emitBuddyRequest,
  emitBuddyRequestAccepted,
  emitBuddyRequestRejected,
  emitNewCompetition,
  emitNewLostFound,
  emitNewPoll,
  listForUser,
  countUnread,
  markAsRead,
  markAllAsRead,
  remove,
};
