import { it, expect, describe, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { productsApi } from '../../api/products';
import { CatalogPage } from './CatalogPage';

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

describe('CatalogPage component', () => {
  let loadCart;

  const mockProducts = [
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
      category: 'Living',
      available_quantity: 20,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    loadCart = vi.fn();

    productsApi.listProducts.mockResolvedValue({
      products: mockProducts,
      pagination: { page: 1, limit: 12, total: 2, totalPages: 1 },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('displays the catalog title, subtitle, and products correctly', async () => {
    render(
      <MemoryRouter initialEntries={['/catalog']}>
        <CatalogPage cart={[]} loadCart={loadCart} />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { level: 1, name: /product catalog/i })).toBeInTheDocument();
    const productContainers = await screen.findAllByTestId('product-container');
    expect(productContainers.length).toBe(2);

    expect(
      within(productContainers[0]).getByText('Black and Gray Athletic Cotton Socks - 6 Pairs')
    ).toBeInTheDocument();
  });

  it('maps category tabs to canonical backend values when clicked', async () => {
    render(
      <MemoryRouter initialEntries={['/catalog']}>
        <CatalogPage cart={[]} loadCart={loadCart} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(productsApi.listProducts).toHaveBeenCalledWith({
        search: undefined,
        category: undefined,
      });
    });

    const apparelTab = screen.getByRole('tab', { name: /^apparel$/i });
    fireEvent.click(apparelTab);

    await waitFor(() => {
      expect(productsApi.listProducts).toHaveBeenCalledWith({
        search: undefined,
        category: 'Apparel',
      });
    });
  });

  it('initializes category filter from URL query parameter (e.g., /catalog?category=APPAREL)', async () => {
    render(
      <MemoryRouter initialEntries={['/catalog?category=APPAREL']}>
        <Routes>
          <Route path="/catalog" element={<CatalogPage cart={[]} loadCart={loadCart} />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(productsApi.listProducts).toHaveBeenCalledWith({
        search: undefined,
        category: 'Apparel',
      });
    });

    const apparelTab = screen.getByRole('tab', { name: /^apparel$/i });
    expect(apparelTab).toHaveAttribute('aria-selected', 'true');
  });

  it('handles search query parameter correctly', async () => {
    render(
      <MemoryRouter initialEntries={['/catalog?search=socks']}>
        <Routes>
          <Route path="/catalog" element={<CatalogPage cart={[]} loadCart={loadCart} />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(productsApi.listProducts).toHaveBeenCalledWith({
        search: 'socks',
        category: undefined,
      });
    });
  });

  it('displays error message and retry button when products fail to load', async () => {
    productsApi.listProducts.mockRejectedValueOnce(new Error('Network error'));

    render(
      <MemoryRouter initialEntries={['/catalog']}>
        <CatalogPage cart={[]} loadCart={loadCart} />
      </MemoryRouter>
    );

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Network error')).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: /retry/i });
    expect(retryBtn).toBeInTheDocument();

    productsApi.listProducts.mockResolvedValueOnce({
      products: mockProducts,
      pagination: { page: 1, limit: 12, total: 2, totalPages: 1 },
    });

    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  it('displays empty state when no products match', async () => {
    productsApi.listProducts.mockResolvedValueOnce({
      products: [],
      pagination: { page: 1, limit: 12, total: 0, totalPages: 0 },
    });

    render(
      <MemoryRouter initialEntries={['/catalog']}>
        <CatalogPage cart={[]} loadCart={loadCart} />
      </MemoryRouter>
    );

    expect(await screen.findByText('No products found')).toBeInTheDocument();
  });

  it('browser refresh on /catalog preserves catalog route, search query, and category filter', async () => {
    render(
      <MemoryRouter initialEntries={['/catalog?search=socks&category=APPAREL']}>
        <Routes>
          <Route path="/catalog" element={<CatalogPage cart={[]} loadCart={loadCart} />} />
        </Routes>
      </MemoryRouter>
    );

    // Verifies catalog page rendered with category and search query preserved
    expect(await screen.findByRole('heading', { level: 1, name: /product catalog/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(productsApi.listProducts).toHaveBeenCalledWith({
        search: 'socks',
        category: 'Apparel',
      });
    });

    const apparelTab = screen.getByRole('tab', { name: /^apparel$/i });
    expect(apparelTab).toHaveAttribute('aria-selected', 'true');
  });
});
