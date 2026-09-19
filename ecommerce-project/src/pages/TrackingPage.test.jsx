import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { TrackingPage } from './TrackingPage.jsx';
import { ordersApi } from '../api/orders.js';

vi.mock('../api/orders.js', () => ({
  ordersApi: {
    getOrder: vi.fn(),
  },
  default: {
    getOrder: vi.fn(),
  },
}));

vi.mock('../api/auth.js', () => ({
  authApi: {
    getCurrentUser: vi.fn().mockResolvedValue({ user: null }),
  },
  default: {
    getCurrentUser: vi.fn().mockResolvedValue({ user: null }),
  },
}));

describe('TrackingPage component', () => {
  it('renders order tracking timeline with item preview and status badge using canonical backend response shape', async () => {
    ordersApi.getOrder.mockResolvedValue({
      success: true,
      data: {
        id: 'ord-12345',
        status: 'SHIPPED',
        orderStatus: 'SHIPPED',
        createdAt: '2026-09-10T12:00:00.000Z',
        items: [
          {
            id: 'item-1',
            productId: 'prod-1',
            productName: 'Architectural Cotton Socks',
            imageUrl: 'https://example.com/product.jpg',
            quantity: 2,
          },
        ],
      },
    });

    render(
      <MemoryRouter initialEntries={['/tracking/ord-12345/prod-1']}>
        <Routes>
          <Route path="tracking/:orderId/:productId" element={<TrackingPage cart={[]} />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Order #ord-12345')).toBeInTheDocument();
    expect(screen.getByText('SHIPPED')).toBeInTheDocument();
    expect(screen.getByText('Architectural Cotton Socks')).toBeInTheDocument();
    expect(screen.getByText('Quantity: 2')).toBeInTheDocument();
    expect(screen.getByText('In Transit')).toBeInTheDocument();

    const img = screen.getByAltText('Architectural Cotton Socks');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://example.com/product.jpg');
    expect(img).not.toHaveAttribute('src', 'images/products/athletic-cotton-socks-6-pairs.jpg');
  });

  it('renders order tracking timeline with legacy { order: ... } format for backward compatibility', async () => {
    ordersApi.getOrder.mockResolvedValue({
      order: {
        id: 'ord-legacy-1',
        status: 'DELIVERED',
        createdAt: '2026-09-10T12:00:00.000Z',
        items: [
          {
            id: 'item-legacy',
            productId: 'prod-legacy',
            productName: 'Classic Leather Trench',
            imageUrl: 'https://example.com/trench.jpg',
            quantity: 1,
          },
        ],
      },
    });

    render(
      <MemoryRouter initialEntries={['/tracking/ord-legacy-1/prod-legacy']}>
        <Routes>
          <Route path="tracking/:orderId/:productId" element={<TrackingPage cart={[]} />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Order #ord-legacy-1')).toBeInTheDocument();
    expect(screen.getByText('DELIVERED')).toBeInTheDocument();
    expect(screen.getByText('Classic Leather Trench')).toBeInTheDocument();
    expect(screen.getByText('Quantity: 1')).toBeInTheDocument();
  });

  it('renders PENDING_PAYMENT with 0% progress, payment-required message, and no active fulfillment step', async () => {
    ordersApi.getOrder.mockResolvedValue({
      success: true,
      data: {
        id: 'ord-pending-track-99',
        status: 'PENDING_PAYMENT',
        orderStatus: 'PENDING_PAYMENT',
        createdAt: '2026-09-19T06:00:00.000Z',
        items: [
          {
            id: 'item-pen',
            productId: 'prod-pen',
            productName: 'Raw Indigo Chore Jacket',
            imageUrl: 'https://example.com/chore-jacket.jpg',
            quantity: 1,
          },
        ],
      },
    });

    const { container } = render(
      <MemoryRouter initialEntries={['/tracking/ord-pending-track-99/prod-pen']}>
        <Routes>
          <Route path="tracking/:orderId/:productId" element={<TrackingPage cart={[]} />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Order #ord-pending-track-99')).toBeInTheDocument();
    expect(screen.getByText('PENDING_PAYMENT')).toBeInTheDocument();
    expect(screen.getByText('Payment required before fulfillment tracking becomes available.')).toBeInTheDocument();
    expect(screen.getByText('Raw Indigo Chore Jacket')).toBeInTheDocument();
    expect(screen.getByText('Quantity: 1')).toBeInTheDocument();

    const img = screen.getByAltText('Raw Indigo Chore Jacket');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://example.com/chore-jacket.jpg');

    // Verify progress bar is at 0%
    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-valuenow', '0');
    const fill = container.querySelector('.tracking-bar-fill');
    expect(fill).toHaveStyle({ width: '0%' });

    // Verify none of the timeline labels are active
    const activeLabels = container.querySelectorAll('.tracking-label.active');
    expect(activeLabels.length).toBe(0);
  });
});
