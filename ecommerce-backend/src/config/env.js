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
  DATABASE_URL: z.string().optional(),
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

  // Reverse Proxy Configuration
  TRUST_PROXY: z.string().optional().default(''),

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

const SAFE_TRUST_PROXY_PATTERN = /^(true|false|loopback|linklocal|uniquelocal|\d+|((?:[0-9]{1,3}\.){3}[0-9]{1,3}(?:\/[0-9]{1,2})?|::1|[a-fA-F0-9:]+(?:\/[0-9]{1,3})?)(?:\s*,\s*((?:[0-9]{1,3}\.){3}[0-9]{1,3}(?:\/[0-9]{1,2})?|::1|[a-fA-F0-9:]+(?:\/[0-9]{1,3})?))*)$/i;

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

  // Strict TRUST_PROXY validation (must not blindly accept arbitrary/unsafe strings)
  if (parsedConfig.TRUST_PROXY && parsedConfig.TRUST_PROXY.trim() !== '') {
    const trimmed = parsedConfig.TRUST_PROXY.trim();
    if (!SAFE_TRUST_PROXY_PATTERN.test(trimmed)) {
      throw new Error(
        `[ConfigValidationError] Invalid TRUST_PROXY value '${trimmed}'. Must be a hop count (e.g. '1', '2'), boolean, predefined alias ('loopback', 'linklocal', 'uniquelocal'), or documented IP/CIDR.`
      );
    }
  }

  // Validate DATABASE_URL format if provided
  if (parsedConfig.DATABASE_URL && parsedConfig.DATABASE_URL.trim() !== '') {
    const dbUrl = parsedConfig.DATABASE_URL.trim();
    if (!dbUrl.startsWith('postgresql://') && !dbUrl.startsWith('postgres://')) {
      throw new Error('[ConfigValidationError] DATABASE_URL must start with postgresql:// or postgres://');
    }
    try {
      const parsedUrl = new URL(dbUrl);
      if (!parsedUrl.host) {
        throw new Error('Missing host in database URL');
      }
    } catch {
      throw new Error('[ConfigValidationError] DATABASE_URL is malformed and cannot be parsed.');
    }
  }

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

    // Database credentials validation with explicit precedence:
    // 1. If DATABASE_URL is present, it must not be a placeholder
    // 2. If DATABASE_URL is absent, discrete DB_PASSWORD and DB_HOST are required
    // 3. If neither is valid, fail startup
    const hasDatabaseUrl = Boolean(parsedConfig.DATABASE_URL && parsedConfig.DATABASE_URL.trim());
    if (hasDatabaseUrl) {
      if (isObviousPlaceholder(parsedConfig.DATABASE_URL)) {
        productionErrors.push('DATABASE_URL cannot be a placeholder in production.');
      }
    } else {
      if (!parsedConfig.DB_PASSWORD) {
        productionErrors.push('Production requires either a valid DATABASE_URL or non-empty DB_PASSWORD with discrete DB credentials.');
      }
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
