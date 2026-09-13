import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { OrdersPage } from './OrdersPage.jsx';
import { ordersApi } from '../../api/orders.js';

vi.mock('../../api/orders.js', () => ({
  ordersApi: {
    listOrders: vi.fn(),
    getOrder: vi.fn(),
  },
  default: {
    listOrders: vi.fn(),
    getOrder: vi.fn(),
  },
}));

vi.mock('../../api/auth.js', () => ({
  authApi: {
    getCurrentUser: vi.fn().mockResolvedValue({ user: null }),
  },
  default: {
    getCurrentUser: vi.fn().mockResolvedValue({ user: null }),
  },
}));

describe('OrdersPage component', () => {
  let loadCart;

  beforeEach(() => {
    loadCart = vi.fn();
  });

  it('renders empty orders state when list is empty', async () => {
    ordersApi.listOrders.mockResolvedValue({ orders: [] });

    render(
      <MemoryRouter>
        <OrdersPage cart={[]} loadCart={loadCart} />
      </MemoryRouter>
    );

    expect(await screen.findByText(/no placed orders/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /start shopping/i })).toBeInTheDocument();
  });

  it('renders orders list with order details, status badge, and item previews', async () => {
    ordersApi.listOrders.mockResolvedValue({
      orders: [
        {
          id: 'ord-9988',
          status: 'PAID',
          total_paise: 218000,
          created_at: '2026-09-10T12:00:00.000Z',
          items: [
            {
              id: 'oi-1',
              productId: 'p-1',
              productName: 'Architectural Cotton Socks',
              quantity: 2,
              unitPricePaise: 109000,
              image: 'images/products/athletic-cotton-socks-6-pairs.jpg',
            },
          ],
        },
      ],
    });

    render(
      <MemoryRouter>
        <OrdersPage cart={[]} loadCart={loadCart} />
      </MemoryRouter>
    );

    expect(await screen.findByText('ord-9988')).toBeInTheDocument();
    expect(screen.getByText('PAID')).toBeInTheDocument();
    expect(screen.getByText('Architectural Cotton Socks')).toBeInTheDocument();
    expect(screen.getByText('Quantity: 2')).toBeInTheDocument();
    expect(screen.getByText('₹2180.00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /buy again/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /track package/i })).toBeInTheDocument();
  });
});
