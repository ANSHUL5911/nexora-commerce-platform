import crypto from 'crypto';
import { Op } from 'sequelize';
import { Session } from '../../models/Session.js';
import { User } from '../../models/User.js';
import { config } from '../../config/env.js';

// 7-day rolling session window in milliseconds (604,800,000 ms)
export const SESSION_TTL_MS = config.SESSION_MAX_AGE_MS || 604800000;

// Rolling refresh threshold (1 day = 86,400,000 ms).
// Avoids database write on every single sub-millisecond request while preserving 7-day rolling window.
export const REFRESH_THRESHOLD_MS = 86400000;

/**
 * Generate cryptographically secure 256-bit opaque random session token.
 * 32 bytes = 256 bits of entropy -> 64 hex characters.
 *
 * @returns {string}
 */
export function generateSessionId() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Validate session ID format before hitting database.
 * @param {unknown} sid
 * @returns {boolean}
 */
export function isValidSessionIdFormat(sid) {
  if (!sid || typeof sid !== 'string') return false;
  return /^[0-9a-f]{64}$/i.test(sid);
}

/**
 * Create a new server-side session for an authenticated user.
 *
 * @param {string} userId - User UUID
 * @param {object} [options] - Optional transaction
 * @returns {Promise<Session>}
 */
export async function createSession(userId, options = {}) {
  const sid = generateSessionId();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  return Session.create(
    {
      sid,
      user_id: userId,
      expires_at: expiresAt,
      created_at: now,
      updated_at: now,
    },
    { transaction: options.transaction }
  );
}

/**
 * Lookup session by ID, verify expiration against live database, and eager-load user.
 * Rejects expired sessions without extending or reviving them.
 *
 * @param {string} sid - 64-char hex session token
 * @returns {Promise<{ session: Session, user: User } | null>}
 */
export async function findValidSession(sid) {
  if (!isValidSessionIdFormat(sid)) {
    return null;
  }

  const session = await Session.findOne({
    where: {
      sid,
      expires_at: {
        [Op.gt]: new Date(),
      },
    },
    include: [
      {
        model: User,
        as: 'user',
        where: { is_active: true },
        required: true,
      },
    ],
  });

  if (!session || !session.user) {
    return null;
  }

  return { session, user: session.user };
}

/**
 * Safely refresh rolling session expiration if threshold has passed.
 * Uses atomic conditional update `WHERE sid = :sid AND expires_at > NOW()`.
 * Concurrent requests cannot accidentally revive or extend an already-expired session.
 *
 * @param {string} sid
 * @param {Date} currentExpiresAt
 * @returns {Promise<boolean>}
 */
export async function touchSessionIfDue(sid, currentExpiresAt) {
  if (!isValidSessionIdFormat(sid) || !currentExpiresAt) return false;

  const now = Date.now();
  const expiresTime = new Date(currentExpiresAt).getTime();
  const timeRemaining = expiresTime - now;

  // Only refresh if more than REFRESH_THRESHOLD_MS has elapsed from original 7-day window
  // (i.e. remaining time is less than SESSION_TTL_MS - REFRESH_THRESHOLD_MS)
  if (timeRemaining <= SESSION_TTL_MS - REFRESH_THRESHOLD_MS && timeRemaining > 0) {
    const newExpiresAt = new Date(now + SESSION_TTL_MS);

    const [affectedCount] = await Session.update(
      {
        expires_at: newExpiresAt,
        updated_at: new Date(now),
      },
      {
        where: {
          sid,
          expires_at: {
            [Op.gt]: new Date(now),
          },
        },
      }
    );

    return affectedCount > 0;
  }

  return false;
}

/**
 * Invalidate / delete a session from PostgreSQL.
 *
 * @param {string} sid
 * @returns {Promise<number>} - Number of deleted rows
 */
export async function deleteSession(sid) {
  if (!isValidSessionIdFormat(sid)) return 0;

  return Session.destroy({
    where: { sid },
  });
}

/**
 * Session fixation defense: invalidate any pre-existing session associated
 * with the request and create a freshly generated CSPRNG authenticated session.
 *
 * @param {string | undefined} oldSid
 * @param {string} userId
 * @param {object} [options]
 * @returns {Promise<Session>}
 */
export async function rotateSession(oldSid, userId, options = {}) {
  if (oldSid && isValidSessionIdFormat(oldSid)) {
    await deleteSession(oldSid);
  }
  return createSession(userId, options);
}

export default {
  SESSION_TTL_MS,
  REFRESH_THRESHOLD_MS,
  generateSessionId,
  isValidSessionIdFormat,
  createSession,
  findValidSession,
  touchSessionIfDue,
  deleteSession,
  rotateSession,
};
