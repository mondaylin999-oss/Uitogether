'use strict';

/** lost_found table access. Ownership is checked in the service layer. */

const { query, queryOne } = require('../config/database');
const { buildUpdateSet, limitOffset, orderBy } = require('../utils/sql');

const COLUMNS = `
  l.item_id, l.user_id, l.type, l.title, l.description, l.location,
  l.item_date, l.image_url, l.contact_info, l.status,
  l.created_at, l.updated_at, u.name AS posted_by_name`;

const SORTABLE = { newest: 'l.created_at', item_date: 'l.item_date' };

const UPDATABLE_COLUMNS = [
  'type',
  'title',
  'description',
  'location',
  'item_date',
  'image_url',
  'contact_info',
  'status',
];

/** @param {number} itemId */
function findById(itemId) {
  return queryOne(
    `SELECT ${COLUMNS}
       FROM lost_found l
       JOIN users u ON u.user_id = l.user_id
      WHERE l.item_id = ?`,
    [itemId]
  );
}

/**
 * @param {{ type?: string, status?: string, q?: string, user_id?: number, sort?: string }} filters
 * @param {{ limit: number, offset: number }} pagination
 */
async function list(filters, pagination) {
  const where = [];
  const params = [];

  if (filters.type) {
    where.push('l.type = ?');
    params.push(filters.type);
  }
  if (filters.status) {
    where.push('l.status = ?');
    params.push(filters.status);
  }
  if (filters.user_id) {
    where.push('l.user_id = ?');
    params.push(filters.user_id);
  }
  if (filters.q) {
    where.push('(l.title LIKE ? OR l.description LIKE ? OR l.location LIKE ?)');
    params.push(`%${filters.q}%`, `%${filters.q}%`, `%${filters.q}%`);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const order = orderBy(filters.sort, SORTABLE, 'newest');

  const rows = await query(
    `SELECT ${COLUMNS}
       FROM lost_found l
       JOIN users u ON u.user_id = l.user_id
       ${whereClause}
      ORDER BY ${order}${limitOffset(pagination)}`,
    params
  );

  const countRow = await queryOne(
    `SELECT COUNT(*) AS total FROM lost_found l ${whereClause}`,
    params
  );
  return { rows, total: Number(countRow?.total ?? 0) };
}

/**
 * @param {Record<string, *>} data
 * @param {number} userId
 * @returns {Promise<number>} new item_id
 */
async function create(data, userId) {
  const result = await query(
    `INSERT INTO lost_found
       (user_id, type, title, description, location, item_date, image_url, contact_info, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      data.type,
      data.title,
      data.description ?? null,
      data.location ?? null,
      data.item_date ?? null,
      data.image_url ?? null,
      data.contact_info ?? null,
      data.status ?? 'active',
    ]
  );
  return result.insertId;
}

async function update(itemId, data) {
  const { clause, values, fields } = buildUpdateSet(data, UPDATABLE_COLUMNS);
  if (fields.length === 0) return findById(itemId);

  await query(`UPDATE lost_found SET ${clause} WHERE item_id = ?`, [...values, itemId]);
  return findById(itemId);
}

async function remove(itemId) {
  const result = await query('DELETE FROM lost_found WHERE item_id = ?', [itemId]);
  return result.affectedRows > 0;
}

module.exports = { UPDATABLE_COLUMNS, findById, list, create, update, remove };
