import { config } from '../config/env.js';

const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'db_password',
  'session_secret',
  'guest_token_secret',
  'razorpay_key_secret',
  'razorpay_webhook_secret',
  'cookie',
  'set-cookie',
  'authorization',
  'token',
  'guesttoken',
  'x-guest-token',
  'cardnumber',
  'card_number',
  'cvv',
  'cvc',
  'expiry',
  'razorpay_signature',
  'signature',
  'idempotency_key',
  'idempotencykey',
  'idempotency-key',
  'request_hash',
  'requesthash',
]);


/**
 * Deeply redacts sensitive keys from log context.
 * @param {unknown} data
 * @param {Set<unknown>} seen
 * @returns {unknown}
 */
export function redactSensitiveData(data, seen = new Set()) {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;

  if (seen.has(data)) return '[Circular]';
  seen.add(data);

  if (Array.isArray(data)) {
    return data.map((item) => redactSensitiveData(item, seen));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase().replace(/[-_]/g, '');
    if (SENSITIVE_KEYS.has(key.toLowerCase()) || SENSITIVE_KEYS.has(lowerKey)) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = redactSensitiveData(value, seen);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevelThreshold = config.NODE_ENV === 'production' ? LOG_LEVELS.info : LOG_LEVELS.debug;

function formatLogEntry(level, message, meta = {}) {
  const safeMeta = redactSensitiveData(meta);
  const entry = {
    timestamp: new Date().toISOString(),
    level: level.toUpperCase(),
    message,
    ...(typeof safeMeta === 'object' && safeMeta !== null ? safeMeta : { meta: safeMeta }),
  };

  return JSON.stringify(entry);
}

export const logger = {
  debug(message, meta = {}) {
    if (LOG_LEVELS.debug >= currentLevelThreshold) {
      console.debug(formatLogEntry('debug', message, meta));
    }
  },

  info(message, meta = {}) {
    if (LOG_LEVELS.info >= currentLevelThreshold) {
      console.log(formatLogEntry('info', message, meta));
    }
  },

  warn(message, meta = {}) {
    if (LOG_LEVELS.warn >= currentLevelThreshold) {
      console.warn(formatLogEntry('warn', message, meta));
    }
  },

  error(message, meta = {}) {
    if (LOG_LEVELS.error >= currentLevelThreshold) {
      console.error(formatLogEntry('error', message, meta));
    }
  },
};

export default logger;
