import { logger } from '../utils/logger.js';

/**
 * Structured HTTP request lifecycle logging middleware.
 * Standardizes event names, normalized path, durationMs, and actorType.
 */
export function requestLogger(req, res, next) {
  const startTime = process.hrtime.bigint();

  res.on('finish', () => {
    try {
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1e6;

      // Classify actor type without logging credentials
      let actorType = 'anonymous';
      if (req.user?.role === 'admin') {
        actorType = 'admin';
      } else if (req.user) {
        actorType = 'customer';
      } else if (req.headers['x-guest-token']) {
        actorType = 'guest';
      }

      // Normalized path without high-cardinality query strings
      const rawPath = req.baseUrl ? `${req.baseUrl}${req.path}` : (req.originalUrl || req.url || req.path);
      const normalizedPath = (rawPath || '/').split('?')[0];

      let event = 'http.request.completed';
      if (res.statusCode >= 500) {
        event = 'http.server_error';
      } else if (res.statusCode >= 400) {
        event = 'http.client_error';
      }

      const logMeta = {
        event,
        requestId: req.id || req.requestId || 'unknown',
        method: req.method,
        path: normalizedPath,
        url: req.originalUrl || req.url,
        statusCode: res.statusCode,
        durationMs: parseFloat(durationMs.toFixed(2)),
        actorType,
        ip: req.ip || req.socket?.remoteAddress,
        userAgent: req.headers['user-agent'] || 'unknown',
      };

      if (req.user?.id) {
        logMeta.userId = req.user.id;
      }

      if (res.statusCode >= 500) {
        logger.error(`HTTP ${req.method} ${normalizedPath} failed`, logMeta);
      } else if (res.statusCode >= 400) {
        logger.warn(`HTTP ${req.method} ${normalizedPath} client error`, logMeta);
      } else {
        logger.info(`HTTP ${req.method} ${normalizedPath} completed`, logMeta);
      }
    } catch {
      // Logging failure must remain side-effect free
    }
  });

  next();
}

export default requestLogger;
