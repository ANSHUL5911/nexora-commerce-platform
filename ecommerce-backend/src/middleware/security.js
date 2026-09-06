import helmet from 'helmet';

/**
 * Helmet security headers middleware configuration.
 * Configured with robust defaults and explicit CSP directives designed
 * to safely accommodate future Razorpay Standard Checkout modal integration.
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // Razorpay Checkout modal loads checkout.js script
      scriptSrc: ["'self'", 'https://checkout.razorpay.com'],
      // Razorpay Checkout modal runs inside an iframe from api.razorpay.com
      frameSrc: ["'self'", 'https://api.razorpay.com'],
      // Client calls backend /api and Razorpay telemetry / APIs
      connectSrc: ["'self'", 'https://api.razorpay.com', 'https://lumberjack.razorpay.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Allows cross-origin asset loading for images/gateways
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  frameguard: { action: 'deny' },
  noSniff: true,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
});

export default securityHeaders;
