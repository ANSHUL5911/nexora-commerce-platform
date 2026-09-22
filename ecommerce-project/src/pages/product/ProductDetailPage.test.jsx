import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import { ProductDetailPage } from './ProductDetailPage.jsx';
import { productsApi } from '../../api/products.js';
import { cartApi } from '../../api/cart.js';

vi.mock('../../api/products.js', () => ({
  productsApi: {
    getProductById: vi.fn(),
    listProducts: vi.fn(),
  },
  default: {
    getProductById: vi.fn(),
    listProducts: vi.fn(),
  },
}));

vi.mock('../../api/cart.js', () => ({
  cartApi: {
    addItem: vi.fn(),
    getCart: vi.fn(),
  },
  default: {
    addItem: vi.fn(),
    getCart: vi.fn(),
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

describe('ProductDetailPage component', () => {
  let loadCart;

  beforeEach(() => {
    loadCart = vi.fn();
    cartApi.addItem.mockResolvedValue({ success: true });

    productsApi.getProductById.mockResolvedValue({
      product: {
        id: 'prod-123',
        name: 'Monolithic Wool Coat',
        description: 'Structured tailoring with heavy natural wool.',
        price_paise: 2490000,
        category: 'Apparel',
        available_quantity: 4,
        image_url: 'images/products/athletic-cotton-socks-6-pairs.jpg',
      },
    });
  });

  it('renders product details, low stock badge, and price', async () => {
    render(
      <MemoryRouter initialEntries={['/product/prod-123']}>
        <Routes>
          <Route path="product/:productId" element={<ProductDetailPage cart={[]} loadCart={loadCart} />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Monolithic Wool Coat' })).toBeInTheDocument();
    expect(screen.getByText('₹24900.00')).toBeInTheDocument();
    expect(screen.getByText(/only 4 left/i)).toBeInTheDocument();
    expect(screen.getByText('Structured tailoring with heavy natural wool.')).toBeInTheDocument();
  });

  it('adds selected quantity to cart', async () => {
    render(
      <MemoryRouter initialEntries={['/product/prod-123']}>
        <Routes>
          <Route path="product/:productId" element={<ProductDetailPage cart={[]} loadCart={loadCart} />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Monolithic Wool Coat' })).toBeInTheDocument();

    const user = userEvent.setup();
    const qtySelect = screen.getByLabelText(/select quantity/i);
    await user.selectOptions(qtySelect, '2');

    const addBtn = screen.getByRole('button', { name: /acquire piece/i });
    await user.click(addBtn);

    expect(cartApi.addItem).toHaveBeenCalledWith({
      productId: 'prod-123',
      quantity: 2,
    });
    expect(loadCart).toHaveBeenCalled();
  });

  it('toggles Technical Metadata Inspector revealing ImageMetadataPreview with authentic metadata', async () => {
    render(
      <MemoryRouter initialEntries={['/product/prod-123']}>
        <Routes>
          <Route path="product/:productId" element={<ProductDetailPage cart={[]} loadCart={loadCart} />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Monolithic Wool Coat' })).toBeInTheDocument();

    const user = userEvent.setup();
    const toggleBtn = screen.getByRole('button', { name: /inspect technical specifications/i });
    expect(toggleBtn).toBeInTheDocument();

    await user.click(toggleBtn);

    expect(screen.getByRole('heading', { name: /specifications & catalog metadata/i })).toBeInTheDocument();
    expect(screen.getAllByAltText('Monolithic Wool Coat')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /open metadata preview/i })).toBeInTheDocument();
  });
});
