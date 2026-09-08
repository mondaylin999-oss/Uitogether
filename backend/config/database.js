'use strict';

/**
 * PostgreSQL connection pool + the only three ways the app talks to the DB:
 *
 *   query(sql, params)     -> rows            (parameterised)
 *   queryOne(sql, params)  -> first row|null  (parameterised)
 *   withTransaction(fn)    -> fn(client)      (BEGIN / COMMIT / ROLLBACK)
 *
 * EVERY call goes through node-postgres' extended query protocol, which sends
 * the SQL and the values to the server separately. Values are therefore never
 * concatenated into SQL text - that is our SQL-injection prevention. Any place
 * that needs a dynamic column/direction (e.g. ORDER BY) must pick it from a
 * hard-coded allow-list, never from raw user input.
 *
 * PORTED FROM MySQL (mysql2). Two compatibility shims live here so the
 * repository layer did not have to be rewritten line by line:
 *
 *   1. Placeholders. The repositories write MySQL's `?`; PostgreSQL wants
 *      `$1, $2, ...`. toPositional() rewrites them, skipping anything inside
 *      a string literal, a quoted identifier or a comment.
 *
 *   2. Write results. mysql2 returned a ResultSetHeader with `insertId` and
 *      `affectedRows`. query() returns the row array as before, but with
 *      those two properties attached (non-enumerable, so JSON.stringify and
 *      iteration are unaffected). `insertId` is only populated when the
 *      statement ends in RETURNING - see the create() functions.
 */

const { Pool, types } = require('pg');
const { env } = require('./env');
const logger = require('../utils/logger');

let pool = null;

// --- type parsers -----------------------------------------------------------
// mysql2 was configured with `dateStrings: ['DATE', 'TIME']` so a DATE came
// back as '2026-09-20' and a TIME as '09:00:00', with no timezone maths able
// to shift an event by a day. node-postgres turns DATE into a JS Date by
// default, which would reintroduce exactly that bug, so DATE is parsed as the
// raw string instead. (TIME already arrives as a string.)
types.setTypeParser(types.builtins.DATE, (value) => value);

// COUNT(*) is int8 and NUMERIC is arbitrary-precision, so node-postgres hands
// both back as STRINGS to avoid silent precision loss. Every value we store in
// them is a small count or a percentage, and the API used to emit numbers, so
// they are parsed back to numbers to keep the JSON responses unchanged.
types.setTypeParser(types.builtins.INT8, (value) => (value === null ? null : Number(value)));
types.setTypeParser(types.builtins.NUMERIC, (value) =>
  value === null ? null : Number.parseFloat(value)
);

/**
 * Rewrite MySQL-style `?` placeholders as PostgreSQL's `$1, $2, ...`.
 *
 * A naive `sql.replace(/\?/g, ...)` would corrupt any question mark that is
 * part of a value rather than a placeholder, so this walks the string and
 * ignores '...' literals, "..." identifiers, -- line comments and block
 * comments.
 *
 * @param {string} sql
 * @returns {string}
 */
function toPositional(sql) {
  let out = '';
  let index = 0;

  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      out += char;
      if (char === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      out += char;
      if (char === '*' && next === '/') {
        out += next;
        i += 1;
        inBlockComment = false;
      }
      continue;
    }
    if (inSingle) {
      out += char;
      // '' is an escaped quote inside a literal, not the end of it.
      if (char === "'" && next === "'") {
        out += next;
        i += 1;
      } else if (char === "'") {
        inSingle = false;
      }
      continue;
    }
    if (inDouble) {
      out += char;
      if (char === '"') inDouble = false;
      continue;
    }

    if (char === '-' && next === '-') inLineComment = true;
    else if (char === '/' && next === '*') inBlockComment = true;
    else if (char === "'") inSingle = true;
    else if (char === '"') inDouble = true;
    else if (char === '?') {
      index += 1;
      out += `$${index}`;
      continue;
    }

    out += char;
  }

  return out;
}

/**
 * Attach mysql2's ResultSetHeader fields to the row array, so call sites can
 * keep reading `result.affectedRows` and `result.insertId`.
 *
 * @param {import('pg').QueryResult} result
 * @returns {Array<any>}
 */
