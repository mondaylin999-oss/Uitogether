'use strict';

/**
 * Turn the raw telegram / viber values a student typed into clickable links.
 *
 * Telegram
 *   Stored as "@username" (or a t.me URL). We return
 *     url      -> https://t.me/username    (opens the app on mobile when it is
 *                                           installed, falls back to Telegram Web)
 *     app_url  -> tg://resolve?domain=username  (direct app scheme)
 *
 * Viber
 *   Stored as a phone number ("+959...") or a viber:// link. We return
 *     url      -> viber://chat?number=%2B959...   (opens the Viber app)
 *     web_url  -> https://www.viber.com/          (informational fallback,
 *                  Viber has no public web-chat deep link)
 *
 * NOTE: these builders are only ever called for a MUTUALLY MATCHED pair.
 * See buddy.service.js / profile visibility rules.
 */

/** @param {string|null|undefined} raw */
function buildTelegramLink(raw) {
  if (!raw) return null;

  const value = String(raw).trim();
  if (!value) return null;

  // Accept "@user", "user", "t.me/user", "https://t.me/user", "https://telegram.me/user"
  const username = value
    .replace(/^https?:\/\//i, '')
    .replace(/^(www\.)?(t\.me|telegram\.me)\//i, '')
    .replace(/^@/, '')
    .split(/[/?#]/)[0]
    .trim();

  if (!/^[A-Za-z0-9_]{4,32}$/.test(username)) {
    // Not a recognisable username - hand the raw value back so nothing is lost.
    return { platform: 'telegram', handle: value, url: null, app_url: null };
  }

  return {
    platform: 'telegram',
    handle: `@${username}`,
    url: `https://t.me/${username}`,
    app_url: `tg://resolve?domain=${username}`,
  };
}

/** @param {string|null|undefined} raw */
function buildViberLink(raw) {
  if (!raw) return null;

  const value = String(raw).trim();
  if (!value) return null;

  if (/^viber:\/\//i.test(value)) {
    return { platform: 'viber', handle: value, url: value, web_url: null };
  }

  if (/^https?:\/\//i.test(value)) {
    return { platform: 'viber', handle: value, url: value, web_url: value };
  }

  const digits = value.replace(/[^\d+]/g, '');
  if (!/^\+?\d{6,15}$/.test(digits)) {
    return { platform: 'viber', handle: value, url: null, web_url: null };
  }

  const normalised = digits.startsWith('+') ? digits : `+${digits}`;
  return {
    platform: 'viber',
    handle: normalised,
    url: `viber://chat?number=${encodeURIComponent(normalised)}`,
    web_url: 'https://www.viber.com/',
  };
}

/**
 * @param {{ telegram?: string|null, viber?: string|null }} profile
 * @returns {{ telegram: object|null, viber: object|null }}
 */
function buildContactLinks(profile = {}) {
  return {
    telegram: buildTelegramLink(profile.telegram),
    viber: buildViberLink(profile.viber),
  };
}

module.exports = { buildTelegramLink, buildViberLink, buildContactLinks };
