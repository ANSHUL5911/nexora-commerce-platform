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

  it('normalizes nested backend error envelope correctly and does not produce [object Object]', () => {
    const errorWithNestedEnvelope = {
      response: {
        status: 400,
        data: {
          error: {
            code: 'INSUFFICIENT_STOCK',
            message: 'Requested quantity exceeds available stock.',
            requestId: 'req-stock-123',
            details: [{ field: 'quantity', message: 'Requested quantity exceeds available stock.' }],
          },
        },
      },
      config: { url: '/cart/items' },
    };

    const normalized = normalizeApiError(errorWithNestedEnvelope);
    expect(normalized.status).toBe(400);
    expect(normalized.code).toBe('INSUFFICIENT_STOCK');
    expect(normalized.message).toBe('Requested quantity exceeds available stock.');
    expect(normalized.message).not.toContain('[object Object]');
    expect(normalized.requestId).toBe('req-stock-123');
    expect(normalized.details).toEqual([
      { field: 'quantity', message: 'Requested quantity exceeds available stock.' },
    ]);
    expect(normalized.isNetworkError).toBe(false);
  });
});

