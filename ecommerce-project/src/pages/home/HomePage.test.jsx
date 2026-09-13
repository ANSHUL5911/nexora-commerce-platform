import { it, expect, describe, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { productsApi } from '../../api/products';
import { HomePage } from './HomePage';

vi.mock('../../api/products', () => ({
  productsApi: {
    listProducts: vi.fn(),
    getProductById: vi.fn(),
  },
  default: {
    listProducts: vi.fn(),
    getProductById: vi.fn(),
  },
}));

vi.mock('../../api/auth', () => ({
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

describe('HomePage component', () => {
  let loadCart;

  beforeEach(() => {
    loadCart = vi.fn();

    productsApi.listProducts.mockResolvedValue({
      products: [
        {
          id: 'e43638ce-6aa0-4b85-b27f-e1d07eb678c6',
          image_url: 'images/products/athletic-cotton-socks-6-pairs.jpg',
          name: 'Black and Gray Athletic Cotton Socks - 6 Pairs',
          description: 'High quality cotton socks',
          price_paise: 109000,
          category: 'Apparel',
          available_quantity: 50,
        },
        {
          id: '15b6fc6f-327a-4ec4-896f-486349e85a3d',
          image_url: 'images/products/intermediate-composite-basketball.jpg',
          name: 'Intermediate Size Basketball',
          description: 'Official size composite basketball',
          price_paise: 209500,
          category: 'Sports',
          available_quantity: 20,
        },
      ],
      pagination: { page: 1, limit: 12, total: 2, totalPages: 1 },
    });
  });

  it('displays the products correctly', async () => {
    render(
      <MemoryRouter>
        <HomePage cart={[]} loadCart={loadCart} />
      </MemoryRouter>
    );
    const productContainers = await screen.findAllByTestId('product-container');

    expect(productContainers.length).toBe(2);

    expect(
      within(productContainers[0])
        .getByText('Black and Gray Athletic Cotton Socks - 6 Pairs')
    ).toBeInTheDocument();

    expect(
      within(productContainers[1])
        .getByText('Intermediate Size Basketball')
    ).toBeInTheDocument();
  });
});