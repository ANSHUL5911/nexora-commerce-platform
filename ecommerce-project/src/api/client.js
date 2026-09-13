import axios from 'axios';

/**
 * Extract CSRF token from document.cookie.
 * The backend sets 'nexora_csrf' with httpOnly: false for double-submit CSRF verification.
 *
 * @returns {string|null}
 */
export function getCsrfToken() {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)nexora_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Generate a random UUIDv4 for Idempotency-Key headers.
 *
 * @returns {string}
 */
export function generateIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback UUIDv4 generator
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Centralized Axios client instance configured for Nexora API.
 */
export const apiClient = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

const MUTATING_METHODS = new Set(['post', 'put', 'patch', 'delete']);

/**
 * Request Interceptor:
 * - Attaches x-csrf-token header for state-changing browser requests (POST, PUT, PATCH, DELETE).
 * - Safe methods (GET, HEAD, OPTIONS) bypass CSRF.
 * - External requests bypass CSRF.
 */
apiClient.interceptors.request.use(
  (config) => {
    const method = (config.method || 'get').toLowerCase();
    const isMutating = MUTATING_METHODS.has(method);

    // Only attach CSRF to same-origin / relative / /api mutating requests
    const isInternal = !config.url || config.url.startsWith('/') || config.url.startsWith('/api') || config.url.startsWith('http://localhost:5000');

    if (isMutating && isInternal) {
      const token = getCsrfToken();
      if (token) {
        config.headers = config.headers || {};
        config.headers['x-csrf-token'] = token;
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * Normalize API errors into a standardized, user-safe representation.
 * Guarantees no internal secrets, stack traces, or raw exception names are leaked.
 *
 * @param {any} error
 * @returns {{
 *   status: number,
 *   code: string,
 *   message: string,
 *   requestId: string|null,
 *   details: Array<{ field?: string, message: string }>
 * }}
 */
export function normalizeApiError(error) {
  if (error && error.isNormalized) {
    return error;
  }

  const response = error?.response;
  const status = response?.status || (error?.code === 'ECONNABORTED' ? 504 : 500);
  const data = response?.data;

  let code = data?.errorCode || data?.code || 'UNKNOWN_ERROR';
  let message = data?.errorMessage || data?.message || data?.error;
  const requestId = data?.requestId || response?.headers?.['x-request-id'] || null;
  const details = Array.isArray(data?.details) ? data.details : [];

  if (!message) {
    if (status === 401) {
      message = 'Authentication required. Please log in.';
      code = code === 'UNKNOWN_ERROR' ? 'AUTHENTICATION_REQUIRED' : code;
    } else if (status === 403) {
      message = 'Access denied. You do not have permission to perform this action.';
      code = code === 'UNKNOWN_ERROR' ? 'FORBIDDEN' : code;
    } else if (status === 404) {
      message = 'Requested resource was not found.';
      code = code === 'UNKNOWN_ERROR' ? 'NOT_FOUND' : code;
    } else if (status === 409) {
      message = 'A conflict occurred. The request could not be completed.';
      code = code === 'UNKNOWN_ERROR' ? 'CONFLICT' : code;
    } else if (status === 422) {
      message = 'The operation could not be processed due to invalid state.';
      code = code === 'UNKNOWN_ERROR' ? 'UNPROCESSABLE_ENTITY' : code;
    } else if (status === 429) {
      message = 'Too many requests. Please slow down and try again later.';
      code = code === 'UNKNOWN_ERROR' ? 'RATE_LIMITED' : code;
    } else if (status >= 500) {
      message = 'Unable to connect to Nexora service. Please try again later.';
      code = code === 'UNKNOWN_ERROR' ? 'SERVER_ERROR' : code;
    } else {
      message = error?.message || 'An unexpected error occurred.';
    }
  }

  const isNetwork = !response;
  const normalized = new Error(message);
  normalized.isNormalized = true;
  normalized.isNetworkError = isNetwork;
  normalized.status = response ? status : 0;
  normalized.code = isNetwork ? (error?.code === 'ECONNABORTED' ? 'TIMEOUT_ERROR' : 'NETWORK_ERROR') : code;
  normalized.requestId = requestId;
  normalized.details = details;
  normalized.originalError = error;

  return normalized;

}

/**
 * Response Interceptor:
 * - Normalizes HTTP errors into standardized error objects.
 */
apiClient.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(normalizeApiError(error))
);

export default apiClient;
