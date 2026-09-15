import { findValidSession, touchSessionIfDue, isValidSessionIdFormat } from './session.service.js';
import { toSafeUserDTO } from './auth.dto.js';
import { AuthenticationError } from '../../utils/errors.js';
import { config } from '../../config/env.js';

export const SESSION_COOKIE_NAME = '__Host-nexora_sid';

/**
 * Authentication Middleware: enforces valid server-side PostgreSQL session.
 * Rejects expired, invalid, or missing sessions with HTTP 401.
 * Safely refreshes 7-day rolling window when threshold is reached.
 */
export async function requireAuth(req, res, next) {
  try {
    const sid = req.cookies?.[SESSION_COOKIE_NAME];

    if (!sid || !isValidSessionIdFormat(sid)) {
      throw new AuthenticationError('Authentication required. Please log in.', 'AUTHENTICATION_REQUIRED');
    }

    const sessionContext = await findValidSession(sid);

    if (!sessionContext) {
      // Clear stale/expired cookie
      const isProd = config.NODE_ENV === 'production';
      const isSecure = isProd ? true : Boolean(config.SESSION_SECURE_COOKIE);
      res.clearCookie(SESSION_COOKIE_NAME, {
        path: '/',
        httpOnly: true,
        secure: isSecure,
        sameSite: config.SESSION_SAME_SITE || 'lax',
      });
      throw new AuthenticationError('Session has expired or is invalid. Please log in again.', 'AUTHENTICATION_REQUIRED');
    }

    const { session, user } = sessionContext;

    // Race-safe rolling extension check
    await touchSessionIfDue(session.sid, session.expires_at);

    // Attach authenticated identity and session context
    req.user = toSafeUserDTO(user);
    req.session = {
      sid: session.sid,
      expiresAt: session.expires_at,
    };

    return next();
  } catch (err) {
    return next(err);
  }
}

/**
 * Optional Authentication Middleware:
 * Inspects whether a valid session exists. If present, attaches authenticated identity.
 * If absent or invalid, sets req.user = null and continues non-blockingly.
 */
export async function optionalAuth(req, res, next) {
  try {
    const sid = req.cookies?.[SESSION_COOKIE_NAME];

    if (!sid || !isValidSessionIdFormat(sid)) {
      req.user = null;
      req.session = null;
      return next();
    }

    const sessionContext = await findValidSession(sid);

    if (sessionContext) {
      const { session, user } = sessionContext;
      await touchSessionIfDue(session.sid, session.expires_at);
      req.user = toSafeUserDTO(user);
      req.session = {
        sid: session.sid,
        expiresAt: session.expires_at,
      };
    } else {
      req.user = null;
      req.session = null;
    }

    return next();
  } catch (err) {
    // Non-blocking error handling for optional context
    req.user = null;
    req.session = null;
    return next();
  }
}

/**
 * Require Auth or Guest Token Middleware:
 * Verifies that the request either has an active user session OR provides an X-Guest-Token header.
 * Throws HTTP 401 AuthenticationError if neither identity is present.
 */
export function requireAuthOrGuestToken(req, res, next) {
  if (req.user || req.headers['x-guest-token']) {
    return next();
  }
  throw new AuthenticationError('Authentication required. Please log in.', 'AUTHENTICATION_REQUIRED');
}

export default {
  SESSION_COOKIE_NAME,
  requireAuth,
  optionalAuth,
  requireAuthOrGuestToken,
};

