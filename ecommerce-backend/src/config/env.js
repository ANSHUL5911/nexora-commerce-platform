import { z } from 'zod';
import dotenv from 'dotenv';

// Load .env file if present
dotenv.config();

const PLACEHOLDER_PATTERNS = [
  /replace_with/i,
  /your_secure/i,
  /placeholder/i,
  /change_me/i,
  /secret_key/i,
  /default_secret/i,
  /password123/i,
  /123456/i,
];

function isObviousPlaceholder(val) {
  if (!val || typeof val !== 'string') return true;
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(val));
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),

  // PostgreSQL Configuration
  DB_HOST: z.string().min(1).default('localhost'),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_NAME: z.string().min(1).default('nexora_dev'),
  DB_USER: z.string().min(1).default('nexora_user'),
  DB_PASSWORD: z.string().default(''),
  DB_SSL: z
    .preprocess((val) => {
      if (typeof val === 'string') return val.toLowerCase() === 'true' || val === '1';
      return Boolean(val);
    }, z.boolean())
    .default(false),
  DB_POOL_MIN: z.coerce.number().int().min(1).default(2),
  DB_POOL_MAX: z.coerce.number().int().min(2).max(50).default(10),

  // Session Management
  SESSION_SECRET: z.string().default('dev_session_secret_at_least_32_characters_long_for_nexora_platform'),
  SESSION_MAX_AGE_MS: z.coerce.number().int().positive().default(604800000), // 7-day rolling expiry
  SESSION_SECURE_COOKIE: z
    .preprocess((val) => {
      if (typeof val === 'string') return val.toLowerCase() === 'true' || val === '1';
      return Boolean(val);
    }, z.boolean())
    .default(false),
  SESSION_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),

  // Guest Token Security
  GUEST_TOKEN_SECRET: z.string().default('dev_guest_secret_at_least_32_characters_long_for_nexora_platform'),
  GUEST_TOKEN_EXPIRY_DAYS: z.coerce.number().int().positive().default(30),

  // CORS & Client Origin
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  // Razorpay Gateway
  RAZORPAY_KEY_ID: z.string().default('rzp_test_placeholder_key_id'),
  RAZORPAY_KEY_SECRET: z.string().default('placeholder_razorpay_key_secret'),
  RAZORPAY_WEBHOOK_SECRET: z.string().default('placeholder_razorpay_webhook_secret'),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000), // 15 minutes
  RATE_LIMIT_MAX_GENERAL: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_MAX_AUTH: z.coerce.number().int().positive().default(5), // 5 requests / minute / IP
  RATE_LIMIT_MAX_CHECKOUT: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_MAX_GUEST: z.coerce.number().int().positive().default(15),
});

/**
 * Validates raw environment configuration with strict production safety rules.
 * Never leaks secret values in error messages.
 *
 * @param {Record<string, unknown>} rawEnv
 * @returns {z.infer<typeof envSchema>}
 */
export function validateConfig(rawEnv = process.env) {
  const result = envSchema.safeParse(rawEnv);

  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) => ` - [${issue.path.join('.')}]: ${issue.message}`)
      .join('\n');
    throw new Error(`[ConfigValidationError] Invalid environment configuration:\n${errorDetails}`);
  }

  const parsedConfig = result.data;

  // Strict production assertions
  if (parsedConfig.NODE_ENV === 'production') {
    const productionErrors = [];

    if (parsedConfig.SESSION_SECRET.length < 32 || isObviousPlaceholder(parsedConfig.SESSION_SECRET)) {
      productionErrors.push('SESSION_SECRET must be at least 32 characters and cannot be a default/placeholder in production.');
    }

    if (parsedConfig.GUEST_TOKEN_SECRET.length < 32 || isObviousPlaceholder(parsedConfig.GUEST_TOKEN_SECRET)) {
      productionErrors.push('GUEST_TOKEN_SECRET must be at least 32 characters and cannot be a default/placeholder in production.');
    }

    if (isObviousPlaceholder(parsedConfig.RAZORPAY_KEY_ID)) {
      productionErrors.push('RAZORPAY_KEY_ID must be a valid production/live key and cannot be a placeholder in production.');
    }

    if (isObviousPlaceholder(parsedConfig.RAZORPAY_KEY_SECRET)) {
      productionErrors.push('RAZORPAY_KEY_SECRET must be configured and cannot be a placeholder in production.');
    }

    if (isObviousPlaceholder(parsedConfig.RAZORPAY_WEBHOOK_SECRET)) {
      productionErrors.push('RAZORPAY_WEBHOOK_SECRET must be configured and cannot be a placeholder in production.');
    }

    if (!parsedConfig.DB_PASSWORD) {
      productionErrors.push('DB_PASSWORD must not be empty in production.');
    }

    if (parsedConfig.CORS_ORIGIN.includes('*')) {
      productionErrors.push('CORS_ORIGIN cannot contain wildcard (*) in production with credentials.');
    }

    if (productionErrors.length > 0) {
      throw new Error(`[ConfigValidationError] Production security validation failed:\n${productionErrors.map((e) => ` - ${e}`).join('\n')}`);
    }
  }

  return Object.freeze(parsedConfig);
}

export const config = validateConfig(process.env);
export default config;
