/**
 * Idempotency record lifecycle states matching Migration 010 CHECK constraint.
 */
export const IDEMPOTENCY_STATUS = Object.freeze({
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  FAILED_RETRYABLE: 'FAILED_RETRYABLE',
});

/**
 * Standard HTTP header for client-supplied idempotency key.
 */
export const IDEMPOTENCY_HEADER = 'idempotency-key';

/**
 * Replay response header indicating cached response.
 */
export const IDEMPOTENCY_REPLAY_HEADER = 'x-idempotency-replay';

/**
 * Maximum permitted length for an idempotency key.
 */
export const MAX_IDEMPOTENCY_KEY_LENGTH = 255;

/**
 * Default expiration TTL in hours for idempotency records.
 */
export const DEFAULT_IDEMPOTENCY_EXPIRY_HOURS = 24;

export default {
  IDEMPOTENCY_STATUS,
  IDEMPOTENCY_HEADER,
  IDEMPOTENCY_REPLAY_HEADER,
  MAX_IDEMPOTENCY_KEY_LENGTH,
  DEFAULT_IDEMPOTENCY_EXPIRY_HOURS,
};
