'use strict';

const studyBuddyService = require('../services/studyBuddy.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, created, noContent } = require('../utils/apiResponse');
const { parsePagination } = require('../utils/pagination');

/** GET /api/study-buddy/profile/me */
const getMyProfile = asyncHandler(async (req, res) => {
  const profile = await studyBuddyService.getMyProfile(req.user.user_id);
  return sendSuccess(res, { message: 'Your study buddy profile', data: { profile } });
});

/** POST /api/study-buddy/profile */
const createMyProfile = asyncHandler(async (req, res) => {
  const profile = await studyBuddyService.createMyProfile(req.user.user_id, req.body);
  return created(res, 'Study buddy profile created', { profile });
});

/** PATCH /api/study-buddy/profile/me */
const updateMyProfile = asyncHandler(async (req, res) => {
  const profile = await studyBuddyService.updateMyProfile(req.user.user_id, req.body);
  return sendSuccess(res, { message: 'Study buddy profile updated', data: { profile } });
});

/** DELETE /api/study-buddy/profile/me */
const deleteMyProfile = asyncHandler(async (req, res) => {
  await studyBuddyService.deleteMyProfile(req.user.user_id);
  return noContent(res);
});

/** GET /api/study-buddy - browse. Contact details are never included here. */
const browse = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query);
  const { items, meta } = await studyBuddyService.browse(
    req.user.user_id,
    {
      semester: req.query.semester,
      study_style: req.query.study_style,
      wanna_meet: req.query.wanna_meet,
      subject: req.query.subject,
      q: req.query.q,
      sort: req.query.sort,
    },
    pagination
  );

  return sendSuccess(res, { message: 'Study buddies', data: { profiles: items }, meta });
});

/** GET /api/study-buddy/:userId - contacts appear only on a mutual match. */
const getByUserId = asyncHandler(async (req, res) => {
  const profile = await studyBuddyService.getProfileForViewer(req.user.user_id, req.params.userId);
  return sendSuccess(res, { message: 'Study buddy profile', data: { profile } });
});

module.exports = {
  getMyProfile,
  createMyProfile,
  updateMyProfile,
  deleteMyProfile,
  browse,
  getByUserId,
};
