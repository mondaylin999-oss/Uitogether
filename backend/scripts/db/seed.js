'use strict';

/**
 * `npm run db:seed`
 *
 * Loads database/seed.sql - clearly-labelled DEMO data only. Every statement
 * uses ON CONFLICT DO NOTHING with explicit ids, so running it twice changes
 * nothing.
 */

const path = require('path');
const fs = require('fs');

const { connect } = require('./migrate');
const { runSqlFile } = require('./sql-runner');
const { validateEnv } = require('../../config/env');
const logger = require('../../utils/logger');

const SEED_FILE = path.resolve(__dirname, '..', '..', '..', 'database', 'seed.sql');

async function seed() {
  validateEnv({ requireJwt: false });

  if (!fs.existsSync(SEED_FILE)) {
    throw new Error(`Seed file not found: ${SEED_FILE}`);
  }

  const connection = await connect();
  try {
    const count = await runSqlFile(connection, SEED_FILE);
    logger.info(`Seeded demo data (${count} statements from seed.sql)`);
    logger.info('Demo logins:  admin.uitogether@gmail.com / Admin@123');
    logger.info('              aung.kyaw.dev@gmail.com    / Student@123');
    return count;
  } finally {
    await connection.end();
  }
}

module.exports = { seed, SEED_FILE };

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch((error) => {
      logger.error(error.friendlyMessage || error.message);
      if (error.code === '42P01') {
        logger.error('Tables are missing. Run `npm run db:setup` first.');
      }
      process.exit(1);
    });
}
