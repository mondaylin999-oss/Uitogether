'use strict';

/**
 * Lost & Found.
 * Any student may post. A post may be edited or deleted by its OWNER,
 * or by an ADMIN acting as moderator - assertCanModify() is the single
 * place that decision is made.
 */

const lostFoundRepository = require('../repositories/lostFound.repository');
const notificationService = require('./notification.service');
const { toLostFoundItem } = require('../utils/serializers');
const { buildMeta } = require('../utils/pagination');
const { ROLES } = require('../config/constants');
const ApiError = require('../utils/ApiError');

/**
 * @param {object} item      the row being modified
 * @param {{ user_id: number, role: string }} actor
 */
function assertCanModify(item, actor) {
  const isOwner = Number(item.user_id) === Number(actor.user_id);
  const isAdmin = actor.role === ROLES.ADMIN;
  if (!isOwner && !isAdmin) {
    throw ApiError.forbidden('You can only modify your own lost & found posts');
  }
}

async function list(filters, pagination) {
  const { rows, total } = await lostFoundRepository.list(filters, pagination);
  return { items: rows.map(toLostFoundItem), meta: buildMeta(pagination, total) };
}

async function getById(itemId) {
  const row = await lostFoundRepository.findById(itemId);
  if (!row) throw ApiError.notFound('Lost & found post not found');
  return toLostFoundItem(row);
}

/**
 * @param {Record<string, *>} data
 * @param {{ user_id: number }} author
 */
async function create(data, author) {
  const itemId = await lostFoundRepository.create(data, author.user_id);
  const item = toLostFoundItem(await lostFoundRepository.findById(itemId));

  await notificationService.emitNewLostFound({ authorUserId: author.user_id, item });
  return item;
}

async function update(itemId, data, actor) {
  const existing = await lostFoundRepository.findById(itemId);
  if (!existing) throw ApiError.notFound('Lost & found post not found');
  assertCanModify(existing, actor);

  return toLostFoundItem(await lostFoundRepository.update(itemId, data));
}

async function updateStatus(itemId, status, actor) {
  const existing = await lostFoundRepository.findById(itemId);
  if (!existing) throw ApiError.notFound('Lost & found post not found');
  assertCanModify(existing, actor);

  return toLostFoundItem(await lostFoundRepository.update(itemId, { status }));
}

async function remove(itemId, actor) {
  const existing = await lostFoundRepository.findById(itemId);
  if (!existing) throw ApiError.notFound('Lost & found post not found');
  assertCanModify(existing, actor);

  await lostFoundRepository.remove(itemId);
  return true;
}

module.exports = { list, getById, create, update, updateStatus, remove };
