'use strict';

/**
 * THE CORE FLOW
 *
 *   Student A --"Interested"--> Student B --"Accept"--> mutual match
 *                                                       -> contact unlocked
 *
 * Rules enforced here (and mirrored by DB constraints):
 *   - a user can never request themselves            (chk_requests_not_self)
 *   - no duplicate request in the same direction     (uq_requests_pair)
 *   - only the RECEIVER may accept or reject; the sender cannot accept
 *     their own request
 *   - only the SENDER may cancel, and only while pending
 *   - contacts unlock only when status = 'accepted'
 */

const buddyRequestRepository = require('../repositories/buddyRequest.repository');
const profileRepository = require('../repositories/profile.repository');
const userRepository = require('../repositories/user.repository');
const notificationService = require('./notification.service');
const { REQUEST_STATUS } = require('../config/constants');
const { toBuddyRequest, toStudyBuddyProfile, toPublicUser } = require('../utils/serializers');
const { buildMeta } = require('../utils/pagination');
const ApiError = require('../utils/ApiError');

/**
 * Send an "Interested" request.
 *
 * @param {{ user_id: number, name: string }} sender
 * @param {number} receiverId
 */
async function sendRequest(sender, receiverId) {
  const senderId = Number(sender.user_id);
  const targetId = Number(receiverId);

  if (senderId === targetId) {
    throw ApiError.badRequest('You cannot send a buddy request to yourself');
  }

  const receiver = await userRepository.findById(targetId);
  if (!receiver) throw ApiError.notFound('Student not found');

  // A match is only useful if BOTH sides have contact details to unlock.
  const senderProfile = await profileRepository.findOwnByUserId(senderId);
  if (!senderProfile) {
    throw ApiError.forbidden(
      'Create your study buddy profile before sending requests, so a match can unlock your contact too'
    );
  }

  const receiverProfile = await profileRepository.findPublicByUserId(targetId);
  if (!receiverProfile) {
    throw ApiError.badRequest('This student has not created a study buddy profile yet');
  }

  // Is there already something between these two, in either direction?
  const outgoing = await buddyRequestRepository.findByPair(senderId, targetId);
  const incoming = await buddyRequestRepository.findByPair(targetId, senderId);

  if (outgoing?.status === REQUEST_STATUS.ACCEPTED || incoming?.status === REQUEST_STATUS.ACCEPTED) {
    throw ApiError.conflict('You are already matched with this student');
  }
  if (incoming?.status === REQUEST_STATUS.PENDING) {
    throw ApiError.conflict(
      'This student already sent you a request - accept it instead of sending a new one'
    );
  }
  if (outgoing?.status === REQUEST_STATUS.PENDING) {
    throw ApiError.conflict('You already have a pending request with this student');
  }

  let requestId;
  if (outgoing?.status === REQUEST_STATUS.REJECTED) {
    // Re-open the existing row rather than violating uq_requests_pair.
    await buddyRequestRepository.reopen(outgoing.request_id);
    requestId = outgoing.request_id;
  } else {
    requestId = await buddyRequestRepository.create(senderId, targetId);
  }

  await notificationService.emitBuddyRequest({
    receiverId: targetId,
    senderName: sender.name,
    requestId,
  });

  const row = await buddyRequestRepository.findById(requestId);
  return toBuddyRequest(row);
}

/**
 * Shared guard for accept/reject.
 * @returns {Promise<object>} the pending request row
 */
async function loadRespondableRequest(requestId, userId) {
  const request = await buddyRequestRepository.findById(requestId);
  if (!request) throw ApiError.notFound('Buddy request not found');

  if (Number(request.receiver_id) !== Number(userId)) {
    // Covers the "sender tries to accept their own request" case.
    throw ApiError.forbidden('Only the student who received this request can respond to it');
  }
  if (request.status !== REQUEST_STATUS.PENDING) {
    throw ApiError.conflict(`This request has already been ${request.status}`);
  }
  return request;
}

/**
 * Accept -> MUTUAL MATCH. The response already carries the now-unlocked
 * contact of the sender, so the frontend can show the Telegram/Viber link
 * immediately.
 *
 * @param {number} requestId
 * @param {{ user_id: number, name: string }} receiver
 */
