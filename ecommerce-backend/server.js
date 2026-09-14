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

    // Attempt database connection check (non-blocking warning if local dev DB is not yet running)
    if (config.NODE_ENV !== 'test') {
      try {
        await testDbConnection();
        dbConnected = true;
        logger.info('PostgreSQL database connection established successfully.', {
          databaseConnected: true,
        });
      } catch (dbErr) {
        dbConnected = false;
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

    const gracefulShutdown = async (signal) => {
      logger.info(`Received ${signal}. Shutting down gracefully...`, {
        event: 'application.shutdown.started',
        signal,
      });
      if (server) {
        server.close(async () => {
          logger.info('HTTP server closed.', {
            event: 'application.shutdown.completed',
          });
          await closeDbConnection();
          process.exit(0);
        });
      } else {
        logger.info('Application shutdown completed.', {
          event: 'application.shutdown.completed',
        });
        process.exit(0);
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
