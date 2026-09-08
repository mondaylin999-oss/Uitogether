'use strict';

/**
 * buddy_requests access + the match lookups that gate contact details.
 *
 * areMatched(a, b) is the single authority for "is the contact unlocked?".
 * It is the only reason profile.repository.findUnlockedByUserId() is ever
 * allowed to run.
 */

const { query, queryOne } = require('../config/database');
const { limitOffset } = require('../utils/sql');
const { REQUEST_STATUS } = require('../config/constants');

const BASE_COLUMNS = 'r.request_id, r.sender_id, r.receiver_id, r.status, r.created_at, r.updated_at';

/** @param {number} requestId */
function findById(requestId) {
  return queryOne(`SELECT ${BASE_COLUMNS} FROM buddy_requests r WHERE r.request_id = ?`, [
    requestId,
  ]);
}

/**
 * The row for one direction only.
 * @param {number} senderId
 * @param {number} receiverId
 */
function findByPair(senderId, receiverId) {
  return queryOne(
    `SELECT ${BASE_COLUMNS} FROM buddy_requests r
      WHERE r.sender_id = ? AND r.receiver_id = ?`,
    [senderId, receiverId]
  );
}

/**
 * Any row between two users, in either direction. Used to stop a user from
 * opening a second conversation when one already exists.
 */
function findAnyBetween(userA, userB) {
  return queryOne(
    `SELECT ${BASE_COLUMNS} FROM buddy_requests r
      WHERE (r.sender_id = ? AND r.receiver_id = ?)
         OR (r.sender_id = ? AND r.receiver_id = ?)
      ORDER BY r.updated_at DESC
      LIMIT 1`,
    [userA, userB, userB, userA]
  );
}

/**
 * TRUE when an accepted request exists in either direction.
 * @returns {Promise<boolean>}
 */
async function areMatched(userA, userB) {
  if (Number(userA) === Number(userB)) return false;
  const row = await queryOne(
    `SELECT 1 AS ok FROM buddy_requests
      WHERE status = 'accepted'
        AND ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
      LIMIT 1`,
    [userA, userB, userB, userA]
  );
  return Boolean(row);
}

/**
 * Which of `candidateIds` are already matched with `userId`.
 * Lets a list endpoint flag matches without N+1 queries.
 *
 * @param {number} userId
 * @param {number[]} candidateIds
 * @returns {Promise<Set<number>>}
 */
async function findMatchedIdsAmong(userId, candidateIds) {
  if (!Array.isArray(candidateIds) || candidateIds.length === 0) return new Set();

  const placeholders = candidateIds.map(() => '?').join(', ');
  const rows = await query(
    `SELECT matched_user_id FROM v_buddy_matches
      WHERE user_id = ? AND matched_user_id IN (${placeholders})`,
    [userId, ...candidateIds]
  );
  return new Set(rows.map((row) => row.matched_user_id));
}

/** @returns {Promise<number>} new request_id */
async function create(senderId, receiverId) {
  const result = await query(
    `INSERT INTO buddy_requests (sender_id, receiver_id, status) VALUES (?, ?, 'pending')`,
    [senderId, receiverId]
  );
  return result.insertId;
}

/** Re-open a previously rejected request instead of inserting a duplicate. */
async function reopen(requestId) {
  await query(
    `UPDATE buddy_requests SET status = 'pending' WHERE request_id = ? AND status = 'rejected'`,
    [requestId]
  );
  return findById(requestId);
}

/**
 * Move a PENDING request to accepted/rejected. The `status = 'pending'`
 * guard makes this idempotent and race-safe: a second concurrent accept
 * changes zero rows.
 *
 * @param {number} requestId
 * @param {'accepted'|'rejected'} status
 * @returns {Promise<boolean>} whether a row actually transitioned
 */
async function updateStatusIfPending(requestId, status) {
  const result = await query(
    `UPDATE buddy_requests SET status = ? WHERE request_id = ? AND status = 'pending'`,
    [status, requestId]
  );
  return result.affectedRows > 0;
}

/** @param {number} requestId */
async function remove(requestId) {
  const result = await query('DELETE FROM buddy_requests WHERE request_id = ?', [requestId]);
  return result.affectedRows > 0;
}

/**
 * Requests sent TO the user.
 * @param {number} userId
 * @param {{ status?: string }} filters
 * @param {{ limit: number, offset: number }} pagination
 */
