'use strict';

/**
 * `npm run db:reset`  -  DESTRUCTIVE.
 *
 * Drops uitogether_db entirely, rebuilds it from the migrations and reloads
 * the demo seed. Refuses to run in production, and asks for confirmation
 * unless `--yes` is passed.
 */

const readline = require('readline');
const mysql = require('mysql2/promise');

const { env, validateEnv } = require('../../config/env');
const { baseConnectionConfig } = require('../../config/database');
const { assertSafeIdentifier, explainConnectionError } = require('./create-database');
const { setup } = require('./setup');
const { seed } = require('./seed');
const logger = require('../../utils/logger');

/** @returns {Promise<boolean>} */
function confirm(question) {
  if (process.argv.includes('--yes') || process.argv.includes('-y')) {
    return Promise.resolve(true);
  }
  if (!process.stdin.isTTY) {
    logger.error('Refusing to drop the database in a non-interactive shell.');
    logger.error('Re-run with:  npm run db:reset -- --yes');
    return Promise.resolve(false);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'yes');
    });
  });
}

async function dropDatabase() {
  const database = assertSafeIdentifier(env.db.database);

  const connection = await mysql.createConnection(
    baseConnectionConfig({ withDatabase: false })
  );

  try {
    await connection.query(`DROP DATABASE IF EXISTS \`${database}\``);
    logger.warn(`Dropped database "${database}"`);
  } catch (error) {
    error.friendlyMessage = explainConnectionError(error);
    throw error;
  } finally {
    await connection.end();
  }
}

async function reset() {
  validateEnv({ requireJwt: false });

  if (env.isProduction) {
    throw new Error('db:reset is disabled when NODE_ENV=production');
  }

  const ok = await confirm(
    `This DELETES the database "${env.db.database}" and all its data.\nType "yes" to continue: `
  );
  if (!ok) {
    logger.info('Reset cancelled - nothing was changed');
    return false;
  }

  await dropDatabase();
  await setup();
  await seed();

  logger.info('--- Reset complete ---');
  return true;
}

module.exports = { reset, dropDatabase };

if (require.main === module) {
  reset()
    .then((done) => process.exit(done ? 0 : 1))
    .catch((error) => {
      logger.error(error.friendlyMessage || error.message);
      process.exit(1);
    });
}