async function acceptRequest(requestId, receiver) {
  const request = await loadRespondableRequest(requestId, receiver.user_id);

  const transitioned = await buddyRequestRepository.updateStatusIfPending(
    request.request_id,
    REQUEST_STATUS.ACCEPTED
  );
  if (!transitioned) throw ApiError.conflict('This request has already been answered');

  await notificationService.emitBuddyRequestAccepted({
    senderId: request.sender_id,
    receiverName: receiver.name,
    requestId: request.request_id,
  });

  const updated = await buddyRequestRepository.findById(request.request_id);
  const matchRow = await buddyRequestRepository.findMatch(receiver.user_id, request.sender_id);

  return {
    request: toBuddyRequest(updated),
    match: matchRow
      ? {
          matched_at: matchRow.matched_at,
          user: toPublicUser(matchRow),
          profile: matchRow.profile_id
            ? toStudyBuddyProfile(matchRow, { unlocked: true })
            : null,
        }
      : null,
  };
}

/**
 * @param {number} requestId
 * @param {{ user_id: number, name: string }} receiver
 */
async function rejectRequest(requestId, receiver) {
  const request = await loadRespondableRequest(requestId, receiver.user_id);

  const transitioned = await buddyRequestRepository.updateStatusIfPending(
    request.request_id,
    REQUEST_STATUS.REJECTED
  );
  if (!transitioned) throw ApiError.conflict('This request has already been answered');

  await notificationService.emitBuddyRequestRejected({
    senderId: request.sender_id,
    receiverName: receiver.name,
    requestId: request.request_id,
  });

  return toBuddyRequest(await buddyRequestRepository.findById(request.request_id));
}

/** The sender withdraws a request that has not been answered yet. */
async function cancelRequest(requestId, userId) {
  const request = await buddyRequestRepository.findById(requestId);
  if (!request) throw ApiError.notFound('Buddy request not found');

  if (Number(request.sender_id) !== Number(userId)) {
    throw ApiError.forbidden('Only the student who sent this request can cancel it');
  }
  if (request.status !== REQUEST_STATUS.PENDING) {
    throw ApiError.conflict(`This request has already been ${request.status}`);
  }

  await buddyRequestRepository.remove(requestId);
  return true;
}

async function listIncoming(userId, filters, pagination) {
  const { rows, total } = await buddyRequestRepository.listIncoming(userId, filters, pagination);
  return { items: rows.map(toBuddyRequest), meta: buildMeta(pagination, total) };
}

async function listOutgoing(userId, filters, pagination) {
  const { rows, total } = await buddyRequestRepository.listOutgoing(userId, filters, pagination);
  return { items: rows.map(toBuddyRequest), meta: buildMeta(pagination, total) };
}

function countPendingIncoming(userId) {
  return buddyRequestRepository.countPendingIncoming(userId);
}

/** Every mutual match, contacts unlocked. */
async function listMatches(userId, pagination) {
  const { rows, total } = await buddyRequestRepository.listMatches(userId, pagination);

  const items = rows.map((row) => ({
    request_id: row.request_id,
    matched_at: row.matched_at,
    user: toPublicUser(row),
    profile: row.profile_id ? toStudyBuddyProfile(row, { unlocked: true }) : null,
  }));

  return { items, meta: buildMeta(pagination, total) };
}

/** One match. 404 when the two users are not matched - contacts stay hidden. */
async function getMatch(userId, matchedUserId) {
  const row = await buddyRequestRepository.findMatch(userId, matchedUserId);
  if (!row) throw ApiError.notFound('You are not matched with this student');

  return {
    request_id: row.request_id,
    matched_at: row.matched_at,
    user: toPublicUser(row),
    profile: row.profile_id ? toStudyBuddyProfile(row, { unlocked: true }) : null,
  };
}

module.exports = {
  sendRequest,
  acceptRequest,
  rejectRequest,
  cancelRequest,
  listIncoming,
  listOutgoing,
  countPendingIncoming,
  listMatches,
  getMatch,
};
