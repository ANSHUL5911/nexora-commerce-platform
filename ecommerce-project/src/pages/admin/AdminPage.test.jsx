import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import { AdminPage } from './AdminPage.jsx';
import { authApi } from '../../api/auth.js';

vi.mock('../../api/auth.js', () => ({
  authApi: {
    logout: vi.fn().mockResolvedValue({ message: 'Logged out successfully' }),
  },
}));

vi.mock('../../api/admin.js', () => ({
  adminApi: {
    listProducts: vi.fn().mockResolvedValue({
      data: [
        {
          id: 'p-1',
          name: 'Handcrafted Oxford',
          category: 'Footwear',
          pricePaise: 1850000,
          stockQuantity: 12,
          reservedQuantity: 2,
          availableQuantity: 10,
          isDeleted: false,
          createdAt: new Date().toISOString(),
        },
      ],
      pagination: { page: 1, limit: 10, total: 24, totalPages: 3 },
    }),
    getInventory: vi.fn().mockResolvedValue({
      data: [
        {
          productId: 'p-low-1',
          name: 'Derby Suede Boot',
          category: 'Footwear',
          stockQuantity: 4,
          reservedQuantity: 1,
          availableQuantity: 3,
          updatedAt: new Date().toISOString(),
        },
      ],
      pagination: { page: 1, limit: 10, total: 3, totalPages: 1 },
    }),
    listOrders: vi.fn().mockResolvedValue({
      data: [
        {
          id: 'o0000000-0000-4000-8000-000000000001',
          customer: { fullName: 'Jane Doe', email: 'jane@example.com' },
          itemCount: 2,
          totalCostPaise: 3700000,
          orderStatus: 'PAID',
          paymentStatus: 'SUCCESS',
          createdAt: new Date().toISOString(),
        },
      ],
      pagination: { page: 1, limit: 10, total: 42, totalPages: 5 },
    }),
    listAuditLogs: vi.fn().mockResolvedValue({
      data: [
        {
          id: 'audit-1',
          action: 'ADMIN_CREATE_PRODUCT',
          actor: { email: 'admin@nexora.local' },
          targetResource: 'products',
          resourceId: 'p-1',
          ipAddress: '127.0.0.1',
          createdAt: new Date().toISOString(),
        },
      ],
      pagination: { page: 1, limit: 10, total: 15, totalPages: 2 },
    }),
    getOrder: vi.fn().mockResolvedValue({
      data: {
        id: 'o0000000-0000-4000-8000-000000000001',
        orderStatus: 'PAID',
        totalCostPaise: 3700000,
        subtotalPaise: 3700000,
        shippingFeePaise: 0,
        shippingAddress: { fullName: 'Jane Doe', addressLine1: '123 Main St', city: 'Mumbai', state: 'MH', pincode: '400001' },
        items: [],
        paymentAttempts: [],
        restockLogs: [],
        isRefundEligible: true,
        isRestockEligible: false,
      },
    }),
  },
}));

