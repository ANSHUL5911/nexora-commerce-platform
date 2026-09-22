import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import App from '../../App.jsx';
import { cartApi } from '../../api/cart.js';
import { authApi } from '../../api/auth.js';
import { productsApi } from '../../api/products.js';
import {
  GUEST_CART_STORAGE_KEY,
  getGuestCart,
  addGuestCartItem,
  clearGuestCart,
} from '../../api/guestCart.js';

vi.mock('../../api/cart.js', () => ({
  cartApi: {
    getCart: vi.fn(),
    addItem: vi.fn(),
    updateItem: vi.fn(),
    removeItem: vi.fn(),
    clearCart: vi.fn(),
  },
  default: {
    getCart: vi.fn(),
    addItem: vi.fn(),
    updateItem: vi.fn(),
    removeItem: vi.fn(),
    clearCart: vi.fn(),
  },
}));

vi.mock('../../api/auth.js', () => ({
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

vi.mock('../../api/products.js', () => ({
  productsApi: {
    getProducts: vi.fn(),
    getProductById: vi.fn(),
  },
  default: {
    getProducts: vi.fn(),
    getProductById: vi.fn(),
  },
}));

describe('Guest Cart to Authenticated Cart Migration Lifecycle', () => {
  const sampleProductId1 = 'e43638ce-6aa0-4b85-b27f-e1d07eb678c6';
  const sampleProductId2 = '15b6fc6f-327a-4ec4-896f-486349e85a3d';

  beforeEach(() => {
    vi.clearAllMocks();
    clearGuestCart();
    localStorage.clear();

    productsApi.getProducts.mockResolvedValue({
      products: [
        {
          id: sampleProductId1,
          name: 'Athletic Cotton Socks',
          pricePaise: 109000,
          priceCents: 1090,
          available_quantity: 10,
          category: 'sports',
        },
        {
          id: sampleProductId2,
          name: 'Composite Basketball',
          pricePaise: 209500,
          priceCents: 2095,
          available_quantity: 5,
          category: 'sports',
        },
      ],
      total: 2,
    });

    productsApi.getProductById.mockImplementation(async (id) => {
      if (id === sampleProductId1) {
        return {
          product: {
            id: sampleProductId1,
            name: 'Athletic Cotton Socks',
            pricePaise: 109000,
            available_quantity: 10,
          },
        };
      }
      return {
        product: {
          id: sampleProductId2,
          name: 'Composite Basketball',
          pricePaise: 209500,
          available_quantity: 5,
        },
      };
    });

    cartApi.getCart.mockResolvedValue({
      cart: {
        id: 'cart-1',
        items: [],
        subtotal_paise: 0,
        total_quantity: 0,
      },
    });

    authApi.getCurrentUser.mockResolvedValue({ user: null });
  });

  it('preserves guest cart in localStorage when items are added', () => {
    addGuestCartItem(sampleProductId1, 2);
    const stored = getGuestCart();
    expect(stored).toEqual([{ productId: sampleProductId1, quantity: 2 }]);
  });

  it('migrates guest cart to server cart sequentially and clears localStorage on full success', async () => {
    addGuestCartItem(sampleProductId1, 2);
    addGuestCartItem(sampleProductId2, 1);

    const callOrder = [];
    cartApi.addItem.mockImplementation(async (payload) => {
      callOrder.push(`POST /items:${payload.productId}`);
      return { message: 'Added' };
    });

    cartApi.getCart.mockImplementation(async () => {
      callOrder.push('GET /cart');
      return {
        cart: {
          id: 'cart-1',
          items: [
            {
              id: 'item-1',
              product_id: sampleProductId1,
              name: 'Athletic Cotton Socks',
              price_paise: 109000,
              quantity: 2,
            },
            {
              id: 'item-2',
              product_id: sampleProductId2,
              name: 'Composite Basketball',
              price_paise: 209500,
              quantity: 1,
            },
          ],
          subtotal_paise: 427500,
          total_quantity: 3,
        },
      };
    });

    authApi.login.mockResolvedValue({
      user: { id: 'u-1', email: 'test@example.com', full_name: 'Test User' },
    });

    render(
      <MemoryRouter initialEntries={['/cart']}>
        <App />
      </MemoryRouter>
    );

    const user = userEvent.setup();

    // Wait for initial guest items to be displayed
    await waitFor(() => {
      expect(screen.getByText(/Athletic Cotton Socks/i)).toBeInTheDocument();
    });

    // Click Proceed to Checkout -> triggers AuthModal
    const proceedBtn = screen.getByRole('button', { name: /proceed to checkout/i });
    await user.click(proceedBtn);

    // Modal appears
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /account login/i })).toBeInTheDocument();
    });

    // Enter login credentials
    await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
    await user.type(screen.getByLabelText(/password/i), 'secret123');
    await user.click(screen.getByRole('button', { name: /sign in to nexora/i }));

    // Wait for migration and cart hydration to complete
    await waitFor(() => {
      expect(callOrder).toContain(`POST /items:${sampleProductId1}`);
      expect(callOrder).toContain(`POST /items:${sampleProductId2}`);
      expect(callOrder).toContain('GET /cart');
    });

    // POST /items must occur before GET /cart
    const postIdx1 = callOrder.indexOf(`POST /items:${sampleProductId1}`);
    const postIdx2 = callOrder.indexOf(`POST /items:${sampleProductId2}`);
    const getIdx = callOrder.lastIndexOf('GET /cart');
    expect(postIdx1).toBeLessThan(getIdx);
    expect(postIdx2).toBeLessThan(getIdx);

    // localStorage must be completely cleared after 100% success
    expect(getGuestCart()).toEqual([]);
  });

  it('preserves failed and unmigrated items in localStorage when migration partially fails', async () => {
    addGuestCartItem(sampleProductId1, 1);
    addGuestCartItem(sampleProductId2, 1);

    // First item succeeds, second item fails (e.g. out of stock or network issue)
    cartApi.addItem.mockImplementation(async (payload) => {
      if (payload.productId === sampleProductId1) {
        return { message: 'Added' };
      }
      throw new Error('INSUFFICIENT_STOCK');
    });

    cartApi.getCart.mockResolvedValue({
      cart: {
        id: 'cart-1',
        items: [
          {
            id: 'item-1',
            product_id: sampleProductId1,
            name: 'Athletic Cotton Socks',
            price_paise: 109000,
            quantity: 1,
          },
        ],
        subtotal_paise: 109000,
        total_quantity: 1,
      },
    });

    authApi.login.mockResolvedValue({
      user: { id: 'u-1', email: 'test@example.com', full_name: 'Test User' },
    });

    render(
      <MemoryRouter initialEntries={['/cart']}>
        <App />
      </MemoryRouter>
    );

    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText(/Athletic Cotton Socks/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /proceed to checkout/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /account login/i })).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
    await user.type(screen.getByLabelText(/password/i), 'secret123');
    await user.click(screen.getByRole('button', { name: /sign in to nexora/i }));

    await waitFor(() => {
      expect(cartApi.addItem).toHaveBeenCalledTimes(2);
    });

    // Invariant: sampleProductId1 succeeded so it was removed,
    // but sampleProductId2 failed so it MUST remain in localStorage
    const remaining = getGuestCart();
    expect(remaining).toEqual([{ productId: sampleProductId2, quantity: 1 }]);
  });

  it('preserves entire guest cart in localStorage if all migration POSTs fail', async () => {
    addGuestCartItem(sampleProductId1, 2);

    cartApi.addItem.mockRejectedValue(new Error('NETWORK_DISCONNECTED'));

    authApi.login.mockResolvedValue({
      user: { id: 'u-1', email: 'test@example.com', full_name: 'Test User' },
    });

    render(
      <MemoryRouter initialEntries={['/cart']}>
        <App />
      </MemoryRouter>
    );

    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText(/Athletic Cotton Socks/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /proceed to checkout/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /account login/i })).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
    await user.type(screen.getByLabelText(/password/i), 'secret123');
    await user.click(screen.getByRole('button', { name: /sign in to nexora/i }));

    await waitFor(() => {
      expect(cartApi.addItem).toHaveBeenCalled();
    });

    // Invariant: Failed migration does NOT clear localStorage
    expect(getGuestCart()).toEqual([{ productId: sampleProductId1, quantity: 2 }]);
  });

  it('safely migrates stranded guest cart on session refresh (loadSession)', async () => {
    addGuestCartItem(sampleProductId1, 1);

    authApi.getCurrentUser.mockResolvedValue({
      user: { id: 'u-1', email: 'test@example.com', full_name: 'Test User' },
    });

    cartApi.addItem.mockResolvedValue({ message: 'Added' });
    cartApi.getCart.mockResolvedValue({
      cart: {
        id: 'cart-1',
        items: [
          {
            id: 'item-1',
            product_id: sampleProductId1,
            name: 'Athletic Cotton Socks',
            price_paise: 109000,
            quantity: 1,
          },
        ],
        subtotal_paise: 109000,
        total_quantity: 1,
      },
    });

    render(
      <MemoryRouter initialEntries={['/cart']}>
        <App />
      </MemoryRouter>
    );

    // On mount, loadSession should detect user + stranded guest item,
    // post item, hydrate cart, and clear localStorage
    await waitFor(() => {
      expect(cartApi.addItem).toHaveBeenCalledWith({ productId: sampleProductId1, quantity: 1 });
      expect(getGuestCart()).toEqual([]);
    });
  });

  it('requires authentication when unauthenticated guest directly accesses /checkout', async () => {
    render(
      <MemoryRouter initialEntries={['/checkout']}>
        <App />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /sign in to complete acquisition/i })).toBeInTheDocument();
    });
  });
});
