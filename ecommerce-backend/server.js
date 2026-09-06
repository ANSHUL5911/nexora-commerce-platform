import { app } from './src/app.js';
import { config } from './src/config/env.js';
import { testDbConnection, closeDbConnection } from './src/config/database.js';
import { logger } from './src/utils/logger.js';

let server;

async function startServer() {
  try {
    // Attempt database connection check (non-blocking warning if local dev DB is not yet running)
    if (config.NODE_ENV !== 'test') {
      try {
        await testDbConnection();
        logger.info('PostgreSQL database connection established successfully.');
      } catch (dbErr) {
        logger.warn(`PostgreSQL connection check skipped/failed: ${dbErr.message}. Server starting in foundation mode.`);
      }
    }

    server = app.listen(config.PORT, () => {
      logger.info(`Nexora Backend Server running on port ${config.PORT} [${config.NODE_ENV}]`);
    });

    const gracefulShutdown = async (signal) => {
      logger.info(`Received ${signal}. Shutting down gracefully...`);
      if (server) {
        server.close(async () => {
          logger.info('HTTP server closed.');
          await closeDbConnection();
          process.exit(0);
        });
      } else {
        process.exit(0);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (error) {
    logger.error(`Fatal server startup error: ${error.message}`);
    process.exit(1);
  }
}

// Start if executed directly
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export { server, startServer };
