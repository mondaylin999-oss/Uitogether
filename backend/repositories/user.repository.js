'use strict';

/**
 * users table access.
 *
 * password_hash is selected by EXACTLY ONE function
 * (findByEmailWithPassword) which the login flow uses and which no
 * controller may call directly.
 */

const { query, queryOne } = require('../config/database');
const { buildUpdateSet } = require('../utils/sql');

/** Every column except password_hash. */
const SAFE_COLUMNS =
  'user_id, name, email, tnt, academic_year, role, created_at, updated_at';

/** @param {number} userId */
function findById(userId) {
  return queryOne(`SELECT ${SAFE_COLUMNS} FROM users WHERE user_id = ?`, [userId]);
}

/** @param {string} email */
function findByEmail(email) {
  return queryOne(`SELECT ${SAFE_COLUMNS} FROM users WHERE email = ?`, [email]);
}

/** @param {string} tnt */
function findByTnt(tnt) {
  return queryOne(`SELECT ${SAFE_COLUMNS} FROM users WHERE tnt = ?`, [tnt]);
}

/**
 * ONLY for the login flow - returns the bcrypt hash alongside the account.
 * @param {string} email
 */
function findByEmailWithPassword(email) {
  return queryOne(
    `SELECT ${SAFE_COLUMNS}, password_hash FROM users WHERE email = ?`,
    [email]
  );
}

/** ONLY for the change-password flow. @param {number} userId */
function findByIdWithPassword(userId) {
  return queryOne(
    `SELECT ${SAFE_COLUMNS}, password_hash FROM users WHERE user_id = ?`,
    [userId]
  );
}

/**
 * Insert a new account. `role` is intentionally NOT a parameter: registration
 * can only ever create a student, whatever the client sends.
 *
 * @param {{ name: string, email: string, tnt: string, academic_year: string, password_hash: string }} data
 * @returns {Promise<number>} new user_id
 */
async function create(data) {
  const result = await query(
    `INSERT INTO users (name, email, tnt, academic_year, password_hash, role)
     VALUES (?, ?, ?, ?, ?, 'student')`,
    [data.name, data.email, data.tnt, data.academic_year, data.password_hash]
  );
  return result.insertId;
}

/**
 * @param {number} userId
 * @param {{ name?: string, academic_year?: string, tnt?: string }} data
 */
async function update(userId, data) {
  const { clause, values, fields } = buildUpdateSet(data, ['name', 'academic_year', 'tnt']);
  if (fields.length === 0) return findById(userId);

  await query(`UPDATE users SET ${clause} WHERE user_id = ?`, [...values, userId]);
  return findById(userId);
}

/**
 * @param {number} userId
 * @param {string} passwordHash
 */
async function updatePassword(userId, passwordHash) {
  const result = await query('UPDATE users SET password_hash = ? WHERE user_id = ?', [
    passwordHash,
    userId,
  ]);
  return result.affectedRows > 0;
}

/** @param {number} userId */
async function exists(userId) {
  const row = await queryOne('SELECT 1 AS ok FROM users WHERE user_id = ?', [userId]);
  return Boolean(row);
}

/** Recipients for broadcast notifications (everyone except the author). */
async function findAllIdsExcept(excludedUserId) {
  const rows = await query('SELECT user_id FROM users WHERE user_id <> ?', [excludedUserId]);
  return rows.map((row) => row.user_id);
}

module.exports = {
  SAFE_COLUMNS,
  findById,
  findByEmail,
  findByTnt,
  findByEmailWithPassword,
  findByIdWithPassword,
  create,
  update,
  updatePassword,
  exists,
  findAllIdsExcept,
};