async function listIncoming(userId, filters, pagination) {
  const where = ['r.receiver_id = ?'];
  const params = [userId];

  if (filters.status) {
    where.push('r.status = ?');
    params.push(filters.status);
  }
  const whereClause = `WHERE ${where.join(' AND ')}`;

  const rows = await query(
    `SELECT ${BASE_COLUMNS},
            u.user_id AS counterpart_id, u.name AS counterpart_name,
            u.academic_year AS counterpart_academic_year,
            p.nickname AS counterpart_nickname, p.semester AS counterpart_semester,
            p.study_style AS counterpart_study_style,
            p.weak_subjects AS counterpart_weak_subjects,
            p.strong_subjects AS counterpart_strong_subjects,
            p.wanna_meet AS counterpart_wanna_meet,
            p.notes AS counterpart_notes
       FROM buddy_requests r
       JOIN users u ON u.user_id = r.sender_id
       LEFT JOIN study_buddy_profiles p ON p.user_id = r.sender_id
       ${whereClause}
      ORDER BY r.created_at DESC${limitOffset(pagination)}`,
    params
  );

  const countRow = await queryOne(
    `SELECT COUNT(*) AS total FROM buddy_requests r ${whereClause}`,
    params
  );
  return { rows, total: Number(countRow?.total ?? 0) };
}

/**
 * Requests the user has SENT.
 * @param {number} userId
 * @param {{ status?: string }} filters
 * @param {{ limit: number, offset: number }} pagination
 */
async function listOutgoing(userId, filters, pagination) {
  const where = ['r.sender_id = ?'];
  const params = [userId];

  if (filters.status) {
    where.push('r.status = ?');
    params.push(filters.status);
  }
  const whereClause = `WHERE ${where.join(' AND ')}`;

  const rows = await query(
    `SELECT ${BASE_COLUMNS},
            u.user_id AS counterpart_id, u.name AS counterpart_name,
            u.academic_year AS counterpart_academic_year,
            p.nickname AS counterpart_nickname, p.semester AS counterpart_semester,
            p.study_style AS counterpart_study_style,
            p.weak_subjects AS counterpart_weak_subjects,
            p.strong_subjects AS counterpart_strong_subjects,
            p.wanna_meet AS counterpart_wanna_meet,
            p.notes AS counterpart_notes
       FROM buddy_requests r
       JOIN users u ON u.user_id = r.receiver_id
       LEFT JOIN study_buddy_profiles p ON p.user_id = r.receiver_id
       ${whereClause}
      ORDER BY r.created_at DESC${limitOffset(pagination)}`,
    params
  );

  const countRow = await queryOne(
    `SELECT COUNT(*) AS total FROM buddy_requests r ${whereClause}`,
    params
  );
  return { rows, total: Number(countRow?.total ?? 0) };
}

/** @param {number} userId */
async function countPendingIncoming(userId) {
  const row = await queryOne(
    `SELECT COUNT(*) AS total FROM buddy_requests
      WHERE receiver_id = ? AND status = ?`,
    [userId, REQUEST_STATUS.PENDING]
  );
  return Number(row?.total ?? 0);
}

/**
 * All mutual matches for a user, WITH the matched student's contact columns.
 * Reading contacts is legitimate here: every row of v_buddy_matches is by
 * definition an accepted request involving `userId`.
 *
 * @param {number} userId
 * @param {{ limit: number, offset: number }} pagination
 */
async function listMatches(userId, pagination) {
  const rows = await query(
    `SELECT m.request_id, m.matched_at,
            u.user_id, u.name, u.academic_year,
            p.profile_id, p.nickname, p.semester, p.study_style,
            p.weak_subjects, p.strong_subjects, p.wanna_meet, p.notes,
            p.telegram, p.viber, p.created_at, p.updated_at
       FROM v_buddy_matches m
       JOIN users u ON u.user_id = m.matched_user_id
       LEFT JOIN study_buddy_profiles p ON p.user_id = m.matched_user_id
      WHERE m.user_id = ?
      ORDER BY m.matched_at DESC${limitOffset(pagination)}`,
    [userId]
  );

  const countRow = await queryOne(
    'SELECT COUNT(*) AS total FROM v_buddy_matches WHERE user_id = ?',
    [userId]
  );
  return { rows, total: Number(countRow?.total ?? 0) };
}

/** A single match row (or null when the two users are not matched). */
function findMatch(userId, matchedUserId) {
  return queryOne(
    `SELECT m.request_id, m.matched_at,
            u.user_id, u.name, u.academic_year,
            p.profile_id, p.nickname, p.semester, p.study_style,
            p.weak_subjects, p.strong_subjects, p.wanna_meet, p.notes,
            p.telegram, p.viber, p.created_at, p.updated_at
       FROM v_buddy_matches m
       JOIN users u ON u.user_id = m.matched_user_id
       LEFT JOIN study_buddy_profiles p ON p.user_id = m.matched_user_id
      WHERE m.user_id = ? AND m.matched_user_id = ?
      LIMIT 1`,
    [userId, matchedUserId]
  );
}

module.exports = {
  findById,
  findByPair,
  findAnyBetween,
  areMatched,
  findMatchedIdsAmong,
  create,
  reopen,
  updateStatusIfPending,
  remove,
  listIncoming,
  listOutgoing,
  countPendingIncoming,
  listMatches,
  findMatch,
};
