'use strict';

/**
 * Step 1 of `npm run db:setup`.
 *
 * Connects to the MySQL SERVER (no database selected) and creates
 * uitogether_db if it is missing. This is what removes the need for you to
 * open Workbench and create anything by hand.
 */

const mysql = require('mysql2/promise');
const { env } = require('../../config/env');
const { baseConnectionConfig } = require('../../config/database');
const logger = require('../../utils/logger');

/**
 * A database name cannot be a bound parameter, so it is validated against a
 * strict identifier pattern and then back-quoted.
 * @param {string} name
 */
function assertSafeIdentifier(name) {
  if (!/^[A-Za-z0-9_]{1,64}$/.test(name)) {
    throw new Error(
      `Unsafe DB_NAME "${name}". Use letters, digits and underscores only (max 64).`
    );
  }
  return name;
}

/** Turn driver errors into instructions the user can actually act on. */
function explainConnectionError(error) {
  if (error.code === 'ECONNREFUSED') {
    return [
      `Cannot reach MySQL at ${env.db.host}:${env.db.port}.`,
      'The server may be running WITHOUT a TCP listener (socket only).',
      'Either fix DB_HOST / DB_PORT in backend/.env, or connect via socket:',
      '',
      '      DB_SOCKET=/tmp/mysql.sock          # macOS /usr/local/mysql default',
      '      DB_SOCKET=/Applications/MAMP/tmp/mysql/mysql.sock   # MAMP',
      '',
      '  (MAMP also listens on TCP port 8889.)',
    ].join('\n  ');
  }

  if (error.code === 'ENOENT' && env.db.socketPath) {
    return [
      `No MySQL socket at ${env.db.socketPath}.`,
      'Check DB_SOCKET in backend/.env, or clear it and use DB_HOST/DB_PORT.',
    ].join('\n  ');
  }

  if (error.code === 'ER_ACCESS_DENIED_ERROR') {
    return [
      `MySQL rejected the credentials for user "${env.db.user}".`,
      'Fix DB_USER / DB_PASSWORD in backend/.env and run this again.',
    ].join('\n  ');
  }

  if (error.code === 'ER_DBACCESS_DENIED_ERROR' || error.errno === 1044) {
    return [
      `User "${env.db.user}" is not allowed to create databases.`,
      '',
      '  >>> THE ONE MANUAL STEP <<<',
      `  Ask your MySQL admin (or use a root account) to run exactly:`,
      '',
      `      CREATE DATABASE ${env.db.database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
      `      GRANT ALL PRIVILEGES ON ${env.db.database}.* TO '${env.db.user}'@'${env.db.host}';`,
      '',
      '  Then re-run `npm run db:setup` - it will create every table for you.',
      '  You never need to write any table SQL yourself.',
    ].join('\n  ');
  }

  return error.message;
}

/** @returns {Promise<{ created: boolean, database: string }>} */
async function createDatabase() {
  const database = assertSafeIdentifier(env.db.database);

  let connection;
  try {
    connection = await mysql.createConnection({
      ...baseConnectionConfig({ withDatabase: false }),
      multipleStatements: false,
    });
  } catch (error) {
    error.friendlyMessage = explainConnectionError(error);
    throw error;
  }

  try {
    const [before] = await connection.query(
      'SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?',
      [database]
    );
    const existed = before.length > 0;

    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\`
         CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );

    if (existed) {
      logger.info(`Database "${database}" already exists - leaving it untouched`);
    } else {
      logger.info(`Database "${database}" created (utf8mb4 / utf8mb4_unicode_ci)`);
    }

    return { created: !existed, database };
  } catch (error) {
    error.friendlyMessage = explainConnectionError(error);
    throw error;
  } finally {
    await connection.end();
  }
}

module.exports = { createDatabase, assertSafeIdentifier, explainConnectionError };

// Allow `node scripts/db/create-database.js` on its own.
if (require.main === module) {
  createDatabase()
    .then(() => process.exit(0))
    .catch((error) => {
      logger.error(error.friendlyMessage || error.message);
      process.exit(1);
    });
}
