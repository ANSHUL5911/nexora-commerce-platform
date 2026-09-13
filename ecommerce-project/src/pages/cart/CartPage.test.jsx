import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { CartPage } from './CartPage.jsx';
import { cartApi } from '../../api/cart.js';

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
    getCurrentUser: vi.fn().mockResolvedValue({ user: null }),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  },
  default: {
    getCurrentUser: vi.fn().mockResolvedValue({ user: null }),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  },
}));

describe('CartPage component', () => {
  let loadCart;

  beforeEach(() => {
    loadCart = vi.fn();
    cartApi.updateItem.mockResolvedValue({ success: true });
    cartApi.removeItem.mockResolvedValue({ success: true });
  });

  it('renders empty state when cart is empty', () => {
    render(
      <MemoryRouter>
        <CartPage cart={[]} loadCart={loadCart} />
      </MemoryRouter>
    );

    expect(screen.getByText(/your cart is empty/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /discover collections/i })).toBeInTheDocument();
  });

  it('renders line items and subtotal correctly', () => {
    const mockCart = [
      {
        id: 'item-1',
        name: 'Architectural Cotton Socks',
        pricePaise: 109000,
        quantity: 2,
        image: 'images/products/athletic-cotton-socks-6-pairs.jpg',
      },
    ];

    render(
      <MemoryRouter>
        <CartPage cart={mockCart} loadCart={loadCart} />
      </MemoryRouter>
    );

    expect(screen.getByText('Architectural Cotton Socks')).toBeInTheDocument();
    expect(screen.getByText('Unit Price: ₹1090.00')).toBeInTheDocument();
    expect(screen.getAllByText('₹2180.00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: /proceed to checkout/i })).toBeInTheDocument();
  });

  it('updates quantity and calls cartApi.updateItem', async () => {
    const mockCart = [
      {
        id: 'item-1',
        name: 'Architectural Cotton Socks',
        pricePaise: 109000,
        quantity: 2,
        image: 'images/products/athletic-cotton-socks-6-pairs.jpg',
      },
    ];

    render(
      <MemoryRouter>
        <CartPage cart={mockCart} loadCart={loadCart} />
      </MemoryRouter>
    );

    const user = userEvent.setup();
    const select = screen.getByLabelText(/quantity for architectural cotton socks/i);
    await user.selectOptions(select, '4');

    expect(cartApi.updateItem).toHaveBeenCalledWith('item-1', { quantity: 4 });
    expect(loadCart).toHaveBeenCalled();
  });

  it('removes item on clicking remove button', async () => {
    const mockCart = [
      {
        id: 'item-1',
        name: 'Architectural Cotton Socks',
        pricePaise: 109000,
        quantity: 1,
        image: 'images/products/athletic-cotton-socks-6-pairs.jpg',
      },
    ];

    render(
      <MemoryRouter>
        <CartPage cart={mockCart} loadCart={loadCart} />
      </MemoryRouter>
    );

    const user = userEvent.setup();
    const removeBtn = screen.getByRole('button', { name: /remove/i });
    await user.click(removeBtn);

    expect(cartApi.removeItem).toHaveBeenCalledWith('item-1');
    expect(loadCart).toHaveBeenCalled();
  });
});
