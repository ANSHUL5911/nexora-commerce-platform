import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthModal } from './AuthModal.jsx';
import { authApi } from '../../api/auth.js';

vi.mock('../../api/auth.js', () => ({
  authApi: {
    login: vi.fn(),
    register: vi.fn(),
  },
  default: {
    login: vi.fn(),
    register: vi.fn(),
  },
}));

describe('AuthModal Component (Phase 07.19)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders login mode by default with accessible tabs and form inputs', () => {
    render(<AuthModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: /account login/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /sign in/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /register/i })).toHaveAttribute('aria-selected', 'false');

    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/full name/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in to nexora/i })).toBeInTheDocument();
  });

  it('submits login form and triggers onAuthSuccess on valid response', async () => {
    const user = userEvent.setup();
    const handleSuccess = vi.fn();
    const mockUser = { id: 'usr-1', email: 'test@nexora.local', role: 'customer' };
    authApi.login.mockResolvedValueOnce({ user: mockUser });

    render(<AuthModal isOpen={true} onClose={vi.fn()} onAuthSuccess={handleSuccess} />);

    await user.type(screen.getByLabelText(/email address/i), 'test@nexora.local');
    await user.type(screen.getByLabelText(/password/i), 'Password123!');
    await user.click(screen.getByRole('button', { name: /sign in to nexora/i }));

    expect(authApi.login).toHaveBeenCalledWith({
      email: 'test@nexora.local',
      password: 'Password123!',
    });

    await waitFor(() => {
      expect(handleSuccess).toHaveBeenCalledWith(mockUser);
    });
  });

  it('displays error alert when login fails with rejected credentials', async () => {
    const user = userEvent.setup();
    authApi.login.mockRejectedValueOnce(new Error('Invalid email or password'));

    render(<AuthModal isOpen={true} onClose={vi.fn()} />);

    await user.type(screen.getByLabelText(/email address/i), 'wrong@nexora.local');
    await user.type(screen.getByLabelText(/password/i), 'WrongPass!');
    await user.click(screen.getByRole('button', { name: /sign in to nexora/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
  });

  it('switches between Sign In and Register tabs and reveals Full Name input', async () => {
    const user = userEvent.setup();
    render(<AuthModal isOpen={true} onClose={vi.fn()} />);

    // Click Register tab
    await user.click(screen.getByRole('tab', { name: /register/i }));

    expect(screen.getByRole('dialog', { name: /create account/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /register/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /sign in/i })).toHaveAttribute('aria-selected', 'false');

    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /complete registration/i })).toBeInTheDocument();
  });

  it('submits registration form with name, email, password and notifies parent', async () => {
    const user = userEvent.setup();
    const handleSuccess = vi.fn();
    const mockUser = { id: 'usr-new', email: 'new@nexora.local', role: 'customer' };
    authApi.register.mockResolvedValueOnce({ user: mockUser });

    render(<AuthModal isOpen={true} onClose={vi.fn()} onAuthSuccess={handleSuccess} initialMode="register" />);

    await user.type(screen.getByLabelText(/full name/i), 'New Customer');
    await user.type(screen.getByLabelText(/email address/i), 'new@nexora.local');
    await user.type(screen.getByLabelText(/password/i), 'Password123!');
    await user.click(screen.getByRole('button', { name: /complete registration/i }));

    expect(authApi.register).toHaveBeenCalledWith({
      email: 'new@nexora.local',
      password: 'Password123!',
      full_name: 'New Customer',
    });

    await waitFor(() => {
      expect(handleSuccess).toHaveBeenCalledWith(mockUser);
    });
  });

  it('closes modal when Escape key is pressed', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();

    render(<AuthModal isOpen={true} onClose={handleClose} />);

    await user.keyboard('{Escape}');
    expect(handleClose).toHaveBeenCalled();
  });
});
