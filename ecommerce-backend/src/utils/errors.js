/**
 * Base Application Error
 */
export class AppError extends Error {
  /**
   * @param {string} message - Safe user-facing error message
   * @param {number} statusCode - HTTP status code
   * @param {string} code - Machine-readable error code
   * @param {unknown} [details] - Optional validation or error details
   */
  constructor(message, statusCode = 500, code = 'INTERNAL_SERVER_ERROR', details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required', code = 'UNAUTHENTICATED', details = null) {
    super(message, 401, code, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied', code = 'FORBIDDEN', details = null) {
    super(message, 403, code, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', code = 'NOT_FOUND', details = null) {
    super(message, 404, code, details);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict', code = 'CONFLICT', details = null) {
    super(message, 409, code, details);
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests. Please try again later.') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

export class DatabaseError extends AppError {
  constructor(message = 'A database error occurred', details = null) {
    super(message, 500, 'DATABASE_ERROR', details);
  }
}

export class InternalServerError extends AppError {
  constructor(message = 'An unexpected internal server error occurred') {
    super(message, 500, 'INTERNAL_SERVER_ERROR');
  }
}
