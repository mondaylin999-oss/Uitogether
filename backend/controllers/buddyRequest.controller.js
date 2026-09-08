'use strict';

/** Buddy requests + matches - the "Interested -> Accept -> Contact" flow. */

const buddyRequestService = require('../services/buddyRequest.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, created, noContent } = require('../utils/apiResponse');
const { parsePagination } = require('../utils/pagination');

/** POST /api/buddy-requests */
const sendRequest = asyncHandler(async (req, res) => {
  const request = await buddyRequestService.sendRequest(req.user, req.body.receiver_id);
  return created(res, 'Buddy request sent', { request });
});

/** GET /api/buddy-requests/incoming */
const listIncoming = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query);
  const { items, meta } = await buddyRequestService.listIncoming(
    req.user.user_id,
    { status: req.query.status },
    pagination
  );
  return sendSuccess(res, { message: 'Incoming buddy requests', data: { requests: items }, meta });
});

/** GET /api/buddy-requests/outgoing */
const listOutgoing = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query);
  const { items, meta } = await buddyRequestService.listOutgoing(
    req.user.user_id,
    { status: req.query.status },
    pagination
  );
  return sendSuccess(res, { message: 'Sent buddy requests', data: { requests: items }, meta });
});

/** GET /api/buddy-requests/pending-count */
const pendingCount = asyncHandler(async (req, res) => {
  const count = await buddyRequestService.countPendingIncoming(req.user.user_id);
  return sendSuccess(res, { message: 'Pending buddy requests', data: { pending_count: count } });
});

/** PATCH /api/buddy-requests/:id/accept - receiver only. */
const accept = asyncHandler(async (req, res) => {
  const result = await buddyRequestService.acceptRequest(req.params.id, req.user);
  return sendSuccess(res, {
    message: 'It is a match! Contact details are now unlocked.',
    data: result,
  });
});

/** PATCH /api/buddy-requests/:id/reject - receiver only. */
const reject = asyncHandler(async (req, res) => {
  const request = await buddyRequestService.rejectRequest(req.params.id, req.user);
  return sendSuccess(res, { message: 'Buddy request rejected', data: { request } });
});

/** DELETE /api/buddy-requests/:id - sender withdraws a pending request. */
const cancel = asyncHandler(async (req, res) => {
  await buddyRequestService.cancelRequest(req.params.id, req.user.user_id);
  return noContent(res);
});

/** GET /api/matches */
const listMatches = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query);
  const { items, meta } = await buddyRequestService.listMatches(req.user.user_id, pagination);
  return sendSuccess(res, { message: 'Your matches', data: { matches: items }, meta });
});

/** GET /api/matches/:userId */
const getMatch = asyncHandler(async (req, res) => {
  const match = await buddyRequestService.getMatch(req.user.user_id, req.params.userId);
  return sendSuccess(res, { message: 'Match details', data: { match } });
});

module.exports = {
  sendRequest,
  listIncoming,
  listOutgoing,
  pendingCount,
  accept,
  reject,
  cancel,
  listMatches,
  getMatch,
};
