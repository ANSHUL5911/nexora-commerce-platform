import { describe, it, expect } from 'vitest';
import {
  AppError,
  ValidationError,
  AuthenticationError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  DatabaseError,
} from '../src/utils/errors.js';
import { redactSensitiveData } from '../src/utils/logger.js';

describe('Central Error Hierarchy & Logger Redaction', () => {
  it('instantiates custom errors with correct status codes and machine codes', () => {
    const baseErr = new AppError('Base operational error', 500, 'BASE_ERROR');
    expect(baseErr.isOperational).toBe(true);

    const valErr = new ValidationError('Invalid email format', { field: 'email' });
    expect(valErr.statusCode).toBe(400);
    expect(valErr.code).toBe('VALIDATION_ERROR');
    expect(valErr.details).toEqual({ field: 'email' });
    expect(valErr.isOperational).toBe(true);

    const authErr = new AuthenticationError();
    expect(authErr.statusCode).toBe(401);
    expect(authErr.code).toBe('UNAUTHENTICATED');

    const forbidErr = new ForbiddenError();
    expect(forbidErr.statusCode).toBe(403);
    expect(forbidErr.code).toBe('FORBIDDEN');

    const notFoundErr = new NotFoundError();
    expect(notFoundErr.statusCode).toBe(404);
    expect(notFoundErr.code).toBe('NOT_FOUND');

    const conflictErr = new ConflictError();
    expect(conflictErr.statusCode).toBe(409);
    expect(conflictErr.code).toBe('CONFLICT');

    const rateErr = new RateLimitError();
    expect(rateErr.statusCode).toBe(429);
    expect(rateErr.code).toBe('RATE_LIMIT_EXCEEDED');

    const dbErr = new DatabaseError();
    expect(dbErr.statusCode).toBe(500);
    expect(dbErr.code).toBe('DATABASE_ERROR');
  });

  it('redacts sensitive fields in log context', () => {
    const sensitiveObj = {
      user: {
        id: 'u-123',
        email: 'user@example.com',
        password: 'SuperSecretPassword!',
        token: 'secret_jwt_token',
      },
      headers: {
        authorization: 'Bearer secret_token',
        cookie: 'sessionId=abc123456',
        'x-guest-token': 'guest_token_123',
      },
      payment: {
        cardNumber: '4111111111111111',
        cvv: '123',
        razorpay_signature: 'sig_abc_xyz',
      },
    };

    const redacted = redactSensitiveData(sensitiveObj);

    expect(redacted.user.id).toBe('u-123');
    expect(redacted.user.email).toBe('user@example.com');
    expect(redacted.user.password).toBe('[REDACTED]');
    expect(redacted.user.token).toBe('[REDACTED]');
    expect(redacted.headers.authorization).toBe('[REDACTED]');
    expect(redacted.headers.cookie).toBe('[REDACTED]');
    expect(redacted.headers['x-guest-token']).toBe('[REDACTED]');
    expect(redacted.payment.cardNumber).toBe('[REDACTED]');
    expect(redacted.payment.cvv).toBe('[REDACTED]');
    expect(redacted.payment.razorpay_signature).toBe('[REDACTED]');
  });

  it('safely handles circular references during redaction', () => {
    const circularObj = { name: 'test' };
    circularObj.self = circularObj;

    const result = redactSensitiveData(circularObj);
    expect(result.name).toBe('test');
    expect(result.self).toBe('[Circular]');
  });
});
