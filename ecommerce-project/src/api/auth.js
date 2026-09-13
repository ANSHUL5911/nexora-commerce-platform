import apiClient from './client.js';

/**
 * Authentication API Service
 * Interacts with server-side session endpoints (POST /api/auth/*, GET /api/auth/me).
 */
export const authApi = {
  /**
   * Register a new customer.
   *
   * @param {{ email: string, password: string, full_name: string }} payload
   * @returns {Promise<{ user: { id: string, email: string, full_name: string, role: string }, requestId?: string }>}
   */
  async register({ email, password, full_name }) {
    const response = await apiClient.post('/auth/register', { email, password, full_name });
    return response.data;
  },

  /**
   * Log in an existing user and establish server session.
   *
   * @param {{ email: string, password: string }} payload
   * @returns {Promise<{ user: { id: string, email: string, full_name: string, role: string }, requestId?: string }>}
   */
  async login({ email, password }) {
    const response = await apiClient.post('/auth/login', { email, password });
    return response.data;
  },

  /**
   * Log out the current user and revoke session cookies.
   *
   * @returns {Promise<{ message: string, requestId?: string }>}
   */
  async logout() {
    const response = await apiClient.post('/auth/logout');
    return response.data;
  },

  /**
   * Inspect current authenticated session.
   *
   * @returns {Promise<{ user: { id: string, email: string, full_name: string, role: string }, requestId?: string }>}
   */
  async getCurrentUser() {
    const response = await apiClient.get('/auth/me');
    return response.data;
  },
};

export default authApi;
