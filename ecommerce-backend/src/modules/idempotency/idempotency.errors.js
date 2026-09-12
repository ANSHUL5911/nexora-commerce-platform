import { AppError } from '../../utils/errors.js';

/**
 * Thrown when a required Idempotency-Key header is missing.
 */
export class MissingIdempotencyKeyError extends AppError {
  constructor(message = 'Idempotency-Key header is required for this operation.') {
    super(message, 400, 'MISSING_IDEMPOTENCY_KEY');
  }
}

/**
 * Thrown when an Idempotency-Key is malformed, empty, or exceeds maximum length.
 */
export class InvalidIdempotencyKeyError extends AppError {
  constructor(message = 'Invalid Idempotency-Key header format.') {
    super(message, 400, 'INVALID_IDEMPOTENCY_KEY');
  }
}

/**
 * Thrown when an idempotency key is reused with a materially different request payload.
 */
export class IdempotencyPayloadMismatchError extends AppError {
  constructor(
    message = 'Idempotency key has already been used with a different request payload.'
  ) {
    super(message, 409, 'IDEMPOTENCY_PAYLOAD_MISMATCH');
  }
}

/**
 * Thrown when an operation with the same idempotency key is currently processing.
 */
export class IdempotencyInProgressError extends AppError {
  constructor(
    message = 'An operation with this idempotency key is currently in progress. Please retry shortly.'
  ) {
    super(message, 409, 'CHECKOUT_IN_PROGRESS');
  }
}

export default {
  MissingIdempotencyKeyError,
  InvalidIdempotencyKeyError,
  IdempotencyPayloadMismatchError,
  IdempotencyInProgressError,
};
