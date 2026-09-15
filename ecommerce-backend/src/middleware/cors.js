import cors from 'cors';
import { config } from '../config/env.js';

const allowedOrigins = config.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean);

/**
 * Strict CORS middleware.
 * Validates origin against configured whitelist with credentials support.
 */
export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (e.g. curl, server-to-server, health check, automated tests) where origin is undefined
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Origin not allowed
    const error = new Error(`CORS Error: Origin '${origin}' is not permitted by Nexora CORS policy.`);
    error.status = 403;
    return callback(error, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Request-Id',
    'X-Guest-Token',
    'X-Guest-Order-Token',
    'Idempotency-Key',
    'X-CSRF-Token',
  ],
  exposedHeaders: ['X-Request-Id'],
  maxAge: 86400, // 24 hours preflight cache
});

export default corsMiddleware;
