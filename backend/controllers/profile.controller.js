'use strict';

const profileService = require('../services/profile.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');

/** GET /api/profiles/me */
const getMe = asyncHandler(async (req, res) => {
  const user = await profileService.getMyAccount(req.user.user_id);
  return sendSuccess(res, { message: 'Your account', data: { user } });
});

/** PATCH /api/profiles/me */
const updateMe = asyncHandler(async (req, res) => {
  const user = await profileService.updateMyAccount(req.user.user_id, req.body);
  return sendSuccess(res, { message: 'Account updated', data: { user } });
});

/** PATCH /api/profiles/me/password */
const changePassword = asyncHandler(async (req, res) => {
  await profileService.changePassword(req.user.user_id, {
    current_password: req.body.current_password,
    new_password: req.body.new_password,
  });
  return sendSuccess(res, { message: 'Password updated successfully', data: null });
});

/** GET /api/profiles/:userId */
const getPublicUser = asyncHandler(async (req, res) => {
  const user = await profileService.getPublicUser(req.params.userId);
  return sendSuccess(res, { message: 'Student profile', data: { user } });
});

module.exports = { getMe, updateMe, changePassword, getPublicUser };
