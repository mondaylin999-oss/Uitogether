'use strict';

const lostFoundService = require('../services/lostFound.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, created, noContent } = require('../utils/apiResponse');
const { parsePagination } = require('../utils/pagination');

/** GET /api/lost-found  (?mine=true limits the list to the caller's posts) */
const list = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query);
  const { items, meta } = await lostFoundService.list(
    {
      type: req.query.type,
      status: req.query.status,
      q: req.query.q,
      sort: req.query.sort,
      user_id: req.query.mine ? req.user.user_id : undefined,
    },
    pagination
  );
  return sendSuccess(res, { message: 'Lost & found posts', data: { items }, meta });
});

/** GET /api/lost-found/:id */
const getById = asyncHandler(async (req, res) => {
  const item = await lostFoundService.getById(req.params.id);
  return sendSuccess(res, { message: 'Lost & found post', data: { item } });
});

/** POST /api/lost-found */
const create = asyncHandler(async (req, res) => {
  const item = await lostFoundService.create(req.body, req.user);
  return created(res, 'Post created', { item });
});

/** PATCH /api/lost-found/:id - owner or admin */
const update = asyncHandler(async (req, res) => {
  const item = await lostFoundService.update(req.params.id, req.body, req.user);
  return sendSuccess(res, { message: 'Post updated', data: { item } });
});

/** PATCH /api/lost-found/:id/status - owner or admin */
const updateStatus = asyncHandler(async (req, res) => {
  const item = await lostFoundService.updateStatus(req.params.id, req.body.status, req.user);
  return sendSuccess(res, { message: 'Post status updated', data: { item } });
});

/** DELETE /api/lost-found/:id - owner or admin */
const remove = asyncHandler(async (req, res) => {
  await lostFoundService.remove(req.params.id, req.user);
  return noContent(res);
});

module.exports = { list, getById, create, update, updateStatus, remove };
