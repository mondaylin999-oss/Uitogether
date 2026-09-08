'use strict';

/**
 * study_buddy_profiles access.
 *
 * Two projections exist on purpose:
 *   PUBLIC_COLUMNS  - no telegram, no viber. Used by every browse/search query.
 *   PRIVATE_COLUMNS - adds telegram/viber. Used ONLY by findOwnByUserId() and
 *                     findUnlockedByUserId(), and the latter is called only
 *                     after buddyRequestRepository.areMatched() returned true.
 */

const { query, queryOne } = require('../config/database');
const { buildUpdateSet, limitOffset, orderBy } = require('../utils/sql');

const PUBLIC_COLUMNS = `
  p.profile_id, p.user_id, p.nickname, p.semester, p.study_style,
  p.weak_subjects, p.strong_subjects, p.wanna_meet, p.notes,
  p.created_at, p.updated_at,
  u.name, u.academic_year`;

const PRIVATE_COLUMNS = `${PUBLIC_COLUMNS}, p.telegram, p.viber`;

const SORTABLE = {
  newest: 'p.created_at',
  updated: 'p.updated_at',
  nickname: 'p.nickname',
};

const UPDATABLE_COLUMNS = [
  'nickname',
  'semester',
  'study_style',
  'weak_subjects',
  'strong_subjects',
  'wanna_meet',
  'notes',
  'telegram',
  'viber',
];

/** The owner's own profile, contacts included. @param {number} userId */
function findOwnByUserId(userId) {
  return queryOne(
    `SELECT ${PRIVATE_COLUMNS}
       FROM study_buddy_profiles p
       JOIN users u ON u.user_id = p.user_id
      WHERE p.user_id = ?`,
    [userId]
  );
}

/** Someone else's profile WITHOUT contact details. @param {number} userId */
function findPublicByUserId(userId) {
  return queryOne(
    `SELECT ${PUBLIC_COLUMNS}
       FROM study_buddy_profiles p
       JOIN users u ON u.user_id = p.user_id
      WHERE p.user_id = ?`,
    [userId]
  );
}

/**
 * Someone else's profile WITH contact details.
 * Callers MUST have verified a mutual match first.
 * @param {number} userId
 */
function findUnlockedByUserId(userId) {
  return queryOne(
    `SELECT ${PRIVATE_COLUMNS}
       FROM study_buddy_profiles p
       JOIN users u ON u.user_id = p.user_id
      WHERE p.user_id = ?`,
    [userId]
  );
}

/**
 * Browse / search study buddies. Never returns contact columns.
 *
 * @param {object} filters
 * @param {number} [filters.excludeUserId] hide the viewer's own profile
 * @param {string} [filters.semester]
 * @param {string} [filters.study_style]
 * @param {string} [filters.wanna_meet]
 * @param {string} [filters.subject] matches weak OR strong subjects
 * @param {string} [filters.q] free text over nickname / name / notes
 * @param {string} [filters.sort]
 * @param {{ limit: number, offset: number }} pagination
 */
async function search(filters, pagination) {
  const where = [];
  const params = [];

  if (filters.excludeUserId) {
    where.push('p.user_id <> ?');
    params.push(filters.excludeUserId);
  }
  if (filters.semester) {
    where.push('p.semester = ?');
    params.push(filters.semester);
  }
  if (filters.study_style) {
    where.push('p.study_style = ?');
    params.push(filters.study_style);
  }
  if (filters.wanna_meet) {
    where.push('p.wanna_meet = ?');
    params.push(filters.wanna_meet);
  }
  if (filters.subject) {
    where.push('(p.weak_subjects LIKE ? OR p.strong_subjects LIKE ?)');
    params.push(`%${filters.subject}%`, `%${filters.subject}%`);
  }
  if (filters.q) {
    where.push('(p.nickname LIKE ? OR u.name LIKE ? OR p.notes LIKE ?)');
    params.push(`%${filters.q}%`, `%${filters.q}%`, `%${filters.q}%`);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const order = orderBy(filters.sort, SORTABLE, 'newest');

  const rows = await query(
    `SELECT ${PUBLIC_COLUMNS}
       FROM study_buddy_profiles p
       JOIN users u ON u.user_id = p.user_id
       ${whereClause}
      ORDER BY ${order}${limitOffset(pagination)}`,
    params
  );

  const countRow = await queryOne(
    `SELECT COUNT(*) AS total
       FROM study_buddy_profiles p
       JOIN users u ON u.user_id = p.user_id
       ${whereClause}`,
    params
  );

  return { rows, total: Number(countRow?.total ?? 0) };
}

/**
 * @param {number} userId
 * @param {Record<string, *>} data
 * @returns {Promise<number>} new profile_id
 */
async function create(userId, data) {
  const result = await query(
    `INSERT INTO study_buddy_profiles
       (user_id, nickname, semester, study_style, weak_subjects,
        strong_subjects, wanna_meet, notes, telegram, viber)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      data.nickname,
      data.semester,
      data.study_style,
      data.weak_subjects ?? null,
      data.strong_subjects ?? null,
      data.wanna_meet,
      data.notes ?? null,
      data.telegram ?? null,
      data.viber ?? null,
    ]
  );
  return result.insertId;
}

/**
 * @param {number} userId
 * @param {Record<string, *>} data partial patch
 */
async function update(userId, data) {
  const { clause, values, fields } = buildUpdateSet(data, UPDATABLE_COLUMNS);
  if (fields.length === 0) return findOwnByUserId(userId);

  await query(`UPDATE study_buddy_profiles SET ${clause} WHERE user_id = ?`, [
    ...values,
    userId,
  ]);
  return findOwnByUserId(userId);
}

/** @param {number} userId */
async function remove(userId) {
  const result = await query('DELETE FROM study_buddy_profiles WHERE user_id = ?', [userId]);
  return result.affectedRows > 0;
}

module.exports = {
  PUBLIC_COLUMNS,
  UPDATABLE_COLUMNS,
  findOwnByUserId,
  findPublicByUserId,
  findUnlockedByUserId,
  search,
  create,
  update,
  remove,
};
