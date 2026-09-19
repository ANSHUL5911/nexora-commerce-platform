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
});
