import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/env.js';

/**
 * Global centralized error handling middleware.
 * Formats errors into the standard Nexora JSON response contract.
 */
/* eslint-disable no-unused-vars */
export function errorHandler(err, req, res, next) {
  const requestId = req.id || req.requestId || 'unknown';

  let statusCode = 500;
  let code = 'INTERNAL_SERVER_ERROR';
  let message = 'An unexpected internal server error occurred.';
  let details = null;

  // Handle known operational AppError hierarchy
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err.name === 'SyntaxError' && 'body' in err) {
    // Malformed JSON payload
    statusCode = 400;
    code = 'MALFORMED_JSON';
    message = 'Invalid JSON payload received in request body.';
  } else if (err.name === 'SequelizeValidationError' || err.name === 'SequelizeUniqueConstraintError') {
    statusCode = 400;
    code = 'DATABASE_VALIDATION_ERROR';
    message = 'Database validation constraint failed.';
    if (config.NODE_ENV !== 'production' && err.errors) {
      details = err.errors.map((e) => ({ message: e.message, path: e.path }));
    }
  } else if (err.status === 403 && err.message?.includes('CORS Error')) {
    statusCode = 403;
    code = 'CORS_ORIGIN_DENIED';
    message = 'Request origin is not allowed by CORS policy.';
  } else if (err.statusCode) {
    statusCode = err.statusCode;
    message = err.message || message;
  }

  // Log error with structured logger
  const rawPath = req.baseUrl ? `${req.baseUrl}${req.path}` : (req.originalUrl || req.url || req.path);
  const normalizedPath = (rawPath || '/').split('?')[0];

  const logPayload = {
    event: statusCode >= 500 ? 'http.server_error' : 'http.client_error',
    requestId,
    statusCode,
    errorCode: code,
    errorType: err.name || 'Error',
    errorMessage: err.message,
    method: req.method,
    path: normalizedPath,
    url: req.originalUrl || req.url,
  };

  if (statusCode >= 500) {
    logger.error(`Server Error: ${err.message}`, {
      ...logPayload,
      stack: err.stack,
    });
  } else {
    logger.warn(`Client Error: ${err.message}`, logPayload);
  }

  // Construct standard error payload
  const errorResponse = {
    error: {
      code,
      message,
      requestId,
    },
  };

  if (details && config.NODE_ENV !== 'production') {
    errorResponse.error.details = details;
  }

  res.status(statusCode).json(errorResponse);
}
/* eslint-enable no-unused-vars */

/**
 * 404 Route Not Found middleware.
 */
export function notFoundHandler(req, res) {
  const requestId = req.id || req.requestId || 'unknown';

  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `The requested endpoint '${req.method} ${req.originalUrl || req.url}' does not exist.`,
      requestId,
    },
  });
}

export default {
  errorHandler,
  notFoundHandler,
};
