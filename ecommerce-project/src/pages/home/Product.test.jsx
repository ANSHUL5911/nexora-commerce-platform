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
    vi.clearAllMocks();
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

  describe('Inventory-aware quantity selection and error rendering', () => {
    it('limits selectable quantities to 1 when available_quantity is 1', () => {
      renderWithRouter(
        <Product product={{ ...product, available_quantity: 1 }} loadCart={loadCart} />
      );

      const options = screen.getAllByRole('option');
      expect(options.map((o) => o.value)).toEqual(['1']);
    });

    it('limits selectable quantities to 1, 2, 3 when available_quantity is 3', () => {
      renderWithRouter(
        <Product product={{ ...product, available_quantity: 3 }} loadCart={loadCart} />
      );

      const options = screen.getAllByRole('option');
      expect(options.map((o) => o.value)).toEqual(['1', '2', '3']);
    });

    it('allows quantities 1 to 10 when available_quantity is 10', () => {
      renderWithRouter(
        <Product product={{ ...product, available_quantity: 10 }} loadCart={loadCart} />
      );

      const options = screen.getAllByRole('option');
      expect(options.map((o) => o.value)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    });

    it('caps selectable quantity at 10 when available_quantity exceeds 10', () => {
      renderWithRouter(
        <Product product={{ ...product, available_quantity: 25 }} loadCart={loadCart} />
      );

      const options = screen.getAllByRole('option');
      expect(options.map((o) => o.value)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    });

    it('preserves quantity as a number and sends the selected numeric quantity on Add to Cart', async () => {
      const user = userEvent.setup();
      renderWithRouter(
        <Product product={{ ...product, available_quantity: 5 }} loadCart={loadCart} />
      );

      const selector = screen.getByTestId('quantity-selector');
      await user.selectOptions(selector, '3');
      expect(selector).toHaveValue('3');

      const addButton = screen.getByTestId('add-to-cart-button');
      await user.click(addButton);

      expect(cartApi.addItem).toHaveBeenCalledWith({
        productId: product.id,
        quantity: 3,
      });
      const callArg = cartApi.addItem.mock.calls[0][0];
      expect(typeof callArg.quantity).toBe('number');
    });

    it('does not submit cart request when available_quantity is 0 (out of stock)', async () => {
      const user = userEvent.setup();
      renderWithRouter(
        <Product product={{ ...product, available_quantity: 0 }} loadCart={loadCart} />
      );

      const addButton = screen.getByTestId('add-to-cart-button');
      expect(addButton).toBeDisabled();
      expect(addButton).toHaveTextContent('Out of Stock');

      const selector = screen.getByTestId('quantity-selector');
      expect(selector).toBeDisabled();

      await user.click(addButton);
      expect(cartApi.addItem).not.toHaveBeenCalled();
    });

    it('preserves existing default behavior without inventing stock when availability is missing/undefined', () => {
      renderWithRouter(
        <Product product={{ ...product, available_quantity: undefined }} loadCart={loadCart} />
      );

      const options = screen.getAllByRole('option');
      expect(options.map((o) => o.value)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    });

    it('displays the clean backend error message on INSUFFICIENT_STOCK failure and never renders [object Object]', async () => {
      const user = userEvent.setup();
      const stockError = new Error('Requested quantity exceeds available stock.');
      cartApi.addItem.mockRejectedValueOnce(stockError);

      renderWithRouter(
        <Product product={{ ...product, available_quantity: 5 }} loadCart={loadCart} />
      );

      const addButton = screen.getByTestId('add-to-cart-button');
      await user.click(addButton);

      const renderedError = await screen.findByRole('alert');
      expect(renderedError).toBeInTheDocument();
      expect(renderedError).toHaveTextContent('Requested quantity exceeds available stock.');
      expect(renderedError.textContent).not.toContain('[object Object]');
    });

    it('adds product to local guest cart without calling cartApi.addItem when currentUser is null', async () => {
      const user = userEvent.setup();
      renderWithRouter(
        <Product product={{ ...product, available_quantity: 5 }} loadCart={loadCart} currentUser={null} />
      );

      const selector = screen.getByTestId('quantity-selector');
      await user.selectOptions(selector, '3');

      const addButton = screen.getByTestId('add-to-cart-button');
      await user.click(addButton);

      // Must NOT call authenticated server cart API
      expect(cartApi.addItem).not.toHaveBeenCalled();
      // Must call loadCart() to refresh application state
      expect(loadCart).toHaveBeenCalled();
      // Must show success notice
      expect(await screen.findByText('✓ Added to Cart')).toBeInTheDocument();

      // Must be present in localStorage nexora_guest_cart
      const stored = JSON.parse(localStorage.getItem('nexora_guest_cart'));
      expect(stored).toEqual([{ productId: product.id, quantity: 3 }]);
    });
  });
});

