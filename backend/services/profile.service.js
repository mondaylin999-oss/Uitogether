'use strict';

/** The authenticated user's own ACCOUNT (users row), not the study buddy card. */

const userRepository = require('../repositories/user.repository');
const { hashPassword, verifyPassword } = require('../utils/password');
const { toAuthUser, toPublicUser } = require('../utils/serializers');
const ApiError = require('../utils/ApiError');

/** @param {number} userId */
async function getMyAccount(userId) {
  const user = await userRepository.findById(userId);
  if (!user) throw ApiError.notFound('User not found');
  return toAuthUser(user);
}

/**
 * Editable account fields. email and role are deliberately absent:
 * email is the login identity and role is admin-controlled.
 *
 * @param {number} userId
 * @param {{ name?: string, academic_year?: string, tnt?: string }} data
 */
async function updateMyAccount(userId, data) {
  const patch = {};
  if (data.name !== undefined) patch.name = String(data.name).trim();
  if (data.academic_year !== undefined) patch.academic_year = String(data.academic_year).trim();
  if (data.tnt !== undefined) patch.tnt = String(data.tnt).trim();

  if (patch.tnt) {
    const existing = await userRepository.findByTnt(patch.tnt);
    if (existing && existing.user_id !== userId) {
      throw ApiError.conflict('An account with this TNT number already exists');
    }
  }

  const updated = await userRepository.update(userId, patch);
  return toAuthUser(updated);
}

/**
 * @param {number} userId
 * @param {{ current_password: string, new_password: string }} data
 */
async function changePassword(userId, data) {
  const account = await userRepository.findByIdWithPassword(userId);
  if (!account) throw ApiError.notFound('User not found');

  const matches = await verifyPassword(data.current_password, account.password_hash);
  if (!matches) throw ApiError.unauthorized('Current password is incorrect');

  const isSame = await verifyPassword(data.new_password, account.password_hash);
  if (isSame) throw ApiError.badRequest('New password must be different from the current one');

  await userRepository.updatePassword(userId, await hashPassword(data.new_password));
  return true;
}

/** Another student's public account card. @param {number} userId */
async function getPublicUser(userId) {
  const user = await userRepository.findById(userId);
  if (!user) throw ApiError.notFound('User not found');
  return toPublicUser(user);
}

module.exports = { getMyAccount, updateMyAccount, changePassword, getPublicUser };
