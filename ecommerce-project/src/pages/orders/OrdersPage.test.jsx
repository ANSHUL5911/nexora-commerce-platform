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

  it('rehydrates and renders guest order using canonical { success: true, data: orderDTO } envelope from location.state', async () => {
    ordersApi.getOrder.mockResolvedValue({
      success: true,
      data: {
        id: 'guest-order-8888',
        status: 'PAID',
        orderStatus: 'PAID',
        subtotalPaise: 150000,
        shippingFeePaise: 0,
        totalPaise: 150000,
        totalCostPaise: 150000,
        createdAt: '2026-09-19T05:00:00.000Z',
        items: [
          {
            id: 'item-guest-1',
            productId: 'prod-guest-1',
            productName: 'Linen Canvas Utility Overshirt',
            quantity: 1,
            unitPricePaise: 150000,
            imageUrl: 'https://images.unsplash.com/photo-1603252109303-2751441dd157?auto=format&fit=crop&w=800&q=80',
          },
        ],
      },
    });

    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/orders',
            state: { guestToken: 'sample-guest-token-123', orderId: 'guest-order-8888' },
          },
        ]}
      >
        <OrdersPage cart={[]} loadCart={loadCart} />
      </MemoryRouter>
    );

    expect(await screen.findByText('guest-order-8888')).toBeInTheDocument();
    expect(screen.getByText('Linen Canvas Utility Overshirt')).toBeInTheDocument();
    expect(screen.getByText('Quantity: 1')).toBeInTheDocument();
    const img = screen.getByAltText('Linen Canvas Utility Overshirt');
    expect(img).toHaveAttribute('src', 'https://images.unsplash.com/photo-1603252109303-2751441dd157?auto=format&fit=crop&w=800&q=80');
    expect(ordersApi.getOrder).toHaveBeenCalledWith('guest-order-8888', { guestToken: 'sample-guest-token-123' });
  });

  describe('Order State Presentation & Action Guard Matrix (Phase 07.24)', () => {
    it('PENDING_PAYMENT renders PAYMENT INITIATED, badge, hides Track Package and Buy Again, and does not render ORDER PLACED', async () => {
      ordersApi.listOrders.mockResolvedValue({
        success: true,
        data: [
          {
            id: 'ord-pending-1',
            status: 'PENDING_PAYMENT',
            totalPaise: 450000,
            createdAt: '2026-09-19T06:00:00.000Z',
            items: [
              {
                id: 'item-pending-1',
                productId: 'prod-p1',
                productName: 'Raw Selvedge Denim',
                quantity: 1,
                unitPricePaise: 450000,
                imageUrl: 'https://images.unsplash.com/photo-denim.jpg',
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

      expect(await screen.findByText('PAYMENT INITIATED')).toBeInTheDocument();
      expect(screen.getByText('PENDING_PAYMENT')).toBeInTheDocument();
      expect(screen.queryByText('ORDER PLACED')).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /track package/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /buy again/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /complete payment/i })).not.toBeInTheDocument();

      // Verify real imageUrl renders on PENDING_PAYMENT order without falling back to socks
      const img = screen.getByAltText('Raw Selvedge Denim');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', 'https://images.unsplash.com/photo-denim.jpg');
    });

    it('PROCESSING renders ORDER PLACED and shows Track Package', async () => {
      ordersApi.listOrders.mockResolvedValue({
        success: true,
        data: [
          {
            id: 'ord-proc-1',
            status: 'PROCESSING',
            totalPaise: 200000,
            createdAt: '2026-09-19T06:00:00.000Z',
            items: [
              {
                id: 'item-proc-1',
                productId: 'prod-proc-1',
                productName: 'Merino Wool Beanie',
                quantity: 1,
                unitPricePaise: 200000,
                imageUrl: 'https://images.unsplash.com/photo-beanie.jpg',
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

      expect(await screen.findByText('ORDER PLACED')).toBeInTheDocument();
      expect(screen.getByText('PROCESSING')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /track package/i })).toBeInTheDocument();
    });

    it('SHIPPED renders ORDER PLACED and shows Track Package', async () => {
      ordersApi.listOrders.mockResolvedValue({
        success: true,
        data: [
          {
            id: 'ord-ship-1',
            status: 'SHIPPED',
            totalPaise: 300000,
            createdAt: '2026-09-19T06:00:00.000Z',
            items: [
              {
                id: 'item-ship-1',
                productId: 'prod-ship-1',
                productName: 'Structured Canvas Tote',
                quantity: 1,
                unitPricePaise: 300000,
                imageUrl: 'https://images.unsplash.com/photo-tote.jpg',
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

      expect(await screen.findByText('ORDER PLACED')).toBeInTheDocument();
      expect(screen.getByText('SHIPPED')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /track package/i })).toBeInTheDocument();
    });

    it('DELIVERED renders ORDER PLACED and shows Buy Again and Track Package', async () => {
      ordersApi.listOrders.mockResolvedValue({
        success: true,
        data: [
          {
            id: 'ord-deliv-1',
            status: 'DELIVERED',
            totalPaise: 150000,
            createdAt: '2026-09-19T06:00:00.000Z',
            items: [
              {
                id: 'item-deliv-1',
                productId: 'prod-deliv-1',
                productName: 'Minimalist Oxford Shoes',
                quantity: 1,
                unitPricePaise: 150000,
                imageUrl: 'https://images.unsplash.com/photo-shoes.jpg',
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

      expect(await screen.findByText('ORDER PLACED')).toBeInTheDocument();
      expect(screen.getByText('DELIVERED')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /buy again/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /track package/i })).toBeInTheDocument();
    });

    it('CANCELLED renders ORDER CANCELLED and hides Track Package while preserving Buy Again', async () => {
      ordersApi.listOrders.mockResolvedValue({
        success: true,
        data: [
          {
            id: 'ord-canc-1',
            status: 'CANCELLED',
            totalPaise: 100000,
            createdAt: '2026-09-19T06:00:00.000Z',
            items: [
              {
                id: 'item-canc-1',
                productId: 'prod-canc-1',
                productName: 'Twisted Seam Knit',
                quantity: 1,
                unitPricePaise: 100000,
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

      expect(await screen.findByText('ORDER CANCELLED')).toBeInTheDocument();
      expect(screen.getByText('CANCELLED')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /track package/i })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /buy again/i })).toBeInTheDocument();
    });

    it('EXPIRED renders ORDER EXPIRED and hides Track Package while preserving Buy Again', async () => {
      ordersApi.listOrders.mockResolvedValue({
        success: true,
        data: [
          {
            id: 'ord-exp-1',
            status: 'EXPIRED',
            totalPaise: 120000,
            createdAt: '2026-09-19T06:00:00.000Z',
            items: [
              {
                id: 'item-exp-1',
                productId: 'prod-exp-1',
                productName: 'Classic Poplin Shirt',
                quantity: 1,
                unitPricePaise: 120000,
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

      expect(await screen.findByText('ORDER EXPIRED')).toBeInTheDocument();
      expect(screen.getByText('EXPIRED')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /track package/i })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /buy again/i })).toBeInTheDocument();
    });

    it('REFUNDED renders ORDER REFUNDED and hides Track Package while preserving Buy Again', async () => {
      ordersApi.listOrders.mockResolvedValue({
        success: true,
        data: [
          {
            id: 'ord-ref-1',
            status: 'REFUNDED',
            totalPaise: 180000,
            createdAt: '2026-09-19T06:00:00.000Z',
            items: [
              {
                id: 'item-ref-1',
                productId: 'prod-ref-1',
                productName: 'Heavyweight Fleece Hoodie',
                quantity: 1,
                unitPricePaise: 180000,
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

      expect(await screen.findByText('ORDER REFUNDED')).toBeInTheDocument();
      expect(screen.getByText('REFUNDED')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /track package/i })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /buy again/i })).toBeInTheDocument();
    });

    it('Unknown status renders ORDER STATUS safely without crashing and without Track Package', async () => {
      ordersApi.listOrders.mockResolvedValue({
        success: true,
        data: [
          {
            id: 'ord-unk-1',
            status: 'SOME_FUTURE_STATUS',
            totalPaise: 90000,
            createdAt: '2026-09-19T06:00:00.000Z',
            items: [
              {
                id: 'item-unk-1',
                productId: 'prod-unk-1',
                productName: 'Mystery Accessory',
                quantity: 1,
                unitPricePaise: 90000,
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

      expect(await screen.findByText('ORDER STATUS')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /track package/i })).not.toBeInTheDocument();
      expect(screen.queryByText('ORDER PLACED')).not.toBeInTheDocument();
    });
  });
});
