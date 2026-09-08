'use strict';

// Vercel serverless entrypoint for the existing Express app.
const app = require('../app');
const { validateEnv } = require('../config/env');

// Fail fast on missing critical env vars in production.
validateEnv({ requireJwt: true });

module.exports = app;
