'use strict';

/**
 * `npm run db:setup`
 *
 * The single command that takes a bare MySQL server to a fully built
 * uitogether_db:  create database  ->  apply all migrations  ->  summary.
 * You never create a table or write SQL by hand.
 */

const { createDatabase } = require('./create-database');
const { migrate } = require('./migrate');
const { validateEnv } = require('../../config/env');
const { describeTarget } = require('../../config/database');
const logger = require('../../utils/logger');

async function setup() {
  // JWT is irrelevant to database work, so it is not required here.
  validateEnv({ requireJwt: false });

  logger.info('--- UITogether database setup ---');
  logger.info(`Target: ${describeTarget()}`);

  await createDatabase();
  const result = await migrate();

  logger.info('--- Setup complete ---');
  logger.info('Next:  npm run db:seed   (optional demo data)');
  logger.info('Then:  npm run dev');

  return result;
}

module.exports = { setup };

if (require.main === module) {
  setup()
    .then(() => process.exit(0))
    .catch((error) => {
      logger.error(error.friendlyMessage || error.message);
      process.exit(1);
    });
}
