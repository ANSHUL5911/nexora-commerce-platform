import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { CustomerRoute } from './CustomerRoute.jsx';

describe('CustomerRoute Guard (Phase 07.26C)', () => {
  it('renders loading state when authLoading is true without rendering storefront prematurely', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <CustomerRoute currentUser={null} authLoading={true}>
          <div>Storefront Catalog Content</div>
        </CustomerRoute>
      </MemoryRouter>
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/validating customer session/i)).toBeInTheDocument();
    expect(screen.queryByText('Storefront Catalog Content')).not.toBeInTheDocument();
  });

  it('immediately redirects authenticated admin users to /admin', () => {
    const adminUser = {
      id: 'admin-123',
      email: 'admin@nexora.local',
      full_name: 'Administrator',
      role: 'admin',
    };

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="/"
            element={
              <CustomerRoute currentUser={adminUser} authLoading={false}>
                <div>Storefront Catalog Content</div>
              </CustomerRoute>
            }
          />
          <Route path="/admin" element={<div>Admin Console Shell</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.queryByText('Storefront Catalog Content')).not.toBeInTheDocument();
    expect(screen.getByText('Admin Console Shell')).toBeInTheDocument();
  });

  it('renders children for unauthenticated guest visitors (currentUser is null)', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <CustomerRoute currentUser={null} authLoading={false}>
          <div>Storefront Catalog Content</div>
        </CustomerRoute>
      </MemoryRouter>
    );

    expect(screen.getByText('Storefront Catalog Content')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('renders children for authenticated customer accounts (role === customer)', () => {
    const customerUser = {
      id: 'cust-123',
      email: 'customer@nexora.local',
      full_name: 'Jane Customer',
      role: 'customer',
    };

    render(
      <MemoryRouter initialEntries={['/orders']}>
        <CustomerRoute currentUser={customerUser} authLoading={false}>
          <div>Customer Orders Content</div>
        </CustomerRoute>
      </MemoryRouter>
    );

    expect(screen.getByText('Customer Orders Content')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('allows guests and customers to access /catalog, while redirecting admins to /admin', () => {
    const adminUser = { id: 'a-1', email: 'admin@nexora.local', role: 'admin' };
    const customerUser = { id: 'c-1', email: 'customer@nexora.local', role: 'customer' };

    // Guest on /catalog
    const { rerender } = render(
      <MemoryRouter initialEntries={['/catalog']}>
        <CustomerRoute currentUser={null} authLoading={false}>
          <div>Commerce Catalog Experience</div>
        </CustomerRoute>
      </MemoryRouter>
    );
    expect(screen.getByText('Commerce Catalog Experience')).toBeInTheDocument();

    // Customer on /catalog
    rerender(
      <MemoryRouter initialEntries={['/catalog']}>
        <CustomerRoute currentUser={customerUser} authLoading={false}>
          <div>Commerce Catalog Experience</div>
        </CustomerRoute>
      </MemoryRouter>
    );
    expect(screen.getByText('Commerce Catalog Experience')).toBeInTheDocument();

    // Admin on /catalog
    rerender(
      <MemoryRouter initialEntries={['/catalog']}>
        <Routes>
          <Route
            path="/catalog"
            element={
              <CustomerRoute currentUser={adminUser} authLoading={false}>
                <div>Commerce Catalog Experience</div>
              </CustomerRoute>
            }
          />
          <Route path="/admin" element={<div>Admin Console Shell</div>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.queryByText('Commerce Catalog Experience')).not.toBeInTheDocument();
    expect(screen.getByText('Admin Console Shell')).toBeInTheDocument();
  });
});
