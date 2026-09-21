/**
 * authRedirect.js (Phase 07.26C)
 * Centralized role-aware redirection helper for authentication flows.
 * 
 * Rules:
 * - When user is authenticated as 'admin': strictly redirect to '/admin'
 * - When user is authenticated as 'customer' or guest: redirect to the provided destination or fallback
 * 
 * @param {object|null} user - The authenticated user object (from session/login)
 * @param {string|null} defaultPath - Fallback destination for customer accounts
 * @returns {string|null} Target path for navigation
 */
export function getAuthRedirectPath(user, defaultPath = null) {
  if (user?.role === 'admin') {
    return '/admin';
  }
  return defaultPath;
}

export default getAuthRedirectPath;
