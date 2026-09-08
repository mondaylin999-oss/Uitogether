'use strict';

const bcrypt = require('bcrypt');
const { env } = require('../config/env');

/**
 * Hash a plaintext password with bcrypt. The plaintext is never stored,
 * logged, or returned anywhere in this codebase.
 *
 * @param {string} plainPassword
 * @returns {Promise<string>} bcrypt hash (60 chars, "$2b$<cost>$...")
 */
function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, env.bcryptRounds);
}

/**
 * Constant-time comparison of a candidate password against a stored hash.
 *
 * @param {string} plainPassword
 * @param {string} passwordHash
 * @returns {Promise<boolean>}
 */
function verifyPassword(plainPassword, passwordHash) {
  if (!passwordHash) return Promise.resolve(false);
  return bcrypt.compare(plainPassword, passwordHash);
}

module.exports = { hashPassword, verifyPassword };
