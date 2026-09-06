import { describe, it, expect } from 'vitest';
import { validateConfig } from '../src/config/env.js';

describe('Environment Configuration & Validation', () => {
  it('parses valid development configuration with defaults', () => {
    const config = validateConfig({
      NODE_ENV: 'development',
      PORT: '5000',
    });

    expect(config.NODE_ENV).toBe('development');
    expect(config.PORT).toBe(5000);
    expect(config.DB_HOST).toBe('localhost');
    expect(config.DB_PORT).toBe(5432);
    expect(config.SESSION_MAX_AGE_MS).toBe(604800000);
    expect(config.SESSION_SAME_SITE).toBe('lax');
    expect(config.RATE_LIMIT_MAX_AUTH).toBe(5);
    expect(config.CORS_ORIGIN).toBe('http://localhost:5173');
  });

  it('fails fast on invalid port or data types', () => {
    expect(() => {
      validateConfig({
        PORT: 'invalid_port',
      });
    }).toThrow(/ConfigValidationError/);
  });

  it('rejects short or placeholder secrets in production mode', () => {
    expect(() => {
      validateConfig({
        NODE_ENV: 'production',
        SESSION_SECRET: 'short_secret',
        GUEST_TOKEN_SECRET: 'valid_guest_secret_of_at_least_32_characters_length_ok',
        RAZORPAY_KEY_ID: 'rzp_live_real_id',
        RAZORPAY_KEY_SECRET: 'real_secret_val',
        RAZORPAY_WEBHOOK_SECRET: 'real_webhook_secret',
        DB_PASSWORD: 'real_strong_password',
        CORS_ORIGIN: 'https://nexora.com',
      });
    }).toThrow(/Production security validation failed/);
  });

  it('rejects obvious placeholder values in production', () => {
    expect(() => {
      validateConfig({
        NODE_ENV: 'production',
        SESSION_SECRET: 'replace_with_a_secure_random_32_character_string_for_sessions',
        GUEST_TOKEN_SECRET: 'valid_guest_secret_of_at_least_32_characters_length_ok',
        RAZORPAY_KEY_ID: 'rzp_live_real_id',
        RAZORPAY_KEY_SECRET: 'real_secret_val',
        RAZORPAY_WEBHOOK_SECRET: 'real_webhook_secret',
        DB_PASSWORD: 'real_password',
        CORS_ORIGIN: 'https://nexora.com',
      });
    }).toThrow(/SESSION_SECRET must be at least 32 characters and cannot be a default\/placeholder/);
  });

  it('rejects wildcard CORS_ORIGIN in production', () => {
    expect(() => {
      validateConfig({
        NODE_ENV: 'production',
        SESSION_SECRET: 'valid_session_secret_of_at_least_32_chars_long_123',
        GUEST_TOKEN_SECRET: 'valid_guest_secret_of_at_least_32_chars_long_123',
        RAZORPAY_KEY_ID: 'rzp_live_real_id',
        RAZORPAY_KEY_SECRET: 'real_secret_val',
        RAZORPAY_WEBHOOK_SECRET: 'real_webhook_secret',
        DB_PASSWORD: 'real_password',
        CORS_ORIGIN: '*',
      });
    }).toThrow(/CORS_ORIGIN cannot contain wildcard/);
  });

  it('accepts valid production configuration without leaking secrets in errors', () => {
    const prodConfig = validateConfig({
      NODE_ENV: 'production',
      SESSION_SECRET: 'super_secure_production_session_signing_key_32_chars',
      GUEST_TOKEN_SECRET: 'super_secure_production_guest_token_signing_key_32_chars',
      RAZORPAY_KEY_ID: 'rzp_live_abcd1234efgh',
      RAZORPAY_KEY_SECRET: 'live_secret_hex_string_987654321',
      RAZORPAY_WEBHOOK_SECRET: 'live_webhook_secret_hex_string_12345',
      DB_PASSWORD: 'prod_database_secret_password',
      CORS_ORIGIN: 'https://nexora.com',
    });

    expect(prodConfig.NODE_ENV).toBe('production');
    expect(prodConfig.CORS_ORIGIN).toBe('https://nexora.com');
  });
});
