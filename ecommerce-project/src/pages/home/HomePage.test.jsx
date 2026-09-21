import { it, expect, describe, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
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

describe('HomePage Component (Phase 07.26E)', () => {
  let loadCart;

  const mockCuratedProducts = [
    {
      id: 'p-1',
      image_url: 'images/products/athletic-cotton-socks-6-pairs.jpg',
      name: 'Architectural Cotton Socks',
      description: 'Heavy gauge organic cotton socks',
      price_paise: 120000,
      category: 'Apparel',
      available_quantity: 40,
    },
    {
      id: 'p-2',
      image_url: 'images/products/intermediate-composite-basketball.jpg',
      name: 'Precision Leather Vessel',
      description: 'Structured tactile everyday container',
      price_paise: 350000,
      category: 'Living',
      available_quantity: 15,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    loadCart = vi.fn();

    productsApi.listProducts.mockResolvedValue({
      products: mockCuratedProducts,
      pagination: { page: 1, limit: 6, total: 2, totalPages: 1 },
    });
  });

  it('renders editorial hero content, headline, and supporting text', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <HomePage cart={[]} loadCart={loadCart} />
      </MemoryRouter>
    );

    expect(screen.getByText(/autumn \/ winter edition/i)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: /architectural essentials, engineered for enduring utility/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/a restrained collection of everyday objects, footwear, and apparel/i)
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(productsApi.listProducts).toHaveBeenCalled();
    });
  });

  it('provides an "Explore Collection" primary CTA linking directly to /catalog', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <HomePage cart={[]} loadCart={loadCart} />
      </MemoryRouter>
    );

    const ctaLink = screen.getByRole('link', { name: /explore the collection in the catalog/i });
    expect(ctaLink).toBeInTheDocument();
    expect(ctaLink).toHaveAttribute('href', '/catalog');

    await waitFor(() => {
      expect(productsApi.listProducts).toHaveBeenCalled();
    });
  });

  it('fetches a curated subset of products from productsApi and renders them', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <HomePage cart={[]} loadCart={loadCart} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(productsApi.listProducts).toHaveBeenCalledWith({ limit: 6 });
    });

    const productContainers = await screen.findAllByTestId('product-container');
    expect(productContainers.length).toBe(2);

    expect(
      within(productContainers[0]).getByText('Architectural Cotton Socks')
    ).toBeInTheDocument();

    expect(
      within(productContainers[1]).getByText('Precision Leather Vessel')
    ).toBeInTheDocument();
  });

  it('renders category navigation cards linking to /catalog with category query params', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <HomePage cart={[]} loadCart={loadCart} />
      </MemoryRouter>
    );

    const apparelLink = screen.getByRole('link', { name: /shop apparel category/i });
    expect(apparelLink).toBeInTheDocument();
    expect(apparelLink).toHaveAttribute('href', '/catalog?category=APPAREL');

    const livingLink = screen.getByRole('link', { name: /shop living category/i });
    expect(livingLink).toBeInTheDocument();
    expect(livingLink).toHaveAttribute('href', '/catalog?category=LIVING');

    const footwearLink = screen.getByRole('link', { name: /shop footwear category/i });
    expect(footwearLink).toBeInTheDocument();
    expect(footwearLink).toHaveAttribute('href', '/catalog?category=FOOTWEAR');

    const accessoriesLink = screen.getByRole('link', { name: /shop accessories category/i });
    expect(accessoriesLink).toBeInTheDocument();
    expect(accessoriesLink).toHaveAttribute('href', '/catalog?category=ACCESSORIES');

    await waitFor(() => {
      expect(productsApi.listProducts).toHaveBeenCalled();
    });
  });

  it('renders "View All Products" CTA linking to /catalog', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <HomePage cart={[]} loadCart={loadCart} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(productsApi.listProducts).toHaveBeenCalled();
    });

    const viewAllLink = screen.getByRole('link', { name: /view all products in catalog/i });
    expect(viewAllLink).toBeInTheDocument();
    expect(viewAllLink).toHaveAttribute('href', '/catalog');
  });

  it('gracefully handles API failure without crashing the homepage', async () => {
    productsApi.listProducts.mockRejectedValueOnce(new Error('Backend connection timeout'));

    render(
      <MemoryRouter initialEntries={['/']}>
        <HomePage cart={[]} loadCart={loadCart} />
      </MemoryRouter>
    );

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Backend connection timeout')).toBeInTheDocument();
    // Verify hero and categories are still intact despite product fetch failure
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /shop apparel category/i })).toBeInTheDocument();

    // Verify retry button exists and triggers reload
    const retryBtn = screen.getByRole('button', { name: /retry/i });
    expect(retryBtn).toBeInTheDocument();

    productsApi.listProducts.mockResolvedValueOnce({
      products: mockCuratedProducts,
      pagination: { total: 2 },
    });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  it('renders gracefully when catalog has zero products', async () => {
    productsApi.listProducts.mockResolvedValueOnce({
      products: [],
      pagination: { total: 0 },
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <HomePage cart={[]} loadCart={loadCart} />
      </MemoryRouter>
    );

    expect(await screen.findByText(/no products currently available in this edition/i)).toBeInTheDocument();
  });

  it('allows authenticated customers and unauthenticated guests to access homepage', async () => {
    const customerUser = {
      id: 'c-1',
      email: 'customer@nexora.local',
      role: 'customer',
      full_name: 'Customer One',
    };

    // Customer
    const { rerender } = render(
      <MemoryRouter initialEntries={['/']}>
        <HomePage cart={[]} currentUser={customerUser} />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();

    // Guest
    rerender(
      <MemoryRouter initialEntries={['/']}>
        <HomePage cart={[]} currentUser={null} />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();

    await waitFor(() => {
      expect(productsApi.listProducts).toHaveBeenCalled();
    });
  });

  it('browser refresh on /?query does not render catalog grid or trigger catalog pagination', async () => {
    render(
      <MemoryRouter initialEntries={['/?search=table&category=LIVING']}>
        <HomePage cart={[]} loadCart={loadCart} />
      </MemoryRouter>
    );

    // Verifies HomePage renders its own editorial structure, not catalog controls
    expect(screen.getByText(/autumn \/ winter edition/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: /product catalog/i })).not.toBeInTheDocument();

    // Fetches curated subset ({ limit: 6 }) rather than full catalog pagination queries
    await waitFor(() => {
      expect(productsApi.listProducts).toHaveBeenCalledWith({ limit: 6 });
    });
  });
});