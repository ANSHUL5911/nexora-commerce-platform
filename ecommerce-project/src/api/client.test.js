import { it, expect, describe } from 'vitest';
import apiClient, { getCsrfToken, normalizeApiError } from './client.js';

describe('API Client', () => {
  it('reads CSRF token from document.cookie', () => {
    document.cookie = 'nexora_csrf=test-csrf-value; path=/';
    expect(getCsrfToken()).toBe('test-csrf-value');
  });

  it('has baseURL set to /api', () => {
    expect(apiClient.defaults.baseURL).toBe('/api');
  });

  it('has withCredentials set to true', () => {
    expect(apiClient.defaults.withCredentials).toBe(true);
  });

  it('normalizes API errors cleanly', () => {
    const errorWithResponse = {
      response: {
        status: 400,
        data: {
          code: 'INVALID_INPUT',
          message: 'Invalid postal code',
          details: [{ field: 'pincode', message: 'Must be 6 digits' }],
        },
      },
      config: { url: '/checkout/initiate' },
    };

    const normalized = normalizeApiError(errorWithResponse);
    expect(normalized.status).toBe(400);
    expect(normalized.code).toBe('INVALID_INPUT');
    expect(normalized.message).toBe('Invalid postal code');
    expect(normalized.details).toHaveLength(1);
    expect(normalized.isNetworkError).toBe(false);
  });

  it('normalizes network errors when response is absent', () => {
    const networkError = {
      message: 'Network Error',
      config: { url: '/products' },
    };

    const normalized = normalizeApiError(networkError);
    expect(normalized.status).toBe(0);
    expect(normalized.code).toBe('NETWORK_ERROR');
    expect(normalized.isNetworkError).toBe(true);
  });
});
