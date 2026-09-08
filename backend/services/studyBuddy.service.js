'use strict';

/**
 * Study buddy profiles.
 *
 * CONTACT VISIBILITY - the rule the whole product hangs on:
 *   telegram / viber are returned only when the viewer is
 *     (a) the profile owner, or
 *     (b) mutually matched with the owner (an accepted buddy_request).
 *   Everything else goes through profileRepository.findPublicByUserId /
 *   search(), which do not even SELECT those columns.
 */

const profileRepository = require('../repositories/profile.repository');
const buddyRequestRepository = require('../repositories/buddyRequest.repository');
const userRepository = require('../repositories/user.repository');
const { toStudyBuddyProfile, toOwnStudyBuddyProfile } = require('../utils/serializers');
const { buildMeta } = require('../utils/pagination');
const ApiError = require('../utils/ApiError');

/** Comma-separated subject lists arrive as an array OR a string. */
function normaliseSubjects(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const list = Array.isArray(value) ? value : String(value).split(',');
  const cleaned = list.map((item) => String(item).trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned.join(', ') : null;
}

const emptyToNull = (value) => {
  if (value === undefined) return undefined;
  const trimmed = value === null ? '' : String(value).trim();
  return trimmed === '' ? null : trimmed;
};

/** @param {number} userId */
async function getMyProfile(userId) {
  const row = await profileRepository.findOwnByUserId(userId);
  if (!row) throw ApiError.notFound('You have not created a study buddy profile yet');
  return toOwnStudyBuddyProfile(row);
}

/**
 * One profile per user - the UNIQUE key on user_id is the real guard,
 * this check just produces a nicer message.
 */
async function createMyProfile(userId, data) {
  const existing = await profileRepository.findOwnByUserId(userId);
  if (existing) {
    throw ApiError.conflict('You already have a study buddy profile - update it instead');
  }

  const payload = {
    nickname: String(data.nickname).trim(),
    semester: String(data.semester).trim(),
    study_style: data.study_style,
    weak_subjects: normaliseSubjects(data.weak_subjects) ?? null,
    strong_subjects: normaliseSubjects(data.strong_subjects) ?? null,
    wanna_meet: data.wanna_meet,
    notes: emptyToNull(data.notes) ?? null,
    telegram: emptyToNull(data.telegram) ?? null,
    viber: emptyToNull(data.viber) ?? null,
  };

  if (!payload.telegram && !payload.viber) {
    throw ApiError.unprocessable(
      'Provide at least one contact method (Telegram or Viber) so a matched buddy can reach you',
      [{ field: 'telegram', message: 'Telegram or Viber is required' }]
    );
  }

  await profileRepository.create(userId, payload);
  return getMyProfile(userId);
}

async function updateMyProfile(userId, data) {
  const existing = await profileRepository.findOwnByUserId(userId);
  if (!existing) throw ApiError.notFound('You have not created a study buddy profile yet');

  const patch = {};
  if (data.nickname !== undefined) patch.nickname = String(data.nickname).trim();
  if (data.semester !== undefined) patch.semester = String(data.semester).trim();
  if (data.study_style !== undefined) patch.study_style = data.study_style;
  if (data.wanna_meet !== undefined) patch.wanna_meet = data.wanna_meet;
  if (data.weak_subjects !== undefined) patch.weak_subjects = normaliseSubjects(data.weak_subjects);
  if (data.strong_subjects !== undefined) {
    patch.strong_subjects = normaliseSubjects(data.strong_subjects);
  }
  if (data.notes !== undefined) patch.notes = emptyToNull(data.notes);
  if (data.telegram !== undefined) patch.telegram = emptyToNull(data.telegram);
  if (data.viber !== undefined) patch.viber = emptyToNull(data.viber);

  const nextTelegram = patch.telegram !== undefined ? patch.telegram : existing.telegram;
  const nextViber = patch.viber !== undefined ? patch.viber : existing.viber;
  if (!nextTelegram && !nextViber) {
    throw ApiError.unprocessable('Keep at least one contact method (Telegram or Viber)', [
      { field: 'telegram', message: 'Telegram or Viber is required' },
    ]);
  }

  await profileRepository.update(userId, patch);
  return getMyProfile(userId);
}

async function deleteMyProfile(userId) {
  const deleted = await profileRepository.remove(userId);
  if (!deleted) throw ApiError.notFound('You have not created a study buddy profile yet');
  return true;
}

/**
 * Browse study buddies. Contacts are never included; each card carries
 * `contact_unlocked` so the frontend knows whether to show a "Message" or an
 * "Interested" button.
 *
 * @param {number} viewerId
 * @param {object} filters
 * @param {{ page: number, limit: number, offset: number }} pagination
 */
async function browse(viewerId, filters, pagination) {
  const { rows, total } = await profileRepository.search(
    { ...filters, excludeUserId: viewerId },
    pagination
  );

  const matchedIds = await buddyRequestRepository.findMatchedIdsAmong(
    viewerId,
    rows.map((row) => row.user_id)
  );

  const items = rows.map((row) =>
    toStudyBuddyProfile(row, { unlocked: matchedIds.has(row.user_id) })
  );

  return { items, meta: buildMeta(pagination, total) };
}

/**
 * A single study buddy profile. Unlocks contacts only for self or a
 * confirmed mutual match.
 *
 * @param {number} viewerId
 * @param {number} targetUserId
 */
async function getProfileForViewer(viewerId, targetUserId) {
  if (Number(viewerId) === Number(targetUserId)) {
    return getMyProfile(targetUserId);
  }

  const targetExists = await userRepository.exists(targetUserId);
  if (!targetExists) throw ApiError.notFound('Student not found');

  const matched = await buddyRequestRepository.areMatched(viewerId, targetUserId);

  const row = matched
    ? await profileRepository.findUnlockedByUserId(targetUserId)
    : await profileRepository.findPublicByUserId(targetUserId);

  if (!row) throw ApiError.notFound('This student has not created a study buddy profile yet');

  return toStudyBuddyProfile(row, { unlocked: matched });
}

module.exports = {
  getMyProfile,
  createMyProfile,
  updateMyProfile,
  deleteMyProfile,
  browse,
  getProfileForViewer,
};
