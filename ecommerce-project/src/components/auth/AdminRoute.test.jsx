import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { AdminRoute } from './AdminRoute.jsx';

describe('AdminRoute Guard (Phase 07.26)', () => {
  it('renders loading state when authLoading is true without redirecting or denying prematurely', () => {
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AdminRoute currentUser={null} authLoading={true}>
          <div>Protected Admin Content</div>
        </AdminRoute>
      </MemoryRouter>
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/validating administrative authorization/i)).toBeInTheDocument();
    expect(screen.queryByText('Protected Admin Content')).not.toBeInTheDocument();
    expect(screen.queryByText(/access denied/i)).not.toBeInTheDocument();
  });

  it('safely redirects unauthenticated users (currentUser is null) to storefront', () => {
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route
            path="/admin"
            element={
              <AdminRoute currentUser={null} authLoading={false}>
                <div>Protected Admin Content</div>
              </AdminRoute>
            }
          />
          <Route path="/" element={<div>Storefront Catalog</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.queryByText('Protected Admin Content')).not.toBeInTheDocument();
    expect(screen.getByText('Storefront Catalog')).toBeInTheDocument();
  });

  it('fails closed and renders 403 Access Denied when authenticated user is a customer', () => {
    const customerUser = {
      id: 'cust-123',
      email: 'customer@nexora.local',
      full_name: 'Customer User',
      role: 'customer',
    };

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AdminRoute currentUser={customerUser} authLoading={false}>
          <div>Protected Admin Content</div>
        </AdminRoute>
      </MemoryRouter>
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /access denied/i })).toBeInTheDocument();
    expect(screen.getByText(/administrator privileges are required/i)).toBeInTheDocument();
    expect(screen.getByText(/customer@nexora\.local/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /return to storefront/i })).toBeInTheDocument();
    expect(screen.queryByText('Protected Admin Content')).not.toBeInTheDocument();
  });

  it('fails closed when user has a missing role', () => {
    const noRoleUser = {
      id: 'norole-123',
      email: 'norole@nexora.local',
      full_name: 'No Role User',
    };

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AdminRoute currentUser={noRoleUser} authLoading={false}>
          <div>Protected Admin Content</div>
        </AdminRoute>
      </MemoryRouter>
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /access denied/i })).toBeInTheDocument();
    expect(screen.queryByText('Protected Admin Content')).not.toBeInTheDocument();
  });

  it('fails closed when user has an unrecognized role string', () => {
    const maliciousUser = {
      id: 'evil-123',
      email: 'evil@nexora.local',
      full_name: 'Impostor',
      role: 'superadmin',
    };

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AdminRoute currentUser={maliciousUser} authLoading={false}>
          <div>Protected Admin Content</div>
        </AdminRoute>
      </MemoryRouter>
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /access denied/i })).toBeInTheDocument();
    expect(screen.queryByText('Protected Admin Content')).not.toBeInTheDocument();
  });

  it('renders children when authenticated user has verified admin role', () => {
    const adminUser = {
      id: 'a0000000-0000-4000-8000-000000000001',
      email: 'admin@nexora.local',
      full_name: 'Nexora System Administrator',
      role: 'admin',
      is_active: true,
    };

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AdminRoute currentUser={adminUser} authLoading={false}>
          <div>Protected Admin Content</div>
        </AdminRoute>
      </MemoryRouter>
    );

    expect(screen.getByText('Protected Admin Content')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/access denied/i)).not.toBeInTheDocument();
  });
});
