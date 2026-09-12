import { describe, it, expect } from 'vitest';
import {
  generateGuestToken,
  hashGuestToken,
  verifyGuestToken,
  isGuestTokenExpired,
} from '../../src/modules/orders/guestToken.js';
import { redactSensitiveData } from '../../src/utils/logger.js';

describe('Phase 07.11 — Guest Token Cryptography, Lifecycle & Security Tests', () => {
  describe('1. Token Generation & CSPRNG Entropy', () => {
    it('generates a 256-bit CSPRNG token (64 hex characters) and matching SHA-256 hash', () => {
      const { rawToken, tokenHash } = generateGuestToken();

      expect(typeof rawToken).toBe('string');
      expect(rawToken).toHaveLength(64); // 32 bytes = 256 bits = 64 hex characters
      expect(/^[0-9a-f]{64}$/.test(rawToken)).toBe(true);

      expect(typeof tokenHash).toBe('string');
      expect(tokenHash).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(tokenHash)).toBe(true);

      // Verify SHA-256 relationship
      const computedHash = hashGuestToken(rawToken);
      expect(computedHash).toBe(tokenHash);
      expect(rawToken).not.toBe(tokenHash);
    });

    it('generates unique tokens across multiple sequential invocations (no collisions)', () => {
      const tokenCount = 1000;
      const rawTokens = new Set();
      const tokenHashes = new Set();

      for (let i = 0; i < tokenCount; i++) {
        const { rawToken, tokenHash } = generateGuestToken();
        rawTokens.add(rawToken);
        tokenHashes.add(tokenHash);
      }

      expect(rawTokens.size).toBe(tokenCount);
      expect(tokenHashes.size).toBe(tokenCount);
    });
  });

  describe('2. Constant-Time Hash Verification', () => {
    it('returns true when raw token matches the stored SHA-256 hash', () => {
      const { rawToken, tokenHash } = generateGuestToken();
      const isValid = verifyGuestToken(rawToken, tokenHash);
      expect(isValid).toBe(true);
    });

    it('returns false when raw token does not match the stored hash', () => {
      const token1 = generateGuestToken();
      const token2 = generateGuestToken();

      const isValid = verifyGuestToken(token1.rawToken, token2.tokenHash);
      expect(isValid).toBe(false);
    });

    it('safely handles empty, malformed, or mismatched length inputs without throwing TypeError', () => {
      const { rawToken, tokenHash } = generateGuestToken();

      expect(verifyGuestToken('', tokenHash)).toBe(false);
      expect(verifyGuestToken(rawToken, '')).toBe(false);
      expect(verifyGuestToken(null, tokenHash)).toBe(false);
      expect(verifyGuestToken(rawToken, null)).toBe(false);
      expect(verifyGuestToken(undefined, undefined)).toBe(false);
      expect(verifyGuestToken('short-token', tokenHash)).toBe(false);
      expect(verifyGuestToken(rawToken, 'invalid-hash')).toBe(false);
    });
  });

  describe('3. Token Expiration Lifecycle', () => {
    it('returns false for an order created recently (within 30 days)', () => {
      const now = new Date();
      expect(isGuestTokenExpired(now, 30)).toBe(false);

      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      expect(isGuestTokenExpired(fiveDaysAgo, 30)).toBe(false);

      const twentyNineDaysAgo = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
      expect(isGuestTokenExpired(twentyNineDaysAgo, 30)).toBe(false);
    });

    it('returns true for an order created beyond the 30-day expiration window', () => {
      const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
      expect(isGuestTokenExpired(thirtyOneDaysAgo, 30)).toBe(true);

      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      expect(isGuestTokenExpired(sixtyDaysAgo, 30)).toBe(true);
    });

    it('returns true for invalid or missing timestamp', () => {
      expect(isGuestTokenExpired(null)).toBe(true);
      expect(isGuestTokenExpired(undefined)).toBe(true);
      expect(isGuestTokenExpired('invalid-date')).toBe(true);
    });
  });

  describe('4. Centralized Structured Logging Redaction', () => {
    it('deeply redacts raw guest tokens and guest token hashes from logs', () => {
      const testPayload = {
        requestId: 'req-test-123',
        headers: {
          'x-guest-token': 'a3f890b21c4e567d890a123b456c789d012e345f678a901b23c456d789e012f3',
          'content-type': 'application/json',
        },
        body: {
          guestToken: 'a3f890b21c4e567d890a123b456c789d012e345f678a901b23c456d789e012f3',
          guest_token_hash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
          orderId: '550e8400-e29b-41d4-a716-446655440000',
        },
      };

      const redacted = redactSensitiveData(testPayload);

      expect(redacted.headers['x-guest-token']).toBe('[REDACTED]');
      expect(redacted.headers['content-type']).toBe('application/json');
      expect(redacted.body.guestToken).toBe('[REDACTED]');
      expect(redacted.body.guest_token_hash).toBe('[REDACTED]');
      expect(redacted.body.orderId).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(redacted.requestId).toBe('req-test-123');
    });
  });
});