function decorate(result) {
  const rows = result.rows;

  // For a RETURNING statement, take the first returned column of the first
  // row - the create() functions all return their own primary key.
  let insertId = 0;
  if (rows.length > 0) {
    const first = rows[0];
    const firstField = result.fields && result.fields.length > 0 ? result.fields[0].name : null;
    if (firstField && first[firstField] !== undefined) insertId = first[firstField];
  }

  Object.defineProperty(rows, 'affectedRows', { value: result.rowCount ?? 0, enumerable: false });
  Object.defineProperty(rows, 'insertId', { value: insertId, enumerable: false });
  return rows;
}

/**
 * Connection settings shared by the pool AND the backend/scripts/db/* tools.
 *
 * A managed provider (Render, Neon, Supabase...) supplies one DATABASE_URL,
 * which config/env.js has already split into these fields.
 *
 * @param {{ withDatabase?: boolean }} [options]
 * @returns {Record<string, *>}
 */
function baseConnectionConfig({ withDatabase = true } = {}) {
  const config = {
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    // Connecting with no application database selected is not a thing in
    // PostgreSQL - you always connect to SOME database. `postgres` is the
    // maintenance database every server ships with, and it is what
    // scripts/db/create-database.js uses to issue CREATE DATABASE.
    database: withDatabase ? env.db.database : env.db.maintenanceDatabase,
  };

  // Hosted PostgreSQL only accepts TLS. Render's internal connection string
  // is the exception, so this stays driven by DB_SSL rather than forced on.
  if (env.db.ssl) {
    config.ssl = env.db.sslCa
      ? { ca: env.db.sslCa, rejectUnauthorized: true }
      : // Managed providers terminate TLS with a certificate signed by their
        // own CA, which is not in Node's trust store. The connection is still
        // encrypted; set DB_SSL_CA to also verify the chain.
        { rejectUnauthorized: false };
  }

  return config;
}

/** Human readable target, for log lines and error messages. */
function describeTarget() {
  return `${env.db.user}@${env.db.host}:${env.db.port}/${env.db.database}`;
}

/**
 * @param {Record<string, *>} [overrides]
 * @returns {import('pg').Pool}
 */
function createPool(overrides = {}) {
  return new Pool({
    ...baseConnectionConfig(),
    max: env.db.connectionLimit,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ...overrides,
  });
}

/** @returns {import('pg').Pool} */
function getPool() {
  if (!pool) {
    pool = createPool();
    // Without a listener, a dropped idle connection crashes the process.
    // Free-tier databases idle out constantly, so this is not theoretical.
    pool.on('error', (error) => logger.error('Idle PostgreSQL client error', error.message));
  }
  return pool;
}

/**
 * Run a parameterised query.
 * @param {string} sql   may use MySQL-style `?` placeholders
 * @param {Array<*>} [params]
 * @returns {Promise<any>} rows, carrying .affectedRows and .insertId
 */
async function query(sql, params = []) {
  const result = await getPool().query(toPositional(sql), params);
  return decorate(result);
}

/**
 * Run a parameterised query and return the first row (or null).
 * @param {string} sql
 * @param {Array<*>} [params]
 */
async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Run `fn` inside a transaction. Commits on resolve, rolls back on throw.
 *
 * The callback receives a wrapper exposing the same query()/queryOne() pair as
 * this module, bound to one dedicated connection. Use those, NOT the
 * module-level query(), or the statement will run outside the transaction.
 *
 * @template T
 * @param {(tx: { query: Function, queryOne: Function, client: import('pg').PoolClient }) => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withTransaction(fn) {
  const client = await getPool().connect();

  const tx = {
    client,
    async query(sql, params = []) {
      return decorate(await client.query(toPositional(sql), params));
    },
    async queryOne(sql, params = []) {
      const rows = await tx.query(sql, params);
      return rows.length > 0 ? rows[0] : null;
    },
  };

  try {
    await client.query('BEGIN');
    const result = await fn(tx);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      logger.error('Transaction rollback failed', rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}

/** Verify the database is reachable at boot so we fail loudly, not lazily. */
async function assertConnection() {
  const client = await getPool().connect();
  try {
    await client.query('SELECT 1');
    logger.info(`PostgreSQL connected -> ${describeTarget()}`);
  } finally {
    client.release();
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
  toPositional,
};
