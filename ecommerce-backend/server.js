import { app } from './src/app.js';
import { config } from './src/config/env.js';
import { testDbConnection, closeDbConnection } from './src/config/database.js';
import { logger } from './src/utils/logger.js';

let server;

async function startServer() {
  let dbConnected = false;

  try {
    logger.info('Application starting', {
      event: 'application.starting',
      environment: config.NODE_ENV,
      port: config.PORT,
    });

    // Attempt database connection check
    if (config.NODE_ENV !== 'test') {
      try {
        await testDbConnection();
        dbConnected = true;
        logger.info('PostgreSQL database connection established successfully.', {
          databaseConnected: true,
        });
      } catch (dbErr) {
        dbConnected = false;
        if (config.NODE_ENV === 'production') {
          logger.error(`Fatal production startup error: PostgreSQL connection failed: ${dbErr.message}`, {
            event: 'application.startup.failed',
            databaseConnected: false,
          });
          process.exit(1);
        }
        logger.warn(`PostgreSQL connection check skipped/failed: ${dbErr.message}. Server starting in foundation mode.`, {
          databaseConnected: false,
        });
      }
    }

    server = app.listen(config.PORT, () => {
      logger.info(`Nexora Backend Server running on port ${config.PORT} [${config.NODE_ENV}]`, {
        event: 'application.started',
        environment: config.NODE_ENV,
        port: config.PORT,
        databaseConnected: dbConnected,
      });
    });

    let isShuttingDown = false;

    const gracefulShutdown = async (signal) => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      logger.info(`Received ${signal}. Starting graceful shutdown...`, {
        event: 'application.shutdown.started',
        signal,
      });

      // 10-second safety timeout: force process exit if in-flight connections hang
      const forceExitTimer = setTimeout(() => {
        logger.error('Graceful shutdown timed out after 10s. Forcing process exit.', {
          event: 'application.shutdown.timeout',
          signal,
        });
        process.exit(1);
      }, 10000);
      forceExitTimer.unref();

      try {
        if (server) {
          // 1. Stop accepting new HTTP connections and allow active requests to finish
          server.close(async (err) => {
            if (err) {
              logger.error('Error closing HTTP server during shutdown', { error: err.message });
            } else {
              logger.info('HTTP server closed successfully.', {
                event: 'application.shutdown.http_closed',
              });
            }

            // 2. Close PostgreSQL connection pool safely (in-flight queries complete or abort safely at DB level)
            await closeDbConnection();
            logger.info('Database connections closed. Application shutdown completed.', {
              event: 'application.shutdown.completed',
            });
            clearTimeout(forceExitTimer);
            process.exit(0);
          });
        } else {
          await closeDbConnection();
          logger.info('Application shutdown completed.', {
            event: 'application.shutdown.completed',
          });
          clearTimeout(forceExitTimer);
          process.exit(0);
        }
      } catch (shutdownErr) {
        logger.error('Error during graceful shutdown sequence', {
          event: 'application.shutdown.failed',
          errorMessage: shutdownErr?.message,
        });
        clearTimeout(forceExitTimer);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (error) {
    logger.error('Fatal server startup error', {
      event: 'application.startup.failed',
      errorMessage: error?.message || 'Unknown startup error',
    });
    process.exit(1);
  }
}

// Start if executed directly
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export { server, startServer };
