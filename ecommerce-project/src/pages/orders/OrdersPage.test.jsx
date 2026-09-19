import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import userEvent from '@testing-library/user-event';
import { OrdersPage } from './OrdersPage.jsx';
import { ordersApi } from '../../api/orders.js';
import { cartApi } from '../../api/cart.js';

vi.mock('../../api/cart.js', () => ({
  cartApi: {
    addItem: vi.fn().mockResolvedValue({ success: true }),
  },
  default: {
    addItem: vi.fn().mockResolvedValue({ success: true }),
  },
}));

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

  it('renders empty orders state when list is empty (canonical format)', async () => {
    ordersApi.listOrders.mockResolvedValue({
      success: true,
      data: [],
      pagination: { page: 1, limit: 10, totalItems: 0, totalPages: 0 },
    });

    render(
      <MemoryRouter>
        <OrdersPage cart={[]} loadCart={loadCart} />
      </MemoryRouter>
    );

    expect(await screen.findByText(/no placed orders/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /start shopping/i })).toBeInTheDocument();
  });

  it('renders orders list with canonical backend response envelope { success: true, data: [...], pagination: {...} }', async () => {
    ordersApi.listOrders.mockResolvedValue({
      success: true,
      data: [
        {
          id: '11e7e98c-41ef-4a80-b20b-b5418019fbe0',
          userId: '52d651e5-259f-4bc9-ba5f-54c1ab5dbd2e',
          status: 'PAID',
          orderStatus: 'PAID',
          subtotalPaise: 2779900,
          shippingFeePaise: 30000,
          totalPaise: 2809900,
          totalCostPaise: 2809900,
          createdAt: '2026-09-19T04:40:00.000Z',
          items: [
            {
              id: 'oi-1',
              productId: 'd0000000-0000-4000-8000-000000000011',
              productName: 'Linen Canvas Utility Overshirt',
              quantity: 2,
              unitPricePaise: 109000,
              lineTotalPaise: 218000,
              imageUrl: 'https://images.unsplash.com/photo-1603252109303-2751441dd157?auto=format&fit=crop&w=800&q=80',
            },
          ],
        },
      ],
      pagination: {
        page: 1,
        limit: 10,
        totalItems: 1,
        totalPages: 1,
      },
    });

    render(
      <MemoryRouter>
        <OrdersPage cart={[]} loadCart={loadCart} />
      </MemoryRouter>
    );

    expect(await screen.findByText('11e7e98c-41ef-4a80-b20b-b5418019fbe0')).toBeInTheDocument();
    expect(screen.getByText('PAID')).toBeInTheDocument();
    expect(screen.getByText('Linen Canvas Utility Overshirt')).toBeInTheDocument();
    expect(screen.getByText('Quantity: 2')).toBeInTheDocument();
    expect(screen.getByText('₹28099.00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /buy again/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /track package/i })).toBeInTheDocument();

    // Verify correct product imageUrl is rendered instead of generic fallback
    const img = screen.getByAltText('Linen Canvas Utility Overshirt');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://images.unsplash.com/photo-1603252109303-2751441dd157?auto=format&fit=crop&w=800&q=80');
  });

  it('renders fallback placeholder image when order item imageUrl is null or missing', async () => {
    ordersApi.listOrders.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'ord-fallback-null',
          status: 'PAID',
          totalPaise: 100000,
          created_at: '2026-09-19T04:40:00.000Z',
          items: [
            {
              id: 'oi-fallback',
              productId: 'p-none',
              productName: 'Custom Heritage Jacket',
              quantity: 1,
              unitPricePaise: 100000,
              imageUrl: null,
            },
          ],
        },
      ],
      pagination: { page: 1, limit: 10, totalItems: 1, totalPages: 1 },
    });

    render(
      <MemoryRouter>
        <OrdersPage cart={[]} loadCart={loadCart} />
      </MemoryRouter>
    );

    expect(await screen.findByText('ord-fallback-null')).toBeInTheDocument();
    const img = screen.getByAltText('Custom Heritage Jacket');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'images/products/athletic-cotton-socks-6-pairs.jpg');
  });

  it('renders orders list with legacy response format { orders: [...] } for backward compatibility', async () => {
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

  it('adds item to cart using existing cartApi and invokes loadCart on Buy Again click', async () => {
    const user = userEvent.setup();
    ordersApi.listOrders.mockResolvedValue({
      orders: [
        {
          id: 'ord-buy-again',
          status: 'PAID',
          total_paise: 100000,
          created_at: '2026-09-10T12:00:00.000Z',
          items: [
            {
              id: 'oi-10',
              productId: 'prod-socks-10',
              productName: 'Architectural Cotton Socks',
              quantity: 1,
              unitPricePaise: 100000,
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

    const buyAgainBtn = await screen.findByRole('button', { name: /buy again/i });
    await user.click(buyAgainBtn);

    expect(cartApi.addItem).toHaveBeenCalledWith({
      productId: 'prod-socks-10',
      quantity: 1,
    });
    expect(loadCart).toHaveBeenCalled();
  });
});
