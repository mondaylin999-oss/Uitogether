'use strict';

/**
 * One JSON shape for the whole API, so the frontend can write a single
 * fetch wrapper.
 *
 *   success -> { "success": true,  "message": "...", "data": ..., "meta": {...} }
 *   failure -> { "success": false, "message": "...", "errors": [ { field, message } ] }
 */

/**
 * @param {import('express').Response} res
 * @param {object} options
 * @param {number} [options.statusCode=200]
 * @param {string} [options.message]
 * @param {*} [options.data]
 * @param {object} [options.meta]
 */
function sendSuccess(res, { statusCode = 200, message = 'OK', data = null, meta } = {}) {
  const body = { success: true, message, data };
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
}

/**
 * @param {import('express').Response} res
 * @param {object} options
 * @param {number} [options.statusCode=500]
 * @param {string} [options.message]
 * @param {Array<{field?: string, message: string}>} [options.errors]
 */
function sendError(res, { statusCode = 500, message = 'Internal server error', errors = [] } = {}) {
  const body = { success: false, message };
  if (errors.length > 0) body.errors = errors;
  return res.status(statusCode).json(body);
}

const created = (res, message, data) => sendSuccess(res, { statusCode: 201, message, data });
const noContent = (res) => res.status(204).end();

module.exports = { sendSuccess, sendError, created, noContent };
