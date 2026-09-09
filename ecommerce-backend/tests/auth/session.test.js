import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import crypto from 'crypto';
import { Sequelize } from 'sequelize';
import pg from 'pg';
import { config } from '../../src/config/env.js';
import { getMigrator, migrateReset } from '../../src/database/migrator.js';
import {
  generateSessionId,
  isValidSessionIdFormat,
  createSession,
  findValidSession,
  touchSessionIfDue,
  deleteSession,
  rotateSession,
  SESSION_TTL_MS,
} from '../../src/modules/auth/session.service.js';
import { User, Session } from '../../src/models/index.js';

describe('Phase 07.3 — PostgreSQL Session Service Tests', () => {
  let testSequelize;
  let testUserId;

  beforeAll(async () => {
    testSequelize = new Sequelize({
      dialect: 'postgres',
      dialectModule: pg,
      host: config.DB_HOST,
      port: config.DB_PORT,
      database: process.env.TEST_DB_NAME || 'nexora_test',
      username: config.DB_USER,
      password: config.DB_PASSWORD,
      logging: false,
    });

    await testSequelize.authenticate();
    await migrateReset(testSequelize);
    const migrator = getMigrator(testSequelize);
    await migrator.up();
  });

  afterAll(async () => {
    if (testSequelize) {
      await testSequelize.close();
    }
  });

  beforeEach(async () => {
    await testSequelize.query('TRUNCATE users, sessions CASCADE;');
    testUserId = crypto.randomUUID();
    await User.create({
      id: testUserId,
      email: 'session_test_user@example.com',
      password_hash: 'dummy_hashed_password',
      full_name: 'Session Test User',
      role: 'customer',
      is_active: true,
    });
  });

  it('generates 256-bit opaque random session tokens (64 hex chars)', () => {
    const sid1 = generateSessionId();
    const sid2 = generateSessionId();

    expect(sid1).toHaveLength(64);
    expect(sid2).toHaveLength(64);
    expect(sid1).not.toBe(sid2);
    expect(isValidSessionIdFormat(sid1)).toBe(true);
    expect(isValidSessionIdFormat('invalid_short_token')).toBe(false);
  });

  it('persists session in PostgreSQL with 7-day expiration', async () => {
    const session = await createSession(testUserId);
    expect(session.sid).toHaveLength(64);
    expect(session.user_id).toBe(testUserId);

    const expiresAt = new Date(session.expires_at).getTime();
    const now = Date.now();
    const diff = expiresAt - now;

    // Should be approximately 7 days (604,800,000 ms) within 5 seconds tolerance
    expect(diff).toBeGreaterThan(SESSION_TTL_MS - 5000);
    expect(diff).toBeLessThanOrEqual(SESSION_TTL_MS + 1000);
  });

  it('finds valid active session and eager-loads user', async () => {
    const session = await createSession(testUserId);
    const result = await findValidSession(session.sid);

    expect(result).not.toBeNull();
    expect(result.session.sid).toBe(session.sid);
    expect(result.user.id).toBe(testUserId);
    expect(result.user.email).toBe('session_test_user@example.com');
  });

  it('rejects expired session and never revives it', async () => {
    const expiredDate = new Date(Date.now() - 10000); // 10 seconds in past
    const expiredSid = generateSessionId();

    await Session.create({
      sid: expiredSid,
      user_id: testUserId,
      expires_at: expiredDate,
    });

    const result = await findValidSession(expiredSid);
    expect(result).toBeNull();

    // Trying to refresh expired session should fail safely
    const refreshed = await touchSessionIfDue(expiredSid, expiredDate);
    expect(refreshed).toBe(false);
  });

  it('refreshes rolling session expiration when threshold is met', async () => {
    // Create session that is 2 days old (past the 1-day refresh threshold)
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000);
    const initialExpiresAt = new Date(twoDaysAgo.getTime() + SESSION_TTL_MS); // 5 days remaining
    const sid = generateSessionId();

    await Session.create({
      sid,
      user_id: testUserId,
      expires_at: initialExpiresAt,
      created_at: twoDaysAgo,
      updated_at: twoDaysAgo,
    });

    const refreshed = await touchSessionIfDue(sid, initialExpiresAt);
    expect(refreshed).toBe(true);

    const updated = await Session.findByPk(sid);
    const updatedExpiry = new Date(updated.expires_at).getTime();
    const now = Date.now();

    // Expiry bumped back to ~7 days from now
    expect(updatedExpiry - now).toBeGreaterThan(SESSION_TTL_MS - 5000);
  });

  it('does not write to database if refresh threshold has not elapsed', async () => {
    const session = await createSession(testUserId);
    const refreshed = await touchSessionIfDue(session.sid, session.expires_at);
    // Brand new session has ~7 days remaining, threshold not due
    expect(refreshed).toBe(false);
  });

  it('deletes session upon logout', async () => {
    const session = await createSession(testUserId);
    const deletedCount = await deleteSession(session.sid);
    expect(deletedCount).toBe(1);

    const result = await findValidSession(session.sid);
    expect(result).toBeNull();
  });

  it('rotates session for session fixation protection', async () => {
    const oldSession = await createSession(testUserId);
    const newSession = await rotateSession(oldSession.sid, testUserId);

    expect(newSession.sid).not.toBe(oldSession.sid);
    expect(await findValidSession(oldSession.sid)).toBeNull();
    expect(await findValidSession(newSession.sid)).not.toBeNull();
  });
});
