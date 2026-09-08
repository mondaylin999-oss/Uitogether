'use strict';

/**
 * Registration / login.
 *
 * Two rules are enforced here and cannot be bypassed from the outside:
 *   1. role is never taken from the request body - user.repository.create()
 *      hard-codes 'student'.
 *   2. the password is hashed with bcrypt before it touches the database.
 */

const userRepository = require('../repositories/user.repository');
const { hashPassword, verifyPassword } = require('../utils/password');
const { signToken } = require('../utils/jwt');
const { toAuthUser } = require('../utils/serializers');
const ApiError = require('../utils/ApiError');

const normaliseEmail = (email) => String(email || '').trim().toLowerCase();

/**
 * @param {{ name: string, email: string, tnt: string, academic_year: string, password: string }} payload
 * @returns {Promise<{ user: object, token: string }>}
 */
async function register(payload) {
  const email = normaliseEmail(payload.email);
  const tnt = String(payload.tnt).trim();

  // Friendly, specific errors. The unique keys in MySQL remain the real
  // guard against a race between these checks and the INSERT.
  if (await userRepository.findByEmail(email)) {
    throw ApiError.conflict('An account with this email already exists');
  }
  if (await userRepository.findByTnt(tnt)) {
    throw ApiError.conflict('An account with this TNT number already exists');
  }

  const passwordHash = await hashPassword(payload.password);

  const userId = await userRepository.create({
    name: String(payload.name).trim(),
    email,
    tnt,
    academic_year: String(payload.academic_year).trim(),
    password_hash: passwordHash,
  });

  const user = await userRepository.findById(userId);
  return { user: toAuthUser(user), token: signToken(user) };
}

/**
 * @param {{ email: string, password: string }} payload
 * @returns {Promise<{ user: object, token: string }>}
 */
async function login(payload) {
  const email = normaliseEmail(payload.email);
  const account = await userRepository.findByEmailWithPassword(email);

  // Same message for "no such user" and "wrong password" so the endpoint
  // cannot be used to discover which emails are registered.
  const invalid = ApiError.unauthorized('Invalid email or password');
  if (!account) {
    // Spend roughly the same time as a real comparison would.
    await verifyPassword(payload.password, '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv');
    throw invalid;
  }

  const matches = await verifyPassword(payload.password, account.password_hash);
  if (!matches) throw invalid;

  delete account.password_hash;
  return { user: toAuthUser(account), token: signToken(account) };
}

/** @param {number} userId */
async function getCurrentUser(userId) {
  const user = await userRepository.findById(userId);
  if (!user) throw ApiError.notFound('User not found');
  return toAuthUser(user);
}

module.exports = { register, login, getCurrentUser, normaliseEmail };
