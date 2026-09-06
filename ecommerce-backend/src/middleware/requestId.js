import crypto from 'crypto';

const SAFE_REQUEST_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

/**
 * Request ID correlation middleware.
 * Ingests a safe X-Request-Id or generates a new cryptographic UUIDv4.
 */
export function requestId(req, res, next) {
  const incomingId = req.headers['x-request-id'];

  let id;
  if (typeof incomingId === 'string' && SAFE_REQUEST_ID_REGEX.test(incomingId)) {
    id = incomingId;
  } else {
    id = crypto.randomUUID();
  }

  req.id = id;
  req.requestId = id;
  res.setHeader('X-Request-Id', id);

  next();
}

export default requestId;
