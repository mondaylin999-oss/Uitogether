'use strict';

/**
 * notifications table access.
 *
 * Every read and write is scoped by user_id in the WHERE clause, so a user
 * can only ever touch their own rows - there is no "find by id" that ignores
 * ownership.
 */

const { query, queryOne } = require('../config/database');
const { limitOffset } = require('../utils/sql');

const COLUMNS =
  'notification_id, user_id, type, title, message, reference_type, reference_id, is_read, created_at';

/**
 * @param {{ user_id: number, type: string, title: string, message?: string,
 *           reference_type?: string|null, reference_id?: number|null }} data
 * @returns {Promise<number>} new notification_id
 */
async function create(data) {
  const result = await query(
    `INSERT INTO notifications
       (user_id, type, title, message, reference_type, reference_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      data.user_id,
      data.type,
      data.title,
      data.message ?? null,
      data.reference_type ?? null,
      data.reference_id ?? null,
    ]
  );
  return result.insertId;
}

/**
 * Fan out one notification to many recipients in a single INSERT.
 * @param {number[]} userIds
 * @param {{ type: string, title: string, message?: string,
 *           reference_type?: string|null, reference_id?: number|null }} data
 * @returns {Promise<number>} rows inserted
 */
async function createMany(userIds, data) {
  if (!Array.isArray(userIds) || userIds.length === 0) return 0;

  const placeholders = userIds.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
  const params = userIds.flatMap((userId) => [
    userId,
    data.type,
    data.title,
    data.message ?? null,
    data.reference_type ?? null,
    data.reference_id ?? null,
  ]);

  const result = await query(
    `INSERT INTO notifications
       (user_id, type, title, message, reference_type, reference_id)
     VALUES ${placeholders}`,
    params
  );
  return result.affectedRows;
}

/**
 * @param {number} userId
 * @param {{ is_read?: boolean, type?: string }} filters
 * @param {{ limit: number, offset: number }} pagination
 */
async function listForUser(userId, filters, pagination) {
  const where = ['user_id = ?'];
  const params = [userId];

  if (filters.is_read !== undefined) {
    where.push('is_read = ?');
    params.push(filters.is_read ? 1 : 0);
  }
  if (filters.type) {
    where.push('type = ?');
    params.push(filters.type);
  }
  const whereClause = `WHERE ${where.join(' AND ')}`;

  const rows = await query(
    `SELECT ${COLUMNS} FROM notifications ${whereClause}
      ORDER BY created_at DESC, notification_id DESC${limitOffset(pagination)}`,
    params
  );

  const countRow = await queryOne(
    `SELECT COUNT(*) AS total FROM notifications ${whereClause}`,
    params
  );
  return { rows, total: Number(countRow?.total ?? 0) };
}

/** @param {number} userId */
async function countUnread(userId) {
  const row = await queryOne(
    'SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND is_read = 0',
    [userId]
  );
  return Number(row?.total ?? 0);
}

/** Ownership is part of the WHERE clause, never a separate check. */
function findOwnedById(notificationId, userId) {
  return queryOne(
    `SELECT ${COLUMNS} FROM notifications WHERE notification_id = ? AND user_id = ?`,
    [notificationId, userId]
  );
}

async function markAsRead(notificationId, userId) {
  const result = await query(
    'UPDATE notifications SET is_read = 1 WHERE notification_id = ? AND user_id = ?',
    [notificationId, userId]
  );
  return result.affectedRows > 0;
}

async function markAllAsRead(userId) {
  const result = await query(
    'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
    [userId]
  );
  return result.affectedRows;
}

async function remove(notificationId, userId) {
  const result = await query(
    'DELETE FROM notifications WHERE notification_id = ? AND user_id = ?',
    [notificationId, userId]
  );
  return result.affectedRows > 0;
}

module.exports = {
  create,
  createMany,
  listForUser,
  countUnread,
  findOwnedById,
  markAsRead,
  markAllAsRead,
  remove,
};
