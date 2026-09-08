'use strict';

const competitionService = require('../services/competition.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, created, noContent } = require('../utils/apiResponse');
const { parsePagination } = require('../utils/pagination');

/** GET /api/competitions */
const list = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query);
  const { items, meta } = await competitionService.list(
    { scope: req.query.scope || 'all', q: req.query.q, sort: req.query.sort },
    pagination
  );
  return sendSuccess(res, { message: 'Competitions', data: { competitions: items }, meta });
});

/** GET /api/competitions/:id */
const getById = asyncHandler(async (req, res) => {
  const competition = await competitionService.getById(req.params.id);
  return sendSuccess(res, { message: 'Competition', data: { competition } });
});

/** POST /api/competitions - ADMIN ONLY */
const create = asyncHandler(async (req, res) => {
  const competition = await competitionService.create(req.body, req.user);
  return created(res, 'Competition created', { competition });
});

/** PUT /api/competitions/:id - ADMIN ONLY */
const update = asyncHandler(async (req, res) => {
  const competition = await competitionService.update(req.params.id, req.body);
  return sendSuccess(res, { message: 'Competition updated', data: { competition } });
});

/** DELETE /api/competitions/:id - ADMIN ONLY */
const remove = asyncHandler(async (req, res) => {
  await competitionService.remove(req.params.id);
  return noContent(res);
});

module.exports = { list, getById, create, update, remove };
