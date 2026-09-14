import crypto from 'crypto';
import { sequelize } from '../../config/database.js';
import { User } from '../../models/User.js';
import { Session } from '../../models/Session.js';
import { AuditLog } from '../../models/AuditLog.js';
import { hashPassword, verifyPassword, verifyDummyPassword } from './password.js';
import { createSession, rotateSession, deleteSession, hashSessionId, isValidSessionIdFormat } from './session.service.js';
import { generateCsrfToken } from './csrf.js';
import { toSafeUserDTO } from './auth.dto.js';
import { ConflictError, AuthenticationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

/**
 * Register a new customer account atomically in a database transaction.
 *
 * @param {{ email: string, password: string, full_name: string, ipAddress?: string }} params
 * @returns {Promise<{ user: ReturnType<typeof toSafeUserDTO>, session: import('../../models/Session.js').Session, csrfToken: string }>}
 */
export async function register({ email, password, full_name, ipAddress = '127.0.0.1' }) {
  const normalizedEmail = email.trim().toLowerCase();

  // Check if account already exists
  const existingUser = await User.findOne({
    where: { email: normalizedEmail },
    attributes: ['id'],
  });

  if (existingUser) {
    throw new ConflictError('An account with this email address already exists.', 'EMAIL_ALREADY_EXISTS');
  }

  const passwordHash = await hashPassword(password);
  const userId = crypto.randomUUID();
  const auditLogId = crypto.randomUUID();

  // Execute user creation, session generation, and audit logging atomically
  const result = await sequelize.transaction(async (t) => {
    const user = await User.create(
      {
        id: userId,
        email: normalizedEmail,
        password_hash: passwordHash,
        full_name,
        role: 'customer',
        is_active: true,
      },
      { transaction: t }
    );

    const session = await createSession(user.id, { transaction: t });

    await AuditLog.create(
      {
        id: auditLogId,
        actor_id: user.id,
        action: 'AUTH_REGISTER_SUCCESS',
        target_resource: 'users',
        resource_id: user.id,
        ip_address: ipAddress.slice(0, 45),
        details_json: { role: 'customer' },
        created_at: new Date(),
      },
      { transaction: t }
    );

    return { user, session };
  });

  const csrfToken = generateCsrfToken();

  logger.info({
    event: 'auth.register.success',
    message: 'User registered successfully',
    userId: result.user.id,
    actorType: result.user.role,
    role: result.user.role,
    ip: ipAddress,
  });

  return {
    user: toSafeUserDTO(result.user),
    session: result.session,
    csrfToken,
  };
}

/**
 * Authenticate user credentials, protect against timing enumeration,
 * defend against session fixation, and establish fresh session.
 *
 * @param {{ email: string, password: string, incomingSid?: string, ipAddress?: string }} params
 * @returns {Promise<{ user: ReturnType<typeof toSafeUserDTO>, session: import('../../models/Session.js').Session, csrfToken: string }>}
 */
export async function login({ email, password, incomingSid, ipAddress = '127.0.0.1' }) {
  const normalizedEmail = email.trim().toLowerCase();

  // Load user with password_hash scope
  const user = await User.scope('withPassword').findOne({
    where: { email: normalizedEmail },
  });

  if (!user || !user.is_active) {
    // Execute dummy bcrypt workload to mitigate timing side-channel differences
    await verifyDummyPassword(password);

    logger.warn({
      event: 'auth.login.failure',
      message: 'Authentication failed: invalid credentials or inactive user',
      ip: ipAddress,
      reason: 'INVALID_CREDENTIALS',
    });

    throw new AuthenticationError('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  const isMatch = await verifyPassword(password, user.password_hash);

  if (!isMatch) {
    logger.warn({
      event: 'auth.login.failure',
      message: 'Authentication failed: invalid password',
      userId: user.id,
      ip: ipAddress,
      reason: 'INVALID_CREDENTIALS',
    });

    throw new AuthenticationError('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  // Session fixation defense: invalidate existing session and create fresh session
  const session = await rotateSession(incomingSid, user.id);
  logger.info({
    event: 'auth.session.rotated',
    message: 'Session rotated for authenticated user',
    userId: user.id,
  });

  const csrfToken = generateCsrfToken();

  // Minimal audit record
  try {
    await AuditLog.create({
      id: crypto.randomUUID(),
      actor_id: user.id,
      action: 'AUTH_LOGIN_SUCCESS',
      target_resource: 'sessions',
      resource_id: hashSessionId(session.sid),
      ip_address: ipAddress.slice(0, 45),
      details_json: { role: user.role },
      created_at: new Date(),
    });
  } catch (err) {
    logger.error({
      message: 'Failed to record login audit log',
      error: err.message,
    });
  }

  logger.info({
    event: 'auth.login.success',
    message: 'User logged in successfully',
    userId: user.id,
    actorType: user.role,
    role: user.role,
    ip: ipAddress,
  });

  return {
    user: toSafeUserDTO(user),
    session,
    csrfToken,
  };
}

/**
 * Terminate user session and record minimal audit entry.
 *
 * @param {{ sid: string, userId?: string, ipAddress?: string }} params
 * @returns {Promise<void>}
 */
export async function logout({ sid, userId, ipAddress = '127.0.0.1' }) {
  let effectiveUserId = userId;
  if (!effectiveUserId && sid && isValidSessionIdFormat(sid)) {
    try {
      const existingSession = await Session.findByPk(sid);
      if (existingSession) {
        effectiveUserId = existingSession.user_id;
      }
    } catch {
      // Ignore lookup error
    }
  }

  if (sid) {
    await deleteSession(sid);
  }

  if (effectiveUserId) {
    try {
      await AuditLog.create({
        id: crypto.randomUUID(),
        actor_id: effectiveUserId,
        action: 'AUTH_LOGOUT',
        target_resource: 'sessions',
        resource_id: hashSessionId(sid),
        ip_address: ipAddress.slice(0, 45),
        details_json: null,
        created_at: new Date(),
      });
    } catch (err) {
      logger.error({
        message: 'Failed to record logout audit log',
        error: err.message,
      });
    }
  }

  logger.info({
    event: 'auth.logout',
    message: 'User logged out successfully',
    userId: effectiveUserId || 'anonymous',
    actorType: effectiveUserId ? 'customer' : 'anonymous',
    ip: ipAddress,
  });
}

export default {
  register,
  login,
  logout,
};
