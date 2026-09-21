import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { Header } from './Header.jsx';
import { authApi } from '../api/auth.js';

vi.mock('../api/auth.js', () => ({
  authApi: {
    getCurrentUser: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  },
  default: {
    getCurrentUser: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  },
}));

describe('Header component', () => {
  beforeEach(() => {
    authApi.getCurrentUser.mockResolvedValue({ user: null });
  });

  it('renders wordmark, navigation links with /cart target, and cart badge count', async () => {
    const mockCart = [
      { id: '1', quantity: 2 },
      { id: '2', quantity: 3 },
    ];

    render(
      <MemoryRouter>
        <Header cart={mockCart} />
      </MemoryRouter>
    );

    expect(screen.getByText('NEXORA')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /catalog/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /orders/i })).toBeInTheDocument();
    const cartLink = screen.getByLabelText(/shopping cart with 5 items/i);
    expect(cartLink).toBeInTheDocument();
    expect(cartLink).toHaveAttribute('href', '/cart');
    expect(screen.getByText('5')).toBeInTheDocument();

    const user = userEvent.setup();
    const mobileToggle = screen.getByRole('button', { name: /open menu/i });
    await user.click(mobileToggle);
    const mobileDrawer = screen.getByRole('dialog', { name: /mobile navigation/i });
    const mobileCartLink = mobileDrawer.querySelector('a[href="/cart"]');
    expect(mobileCartLink).toBeInTheDocument();
  });

  it('renders sign in button for unauthenticated users and opens auth modal on click', async () => {
    render(
      <MemoryRouter>
        <Header cart={[]} />
      </MemoryRouter>
    );

    const signInBtn = screen.getByRole('button', { name: /sign in/i });
    expect(signInBtn).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(signInBtn);

    expect(screen.getByRole('dialog', { name: /account login/i })).toBeInTheDocument();
  });

  it('renders user dropdown when user is authenticated', async () => {
    const mockUser = {
      id: 'u1',
      full_name: 'Anshul Singh',
      email: 'anshul@example.com',
    };

    render(
      <MemoryRouter>
        <Header cart={[]} currentUser={mockUser} />
      </MemoryRouter>
    );

    expect(screen.getByText('Anshul')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /anshul/i }));

    expect(screen.getByText('anshul@example.com')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /sign out/i })).toBeInTheDocument();
  });

  it('renders Admin navigation link and hides Catalog, Orders, Cart, and Search when currentUser.role is admin', async () => {
    const adminUser = {
      id: 'a1',
      full_name: 'Admin User',
      email: 'admin@nexora.local',
      role: 'admin',
    };

    render(
      <MemoryRouter>
        <Header cart={[]} currentUser={adminUser} />
      </MemoryRouter>
    );

    // Desktop admin link
    const adminLinks = screen.getAllByRole('link', { name: /admin/i });
    expect(adminLinks.length).toBeGreaterThanOrEqual(1);
    expect(adminLinks[0]).toHaveAttribute('href', '/admin');

    // Customer links MUST be hidden
    expect(screen.queryByRole('link', { name: /^catalog$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^orders$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^cart$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('search')).not.toBeInTheDocument();

    // Dropdown contains Admin Dashboard
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /admin/i }));
    expect(screen.getByRole('menuitem', { name: /admin dashboard/i })).toBeInTheDocument();
  });

  it('renders customer navigation links and search when currentUser.role is customer or guest', () => {
    const customerUser = {
      id: 'c1',
      full_name: 'Customer User',
      email: 'customer@nexora.local',
      role: 'customer',
    };

    const { rerender } = render(
      <MemoryRouter>
        <Header cart={[]} currentUser={customerUser} />
      </MemoryRouter>
    );

    // Customer links visible
    expect(screen.getByRole('link', { name: /^catalog$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^orders$/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/shopping cart/i)).toBeInTheDocument();
    expect(screen.getByRole('search')).toBeInTheDocument();

    // Admin links hidden
    expect(screen.queryByRole('link', { name: /admin dashboard/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /admin dashboard/i })).not.toBeInTheDocument();

    // Guest / Unauthenticated
    rerender(
      <MemoryRouter>
        <Header cart={[]} currentUser={null} />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: /^catalog$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^orders$/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/shopping cart/i)).toBeInTheDocument();
    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /admin dashboard/i })).not.toBeInTheDocument();
  });

  it('navigates to /admin after successful admin login', async () => {
    const user = userEvent.setup();
    const adminUser = {
      id: 'a1',
      full_name: 'Admin User',
      email: 'admin@nexora.local',
      role: 'admin',
    };
    authApi.login.mockResolvedValueOnce({ user: adminUser });

    render(
      <MemoryRouter initialEntries={['/']}>
        <Header cart={[]} />
      </MemoryRouter>
    );

    // Open login modal
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(screen.getByRole('dialog', { name: /account login/i })).toBeInTheDocument();

    // Submit form
    await user.type(screen.getByLabelText(/email address/i), 'admin@nexora.local');
    await user.type(screen.getByLabelText(/password/i), 'AdminSecurePassword123!');
    await user.click(screen.getByRole('button', { name: /sign in to nexora/i }));

    expect(authApi.login).toHaveBeenCalledWith({
      email: 'admin@nexora.local',
      password: 'AdminSecurePassword123!',
    });
  });
});
