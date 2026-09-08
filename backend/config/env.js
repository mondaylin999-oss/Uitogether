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

const toList = (value, fallback) =>
  (value ? String(value) : fallback)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: (process.env.NODE_ENV || 'development') === 'production',
  port: toInt(process.env.PORT, 5000),

  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: toInt(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'uitogether_db',
    connectionLimit: toInt(process.env.DB_CONNECTION_LIMIT, 10),
    // Optional: connect over a UNIX socket instead of TCP. Some MySQL
    // installs (including the default macOS /usr/local/mysql build) listen
    // only on a socket. When set, host/port are ignored.
    socketPath: process.env.DB_SOCKET || null,
  },

  jwt: {
    secret: process.env.JWT_SECRET || '',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    cookieName: process.env.JWT_COOKIE_NAME || 'uitogether_token',
  },

  bcryptRounds: toInt(process.env.BCRYPT_SALT_ROUNDS, 12),

  // Comma separated list - the frontend will be served from a different origin.
  clientUrls: toList(process.env.CLIENT_URL, 'http://localhost:5173,http://127.0.0.1:5500'),

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
