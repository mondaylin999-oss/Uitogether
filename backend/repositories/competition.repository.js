'use strict';

/** competitions table access. Writes are reachable only from admin routes. */

const { query, queryOne } = require('../config/database');
const { buildUpdateSet, limitOffset, orderBy } = require('../utils/sql');

const COLUMNS = `
  c.competition_id, c.title, c.description, c.event_date, c.event_time,
  c.location, c.organizer, c.image_url, c.created_by,
  c.created_at, c.updated_at, u.name AS created_by_name`;

const SORTABLE = {
  event_date: 'c.event_date',
  newest: 'c.created_at',
  title: 'c.title',
};

const UPDATABLE_COLUMNS = [
  'title',
  'description',
  'event_date',
  'event_time',
  'location',
  'organizer',
  'image_url',
];

/** @param {number} competitionId */
function findById(competitionId) {
  return queryOne(
    `SELECT ${COLUMNS}
       FROM competitions c
       LEFT JOIN users u ON u.user_id = c.created_by
      WHERE c.competition_id = ?`,
    [competitionId]
  );
}

/**
 * @param {{ scope?: 'upcoming'|'past'|'all', q?: string, sort?: string }} filters
 * @param {{ limit: number, offset: number }} pagination
 */
async function list(filters, pagination) {
  const where = [];
  const params = [];

  if (filters.scope === 'upcoming') where.push('c.event_date >= CURDATE()');
  if (filters.scope === 'past') where.push('c.event_date < CURDATE()');

  if (filters.q) {
    where.push('(c.title LIKE ? OR c.description LIKE ? OR c.organizer LIKE ?)');
    params.push(`%${filters.q}%`, `%${filters.q}%`, `%${filters.q}%`);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const order = orderBy(filters.sort, SORTABLE, 'event_date');

  const rows = await query(
    `SELECT ${COLUMNS}
       FROM competitions c
       LEFT JOIN users u ON u.user_id = c.created_by
       ${whereClause}
      ORDER BY ${order}${limitOffset(pagination)}`,
    params
  );

  const countRow = await queryOne(
    `SELECT COUNT(*) AS total FROM competitions c ${whereClause}`,
    params
  );
  return { rows, total: Number(countRow?.total ?? 0) };
}

/**
 * @param {Record<string, *>} data
 * @param {number} adminUserId
 * @returns {Promise<number>} new competition_id
 */
async function create(data, adminUserId) {
  const result = await query(
    `INSERT INTO competitions
       (title, description, event_date, event_time, location, organizer, image_url, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.title,
      data.description ?? null,
      data.event_date,
      data.event_time ?? null,
      data.location ?? null,
      data.organizer ?? null,
      data.image_url ?? null,
      adminUserId,
    ]
  );
  return result.insertId;
}

async function update(competitionId, data) {
  const { clause, values, fields } = buildUpdateSet(data, UPDATABLE_COLUMNS);
  if (fields.length === 0) return findById(competitionId);

  await query(`UPDATE competitions SET ${clause} WHERE competition_id = ?`, [
    ...values,
    competitionId,
  ]);
  return findById(competitionId);
}

async function remove(competitionId) {
  const result = await query('DELETE FROM competitions WHERE competition_id = ?', [competitionId]);
  return result.affectedRows > 0;
}

module.exports = { UPDATABLE_COLUMNS, findById, list, create, update, remove };
