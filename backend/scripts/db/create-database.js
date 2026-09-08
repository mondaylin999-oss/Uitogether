'use strict';

/**
 * Step 1 of `npm run db:setup`.
 *
 * Connects to the `postgres` maintenance database and creates uitogether_db if
 * it is missing. This is what removes the need for you to open psql or pgAdmin
 * and create anything by hand.
 *
 * ON A MANAGED HOST (Render, Neon, Supabase) the database is created for you
 * when you provision it, and your role usually has no CREATEDB privilege. That
 * is not an error: the "already exists" and "not permitted" paths below both
 * report and continue, so `npm run db:setup` still goes on to migrate.
 */

const { Client } = require('pg');
const { env } = require('../../config/env');
const { baseConnectionConfig } = require('../../config/database');
const logger = require('../../utils/logger');

/**
 * A database name cannot be a bound parameter, so it is validated against a
 * strict identifier pattern and then double-quoted.
 * @param {string} name
 */
function assertSafeIdentifier(name) {
  if (!/^[A-Za-z0-9_]{1,63}$/.test(name)) {
    throw new Error(
      `Unsafe DB_NAME "${name}". Use letters, digits and underscores only (max 63).`
    );
  }
  return name;
}

/** Turn driver errors into instructions the user can actually act on. */
function explainConnectionError(error) {
  if (error.code === 'ECONNREFUSED') {
    return [
      `Cannot reach PostgreSQL at ${env.db.host}:${env.db.port}.`,
      'Check that the server is running and that DB_HOST / DB_PORT in',
      'backend/.env point at it. On a hosted database, set DATABASE_URL',
      'instead and make sure DB_SSL=true.',
    ].join('\n  ');
  }

  if (error.code === 'ENOTFOUND') {
    return [
      `Host "${env.db.host}" could not be resolved.`,
      'Check DATABASE_URL (or DB_HOST) for a typo.',
    ].join('\n  ');
  }

  // 28P01 invalid_password, 28000 invalid_authorization_specification
  if (error.code === '28P01' || error.code === '28000') {
    return [
      `PostgreSQL rejected the credentials for user "${env.db.user}".`,
      'Fix DB_USER / DB_PASSWORD (or DATABASE_URL) in backend/.env and run this again.',
    ].join('\n  ');
  }

  if (/self.signed certificate|certificate/i.test(error.message || '')) {
    return [
      'The database TLS certificate was rejected.',
      'Hosted providers sign with their own CA. Set DB_SSL=true and leave',
      'DB_SSL_CA empty, or paste the provider CA bundle into DB_SSL_CA.',
    ].join('\n  ');
  }

  return error.message;
}

/** @returns {Promise<{ created: boolean, database: string }>} */
async function createDatabase() {
  const database = assertSafeIdentifier(env.db.database);

  const client = new Client(baseConnectionConfig({ withDatabase: false }));

  try {
    await client.connect();
  } catch (error) {
    error.friendlyMessage = explainConnectionError(error);
    throw error;
  }

  try {
    const { rows } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      database,
    ]);

    if (rows.length > 0) {
      logger.info(`Database "${database}" already exists - leaving it untouched`);
      return { created: false, database };
    }

    // PostgreSQL has no CREATE DATABASE IF NOT EXISTS, hence the check above.
    await client.query(`CREATE DATABASE "${database}" ENCODING 'UTF8'`);
    logger.info(`Database "${database}" created (UTF8)`);
    return { created: true, database };
  } catch (error) {
    // 42501 insufficient_privilege - normal on a managed host, where the
    // database already exists and the role cannot create others.
    if (error.code === '42501') {
      logger.warn(
        `Not permitted to create databases as "${env.db.user}" - assuming ` +
          `"${database}" already exists (normal on a managed host).`
      );
      return { created: false, database };
    }
    error.friendlyMessage = explainConnectionError(error);
    throw error;
  } finally {
    await client.end();
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
