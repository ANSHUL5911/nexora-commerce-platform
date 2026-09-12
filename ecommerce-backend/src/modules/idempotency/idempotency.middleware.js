import crypto from 'crypto';
import {
  IDEMPOTENCY_HEADER,
  IDEMPOTENCY_REPLAY_HEADER,
  MAX_IDEMPOTENCY_KEY_LENGTH,
} from './idempotency.constants.js';
import {
  MissingIdempotencyKeyError,
  InvalidIdempotencyKeyError,
} from './idempotency.errors.js';
import { idempotencyRepository } from './idempotency.repository.js';

/**
 * Deterministically serialize a JavaScript object with sorted keys.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function canonicalizePayload(value) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalizePayload).join(',') + ']';
  }

  const sortedKeys = Object.keys(value).sort();
  const pairs = sortedKeys.map(
    (k) => `${JSON.stringify(k)}:${canonicalizePayload(value[k])}`
  );
  return '{' + pairs.join(',') + '}';
}

/**
 * Compute SHA-256 fingerprint for idempotency record payload validation.
 *
 * @param {{
 *   userId?: string,
 *   path: string,
 *   body: unknown
 * }} params
 * @returns {string} 64-char hex SHA-256 hash
 */
export function computeRequestHash({ userId, path, body }) {
  const canonicalBody = canonicalizePayload(body);
  const rawFingerprint = `user:${userId || 'anonymous'}|path:${path}|body:${canonicalBody}`;
  return crypto.createHash('sha256').update(rawFingerprint).digest('hex');
}

/**
 * Express middleware to enforce request-level idempotency on mutation endpoints.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function requireIdempotency(req, res, next) {
  try {
    const rawKey = req.headers[IDEMPOTENCY_HEADER];

    // 1. Validate presence of Idempotency-Key header
    if (!rawKey || typeof rawKey !== 'string' || rawKey.trim() === '') {
      throw new MissingIdempotencyKeyError(
        'Idempotency-Key header is required for this operation.'
      );
    }

    const idempotencyKey = rawKey.trim();

    // 2. Validate length and format boundaries
    if (
      idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH ||
      /[\r\n\t]/.test(idempotencyKey)
    ) {
      throw new InvalidIdempotencyKeyError(
        'Idempotency-Key header exceeds maximum length or contains invalid characters.'
      );
    }

    // 3. Resolve canonical endpoint path
    const requestPath = req.baseUrl ? `${req.baseUrl}${req.path}` : req.path;

    // 4. Compute deterministic request hash incorporating actor identity
    const requestHash = computeRequestHash({
      userId: req.user?.id,
      path: requestPath,
      body: req.body,
    });

    // 5. Atomically claim key or resolve replay
    const { record, claimed, replayed } = await idempotencyRepository.claimKey({
      idempotencyKey,
      requestPath,
      requestHash,
    });

    // 6. Handle cached replay
    if (replayed) {
      res.setHeader(IDEMPOTENCY_REPLAY_HEADER, 'true');
      return res.status(record.response_code || 200).json(record.response_body);
    }

    // 7. Attach record to request for transactional downstream coordination
    if (claimed && record) {
      req.idempotencyRecord = record;
    }

    return next();
  } catch (err) {
    return next(err);
  }
}

export default {
  requireIdempotency,
  computeRequestHash,
  canonicalizePayload,
};
