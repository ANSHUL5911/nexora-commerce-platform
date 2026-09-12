import crypto from 'crypto';
import { config } from '../../config/env.js';

/**
 * Generate a 256-bit cryptographically secure random guest token and its SHA-256 hash.
 * Entropy: 32 bytes (256 bits) from CSPRNG.
 *
 * @returns {{ rawToken: string, tokenHash: string }}
 */
export function generateGuestToken() {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashGuestToken(rawToken);
  return { rawToken, tokenHash };
}

/**
 * Compute the SHA-256 hex digest of a raw guest token string.
 *
 * @param {string} rawToken
 * @returns {string} 64-character lowercase hex string
 */
export function hashGuestToken(rawToken) {
  if (typeof rawToken !== 'string' || rawToken.trim() === '') {
    return '';
  }
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Verify a raw guest token against a stored SHA-256 hash in constant time.
 * Prevents timing side-channel attacks on token comparison.
 *
 * @param {string} rawToken
 * @param {string} storedHash
 * @returns {boolean}
 */
export function verifyGuestToken(rawToken, storedHash) {
  if (
    typeof rawToken !== 'string' ||
    typeof storedHash !== 'string' ||
    rawToken.trim() === '' ||
    storedHash.trim() === ''
  ) {
    return false;
  }

  const computedHash = hashGuestToken(rawToken);
  const bufComputed = Buffer.from(computedHash, 'utf8');
  const bufStored = Buffer.from(storedHash, 'utf8');

  // Verify buffer byte lengths first to prevent timingSafeEqual throwing TypeError
  if (bufComputed.length !== bufStored.length) {
    return false;
  }

  return crypto.timingSafeEqual(bufComputed, bufStored);
}

/**
 * Check if a guest token has expired based on the order's creation timestamp.
 * Frozen lifetime: 30 days (configured via GUEST_TOKEN_EXPIRY_DAYS).
 *
 * @param {Date | string | number} orderCreatedAt
 * @param {number} [maxAgeDays]
 * @returns {boolean}
 */
export function isGuestTokenExpired(
  orderCreatedAt,
  maxAgeDays = config.GUEST_TOKEN_EXPIRY_DAYS || 30
) {
  if (!orderCreatedAt) return true;

  const createdTime = new Date(orderCreatedAt).getTime();
  if (Number.isNaN(createdTime)) return true;

  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  const now = Date.now();

  return now - createdTime > maxAgeMs;
}

export default {
  generateGuestToken,
  hashGuestToken,
  verifyGuestToken,
  isGuestTokenExpired,
};
