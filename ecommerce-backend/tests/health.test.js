import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';

describe('Health Check API', () => {
  it('returns 200 OK with service metadata and request correlation ID', async () => {
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
});
