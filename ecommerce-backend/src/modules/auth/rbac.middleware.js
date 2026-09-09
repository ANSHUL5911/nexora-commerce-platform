import { AuthenticationError, ForbiddenError } from '../../utils/errors.js';

/**
 * Role-Based Access Control (RBAC) middleware factory.
 * Enforces server-side database-backed role authorization.
 *
 * @param {string | string[]} roles - Required role or array of allowed roles
 */
export function requireRole(roles) {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];

  return (req, res, next) => {
    if (!req.user) {
      return next(
        new AuthenticationError('Authentication required to access this resource.', 'AUTHENTICATION_REQUIRED')
      );
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new ForbiddenError(
          'Access denied: Insufficient privileges to perform this action.',
          'INSUFFICIENT_PERMISSIONS'
        )
      );
    }

    return next();
  };
}

/**
 * Pre-configured Admin-only access middleware.
 */
export const requireAdmin = requireRole('admin');

/**
 * Formalized User Isolation & IDOR Defense Helper.
 * Evaluates whether the authenticated user is the owner of the resource or an administrator.
 *
 * Rules:
 * 1. If reqUser.id === targetUserId -> ALLOW.
 * 2. Else if reqUser.role === 'admin' -> ALLOW.
 * 3. Otherwise -> throws ForbiddenError (HTTP 403).
 *
 * @param {{ id: string, role: string }} reqUser - Authenticated user object from server session
 * @param {string} targetUserId - Owner user ID of target resource
 * @returns {boolean} - Returns true if authorized, throws ForbiddenError if denied
 */
export function assertOwnerOrAdmin(reqUser, targetUserId) {
  if (!reqUser || !reqUser.id) {
    throw new AuthenticationError('Authentication required for resource access.', 'AUTHENTICATION_REQUIRED');
  }

  if (reqUser.id === targetUserId) {
    return true;
  }

  if (reqUser.role === 'admin') {
    return true;
  }

  throw new ForbiddenError('Access denied: You do not have permission to access this resource.', 'FORBIDDEN');
}

export default {
  requireRole,
  requireAdmin,
  assertOwnerOrAdmin,
};
