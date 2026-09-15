import { config } from '../../config/env.js';
import { register as registerService, login as loginService, logout as logoutService } from './auth.service.js';
import { SESSION_COOKIE_NAME } from './auth.middleware.js';
import { CSRF_COOKIE_NAME } from './csrf.js';

/**
 * Configure and attach authentication & CSRF cookies to HTTP response.
 *
 * Production:
 * - __Host-nexora_sid: HttpOnly=true, SameSite=Lax, Path=/, Secure=true, no Domain attribute
 * - nexora_csrf: HttpOnly=false, SameSite=Lax, Path=/, Secure=true, no Domain attribute
 *
 * Development/Test:
 * - Environment-appropriate Secure flag (configurable via SESSION_SECURE_COOKIE)
 */
export function setAuthCookies(res, sid, csrfToken) {
  const isProd = config.NODE_ENV === 'production';
  const isSecure = isProd ? true : Boolean(config.SESSION_SECURE_COOKIE);
  const maxAge = config.SESSION_MAX_AGE_MS || 604800000; // 7 days

  // 1. Session Cookie (__Host- prefix mandates HttpOnly, Secure in prod, Path=/, no Domain)
  res.cookie(SESSION_COOKIE_NAME, sid, {
    httpOnly: true,
    secure: isSecure,
    sameSite: config.SESSION_SAME_SITE || 'lax',
    path: '/',
    maxAge,
  });

  // 2. CSRF Cookie (readable by frontend script)
  if (csrfToken) {
    res.cookie(CSRF_COOKIE_NAME, csrfToken, {
      httpOnly: false,
      secure: isSecure,
      sameSite: config.SESSION_SAME_SITE || 'lax',
      path: '/',
      maxAge,
    });
  }
}

/**
 * Clear authentication & CSRF cookies upon logout or session invalidation.
 */
export function clearAuthCookies(res) {
  const isProd = config.NODE_ENV === 'production';
  const isSecure = isProd ? true : Boolean(config.SESSION_SECURE_COOKIE);
  res.clearCookie(SESSION_COOKIE_NAME, {
    path: '/',
    httpOnly: true,
    secure: isSecure,
    sameSite: config.SESSION_SAME_SITE || 'lax',
  });
  res.clearCookie(CSRF_COOKIE_NAME, {
    path: '/',
    httpOnly: false,
    secure: isSecure,
    sameSite: config.SESSION_SAME_SITE || 'lax',
  });
}

/**
 * Handler for POST /api/auth/register
 */
export async function register(req, res, next) {
  try {
    const { email, password, full_name } = req.body;
    const ipAddress = req.ip || req.socket?.remoteAddress || '127.0.0.1';

    const { user, session, csrfToken } = await registerService({
      email,
      password,
      full_name,
      ipAddress,
    });

    setAuthCookies(res, session.sid, csrfToken);

    return res.status(201).json({
      user,
      requestId: req.id,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Handler for POST /api/auth/login
 */
export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const incomingSid = req.cookies?.[SESSION_COOKIE_NAME];
    const ipAddress = req.ip || req.socket?.remoteAddress || '127.0.0.1';

    const { user, session, csrfToken } = await loginService({
      email,
      password,
      incomingSid,
      ipAddress,
    });

    setAuthCookies(res, session.sid, csrfToken);

    return res.status(200).json({
      user,
      requestId: req.id,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Handler for POST /api/auth/logout
 */
export async function logout(req, res, next) {
  try {
    const sid = req.cookies?.[SESSION_COOKIE_NAME];
    const userId = req.user?.id;
    const ipAddress = req.ip || req.socket?.remoteAddress || '127.0.0.1';

    await logoutService({
      sid,
      userId,
      ipAddress,
    });

    clearAuthCookies(res);

    return res.status(200).json({
      message: 'Successfully logged out',
      requestId: req.id,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Handler for GET /api/auth/me
 */
export async function getCurrentUser(req, res) {
  return res.status(200).json({
    user: req.user,
    requestId: req.id,
  });
}

export default {
  register,
  login,
  logout,
  getCurrentUser,
  setAuthCookies,
  clearAuthCookies,
};
