import { logger } from '../utils/logger.js';

/**
 * Structured HTTP request logging middleware.
 */
export function requestLogger(req, res, next) {
  const startTime = process.hrtime.bigint();

  res.on('finish', () => {
    const endTime = process.hrtime.bigint();
    const durationMs = Number(endTime - startTime) / 1e6;

    const logMeta = {
      requestId: req.id,
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs: parseFloat(durationMs.toFixed(2)),
      ip: req.ip || req.socket?.remoteAddress,
      userAgent: req.headers['user-agent'] || 'unknown',
    };

    if (res.statusCode >= 500) {
      logger.error(`HTTP ${req.method} ${req.originalUrl} failed`, logMeta);
    } else if (res.statusCode >= 400) {
      logger.warn(`HTTP ${req.method} ${req.originalUrl} client error`, logMeta);
    } else {
      logger.info(`HTTP ${req.method} ${req.originalUrl} completed`, logMeta);
    }
  });

  next();
}

export default requestLogger;
