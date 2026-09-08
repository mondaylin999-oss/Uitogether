'use strict';

/**
 * Single source of truth for every ENUM that also exists in MySQL.
 * Validators and services import from here so the DB and the API can
 * never drift apart.
 */

const ROLES = Object.freeze({ STUDENT: 'student', ADMIN: 'admin' });

const REQUEST_STATUS = Object.freeze({
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
});

const STUDY_STYLES = Object.freeze([
  'solo_focus',
  'group_discussion',
  'quiet_library',
  'online_call',
  'mixed',
]);

const WANNA_MEET = Object.freeze(['online', 'in_person', 'both']);

const LOST_FOUND_TYPE = Object.freeze({ LOST: 'lost', FOUND: 'found' });
const LOST_FOUND_STATUS = Object.freeze({ ACTIVE: 'active', RESOLVED: 'resolved' });

const POLL_STATUS = Object.freeze({ OPEN: 'open', CLOSED: 'closed' });

const NOTIFICATION_TYPE = Object.freeze({
  BUDDY_REQUEST: 'buddy_request',
  BUDDY_REQUEST_ACCEPTED: 'buddy_request_accepted',
  BUDDY_REQUEST_REJECTED: 'buddy_request_rejected',
  NEW_COMPETITION: 'new_competition',
  NEW_LOST_FOUND: 'new_lost_found',
  NEW_POLL: 'new_poll',
});

const REFERENCE_TYPE = Object.freeze({
  BUDDY_REQUEST: 'buddy_request',
  COMPETITION: 'competition',
  LOST_FOUND: 'lost_found',
  POLL: 'poll',
});

const PAGINATION = Object.freeze({ DEFAULT_LIMIT: 20, MAX_LIMIT: 100 });

/**
 * Any valid email domain may register (gmail, yahoo, outlook, university
 * addresses...). This is NOT OAuth - the password is a UITogether account
 * password.
 *
 * Mirrors chk_users_email_format from migration 009. Note the DB copy is
 * effectively case-INSENSITIVE (MySQL REGEXP follows the utf8mb4_unicode_ci
 * collation), which is what we want: it stops "User@x.com" and "user@x.com"
 * becoming two accounts. This JS copy is case-sensitive on purpose because
 * auth.service.normaliseEmail() lowercases the address before it gets here.
 */
const EMAIL_REGEX = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

module.exports = {
  ROLES,
  REQUEST_STATUS,
  STUDY_STYLES,
  WANNA_MEET,
  LOST_FOUND_TYPE,
  LOST_FOUND_STATUS,
  POLL_STATUS,
  NOTIFICATION_TYPE,
  REFERENCE_TYPE,
  PAGINATION,
  EMAIL_REGEX,
};
