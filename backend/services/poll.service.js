'use strict';

/**
 * Polls / voting.
 * Admin creates and manages polls; students vote.
 * ONE VOTE PER USER PER POLL is a UNIQUE key in MySQL, so a race between two
 * simultaneous votes ends in a 409 rather than two rows.
 */

const pollRepository = require('../repositories/poll.repository');
const notificationService = require('./notification.service');
const { toPoll, toPollOption } = require('../utils/serializers');
const { buildMeta } = require('../utils/pagination');
const { POLL_STATUS } = require('../config/constants');
const ApiError = require('../utils/ApiError');

/**
 * @param {object} filters
 * @param {{ page: number, limit: number, offset: number }} pagination
 * @param {number|null} viewerId  used to flag the viewer's own vote
 */
async function list(filters, pagination, viewerId = null) {
  const { rows, total } = await pollRepository.list(filters, pagination);
  const pollIds = rows.map((row) => row.poll_id);

  const [optionRows, myVotes] = await Promise.all([
    pollRepository.findResultsForPolls(pollIds),
    viewerId ? pollRepository.findUserVotesForPolls(pollIds, viewerId) : new Map(),
  ]);

  const optionsByPoll = new Map();
  optionRows.forEach((row) => {
    if (!optionsByPoll.has(row.poll_id)) optionsByPoll.set(row.poll_id, []);
    optionsByPoll.get(row.poll_id).push(toPollOption(row));
  });

  const items = rows.map((row) =>
    toPoll(row, {
      options: optionsByPoll.get(row.poll_id) ?? [],
      myVoteOptionId: myVotes.get(row.poll_id) ?? null,
      totalVotes: Number(row.total_votes ?? 0),
    })
  );

  return { items, meta: buildMeta(pagination, total) };
}

/**
 * @param {number} pollId
 * @param {number|null} viewerId
 */
async function getById(pollId, viewerId = null) {
  const row = await pollRepository.findById(pollId);
  if (!row) throw ApiError.notFound('Poll not found');

  const options = (await pollRepository.findResults(pollId)).map(toPollOption);
  const myVote = viewerId ? await pollRepository.findUserVote(pollId, viewerId) : null;

  return toPoll(row, {
    options,
    myVoteOptionId: myVote ? myVote.option_id : null,
    totalVotes: Number(row.total_votes ?? 0),
  });
}

/**
 * @param {{ question: string, description?: string, ends_at?: string|null, options: string[] }} data
 * @param {{ user_id: number }} admin
 */
async function create(data, admin) {
  const options = (data.options || []).map((option) => String(option).trim()).filter(Boolean);
  const unique = new Set(options.map((option) => option.toLowerCase()));

  if (options.length < 2) {
    throw ApiError.unprocessable('A poll needs at least 2 options', [
      { field: 'options', message: 'Provide at least 2 options' },
    ]);
  }
  if (unique.size !== options.length) {
    throw ApiError.unprocessable('Poll options must be unique', [
      { field: 'options', message: 'Duplicate option text' },
    ]);
  }

  const pollId = await pollRepository.createWithOptions({ ...data, options }, admin.user_id);
  const poll = await getById(pollId, admin.user_id);

  await notificationService.emitNewPoll({ adminUserId: admin.user_id, poll });
  return poll;
}

async function update(pollId, data, viewerId) {
  const existing = await pollRepository.findById(pollId);
  if (!existing) throw ApiError.notFound('Poll not found');

  await pollRepository.update(pollId, data);
  return getById(pollId, viewerId);
}

async function remove(pollId) {
  const existing = await pollRepository.findById(pollId);
  if (!existing) throw ApiError.notFound('Poll not found');

  // poll_options and votes are removed by ON DELETE CASCADE.
  await pollRepository.remove(pollId);
  return true;
}

/**
 * Cast a vote.
 *
 * @param {number} pollId
 * @param {number} optionId
 * @param {number} userId
 */
async function vote(pollId, optionId, userId) {
  const poll = await pollRepository.findById(pollId);
  if (!poll) throw ApiError.notFound('Poll not found');

  if (poll.status !== POLL_STATUS.OPEN) throw ApiError.conflict('This poll is closed');
  if (poll.ends_at && new Date(poll.ends_at).getTime() <= Date.now()) {
    throw ApiError.conflict('This poll has ended');
  }

  const option = await pollRepository.findOptionById(optionId);
  if (!option || Number(option.poll_id) !== Number(pollId)) {
    throw ApiError.badRequest('That option does not belong to this poll');
  }

  const existingVote = await pollRepository.findUserVote(pollId, userId);
  if (existingVote) throw ApiError.conflict('You have already voted in this poll');

  // uq_votes_one_per_poll still protects against a concurrent duplicate here;
  // the error middleware maps ER_DUP_ENTRY to the same 409 message.
  await pollRepository.castVote(pollId, optionId, userId);
  return getById(pollId, userId);
}

/** Results are public to any authenticated user. */
async function getResults(pollId, viewerId = null) {
  const poll = await pollRepository.findById(pollId);
  if (!poll) throw ApiError.notFound('Poll not found');

  const options = (await pollRepository.findResults(pollId)).map(toPollOption);
  const myVote = viewerId ? await pollRepository.findUserVote(pollId, viewerId) : null;

  return {
    poll_id: poll.poll_id,
    question: poll.question,
    status: poll.status,
    total_votes: Number(poll.total_votes ?? 0),
    my_vote_option_id: myVote ? myVote.option_id : null,
    options,
  };
}

module.exports = { list, getById, create, update, remove, vote, getResults };
