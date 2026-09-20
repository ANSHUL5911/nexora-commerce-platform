import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import { AdminPage } from './AdminPage.jsx';
import { authApi } from '../../api/auth.js';

vi.mock('../../api/auth.js', () => ({
  authApi: {
    logout: vi.fn().mockResolvedValue({ message: 'Logged out successfully' }),
  },
}));

describe('AdminPage Component (Phase 07.26)', () => {
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

  it('renders Nexora Admin heading, admin full name, role, and Storefront link', () => {
    render(
      <MemoryRouter>
        <AdminPage currentUser={adminUser} onAuthChange={vi.fn()} />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { level: 1, name: /nexora admin/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Nexora System Administrator/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/admin/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('link', { name: /return to storefront catalog/i })).toHaveAttribute('href', '/');
  });

  it('renders system and authorization overview section with verified metadata', () => {
    render(
      <MemoryRouter>
        <AdminPage currentUser={adminUser} onAuthChange={vi.fn()} />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { level: 2, name: /system & authorization overview/i })).toBeInTheDocument();
    expect(screen.getByText('admin@nexora.local')).toBeInTheDocument();
    expect(screen.getByText('a0000000-0000-4000-8000-000000000001')).toBeInTheDocument();
    expect(screen.getByText(/backend session cookie \(httponly\)/i)).toBeInTheDocument();
    expect(screen.getByText(/backend router requireadmin rbac/i)).toBeInTheDocument();
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

    const logoutBtn = screen.getByRole('button', { name: /sign out of administrative session/i });
    await user.click(logoutBtn);

    expect(authApi.logout).toHaveBeenCalled();
    expect(handleAuthChange).toHaveBeenCalledWith(null);
    expect(await screen.findByText('Storefront Page')).toBeInTheDocument();
  });
});