describe('AdminPage Component — Nexora Commerce Operations Console (Phase 07.26B)', () => {
  const adminUser = {
    id: 'a0000000-0000-4000-8000-000000000001',
    email: 'admin@nexora.local',
    full_name: 'Nexora System Administrator',
    role: 'admin',
    is_active: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Nexora Admin heading, navigation tabs, and accessible profile menu without Storefront button', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AdminPage currentUser={adminUser} onAuthChange={vi.fn()} />
      </MemoryRouter>
    );

    // Brand and console indicator
    expect(screen.getByRole('heading', { level: 1, name: /nexora admin/i })).toBeInTheDocument();
    expect(screen.getByText(/console/i)).toBeInTheDocument();

    // Storefront link MUST NOT exist anywhere
    expect(screen.queryByRole('link', { name: /storefront/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /storefront/i })).not.toBeInTheDocument();

    // Navigation tabs
    expect(screen.getByRole('button', { name: /^overview$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^orders$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^inventory$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^products$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^audit logs$/i })).toBeInTheDocument();

    // Profile button exists with accessible label
    const profileBtn = screen.getByRole('button', { name: /open admin profile menu/i });
    expect(profileBtn).toBeInTheDocument();
    expect(profileBtn).toHaveAttribute('aria-expanded', 'false');

    // Sign Out is initially NOT visible
    expect(screen.queryByRole('menuitem', { name: /sign out/i })).not.toBeInTheDocument();

    // Open profile menu
    await user.click(profileBtn);
    expect(profileBtn).toHaveAttribute('aria-expanded', 'true');

    // Admin info inside dropdown
    const menu = screen.getByRole('menu');
    expect(within(menu).getByText('Nexora System Administrator')).toBeInTheDocument();
    expect(within(menu).getByText('admin@nexora.local')).toBeInTheDocument();
    expect(within(menu).getByText('ADMIN')).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /sign out/i })).toBeInTheDocument();

    // Close on outside click
    await user.click(document.body);
    expect(screen.queryByRole('menuitem', { name: /sign out/i })).not.toBeInTheDocument();

    // Reopen and close with Escape
    await user.click(profileBtn);
    expect(screen.getByRole('menuitem', { name: /sign out/i })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menuitem', { name: /sign out/i })).not.toBeInTheDocument();
  });

  it('renders Commerce Operations Overview with authoritative backend-derived metrics', async () => {
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AdminPage currentUser={adminUser} onAuthChange={vi.fn()} />
      </MemoryRouter>
    );

    // Overview headings
    expect(await screen.findByRole('heading', { level: 2, name: /commerce operations/i })).toBeInTheDocument();
    expect(screen.getByText(/total products/i)).toBeInTheDocument();
    expect(screen.getAllByText('24').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('42')).toBeInTheDocument(); // total orders
    expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(1); // low stock count

    // Recent orders table
    expect(screen.getByRole('heading', { level: 2, name: /recent orders/i })).toBeInTheDocument();
    expect(screen.getByText(/Jane Doe/i)).toBeInTheDocument();

    // Low stock attention table
    expect(screen.getByRole('heading', { level: 2, name: /low-stock attention/i })).toBeInTheDocument();
    expect(screen.getByText(/Derby Suede Boot/i)).toBeInTheDocument();
  });

  it('switches between administrative sections when tabs are clicked', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route path="/admin/*" element={<AdminPage currentUser={adminUser} onAuthChange={vi.fn()} />} />
          <Route path="/admin" element={<AdminPage currentUser={adminUser} onAuthChange={vi.fn()} />} />
        </Routes>
      </MemoryRouter>
    );

    // Initial view: Overview
    expect(await screen.findByRole('heading', { level: 2, name: /commerce operations/i })).toBeInTheDocument();

    // Navigate to Orders
    const ordersTab = screen.getByRole('button', { name: /^orders$/i });
    await user.click(ordersTab);
    expect(await screen.findByRole('heading', { level: 2, name: /order management/i })).toBeInTheDocument();

    // Navigate to Inventory
    const inventoryTab = screen.getByRole('button', { name: /^inventory$/i });
    await user.click(inventoryTab);
    expect(await screen.findByRole('heading', { level: 2, name: /inventory operations/i })).toBeInTheDocument();

    // Navigate to Products
    const productsTab = screen.getByRole('button', { name: /^products$/i });
    await user.click(productsTab);
    expect(await screen.findByRole('heading', { level: 2, name: /catalog management/i })).toBeInTheDocument();

    // Navigate to Audit Logs
    const auditTab = screen.getByRole('button', { name: /^audit logs$/i });
    await user.click(auditTab);
    expect(await screen.findByRole('heading', { level: 2, name: /operational audit trail/i })).toBeInTheDocument();
  });

  it('handles sign out by calling authApi.logout, onAuthChange(null), and navigating to storefront', async () => {
    const user = userEvent.setup();
    const handleAuthChange = vi.fn();

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route
            path="/admin"
            element={<AdminPage currentUser={adminUser} onAuthChange={handleAuthChange} />}
          />
          <Route path="/" element={<div>Storefront Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    // Open profile menu
    const profileBtn = screen.getByRole('button', { name: /open admin profile menu/i });
    await user.click(profileBtn);

    const logoutBtn = screen.getByRole('menuitem', { name: /sign out/i });
    await user.click(logoutBtn);

    expect(authApi.logout).toHaveBeenCalled();
    expect(handleAuthChange).toHaveBeenCalledWith(null);
    expect(await screen.findByText('Storefront Page')).toBeInTheDocument();
  });
});
