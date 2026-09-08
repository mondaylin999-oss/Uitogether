'use strict';

/**
 * MySQL connection pool + the only three ways the app talks to the DB:
 *
 *   query(sql, params)     -> rows            (prepared statement)
 *   queryOne(sql, params)  -> first row|null  (prepared statement)
 *   withTransaction(fn)    -> fn(connection)  (BEGIN / COMMIT / ROLLBACK)
 *
 * EVERY call goes through mysql2's `execute`, which sends the SQL and the
 * values to the server separately. Values are therefore never concatenated
 * into SQL text - that is our SQL-injection prevention. Any place that needs
 * a dynamic column/direction (e.g. ORDER BY) must pick it from a hard-coded
 * allow-list, never from raw user input.
 */

const mysql = require('mysql2/promise');
const { env } = require('./env');
const logger = require('../utils/logger');

let pool = null;

/**
 * Connection settings shared by the pool AND the backend/scripts/db/* tools.
 *
 * When DB_SOCKET is set we connect over a UNIX socket and host/port are
 * ignored - some MySQL installs listen on a socket only.
 *
 * @param {{ withDatabase?: boolean }} [options]
 * @returns {Record<string, *>}
 */
function baseConnectionConfig({ withDatabase = true } = {}) {
  const config = {
    user: env.db.user,
    password: env.db.password,
  };

  if (env.db.socketPath) {
    config.socketPath = env.db.socketPath;
  } else {
    config.host = env.db.host;
    config.port = env.db.port;
  }

  if (withDatabase) config.database = env.db.database;
  return config;
}

/** Human readable target, for log lines and error messages. */
function describeTarget() {
  const where = env.db.socketPath
    ? `socket ${env.db.socketPath}`
    : `${env.db.host}:${env.db.port}`;
  return `${env.db.user}@${where}/${env.db.database}`;
}

/**
 * @param {Partial<typeof env.db>} [overrides]
 * @returns {import('mysql2/promise').Pool}
 */
function createPool(overrides = {}) {
  return mysql.createPool({
    ...baseConnectionConfig(),
    waitForConnections: true,
    connectionLimit: env.db.connectionLimit,
    queueLimit: 0,
    charset: 'utf8mb4_unicode_ci',
    // DATE / TIME columns come back as plain strings ('2026-09-20', '09:00:00')
    // so no timezone maths can shift an event by a day.
    dateStrings: ['DATE', 'TIME'],
    supportBigNumbers: true,
    ...overrides,
  });
}

/** @returns {import('mysql2/promise').Pool} */
function getPool() {
  if (!pool) pool = createPool();
  return pool;
}

/**
 * Run a parameterised query.
 * @param {string} sql
 * @param {Array<*>} [params]
 * @returns {Promise<any>} rows for SELECT, ResultSetHeader for writes
 */
async function query(sql, params = []) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

/**
 * Run a parameterised query and return the first row (or null).
 * @param {string} sql
 * @param {Array<*>} [params]
 */
async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

/**
 * Run `fn` inside a transaction. Commits on resolve, rolls back on throw.
 * The callback receives a dedicated connection - use conn.execute(...) on it,
 * NOT the module-level query(), or the statement will run outside the tx.
 *
 * @template T
 * @param {(conn: import('mysql2/promise').PoolConnection) => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withTransaction(fn) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const result = await fn(connection);
    await connection.commit();
    return result;
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      logger.error('Transaction rollback failed', rollbackError);
    }
    throw error;
  } finally {
    connection.release();
  }
}

/** Verify the database is reachable at boot so we fail loudly, not lazily. */
async function assertConnection() {
  const connection = await getPool().getConnection();
  try {
    await connection.ping();
    logger.info(`MySQL connected -> ${describeTarget()}`);
  } finally {
    connection.release();
  }
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  baseConnectionConfig,
  describeTarget,
  createPool,
  getPool,
  query,
  queryOne,
  withTransaction,
  assertConnection,
  closePool,
};
