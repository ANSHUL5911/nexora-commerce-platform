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
  it('renders order tracking timeline with item preview and status badge', async () => {
    ordersApi.getOrder.mockResolvedValue({
      order: {
        id: 'ord-12345',
        status: 'SHIPPED',
        createdAt: '2026-09-10T12:00:00.000Z',
        items: [
          {
            id: 'item-1',
            productId: 'prod-1',
            productName: 'Architectural Cotton Socks',
            quantity: 2,
            image: 'images/products/athletic-cotton-socks-6-pairs.jpg',
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
  });
});
