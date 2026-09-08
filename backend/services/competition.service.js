'use strict';

/**
 * Competitions / university events.
 * READ  : any authenticated student
 * WRITE : admin only (routes mount authenticate + requireAdmin, and
 *         trg_competitions_admin_bi rejects a non-admin created_by in MySQL)
 */

const competitionRepository = require('../repositories/competition.repository');
const notificationService = require('./notification.service');
const { toCompetition } = require('../utils/serializers');
const { buildMeta } = require('../utils/pagination');
const ApiError = require('../utils/ApiError');

async function list(filters, pagination) {
  const { rows, total } = await competitionRepository.list(filters, pagination);
  return { items: rows.map(toCompetition), meta: buildMeta(pagination, total) };
}

async function getById(competitionId) {
  const row = await competitionRepository.findById(competitionId);
  if (!row) throw ApiError.notFound('Competition not found');
  return toCompetition(row);
}

/**
 * @param {Record<string, *>} data
 * @param {{ user_id: number }} admin
 */
async function create(data, admin) {
  const competitionId = await competitionRepository.create(data, admin.user_id);
  const competition = toCompetition(await competitionRepository.findById(competitionId));

  await notificationService.emitNewCompetition({ adminUserId: admin.user_id, competition });
  return competition;
}

async function update(competitionId, data) {
  const existing = await competitionRepository.findById(competitionId);
  if (!existing) throw ApiError.notFound('Competition not found');

  return toCompetition(await competitionRepository.update(competitionId, data));
}

async function remove(competitionId) {
  const existing = await competitionRepository.findById(competitionId);
  if (!existing) throw ApiError.notFound('Competition not found');

  await competitionRepository.remove(competitionId);
  return true;
}

module.exports = { list, getById, create, update, remove };
