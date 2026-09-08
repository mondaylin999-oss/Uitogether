'use strict';

/**
 * Row -> API shape. Two rules are enforced here as the LAST line of defence:
 *
 *   1. password_hash never leaves this file alive.
 *   2. telegram / viber are only ever emitted through
 *      toStudyBuddyDetail(row, { unlocked: true }), which the service sets
 *      only for a confirmed mutual match.
 */

const { buildContactLinks } = require('./contactLinks');

/** "Java, Data Structures" -> ["Java", "Data Structures"] */
const toList = (value) =>
  value
    ? String(value)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

/**
 * The authenticated user's own account (GET /api/auth/me).
 * @param {object} row
 */
function toAuthUser(row) {
  if (!row) return null;
  return {
    user_id: row.user_id,
    name: row.name,
    email: row.email,
    tnt: row.tnt,
    academic_year: row.academic_year,
    role: row.role,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Another student as seen by anyone. Email and TNT are account identifiers,
 * so they stay out of public payloads.
 * @param {object} row
 */
function toPublicUser(row) {
  if (!row) return null;
  return {
    user_id: row.user_id,
    name: row.name,
    academic_year: row.academic_year,
    role: row.role,
  };
}

/**
 * A study buddy card / detail.
 * @param {object} row joined study_buddy_profiles + users row
 * @param {{ unlocked?: boolean }} [options] unlocked === mutual match confirmed
 */
function toStudyBuddyProfile(row, { unlocked = false } = {}) {
  if (!row) return null;

  const profile = {
    profile_id: row.profile_id,
    user_id: row.user_id,
    nickname: row.nickname,
    semester: row.semester,
    study_style: row.study_style,
    weak_subjects: toList(row.weak_subjects),
    strong_subjects: toList(row.strong_subjects),
    wanna_meet: row.wanna_meet,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    user: {
      user_id: row.user_id,
      name: row.name,
      academic_year: row.academic_year,
    },
    contact_unlocked: Boolean(unlocked),
  };

  if (unlocked) {
    profile.contact = buildContactLinks({ telegram: row.telegram, viber: row.viber });
  }

  return profile;
}

/** The owner's own study buddy profile - always shows their own contacts. */
function toOwnStudyBuddyProfile(row) {
  if (!row) return null;
  const profile = toStudyBuddyProfile(row, { unlocked: false });
  profile.telegram = row.telegram;
  profile.viber = row.viber;
  profile.contact = buildContactLinks({ telegram: row.telegram, viber: row.viber });
  delete profile.contact_unlocked;
  return profile;
}

function toBuddyRequest(row) {
  if (!row) return null;
  return {
    request_id: row.request_id,
    sender_id: row.sender_id,
    receiver_id: row.receiver_id,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    counterpart: row.counterpart_id
      ? {
          user_id: row.counterpart_id,
          name: row.counterpart_name,
          academic_year: row.counterpart_academic_year,
          nickname: row.counterpart_nickname ?? null,
          semester: row.counterpart_semester ?? null,
          study_style: row.counterpart_study_style ?? null,
          weak_subjects: toList(row.counterpart_weak_subjects),
          strong_subjects: toList(row.counterpart_strong_subjects),
          wanna_meet: row.counterpart_wanna_meet ?? null,
          notes: row.counterpart_notes ?? null,
        }
      : undefined,
  };
}

function toCompetition(row) {
  if (!row) return null;
  return {
    competition_id: row.competition_id,
    title: row.title,
    description: row.description,
    event_date: row.event_date,
    event_time: row.event_time,
    location: row.location,
    organizer: row.organizer,
    image_url: row.image_url,
    created_by: row.created_by,
    created_by_name: row.created_by_name ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toLostFoundItem(row) {
  if (!row) return null;
  return {
    item_id: row.item_id,
    user_id: row.user_id,
    type: row.type,
    title: row.title,
    description: row.description,
    location: row.location,
    item_date: row.item_date,
    image_url: row.image_url,
    contact_info: row.contact_info,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    posted_by: row.posted_by_name ? { user_id: row.user_id, name: row.posted_by_name } : undefined,
  };
}

function toPoll(row, { options = null, myVoteOptionId = null, totalVotes = null } = {}) {
  if (!row) return null;
  const poll = {
    poll_id: row.poll_id,
    question: row.question,
    description: row.description,
    status: row.status,
    ends_at: row.ends_at,
    created_by: row.created_by,
    created_by_name: row.created_by_name ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    total_votes: totalVotes ?? row.total_votes ?? 0,
    my_vote_option_id: myVoteOptionId,
    has_voted: myVoteOptionId !== null && myVoteOptionId !== undefined,
  };
  if (options) poll.options = options;
  return poll;
}

function toPollOption(row) {
  if (!row) return null;
  return {
    option_id: row.option_id,
    poll_id: row.poll_id,
    option_text: row.option_text,
    display_order: row.display_order,
    vote_count: Number(row.vote_count ?? 0),
    vote_percentage: Number(row.vote_percentage ?? 0),
  };
}

function toNotification(row) {
  if (!row) return null;
  return {
    notification_id: row.notification_id,
    type: row.type,
    title: row.title,
    message: row.message,
    reference_type: row.reference_type,
    reference_id: row.reference_id,
    is_read: Boolean(row.is_read),
    created_at: row.created_at,
  };
}

module.exports = {
  toList,
  toAuthUser,
  toPublicUser,
  toStudyBuddyProfile,
  toOwnStudyBuddyProfile,
  toBuddyRequest,
  toCompetition,
  toLostFoundItem,
  toPoll,
  toPollOption,
  toNotification,
};
