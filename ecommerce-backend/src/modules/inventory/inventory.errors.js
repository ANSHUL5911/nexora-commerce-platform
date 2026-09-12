import { AppError, ConflictError, NotFoundError } from '../../utils/errors.js';

/**
 * Thrown when requested stock exceeds available stock during reservation.
 * Maps to HTTP 409 Conflict.
 */
export class InsufficientStockError extends ConflictError {
  constructor(
    message = 'Requested quantity exceeds available stock.',
    details = null
  ) {
    super(message, 'INSUFFICIENT_STOCK', details);
  }
}

/**
 * Thrown when a reservation is not found or fails ownership check.
 * Maps to HTTP 404 Not Found.
 */
export class ReservationNotFoundError extends NotFoundError {
  constructor(
    message = 'Reservation was not found.',
    details = null
  ) {
    super(message, 'RESERVATION_NOT_FOUND', details);
  }
}

/**
 * Thrown when an operation is attempted on an expired reservation.
 * Maps to HTTP 409 Conflict.
 */
export class ReservationExpiredError extends ConflictError {
  constructor(
    message = 'Reservation has expired.',
    details = null
  ) {
    super(message, 'RESERVATION_EXPIRED', details);
  }
}

/**
 * Thrown when an operation is attempted on an already released reservation.
 * Maps to HTTP 409 Conflict.
 */
export class ReservationAlreadyReleasedError extends ConflictError {
  constructor(
    message = 'Reservation has already been released.',
    details = null
  ) {
    super(message, 'RESERVATION_ALREADY_RELEASED', details);
  }
}

/**
 * Thrown when an operation is attempted on an already converted reservation.
 * Maps to HTTP 409 Conflict.
 */
export class ReservationAlreadyConvertedError extends ConflictError {
  constructor(
    message = 'Reservation has already been converted.',
    details = null
  ) {
    super(message, 'RESERVATION_ALREADY_CONVERTED', details);
  }
}

/**
 * Thrown when reservation state transition is invalid.
 * Maps to HTTP 400 Bad Request.
 */
export class InvalidReservationStateError extends AppError {
  constructor(
    message = 'Invalid reservation state transition.',
    details = null
  ) {
    super(message, 400, 'INVALID_RESERVATION_STATE', details);
  }
}

/**
 * Thrown when an internal inventory invariant is violated (e.g. negative counter attempt).
 * Maps to HTTP 500 Internal Server Error.
 */
export class InventoryInvariantError extends AppError {
  constructor(
    message = 'Inventory invariant violation detected.',
    details = null
  ) {
    super(message, 500, 'INVENTORY_INVARIANT_VIOLATION', details);
  }
}
