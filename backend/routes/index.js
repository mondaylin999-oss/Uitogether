'use strict';

/**
 * API surface. Every router is mounted under /api.
 *
 *   /api/health           liveness + database check   (public)
 *   /api/auth             register / login / me / logout
 *   /api/profiles         the caller's account, other students' public cards
 *   /api/study-buddy      profiles + browsing        (no contact details)
 *   /api/buddy-requests   interested / accept / reject / cancel
 *   /api/matches          mutual matches             (CONTACT UNLOCKED)
 *   /api/competitions     read for all, write admin-only
 *   /api/lost-found       owner or admin may modify
 *   /api/polls            read + vote for all, manage admin-only
 *   /api/notifications    the caller's own inbox
 */

const express = require('express');

const authRoutes = require('./auth.routes');
const profileRoutes = require('./profile.routes');
const studyBuddyRoutes = require('./studyBuddy.routes');
const buddyRequestRoutes = require('./buddyRequest.routes');
const matchRoutes = require('./match.routes');
const competitionRoutes = require('./competition.routes');
const lostFoundRoutes = require('./lostFound.routes');
const pollRoutes = require('./poll.routes');
const notificationRoutes = require('./notification.routes');

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const { queryOne } = require('../config/database');

const router = express.Router();

/** GET /api/health - public. Confirms the process AND MySQL are alive. */
router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    let database = 'up';
    try {
      await queryOne('SELECT 1 AS ok');
    } catch {
      database = 'down';
    }

    return sendSuccess(res, {
      message: 'UITogether API is running',
      data: {
        status: 'ok',
        database,
        uptime_seconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      },
    });
  })
);

router.use('/auth', authRoutes);
router.use('/profiles', profileRoutes);
router.use('/study-buddy', studyBuddyRoutes);
router.use('/buddy-requests', buddyRequestRoutes);
router.use('/matches', matchRoutes);
router.use('/competitions', competitionRoutes);
router.use('/lost-found', lostFoundRoutes);
router.use('/polls', pollRoutes);
router.use('/notifications', notificationRoutes);

module.exports = router;
