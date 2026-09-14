import { config } from '../config/env.js';

const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'passwordhash',
  'db_password',
  'dbpassword',
  'session',
  'session_secret',
  'sessionsecret',
  'sid',
  'session_id',
  'sessionid',
  'cookie',
  'set-cookie',
  'setcookie',
  '__host-nexora_sid',
  'hostnexorasid',
  'nexora_sid',
  'nexorasid',
  'authorization',
  'token',
  'guesttoken',
  'guest_token',
  'xguesttoken',
  'x-guest-token',
  'guest_token_hash',
  'guesttokenhash',
  'guest_token_secret',
  'guesttokensecret',
  'csrf',
  'csrftoken',
  'csrf-token',
  'xcsrftoken',
  'x-csrf-token',
  'nexora_csrf',
  'nexoracsrf',
  'cardnumber',
  'card_number',
  'cvv',
  'cvc',
  'expiry',
  'pin',
  'razorpay_key_secret',
  'razorpaykeysecret',
  'razorpay_webhook_secret',
  'razorpaywebhooksecret',
  'key_secret',
  'keysecret',
  'webhook_secret',
  'webhooksecret',
  'razorpay_signature',
  'razorpaysignature',
  'x-razorpay-signature',
  'xrazorpaysignature',
  'signature',
  'idempotency_key',
  'idempotencykey',
  'idempotency-key',
  'request_hash',
  'requesthash',
]);

/**
 * Sanitize sensitive patterns from raw string content (such as error messages or stacks).
 *
 * @param {string} str
 * @returns {string}
 */
export function sanitizeStringContent(str) {
  if (typeof str !== 'string') return str;

  return str
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(
      /([?&]|(?:^|\s))(password|token|secret|guest_token|guesttoken|sid|session_id|cvv|key_secret|webhook_secret)=([^&\s]+)/gi,
      '$1$2=[REDACTED]'
    )
    .replace(
      /(postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/([^:]+):([^@]+)@/gi,
      '$1://$2:[REDACTED]@'
    )
    .replace(
      /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12})\b/g,
      '[REDACTED]'
    );
}

/**
 * Deeply redacts sensitive keys and values from log context,
 * safe against circular references and Error instances.
 * Does NOT mutate the original object.
 *
 * @param {unknown} data
 * @param {Set<unknown>} seen
 * @returns {unknown}
 */
export function redactSensitiveData(data, seen = new Set()) {
  if (data === null || data === undefined) return data;

  if (typeof data === 'string') {
    return sanitizeStringContent(data);
  }

  if (typeof data !== 'object') return data;

  if (seen.has(data)) return '[Circular]';
  seen.add(data);

  if (data instanceof Error) {
    const errorObj = {
      name: data.name,
      message: sanitizeStringContent(data.message),
      code: data.code,
      statusCode: data.statusCode || data.status,
    };
    if (data.stack) {
      errorObj.stack = sanitizeStringContent(data.stack);
    }
    // Extract any safe enumerable properties on the Error
    for (const [key, val] of Object.entries(data)) {
      if (!['name', 'message', 'stack'].includes(key)) {
        errorObj[key] = val;
      }
    }
    return redactSensitiveData(errorObj, seen);
  }

  if (Array.isArray(data)) {
    return data.map((item) => redactSensitiveData(item, seen));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (SENSITIVE_KEYS.has(key.toLowerCase()) || SENSITIVE_KEYS.has(lowerKey)) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = redactSensitiveData(value, seen);
    } else if (typeof value === 'string') {
      sanitized[key] = sanitizeStringContent(value);
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

const currentLevelThreshold =
  config.NODE_ENV === 'production' ? LOG_LEVELS.info : LOG_LEVELS.debug;

/**
 * Formats structured log entry into machine-readable JSON string conforming to standard schema.
 *
 * @param {string} level
 * @param {string | object} message
 * @param {object} meta
 * @returns {string}
 */
export function formatLogEntry(level, message, meta = {}) {
  try {
    let resolvedMessage = message;
    let resolvedMeta = meta;

    if (typeof message === 'object' && message !== null && !Array.isArray(message)) {
      resolvedMeta = { ...message, ...meta };
      resolvedMessage = resolvedMeta.message || resolvedMeta.event || '';
      delete resolvedMeta.message;
    }

    const safeMeta = (redactSensitiveData(resolvedMeta) || {});
    const safeMessage =
      typeof resolvedMessage === 'string'
        ? sanitizeStringContent(resolvedMessage)
        : redactSensitiveData(resolvedMessage);

    const entry = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      service: 'nexora-backend',
      environment: config.NODE_ENV,
    };

    // Standard schema fields placed in canonical order if present
    const standardFields = [
      'event',
      'requestId',
      'method',
      'path',
      'statusCode',
      'durationMs',
      'actorType',
      'userId',
      'orderId',
      'paymentAttemptId',
      'eventId',
      'errorCode',
      'errorType',
    ];

    for (const field of standardFields) {
      if (safeMeta[field] !== undefined) {
        entry[field] = safeMeta[field];
      }
    }

    if (safeMessage) {
      entry.message = safeMessage;
    }

    if (safeMeta.stack !== undefined) {
      entry.stack = safeMeta.stack;
    }

    // Attach any remaining safe metadata fields
    for (const [key, val] of Object.entries(safeMeta)) {
      if (!standardFields.includes(key) && key !== 'stack') {
        entry[key] = val;
      }
    }

    return JSON.stringify(entry);
  } catch {
    // Fail-safe serialization fallback to ensure side-effect free logging
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      service: 'nexora-backend',
      environment: config.NODE_ENV,
      event: 'logger.serialization_error',
      message: 'Failed to serialize log entry safely',
    });
  }
}

export const logger = {
  debug(message, meta = {}) {
    try {
      if (LOG_LEVELS.debug >= currentLevelThreshold) {
        console.debug(formatLogEntry('debug', message, meta));
      }
    } catch {
      // Side-effect free: logging failure never crashes request
    }
  },

  info(message, meta = {}) {
    try {
      if (LOG_LEVELS.info >= currentLevelThreshold) {
        console.log(formatLogEntry('info', message, meta));
      }
    } catch {
      // Side-effect free: logging failure never crashes request
    }
  },

  warn(message, meta = {}) {
    try {
      if (LOG_LEVELS.warn >= currentLevelThreshold) {
        console.warn(formatLogEntry('warn', message, meta));
      }
    } catch {
      // Side-effect free: logging failure never crashes request
    }
  },

  error(message, meta = {}) {
    try {
      if (LOG_LEVELS.error >= currentLevelThreshold) {
        console.error(formatLogEntry('error', message, meta));
      }
    } catch {
      // Side-effect free: logging failure never crashes request
    }
  },
};

export default logger;

