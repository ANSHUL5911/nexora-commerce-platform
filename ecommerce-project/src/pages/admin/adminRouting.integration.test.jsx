import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import App from '../../App.jsx';
import { authApi } from '../../api/auth.js';

vi.mock('../../api/auth.js', () => ({
  authApi: {
    getCurrentUser: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    register: vi.fn(),
  },
}));

vi.mock('../../api/cart.js', () => ({
  cartApi: {
    getCart: vi.fn().mockResolvedValue({ cart: { items: [], subtotal_paise: 0, total_quantity: 0 } }),
    addItem: vi.fn(),
    updateItem: vi.fn(),
    removeItem: vi.fn(),
    clearCart: vi.fn(),
  },
}));

vi.mock('../../api/products.js', () => ({
  productsApi: {
    listProducts: vi.fn().mockResolvedValue({ products: [], pagination: {} }),
    getProductById: vi.fn().mockResolvedValue({ product: {} }),
  },
}));

vi.mock('../../api/admin.js', () => ({
  adminApi: {
    listProducts: vi.fn().mockResolvedValue({ data: [], pagination: { total: 0, totalPages: 1 } }),
    getInventory: vi.fn().mockResolvedValue({ data: [], pagination: { total: 0, totalPages: 1 } }),
    listOrders: vi.fn().mockResolvedValue({ data: [], pagination: { total: 0, totalPages: 1 } }),
    listAuditLogs: vi.fn().mockResolvedValue({ data: [], pagination: { total: 0, totalPages: 1 } }),
  },
}));

describe('Admin Routing & Session Integration (Phase 07.26)', () => {
  const adminUser = {
    id: 'a0000000-0000-4000-8000-000000000001',
    email: 'admin@nexora.local',
    full_name: 'Nexora System Administrator',
    role: 'admin',
    is_active: true,
  };

  const customerUser = {
    id: 'c0000000-0000-4000-8000-000000000002',
    email: 'customer@nexora.local',
    full_name: 'Customer User',
    role: 'customer',
    is_active: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders AdminPage when admin accesses /admin and session resolves with role admin', async () => {
    authApi.getCurrentUser.mockResolvedValueOnce({ user: adminUser });

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <App />
      </MemoryRouter>
    );

    // Initial loading screen while verifying session
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/validating administrative authorization/i)).toBeInTheDocument();

    // After session resolution, AdminPage renders
    expect(await screen.findByRole('heading', { level: 1, name: /nexora admin/i })).toBeInTheDocument();
    const profileBtn = screen.getByRole('button', { name: /open admin profile menu/i });
    expect(profileBtn).toBeInTheDocument();
    fireEvent.click(profileBtn);
    expect(screen.getAllByText(/Nexora System Administrator/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/admin/i).length).toBeGreaterThanOrEqual(1);
  });

  it('denies access with 403 Access Denied when customer user navigates to /admin', async () => {
    authApi.getCurrentUser.mockResolvedValueOnce({ user: customerUser });

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: /access denied/i })).toBeInTheDocument();
    expect(screen.getByText(/administrator privileges are required/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: /nexora admin/i })).not.toBeInTheDocument();
  });

  it('redirects unauthenticated visitor on /admin to storefront catalog', async () => {
    authApi.getCurrentUser.mockResolvedValueOnce({ user: null });

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <App />
      </MemoryRouter>
    );

    // After auth check reveals no session, user is redirected to "/"
    await waitFor(() => {
      expect(screen.queryByText(/validating administrative authorization/i)).not.toBeInTheDocument();
    });

    expect(screen.queryByRole('heading', { level: 1, name: /nexora admin/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /access denied/i })).not.toBeInTheDocument();
  });

  it('preserves the admin experience on page refresh on /admin after session restoration', async () => {
    // Simulates direct URL navigation / browser refresh
    authApi.getCurrentUser.mockResolvedValueOnce({ user: adminUser });

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <App />
      </MemoryRouter>
    );

    // Verifies transition from loading -> authenticated admin interface without redirect loop
    expect(screen.getByText(/validating administrative authorization/i)).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 1, name: /nexora admin/i })).toBeInTheDocument();
  });

  describe('Strict Admin to Customer Route Redirection (Phase 07.26C)', () => {
    it.each([
      ['/', 'root brand homepage'],
      ['/catalog', 'customer catalog page'],
      ['/orders', 'customer orders page'],
      ['/cart', 'customer cart page'],
      ['/checkout', 'customer checkout page'],
      ['/product/p-1', 'customer product detail page'],
      ['/products/p-1', 'customer products alias page'],
    ])('redirects authenticated admin attempting direct navigation to %s (%s) to /admin', async (targetUrl) => {
      authApi.getCurrentUser.mockResolvedValueOnce({ user: adminUser });

      render(
        <MemoryRouter initialEntries={[targetUrl]}>
          <App />
        </MemoryRouter>
      );

      // Verify immediate redirection to /admin and render of Admin console
      expect(await screen.findByRole('heading', { level: 1, name: /nexora admin/i })).toBeInTheDocument();
      // Ensure customer storefront elements are NOT displayed
      expect(screen.queryByText(/shopping cart with/i)).not.toBeInTheDocument();
    });

    it('does NOT invoke cartApi.getCart() when admin session is resolved', async () => {
      const { cartApi } = await import('../../api/cart.js');
      authApi.getCurrentUser.mockResolvedValueOnce({ user: adminUser });

      render(
        <MemoryRouter initialEntries={['/admin']}>
          <App />
        </MemoryRouter>
      );

      await screen.findByRole('heading', { level: 1, name: /nexora admin/i });
      expect(cartApi.getCart).not.toHaveBeenCalled();
    });
  });

  describe('Allowed Direct URLs for Authenticated Admin (Phase 07.26C)', () => {
    it.each([
      ['/admin', 'overview', /commerce operations/i],
      ['/admin/orders', 'orders', /order management/i],
      ['/admin/inventory', 'inventory', /inventory operations/i],
      ['/admin/products', 'products', /catalog management/i],
      ['/admin/audit-logs', 'audit', /operational audit trail/i],
    ])('allows authenticated admin direct access to %s and renders %s section', async (targetUrl, _section, expectedHeading) => {
      authApi.getCurrentUser.mockResolvedValueOnce({ user: adminUser });

      render(
        <MemoryRouter initialEntries={[targetUrl]}>
          <App />
        </MemoryRouter>
      );

      expect(await screen.findByRole('heading', { level: 1, name: /nexora admin/i })).toBeInTheDocument();
      expect(await screen.findByRole('heading', { level: 2, name: expectedHeading })).toBeInTheDocument();
    });
  });

  describe('Allowed Direct URLs for Authenticated Customer (Phase 07.26C)', () => {
    it.each([
      ['/orders', 'orders page', /order history/i],
      ['/cart', 'cart page', /shopping cart/i],
    ])('allows authenticated customer direct access to %s (%s)', async (targetUrl, _desc, expectedHeading) => {
      authApi.getCurrentUser.mockResolvedValueOnce({ user: customerUser });

      render(
        <MemoryRouter initialEntries={[targetUrl]}>
          <App />
        </MemoryRouter>
      );

      expect(await screen.findByRole('heading', { level: 1, name: expectedHeading })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { level: 1, name: /nexora admin/i })).not.toBeInTheDocument();
    });
  });
});
