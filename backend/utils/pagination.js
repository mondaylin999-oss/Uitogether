'use strict';

const { PAGINATION } = require('../config/constants');

/**
 * Turn ?page=&limit= into safe integers. Both are clamped, so a hostile
 * ?limit=999999 cannot be used to dump the whole table.
 *
 * @param {Record<string, *>} query
 * @returns {{ page: number, limit: number, offset: number }}
 */
function parsePagination(query = {}) {
  const rawPage = Number.parseInt(query.page, 10);
  const rawLimit = Number.parseInt(query.limit, 10);

  const page = Number.isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;
  const limit = Number.isNaN(rawLimit) || rawLimit < 1
    ? PAGINATION.DEFAULT_LIMIT
    : Math.min(rawLimit, PAGINATION.MAX_LIMIT);

  return { page, limit, offset: (page - 1) * limit };
}

/**
 * @param {{ page: number, limit: number }} pagination
 * @param {number} total
 */
function buildMeta({ page, limit }, total) {
  return {
    page,
    limit,
    total,
    total_pages: limit > 0 ? Math.ceil(total / limit) : 0,
    has_next_page: page * limit < total,
  };
}

module.exports = { parsePagination, buildMeta };
