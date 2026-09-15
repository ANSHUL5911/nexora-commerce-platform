import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { sequelize } from '../src/config/database.js';

describe('Health Check API', () => {
  it('returns 200 OK with service metadata and request correlation ID for liveness', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      service: 'nexora-backend',
    });
    expect(res.body.environment).toBeDefined();
    expect(res.body.timestamp).toBeDefined();
    expect(res.body.requestId).toBeDefined();
    expect(res.headers['x-request-id']).toBe(res.body.requestId);
  });

  it('returns 200 OK with database: connected for operational readiness check', async () => {
    const res = await request(app).get('/api/health/ready');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ready',
      service: 'nexora-backend',
      database: 'connected',
    });
    expect(res.body.timestamp).toBeDefined();
    expect(res.body.requestId).toBeDefined();
    // Invariant: Never expose database credentials, host, or internal stack traces
    expect(res.body.password).toBeUndefined();
    expect(res.body.host).toBeUndefined();
    expect(res.body.stack).toBeUndefined();
  });

  it('returns 503 with sanitized payload if database connection fails during readiness check', async () => {
    const authenticateSpy = vi.spyOn(sequelize, 'authenticate').mockRejectedValueOnce(
      new Error('Connection to postgres://user:secret@db.internal failed')
    );

    const res = await request(app).get('/api/health/ready');

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      status: 'not_ready',
      service: 'nexora-backend',
      database: 'disconnected',
    });
    // Invariant: Never leak connection string, password, or error stack to client
    expect(JSON.stringify(res.body)).not.toContain('secret');
    expect(JSON.stringify(res.body)).not.toContain('postgres://');
    expect(res.body.stack).toBeUndefined();

    authenticateSpy.mockRestore();
  });
});
