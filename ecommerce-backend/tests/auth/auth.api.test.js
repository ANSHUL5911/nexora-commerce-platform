import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { Sequelize } from 'sequelize';
import pg from 'pg';
import { config } from '../../src/config/env.js';
import { createApp } from '../../src/app.js';
import { getMigrator, migrateReset } from '../../src/database/migrator.js';
import { User, Session, AuditLog } from '../../src/models/index.js';
import { hashPassword } from '../../src/modules/auth/password.js';

describe('Phase 07.3 — Authentication API Integration & Security Tests', () => {
  let app;
  let testSequelize;

  beforeAll(async () => {
    app = createApp();

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
    await testSequelize.query('TRUNCATE users, sessions, audit_logs CASCADE;');
  });

  describe('A. Customer Registration (POST /api/auth/register)', () => {
    it('successfully registers customer with secure bcrypt hash and sets cookies', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .set('X-Forwarded-For', '10.0.1.1')
        .send({
          email: 'Customer.One@Example.com',
          password: 'Password123!',
          full_name: 'Customer One',
        });

      expect(res.status).toBe(201);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.id).toBeDefined();
      expect(res.body.user.email).toBe('customer.one@example.com');
      expect(res.body.user.full_name).toBe('Customer One');
      expect(res.body.user.role).toBe('customer');
      expect(res.body.user.is_active).toBe(true);

      // Security check: passwords and hashes MUST NOT be returned in response body
      expect(res.body.user.password).toBeUndefined();
      expect(res.body.user.password_hash).toBeUndefined();
      expect(res.body.password).toBeUndefined();
      expect(res.body.password_hash).toBeUndefined();

      // Verify database persistence
      const dbUser = await User.scope('withPassword').findOne({
        where: { email: 'customer.one@example.com' },
      });
      expect(dbUser).not.toBeNull();
      expect(dbUser.password_hash).not.toBe('Password123!');
      expect(dbUser.password_hash.startsWith('$2b$12$') || dbUser.password_hash.startsWith('$2a$12$')).toBe(true);

      // Verify cookies
      const setCookie = res.headers['set-cookie'];
      expect(setCookie).toBeDefined();
      const sidCookie = setCookie.find((c) => c.startsWith('__Host-nexora_sid='));
      expect(sidCookie).toBeDefined();
      expect(sidCookie).toContain('HttpOnly');
      expect(sidCookie).toContain('SameSite=Lax');
      expect(sidCookie).toContain('Path=/');

      const csrfCookie = setCookie.find((c) => c.startsWith('nexora_csrf='));
      expect(csrfCookie).toBeDefined();
      expect(csrfCookie).toContain('Path=/');

      // Verify Audit Log entry
      const auditEntry = await AuditLog.findOne({
        where: { actor_id: dbUser.id, action: 'AUTH_REGISTER_SUCCESS' },
      });
      expect(auditEntry).not.toBeNull();
    });

    it('rejects duplicate email with 409 Conflict', async () => {
      await request(app)
        .post('/api/auth/register')
        .set('X-Forwarded-For', '10.0.1.2')
        .send({
          email: 'duplicate@example.com',
          password: 'Password123!',
          full_name: 'First Register',
        });

      const res = await request(app)
        .post('/api/auth/register')
        .set('X-Forwarded-For', '10.0.1.2')
        .send({
          email: 'DUPLICATE@example.com',
          password: 'Password123!',
          full_name: 'Second Register',
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
    });

    it('rejects invalid email, short password, or missing full_name with 400', async () => {
      const resInvalidEmail = await request(app)
        .post('/api/auth/register')
        .set('X-Forwarded-For', '10.0.1.3')
        .send({
          email: 'not-an-email',
          password: 'Password123!',
          full_name: 'Test',
        });
      expect(resInvalidEmail.status).toBe(400);

      const resShortPass = await request(app)
        .post('/api/auth/register')
        .set('X-Forwarded-For', '10.0.1.4')
        .send({
          email: 'valid@example.com',
          password: 'short',
          full_name: 'Test',
        });
      expect(resShortPass.status).toBe(400);

      const resMissingName = await request(app)
        .post('/api/auth/register')
        .set('X-Forwarded-For', '10.0.1.5')
        .send({
          email: 'valid@example.com',
          password: 'Password123!',
          full_name: '',
        });
      expect(resMissingName.status).toBe(400);
    });
  });

  describe('B. Login (POST /api/auth/login)', () => {
    beforeEach(async () => {
      const hashed = await hashPassword('SecurePassword123!');
      await User.create({
        id: '11111111-1111-4111-8111-111111111111',
        email: 'customer@test.local',
        password_hash: hashed,
        full_name: 'Test Customer',
        role: 'customer',
        is_active: true,
      });
    });

    it('successfully logs in with valid credentials and establishes session', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', '10.0.2.1')
        .send({
          email: 'customer@test.local',
          password: 'SecurePassword123!',
        });

      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe('customer@test.local');
      expect(res.body.user.password_hash).toBeUndefined();

      const setCookie = res.headers['set-cookie'];
      const sidCookie = setCookie.find((c) => c.startsWith('__Host-nexora_sid='));
      expect(sidCookie).toBeDefined();

      // Verify Session in database
      const sid = sidCookie.split(';')[0].split('=')[1];
      const dbSession = await Session.findByPk(sid);
      expect(dbSession).not.toBeNull();
      expect(dbSession.user_id).toBe('11111111-1111-4111-8111-111111111111');
    });

    it('returns generic 401 INVALID_CREDENTIALS for wrong password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', '10.0.2.2')
        .send({
          email: 'customer@test.local',
          password: 'WrongPassword999!',
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(res.body.error.message).toBe('Invalid email or password');
    });

    it('returns generic 401 INVALID_CREDENTIALS for nonexistent user (no enumeration)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', '10.0.2.3')
        .send({
          email: 'nonexistent_user@test.local',
          password: 'SomePassword123!',
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(res.body.error.message).toBe('Invalid email or password');
    });

    it('enforces session fixation rotation on login', async () => {
      // 1. Initial login establishes session 1
      const res1 = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', '10.0.2.4')
        .send({
          email: 'customer@test.local',
          password: 'SecurePassword123!',
        });
      const cookie1 = res1.headers['set-cookie'].find((c) => c.startsWith('__Host-nexora_sid='));
      const sid1 = cookie1.split(';')[0].split('=')[1];

      // 2. Second login with previous cookie establishes session 2 and deletes session 1
      const res2 = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', '10.0.2.5')
        .set('Cookie', [`__Host-nexora_sid=${sid1}`])
        .send({
          email: 'customer@test.local',
          password: 'SecurePassword123!',
        });
      const cookie2 = res2.headers['set-cookie'].find((c) => c.startsWith('__Host-nexora_sid='));
      const sid2 = cookie2.split(';')[0].split('=')[1];

      expect(sid2).not.toBe(sid1);
      expect(await Session.findByPk(sid1)).toBeNull();
      expect(await Session.findByPk(sid2)).not.toBeNull();
    });
  });

  describe('C. Current User & Authenticated Requests (GET /api/auth/me)', () => {
    let activeSid;

    beforeEach(async () => {
      const hashed = await hashPassword('SecurePassword123!');
      await User.create({
        id: '22222222-2222-4222-8222-222222222222',
        email: 'me_test@example.com',
        password_hash: hashed,
        full_name: 'Me Test User',
        role: 'customer',
        is_active: true,
      });

      const session = await Session.create({
        sid: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
        user_id: '22222222-2222-4222-8222-222222222222',
        expires_at: new Date(Date.now() + 604800000),
      });
      activeSid = session.sid;
    });

    it('returns sanitized current user when authenticated with valid session cookie', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', [`__Host-nexora_sid=${activeSid}`]);

      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.id).toBe('22222222-2222-4222-8222-222222222222');
      expect(res.body.user.email).toBe('me_test@example.com');
      expect(res.body.user.role).toBe('customer');
      expect(res.body.user.password_hash).toBeUndefined();
    });

    it('returns 401 when no session cookie is present', async () => {
      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('returns 401 when session cookie is invalid or expired', async () => {
      const expiredSid = '1111110123456789abcdef0123456789abcdef0123456789abcdef0123456789';
      await Session.create({
        sid: expiredSid,
        user_id: '22222222-2222-4222-8222-222222222222',
        expires_at: new Date(Date.now() - 10000), // Expired
      });

      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', [`__Host-nexora_sid=${expiredSid}`]);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    });
  });

  describe('D. Logout (POST /api/auth/logout)', () => {
    it('deletes session from database and clears cookies', async () => {
      const hashed = await hashPassword('SecurePassword123!');
      await User.create({
        id: '33333333-3333-4333-8333-333333333333',
        email: 'logout_user@example.com',
        password_hash: hashed,
        full_name: 'Logout User',
        role: 'customer',
        is_active: true,
      });

      const loginRes = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', '10.0.3.1')
        .send({
          email: 'logout_user@example.com',
          password: 'SecurePassword123!',
        });

      const sidCookie = loginRes.headers['set-cookie'].find((c) => c.startsWith('__Host-nexora_sid='));
      const sid = sidCookie.split(';')[0].split('=')[1];

      // Execute Logout
      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', [`__Host-nexora_sid=${sid}`]);

      expect(logoutRes.status).toBe(200);

      // Verify Session deleted in PostgreSQL
      expect(await Session.findByPk(sid)).toBeNull();

      // Subsequent /me call must return 401
      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Cookie', [`__Host-nexora_sid=${sid}`]);

      expect(meRes.status).toBe(401);
    });

    it('is idempotent when called without active session', async () => {
      const res = await request(app).post('/api/auth/logout');
      expect(res.status).toBe(200);
    });
  });

  describe('E. Authentication Rate Limiting', () => {
    it('enforces 5 requests per minute threshold on authentication endpoints', async () => {
      const testIp = '192.168.100.1';

      // 5 requests succeed (or return 401 for wrong credentials)
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post('/api/auth/login')
          .set('X-Forwarded-For', testIp)
          .send({ email: 'rate_test@example.com', password: 'wrong' });
        expect([400, 401]).toContain(res.status);
      }

      // 6th request from same IP is rejected with 429
      const rateLimitedRes = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', testIp)
        .send({ email: 'rate_test@example.com', password: 'wrong' });

      expect(rateLimitedRes.status).toBe(429);
      expect(rateLimitedRes.body.error).toBeDefined();
      expect(rateLimitedRes.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    });
  });
});
