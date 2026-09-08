'use strict';

/**
 * Small helpers for building SQL safely.
 *
 * Values are ALWAYS passed as `?` parameters. The only things ever
 * interpolated into SQL text here are:
 *   - integers that passed through safeInt()
 *   - column names taken from a hard-coded allow-list
 * Nothing derived from user input reaches the query string verbatim.
 */

/**
 * @param {*} value
 * @param {number} fallback
 * @returns {number} a guaranteed non-negative integer
 */
function safeInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

/**
 * LIMIT/OFFSET are inlined (not bound) because MySQL's prepared-statement
 * protocol rejects string-typed placeholders there. safeInt() guarantees they
 * are plain integers, so this cannot be used for injection.
 *
 * @param {{ limit: number, offset: number }} pagination
 */
function limitOffset({ limit, offset }) {
  return ` LIMIT ${safeInt(limit, 20)} OFFSET ${safeInt(offset, 0)}`;
}

/**
 * Build a partial UPDATE from a patch object.
 *
 * @param {Record<string, *>} data       incoming (already validated) payload
 * @param {string[]} allowedColumns      hard-coded allow-list
 * @returns {{ clause: string, values: Array<*>, fields: string[] }}
 */
function buildUpdateSet(data, allowedColumns) {
  const fields = [];
  const values = [];

  for (const column of allowedColumns) {
    if (Object.prototype.hasOwnProperty.call(data, column) && data[column] !== undefined) {
      fields.push(column);
      values.push(data[column]);
    }
  }

  return {
    clause: fields.map((column) => `${column} = ?`).join(', '),
    values,
    fields,
  };
}

/**
 * Resolve a client-supplied sort into a safe "column direction" string.
 *
 * @param {string|undefined} requested   e.g. "created_at:desc"
 * @param {Record<string, string>} allowed  map of alias -> real column
 * @param {string} fallback              alias used when the request is unknown
 */
function orderBy(requested, allowed, fallback) {
  const [alias, direction] = String(requested || fallback).split(':');
  const column = allowed[alias] || allowed[fallback];
  const dir = String(direction).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  return `${column} ${dir}`;
}

module.exports = { safeInt, limitOffset, buildUpdateSet, orderBy };
