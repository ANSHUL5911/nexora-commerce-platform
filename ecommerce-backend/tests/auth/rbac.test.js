import { describe, it, expect, vi } from 'vitest';
import { requireRole, requireAdmin, assertOwnerOrAdmin } from '../../src/modules/auth/rbac.middleware.js';

describe('Phase 07.3 — RBAC & User Isolation Foundation Tests', () => {
  describe('requireRole middleware', () => {
    it('returns 401 when request is unauthenticated', () => {
      const middleware = requireRole('customer');
      const req = {};
      const res = {};
      const next = vi.fn();

      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
          code: 'AUTHENTICATION_REQUIRED',
        })
      );
    });

    it('returns 403 when authenticated user has insufficient role', () => {
      const middleware = requireRole('admin');
      const req = { user: { id: 'user-1', role: 'customer' } };
      const res = {};
      const next = vi.fn();

      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 403,
          code: 'INSUFFICIENT_PERMISSIONS',
        })
      );
    });

    it('allows access when authenticated user has matching role', () => {
      const middleware = requireRole('admin');
      const req = { user: { id: 'admin-1', role: 'admin' } };
      const res = {};
      const next = vi.fn();

      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });

    it('accepts array of allowed roles', () => {
      const middleware = requireRole(['customer', 'admin']);
      const reqCustomer = { user: { id: 'user-1', role: 'customer' } };
      const nextCustomer = vi.fn();

      middleware(reqCustomer, {}, nextCustomer);
      expect(nextCustomer).toHaveBeenCalledWith();

      const reqAdmin = { user: { id: 'admin-1', role: 'admin' } };
      const nextAdmin = vi.fn();

      middleware(reqAdmin, {}, nextAdmin);
      expect(nextAdmin).toHaveBeenCalledWith();
    });

    it('enforces requireAdmin convenience helper', () => {
      const req = { user: { id: 'user-1', role: 'customer' } };
      const next = vi.fn();

      requireAdmin(req, {}, next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 403,
          code: 'INSUFFICIENT_PERMISSIONS',
        })
      );
    });
  });

  describe('assertOwnerOrAdmin IDOR defense helper', () => {
    it('allows access when user ID matches target resource owner ID', () => {
      const reqUser = { id: 'user-123', role: 'customer' };
      expect(assertOwnerOrAdmin(reqUser, 'user-123')).toBe(true);
    });

    it('allows access when user role is admin regardless of target user ID', () => {
      const adminUser = { id: 'admin-999', role: 'admin' };
      expect(assertOwnerOrAdmin(adminUser, 'user-123')).toBe(true);
    });

    it('throws 403 Forbidden when customer user attempts to access another user resource', () => {
      const reqUser = { id: 'user-123', role: 'customer' };

      expect(() => assertOwnerOrAdmin(reqUser, 'user-456')).toThrowError();
      try {
        assertOwnerOrAdmin(reqUser, 'user-456');
      } catch (err) {
        expect(err.statusCode).toBe(403);
        expect(err.code).toBe('FORBIDDEN');
      }
    });

    it('throws 401 AuthenticationError when user context is missing', () => {
      expect(() => assertOwnerOrAdmin(null, 'user-123')).toThrowError();
      try {
        assertOwnerOrAdmin(null, 'user-123');
      } catch (err) {
        expect(err.statusCode).toBe(401);
        expect(err.code).toBe('AUTHENTICATION_REQUIRED');
      }
    });
  });
});
