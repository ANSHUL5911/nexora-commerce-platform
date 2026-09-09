import { describe, it, expect } from 'vitest';
import bcrypt from 'bcrypt';
import { hashPassword, verifyPassword, verifyDummyPassword } from '../../src/modules/auth/password.js';

describe('Phase 07.3 — Password Hashing & Timing Mitigation Tests', () => {
  it('hashes password with bcrypt cost factor 12', async () => {
    const plain = 'super_secret_pass_123';
    const hash = await hashPassword(plain);

    expect(hash).toBeDefined();
    expect(hash).not.toBe(plain);
    expect(hash.startsWith('$2b$12$') || hash.startsWith('$2a$12$')).toBe(true);

    const rounds = bcrypt.getRounds(hash);
    expect(rounds).toBe(12);
  });

  it('verifies correct password returns true', async () => {
    const plain = 'valid_Password_987!';
    const hash = await hashPassword(plain);

    const isValid = await verifyPassword(plain, hash);
    expect(isValid).toBe(true);
  });

  it('rejects incorrect password with false', async () => {
    const plain = 'valid_Password_987!';
    const hash = await hashPassword(plain);

    const isValid = await verifyPassword('wrong_password_attempt', hash);
    expect(isValid).toBe(false);
  });

  it('handles empty or malformed inputs safely without throwing', async () => {
    expect(await verifyPassword('', 'hash')).toBe(false);
    expect(await verifyPassword('password', '')).toBe(false);
    expect(await verifyPassword(null, undefined)).toBe(false);
  });

  it('executes dummy password verification on nonexistent accounts to reduce timing differences', async () => {
    const startTime = Date.now();
    const result = await verifyDummyPassword('attacker_password_guess');
    const duration = Date.now() - startTime;

    expect(result).toBe(false);
    // Bcrypt cost 12 takes meaningful CPU time (typically > 50ms)
    expect(duration).toBeGreaterThanOrEqual(10);
  });
});
