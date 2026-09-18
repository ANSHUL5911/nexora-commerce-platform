import { it, expect, describe, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import { cartApi } from '../../api/cart';
import { Product } from './Product';

vi.mock('../../api/cart', () => ({
  cartApi: {
    addItem: vi.fn(),
    getCart: vi.fn(),
    updateItem: vi.fn(),
    removeItem: vi.fn(),
    clearCart: vi.fn(),
  },
  default: {
    addItem: vi.fn(),
    getCart: vi.fn(),
    updateItem: vi.fn(),
    removeItem: vi.fn(),
    clearCart: vi.fn(),
  },
}));

describe('Product component', () => {
  let product;
  let loadCart;

  beforeEach(() => {
    product = {
      id: 'e43638ce-6aa0-4b85-b27f-e1d07eb678c6',
      image: 'images/products/athletic-cotton-socks-6-pairs.jpg',
      name: 'Black and Gray Athletic Cotton Socks - 6 Pairs',
      rating: {
        stars: 4.5,
        count: 87,
      },
      pricePaise: 1090,
      keywords: ['socks', 'sports', 'apparel'],
    };

    loadCart = vi.fn();
    cartApi.addItem.mockResolvedValue({ success: true });
  });

  const renderWithRouter = (ui, initialEntry = '/') => {
    return render(
      <MemoryRouter initialEntries={[initialEntry]}>
        {ui}
      </MemoryRouter>
    );
  };

  it('displays the product details correctly', () => {
    renderWithRouter(<Product product={product} loadCart={loadCart} />);

    expect(
      screen.getByText('Black and Gray Athletic Cotton Socks - 6 Pairs')
    ).toBeInTheDocument();

    expect(
      screen.getByText('₹10.90')
    ).toBeInTheDocument();

    expect(
      screen.getByTestId('product-image')
    ).toHaveAttribute('src', 'images/products/athletic-cotton-socks-6-pairs.jpg');

    expect(
      screen.getByTestId('product-rating-stars-image')
    ).toHaveAttribute('src', 'images/ratings/rating-45.png');

    expect(
      screen.getByText('87')
    ).toBeInTheDocument();
  });

  it('renders product image and title as links targeting /product/:id', () => {
    renderWithRouter(<Product product={product} loadCart={loadCart} />);

    const titleLink = screen.getByRole('link', { name: 'Black and Gray Athletic Cotton Socks - 6 Pairs' });
    expect(titleLink).toHaveAttribute('href', `/product/${product.id}`);

    const image = screen.getByTestId('product-image');
    const imageLink = image.closest('a');
    expect(imageLink).toBeInTheDocument();
    expect(imageLink).toHaveAttribute('href', `/product/${product.id}`);
  });

  it('navigates to product detail page when clicking the title link', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Product product={product} loadCart={loadCart} />} />
          <Route path="/product/:productId" element={<div data-testid="pdp-target">Product Detail View</div>} />
        </Routes>
      </MemoryRouter>
    );

    const titleLink = screen.getByRole('link', { name: 'Black and Gray Athletic Cotton Socks - 6 Pairs' });
    await user.click(titleLink);

    expect(await screen.findByTestId('pdp-target')).toBeInTheDocument();
  });

  it('navigates to product detail page when clicking the image link', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Product product={product} loadCart={loadCart} />} />
          <Route path="/product/:productId" element={<div data-testid="pdp-target">Product Detail View</div>} />
        </Routes>
      </MemoryRouter>
    );

    const image = screen.getByTestId('product-image');
    await user.click(image);

    expect(await screen.findByTestId('pdp-target')).toBeInTheDocument();
  });

  it('can select a quantity without triggering navigation', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Product product={product} loadCart={loadCart} />} />
          <Route path="/product/:productId" element={<div data-testid="pdp-target">Product Detail View</div>} />
        </Routes>
      </MemoryRouter>
    );

    const quantitySelector = screen.getByTestId('quantity-selector');
    expect(quantitySelector).toHaveValue('1');

    await user.selectOptions(quantitySelector, '4');
    expect(quantitySelector).toHaveValue('4');

    expect(screen.queryByTestId('pdp-target')).not.toBeInTheDocument();
  });

  it('adds a product to the cart without triggering navigation', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Product product={product} loadCart={loadCart} />} />
          <Route path="/product/:productId" element={<div data-testid="pdp-target">Product Detail View</div>} />
        </Routes>
      </MemoryRouter>
    );

    const addToCartButton = screen.getByTestId('add-to-cart-button');
    await user.click(addToCartButton);

    expect(cartApi.addItem).toHaveBeenCalledWith({
      productId: 'e43638ce-6aa0-4b85-b27f-e1d07eb678c6',
      quantity: 1,
    });
    expect(loadCart).toHaveBeenCalled();

    // Verify Add to Cart does NOT navigate to PDP
    expect(screen.queryByTestId('pdp-target')).not.toBeInTheDocument();
  });
});