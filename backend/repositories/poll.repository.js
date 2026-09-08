'use strict';

/**
 * polls / poll_options / votes access.
 *
 * "One vote per user per poll" is guaranteed by the UNIQUE key
 * uq_votes_one_per_poll - castVote() simply lets a duplicate INSERT fail and
 * the error middleware turns ER_DUP_ENTRY into a clean 409.
 */

const { query, queryOne, withTransaction } = require('../config/database');
const { buildUpdateSet, limitOffset, orderBy } = require('../utils/sql');

const POLL_COLUMNS = `
  p.poll_id, p.question, p.description, p.status, p.ends_at, p.created_by,
  p.created_at, p.updated_at, u.name AS created_by_name`;

const SORTABLE = { newest: 'p.created_at', ends_at: 'p.ends_at' };
const UPDATABLE_COLUMNS = ['question', 'description', 'status', 'ends_at'];

/** @param {number} pollId */
function findById(pollId) {
  return queryOne(
    `SELECT ${POLL_COLUMNS},
            (SELECT COUNT(*) FROM votes v WHERE v.poll_id = p.poll_id) AS total_votes
       FROM polls p
       LEFT JOIN users u ON u.user_id = p.created_by
      WHERE p.poll_id = ?`,
    [pollId]
  );
}

/**
 * @param {{ status?: string, sort?: string }} filters
 * @param {{ limit: number, offset: number }} pagination
 */
async function list(filters, pagination) {
  const where = [];
  const params = [];

  if (filters.status) {
    where.push('p.status = ?');
    params.push(filters.status);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const order = orderBy(filters.sort, SORTABLE, 'newest');

  const rows = await query(
    `SELECT ${POLL_COLUMNS},
            (SELECT COUNT(*) FROM votes v WHERE v.poll_id = p.poll_id) AS total_votes
       FROM polls p
       LEFT JOIN users u ON u.user_id = p.created_by
       ${whereClause}
      ORDER BY ${order}${limitOffset(pagination)}`,
    params
  );

  const countRow = await queryOne(`SELECT COUNT(*) AS total FROM polls p ${whereClause}`, params);
  return { rows, total: Number(countRow?.total ?? 0) };
}

/** Options with live vote counts, straight from the v_poll_results view. */
function findResults(pollId) {
  return query(
    `SELECT poll_id, option_id, option_text, display_order, vote_count, vote_percentage
       FROM v_poll_results
      WHERE poll_id = ?
      ORDER BY display_order ASC, option_id ASC`,
    [pollId]
  );
}

/** @param {number[]} pollIds */
async function findResultsForPolls(pollIds) {
  if (!Array.isArray(pollIds) || pollIds.length === 0) return [];
  const placeholders = pollIds.map(() => '?').join(', ');
  return query(
    `SELECT poll_id, option_id, option_text, display_order, vote_count, vote_percentage
       FROM v_poll_results
      WHERE poll_id IN (${placeholders})
      ORDER BY poll_id ASC, display_order ASC, option_id ASC`,
    pollIds
  );
}

/**
 * The viewer's own vote in a poll (null when they have not voted).
 * @param {number} pollId
 * @param {number} userId
 */
function findUserVote(pollId, userId) {
  return queryOne('SELECT vote_id, option_id FROM votes WHERE poll_id = ? AND user_id = ?', [
    pollId,
    userId,
  ]);
}

/**
 * The viewer's votes across several polls, as a Map<poll_id, option_id>.
 * @param {number[]} pollIds
 * @param {number} userId
 */
async function findUserVotesForPolls(pollIds, userId) {
  const map = new Map();
  if (!Array.isArray(pollIds) || pollIds.length === 0) return map;

  const placeholders = pollIds.map(() => '?').join(', ');
  const rows = await query(
    `SELECT poll_id, option_id FROM votes WHERE user_id = ? AND poll_id IN (${placeholders})`,
    [userId, ...pollIds]
  );
  rows.forEach((row) => map.set(row.poll_id, row.option_id));
  return map;
}

/**
 * Create a poll and its options atomically.
 *
 * @param {{ question: string, description?: string, ends_at?: string|null, options: string[] }} data
 * @param {number} adminUserId
 * @returns {Promise<number>} new poll_id
 */
function createWithOptions(data, adminUserId) {
  return withTransaction(async (conn) => {
    const [pollResult] = await conn.execute(
      `INSERT INTO polls (question, description, ends_at, created_by, status)
       VALUES (?, ?, ?, ?, 'open')`,
      [data.question, data.description ?? null, data.ends_at ?? null, adminUserId]
    );
    const pollId = pollResult.insertId;

    let order = 1;
    for (const optionText of data.options) {
      // Sequential on purpose: one shared connection, and display_order must
      // follow the order the admin typed.
      // eslint-disable-next-line no-await-in-loop
      await conn.execute(
        'INSERT INTO poll_options (poll_id, option_text, display_order) VALUES (?, ?, ?)',
        [pollId, optionText, order]
      );
      order += 1;
    }

    return pollId;
  });
}

async function update(pollId, data) {
  const { clause, values, fields } = buildUpdateSet(data, UPDATABLE_COLUMNS);
  if (fields.length === 0) return findById(pollId);

  await query(`UPDATE polls SET ${clause} WHERE poll_id = ?`, [...values, pollId]);
  return findById(pollId);
}

async function remove(pollId) {
  const result = await query('DELETE FROM polls WHERE poll_id = ?', [pollId]);
  return result.affectedRows > 0;
}

/** @param {number} optionId */
function findOptionById(optionId) {
  return queryOne(
    'SELECT option_id, poll_id, option_text FROM poll_options WHERE option_id = ?',
    [optionId]
  );
}

/**
 * Record a vote. Relies on:
 *   uq_votes_one_per_poll  -> one vote per user per poll  (409 on duplicate)
 *   fk_votes_option        -> option must belong to this poll
 *   trg_votes_poll_open_bi -> poll must still be open
 *
 * @returns {Promise<number>} new vote_id
 */
async function castVote(pollId, optionId, userId) {
  const result = await query(
    'INSERT INTO votes (poll_id, option_id, user_id) VALUES (?, ?, ?)',
    [pollId, optionId, userId]
  );
  return result.insertId;
}

/** @param {number} pollId */
async function countVotes(pollId) {
  const row = await queryOne('SELECT COUNT(*) AS total FROM votes WHERE poll_id = ?', [pollId]);
  return Number(row?.total ?? 0);
}

module.exports = {
  UPDATABLE_COLUMNS,
  findById,
  list,
  findResults,
  findResultsForPolls,
  findUserVote,
  findUserVotesForPolls,
  createWithOptions,
  update,
  remove,
  findOptionById,
  castVote,
  countVotes,
};
