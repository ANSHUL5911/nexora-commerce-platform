import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import { requestId } from './middleware/requestId.js';
import { securityHeaders } from './middleware/security.js';
import { corsMiddleware } from './middleware/cors.js';
import { requestLogger } from './middleware/requestLogger.js';
import { generalLimiter } from './middleware/rateLimiter.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { productRouter } from './modules/products/product.routes.js';
import { cartRouter } from './modules/cart/cart.routes.js';
import { inventoryRouter } from './modules/inventory/inventory.routes.js';
import { config } from './config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');

export function createApp() {
  const app = express();

  // 1. Request ID correlation
  app.use(requestId);

  // 2. Security headers
  app.use(securityHeaders);

  // 3. Strict CORS
  app.use(corsMiddleware);

  // 4. Body & Cookie parsing
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));
  app.use(cookieParser());

  // 5. Request logging
  app.use(requestLogger);

  // 6. Application-wide Rate Limiting on API endpoints
  app.use('/api', generalLimiter);

  // 7. Authentication Router
  app.use('/api/auth', authRouter);

  // 8. Products & Catalog Router
  app.use('/api/products', productRouter);

  // 9. Cart Router
  app.use('/api/cart', cartRouter);

  // 10. Inventory & Reservation Router
  app.use('/api/inventory', inventoryRouter);

  // 9. Health check endpoint
  app.get('/api/health', (req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'nexora-backend',
      environment: config.NODE_ENV,
      timestamp: new Date().toISOString(),
      requestId: req.id,
    });
  });

  // 10. Static assets (images)
  app.use('/images', express.static(path.join(backendRoot, 'images')));

  // 11. API 404 handler for unmatched /api routes
  app.use('/api', notFoundHandler);

  // 12. Central error handler
  app.use(errorHandler);


  return app;
}

export const app = createApp();
export default app;
