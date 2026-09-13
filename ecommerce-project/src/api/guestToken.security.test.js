import { it, expect, describe, vi, beforeEach } from 'vitest';
import apiClient, { normalizeApiError } from './client.js';
import { ordersApi } from './orders.js';
import { paymentsApi } from './payments.js';
import { checkoutApi } from './checkout.js';

vi.mock('./client.js', async (importOriginal) => {
  const actual = await importOriginal();
  const mockClient = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };

  return {
    ...actual,
    default: mockClient,
    apiClient: mockClient,
    generateIdempotencyKey: () => 'test-idempotency-key',
    getCsrfToken: () => 'test-csrf-token',
  };
});


describe('Phase 07.14 Guest Token Security Invariants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it('A & B: Guest token is NEVER persisted in sessionStorage or localStorage', async () => {
    const rawGuestToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.testGuestToken';

    // Simulate guest checkout response
    apiClient.post.mockResolvedValue({
      data: {
        order: { id: 'order-guest-001', status: 'PENDING_PAYMENT' },
        guestToken: rawGuestToken,
      },
    });

    const result = await checkoutApi.initiateCheckout({
      shippingAddress: { fullName: 'Guest User' },
      shippingMethod: 'STANDARD',
    });

    // In-memory token exists
    expect(result.guestToken).toBe(rawGuestToken);

    // Verify sessionStorage & localStorage are completely empty of guest tokens
    expect(sessionStorage.getItem('guestToken')).toBeNull();
    expect(sessionStorage.getItem('guestToken_order-guest-001')).toBeNull();
    expect(sessionStorage.getItem('lastGuestToken')).toBeNull();
    expect(localStorage.getItem('guestToken')).toBeNull();
    expect(Object.keys(sessionStorage)).toHaveLength(0);
    expect(Object.keys(localStorage)).toHaveLength(0);
  });

  it('C: Guest token is transmitted exclusively through the X-Guest-Token header', async () => {
    const rawGuestToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.guestOrderHeaderToken';

    apiClient.get.mockResolvedValue({
      data: {
        order: { id: 'order-guest-002', totalPaise: 50000, status: 'PAID' },
      },
    });

    await ordersApi.getOrder('order-guest-002', { guestToken: rawGuestToken });

    // Ensure get was called with X-Guest-Token header and WITHOUT query string params
    expect(apiClient.get).toHaveBeenCalledWith('/orders/order-guest-002', {
      headers: { 'X-Guest-Token': rawGuestToken },
    });
  });

  it('D: Guest token is never included in URL or query parameters', async () => {
    const rawGuestToken = 'secret-guest-token-12345';

    apiClient.get.mockResolvedValue({ data: { order: { id: 'order-123' } } });
    await ordersApi.getOrder('order-123', rawGuestToken);

    const calledUrl = apiClient.get.mock.calls[0][0];
    const calledConfig = apiClient.get.mock.calls[0][1];

    expect(calledUrl).toBe('/orders/order-123');
    expect(calledUrl).not.toContain(rawGuestToken);
    expect(calledConfig.params).toBeUndefined();
  });

  it('E: Guest payment creation and retry transmit guestToken via X-Guest-Token header only', async () => {
    const rawGuestToken = 'guest-pay-token-999';

    apiClient.post.mockResolvedValue({
      data: { razorpayOrderId: 'order_rzp_99', amount: 30000 },
    });

    // Create payment order
    await paymentsApi.createPaymentOrder({
      orderId: 'order-guest-003',
      guestToken: rawGuestToken,
    });

    expect(apiClient.post).toHaveBeenCalledWith(
      '/payments/create-order',
      { orderId: 'order-guest-003' },
      {
        headers: {
          'Idempotency-Key': 'test-idempotency-key',
          'X-Guest-Token': rawGuestToken,
        },
      }
    );

    // Retry payment
    await paymentsApi.retryPayment({
      orderId: 'order-guest-003',
      guestToken: rawGuestToken,
    });

    expect(apiClient.post).toHaveBeenCalledWith(
      '/payments/retry',
      { orderId: 'order-guest-003' },
      {
        headers: {
          'Idempotency-Key': 'test-idempotency-key',
          'X-Guest-Token': rawGuestToken,
        },
      }
    );
  });

  it('F: No raw guest token appears in error payloads or normalization', () => {
    const errorWithToken = {
      message: 'Failed to process order',
      config: {
        headers: { 'X-Guest-Token': 'super-secret-token' },
      },
      response: {
        status: 404,
        data: { message: 'Order was not found' },
      },
    };

    const normalized = normalizeApiError(errorWithToken);
    expect(normalized.message).toBe('Order was not found');
    expect(JSON.stringify(normalized.message)).not.toContain('super-secret-token');
  });

  it('G: Authenticated customer order retrieval works seamlessly without X-Guest-Token', async () => {
    apiClient.get.mockResolvedValue({
      data: {
        order: { id: 'order-auth-100', totalPaise: 120000 },
      },
    });

    await ordersApi.getOrder('order-auth-100');

    expect(apiClient.get).toHaveBeenCalledWith('/orders/order-auth-100', {
      headers: {},
    });
  });
});
