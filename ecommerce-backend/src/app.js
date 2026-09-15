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
import { orderRouter } from './modules/orders/order.routes.js';
import { checkoutRouter } from './modules/checkout/checkout.routes.js';
import { paymentRouter } from './modules/payments/payment.routes.js';
import { webhookRouter } from './modules/payments/webhook.routes.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { config } from './config/env.js';
import { sequelize } from './config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');

export function createApp() {
  const app = express();

  // Reverse proxy trusted hops configuration (if explicitly configured)
  if (config.TRUST_PROXY && config.TRUST_PROXY.trim() !== '') {
    const val = config.TRUST_PROXY.trim();
    if (val.toLowerCase() === 'true') {
      app.set('trust proxy', true);
    } else if (val.toLowerCase() === 'false') {
      app.set('trust proxy', false);
    } else if (/^\d+$/.test(val)) {
      app.set('trust proxy', parseInt(val, 10));
    } else {
      app.set('trust proxy', val);
    }
  } else if (config.NODE_ENV === 'test') {
    // In test harness, trust loopback peer (127.0.0.1) so test suites can simulate distinct client IPs
    app.set('trust proxy', 'loopback');
  }

  // 1. Request ID correlation
  app.use(requestId);

  // 2. Security headers
  app.use(securityHeaders);

  // 3. Strict CORS
  app.use(corsMiddleware);

  // 4. Body & Cookie parsing (preserves raw buffer for webhook signature verification)
  app.use(
    express.json({
      limit: '100kb',
      verify: (req, res, buf) => {
        req.rawBody = buf;
      },
    })
  );
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));
  app.use(cookieParser());

  // 5. Request logging
  app.use(requestLogger);

  // 6. Operational Health & Readiness Endpoints (Mounted BEFORE general rate limiter to prevent load balancer polling exhaustion)
  // Liveness Check: process is running
  app.get('/api/health', (req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'nexora-backend',
      environment: config.NODE_ENV,
      timestamp: new Date().toISOString(),
      requestId: req.id,
    });
  });

  // Readiness Check: lightweight database connectivity check without leaking credentials, SQL, or stack traces
  app.get('/api/health/ready', async (req, res) => {
    try {
      await sequelize.authenticate();
      res.status(200).json({
        status: 'ready',
        service: 'nexora-backend',
        database: 'connected',
        timestamp: new Date().toISOString(),
        requestId: req.id,
      });
    } catch {
      res.status(503).json({
        status: 'not_ready',
        service: 'nexora-backend',
        database: 'disconnected',
        timestamp: new Date().toISOString(),
        requestId: req.id,
      });
    }
  });

  // 7. Application-wide Rate Limiting on API endpoints
  app.use('/api', generalLimiter);

  // 8. Authentication Router
  app.use('/api/auth', authRouter);

  // 9. Products & Catalog Router
  app.use('/api/products', productRouter);

  // 10. Cart Router
  app.use('/api/cart', cartRouter);

  // 11. Inventory & Reservation Router
  app.use('/api/inventory', inventoryRouter);

  // 12. Orders & OrderItems Router
  app.use('/api/orders', orderRouter);

  // 13. Checkout Initiation Router
  app.use('/api/checkout', checkoutRouter);

  // 14. Payments & Razorpay Router
  app.use('/api/payments', paymentRouter);

  // 15. Asynchronous Razorpay Webhook Router
  app.use('/api/webhooks', webhookRouter);

  // 16. Admin Management Router (Refunds, Restocking)
  app.use('/api/admin', adminRouter);

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
