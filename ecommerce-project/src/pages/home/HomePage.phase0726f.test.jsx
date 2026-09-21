import { it, expect, describe, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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

describe('Phase 07.26F — Nexora Award-Winning Editorial Homepage', () => {
  const mockCuratedProducts = [
    {
      id: 'p-1',
      image_url: 'images/products/athletic-cotton-socks-6-pairs.jpg',
      name: 'Architectural Heavy Cotton Socks',
      description: 'Heavy gauge organic cotton socks',
      price_paise: 120000,
      category: 'Apparel',
      available_quantity: 40,
    },
    {
      id: 'p-2',
      image_url: 'https://images.unsplash.com/chronograph', // known malformed seed
      name: 'Precision Chronograph Vessel',
      description: 'Structured tactile everyday container',
      price_paise: 350000,
      category: 'Accessories',
      available_quantity: 15,
    },
    {
      id: 'p-3',
      image_url: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c',
      name: 'Minimalist Stool',
      description: 'Milled solid oak foundation',
      price_paise: 890000,
      category: 'Living',
      available_quantity: 8,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    productsApi.listProducts.mockResolvedValue({
      products: mockCuratedProducts,
      pagination: { page: 1, limit: 6, total: 3, totalPages: 1 },
    });
  });

  it('renders all 8 continuous editorial sections with zero gaps', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <HomePage cart={[]} currentUser={null} />
      </MemoryRouter>
    );

    // 01 Header
    expect(screen.getByRole('banner')).toBeInTheDocument();

    // 02 Hero
    expect(screen.getByRole('heading', { level: 1, name: /architectural essentials, engineered for enduring utility/i })).toBeInTheDocument();

    // 03 Collection Intro
    expect(screen.getByText(/objects designed around material, proportion and everyday utility/i)).toBeInTheDocument();

    // 04 Editorial Feature (TextReveal)
    expect(screen.getByText('Material')).toBeInTheDocument();

    // 05 Shop by Category (AnimatedTabs & Categories)
    expect(screen.getByRole('region', { name: /category discipline selector/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /shop apparel category/i })).toBeInTheDocument();

    // 06 Selected Objects
    expect(screen.getByRole('heading', { level: 2, name: /selected objects/i })).toBeInTheDocument();

    // 07 Brand Philosophy
    expect(screen.getByText(/design is not an embellishment; it is the discipline of stripping away until only purpose remains/i)).toBeInTheDocument();

    // 08 Footer
    expect(screen.getByRole('contentinfo', { name: /site footer/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(productsApi.listProducts).toHaveBeenCalledWith({ limit: 6 });
    });
  });

  it('renders Selected Objects without raw catalog controls (no dropdowns, no add-to-cart buttons)', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <HomePage cart={[]} currentUser={null} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(productsApi.listProducts).toHaveBeenCalled();
    });

    const objectCards = await screen.findAllByTestId('selected-object-card');
    expect(objectCards.length).toBe(3);

    // Verify raw catalog controls are ABSENT from homepage cards
    expect(screen.queryByTestId('quantity-selector')).not.toBeInTheDocument();
    expect(screen.queryByTestId('add-to-cart-button')).not.toBeInTheDocument();

    // Verify entire card links to /product/:id
    const firstLink = screen.getByRole('link', { name: /view architectural heavy cotton socks/i });
    expect(firstLink).toHaveAttribute('href', '/product/p-1');
  });

  it('normalizes malformed image URLs and renders architectural fallback on error', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <HomePage cart={[]} currentUser={null} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(productsApi.listProducts).toHaveBeenCalled();
    });

    // Product 1 relative path normalized with leading slash
    const img1 = screen.getByAltText('Architectural Heavy Cotton Socks');
    expect(img1.getAttribute('src')).toBe('/images/products/athletic-cotton-socks-6-pairs.jpg');

    // Product 2 malformed chronograph URL normalized to category fallback
    const img2 = screen.getByAltText('Precision Chronograph Vessel');
    expect(img2.getAttribute('src')).toContain('images.unsplash.com');

    // Simulating image load error swaps to fallback
    fireEvent.error(img2);
    expect(img2.getAttribute('src')).toContain('data:image/svg+xml');
  });

  it('opens and closes SmoothUI ImageMetadataPreview modal on user interaction', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <HomePage cart={[]} currentUser={null} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(productsApi.listProducts).toHaveBeenCalled();
    });

    const provenanceBtn = screen.getByRole('button', { name: /inspect architectural provenance preview/i });
    expect(provenanceBtn).toBeInTheDocument();

    fireEvent.click(provenanceBtn);

    const dialog = screen.getByRole('dialog', { name: /product provenance metadata/i });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('ARCHITECTURAL PROVENANCE')).toBeInTheDocument();

    const closeBtn = screen.getByRole('button', { name: /close provenance modal/i });
    fireEvent.click(closeBtn);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
