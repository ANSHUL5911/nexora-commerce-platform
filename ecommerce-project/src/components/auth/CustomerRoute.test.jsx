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
});
