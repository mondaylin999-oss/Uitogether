'use strict';

const pollService = require('../services/poll.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, created, noContent } = require('../utils/apiResponse');
const { parsePagination } = require('../utils/pagination');

/** GET /api/polls */
const list = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query);
  const { items, meta } = await pollService.list(
    { status: req.query.status, sort: req.query.sort },
    pagination,
    req.user.user_id
  );
  return sendSuccess(res, { message: 'Polls', data: { polls: items }, meta });
});

/** GET /api/polls/:id */
const getById = asyncHandler(async (req, res) => {
  const poll = await pollService.getById(req.params.id, req.user.user_id);
  return sendSuccess(res, { message: 'Poll', data: { poll } });
});

/** GET /api/polls/:id/results */
const getResults = asyncHandler(async (req, res) => {
  const results = await pollService.getResults(req.params.id, req.user.user_id);
  return sendSuccess(res, { message: 'Poll results', data: { results } });
});

/** POST /api/polls - ADMIN ONLY */
const create = asyncHandler(async (req, res) => {
  const poll = await pollService.create(req.body, req.user);
  return created(res, 'Poll created', { poll });
});

/** PATCH /api/polls/:id - ADMIN ONLY (e.g. close a poll) */
const update = asyncHandler(async (req, res) => {
  const poll = await pollService.update(req.params.id, req.body, req.user.user_id);
  return sendSuccess(res, { message: 'Poll updated', data: { poll } });
});

/** DELETE /api/polls/:id - ADMIN ONLY */
const remove = asyncHandler(async (req, res) => {
  await pollService.remove(req.params.id);
  return noContent(res);
});

/** POST /api/polls/:id/vote - one vote per user per poll (DB enforced) */
const vote = asyncHandler(async (req, res) => {
  const poll = await pollService.vote(req.params.id, req.body.option_id, req.user.user_id);
  return created(res, 'Vote recorded', { poll });
});

module.exports = { list, getById, getResults, create, update, remove, vote };
