'use strict';

/**
 * Centralised environment configuration.
 *
 * Nothing else in the codebase reads process.env directly - everything
 * imports this module. That keeps defaults in one place and makes it
 * impossible to silently depend on an undocumented variable.
 */

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const toBool = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on', 'required', 'require'].includes(String(value).toLowerCase());
};

const toList = (value, fallback) =>
  (value ? String(value) : fallback)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

/**
 * Managed PostgreSQL providers (Render, Neon, Supabase...) hand out a single
 * connection URI instead of five separate variables. Render injects
 * DATABASE_URL automatically from the database declared in render.yaml. When
 * it is present it supplies every field; the individual DB_* variables remain
 * the local-development path and take precedence as per-field overrides.
 *
 * @param {string|undefined} value
 * @returns {{host?:string, port?:number, user?:string, password?:string, database?:string, ssl?:boolean}}
 */
function parseDatabaseUrl(value) {
  if (!value) return {};

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`DATABASE_URL is not a valid URI: ${value}`);
  }

  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  const sslMode = url.searchParams.get('sslmode') || url.searchParams.get('ssl-mode');

  return {
    host: url.hostname || undefined,
    port: url.port ? Number.parseInt(url.port, 10) : undefined,
    user: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    database: database || undefined,
    ssl: sslMode ? !['disable', 'disabled', 'allow'].includes(sslMode.toLowerCase()) : undefined,
  };
}

const dbUrl = parseDatabaseUrl(process.env.DATABASE_URL);

/**
 * Turn 'example.com', 'https://example.com/' and 'http://localhost:5500' into
 * the exact origin string a browser puts in the Origin header.
 *
 * @param {string[]} values
 * @returns {string[]}
 */
function toOrigins(values) {
  const origins = new Set();

  for (const value of values) {
    const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    try {
      origins.add(new URL(withScheme).origin);
    } catch {
      // Unparseable entry - keep it as written so the misconfiguration is
      // visible in the startup log rather than silently dropped.
      origins.add(value);
    }
  }

  return [...origins];
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: (process.env.NODE_ENV || 'development') === 'production',
  port: toInt(process.env.PORT, 5000),

  db: {
    host: process.env.DB_HOST || dbUrl.host || '127.0.0.1',
    port: toInt(process.env.DB_PORT, dbUrl.port || 5432),
    user: process.env.DB_USER || dbUrl.user || 'postgres',
    password: process.env.DB_PASSWORD || dbUrl.password || '',
    database: process.env.DB_NAME || dbUrl.database || 'uitogether_db',
    connectionLimit: toInt(process.env.DB_CONNECTION_LIMIT, 10),
    // The database CREATE DATABASE is issued from, because PostgreSQL always
    // connects to some database. Only scripts/db/create-database.js uses it.
    maintenanceDatabase: process.env.DB_MAINTENANCE_NAME || 'postgres',
    // Hosted PostgreSQL requires TLS. Render's EXTERNAL connection string
    // needs it; the internal one (same region, private network) does not.
    ssl: toBool(process.env.DB_SSL, dbUrl.ssl ?? false),
    sslCa: process.env.DB_SSL_CA || null,
  },

  jwt: {
    secret: process.env.JWT_SECRET || '',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    cookieName: process.env.JWT_COOKIE_NAME || 'uitogether_token',
  },

  bcryptRounds: toInt(process.env.BCRYPT_SALT_ROUNDS, 12),

  // Comma separated list - the frontend will be served from a different origin.
  // Entries are normalised to full origins, because Render's `fromService`
  // substitution supplies a bare hostname while the browser sends a scheme.
  clientUrls: toOrigins(
    toList(process.env.CLIENT_URL, 'http://localhost:5173,http://127.0.0.1:5500')
  ),

  rateLimit: {
    windowMs: toInt(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    max: toInt(process.env.RATE_LIMIT_MAX, 300),
    authMax: toInt(process.env.RATE_LIMIT_AUTH_MAX, 20),
  },
};

/**
 * Fail fast with an actionable message instead of throwing a confusing
 * error deep inside a request handler.
 *
 * @param {{ requireJwt?: boolean }} options
 */
function validateEnv({ requireJwt = true } = {}) {
  const problems = [];

  if (!env.db.database) problems.push('DB_NAME is missing');
  if (!env.db.user) problems.push('DB_USER is missing');

  if (requireJwt) {
    if (!env.jwt.secret) {
      problems.push('JWT_SECRET is missing');
    } else if (env.jwt.secret.length < 32) {
      problems.push('JWT_SECRET is too short (use at least 32 characters)');
    }
  }

  if (env.isProduction && !env.db.password) {
    problems.push('DB_PASSWORD must be set in production');
  }

  if (problems.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n  - ${problems.join('\n  - ')}\n\n` +
        'Copy backend/.env.example to backend/.env and fill in the values.\n' +
        'Generate a secret with:  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
    );
  }

  return env;
}

module.exports = { env, validateEnv };
