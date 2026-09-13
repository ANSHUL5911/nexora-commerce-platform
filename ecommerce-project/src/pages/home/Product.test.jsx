import { it, expect, describe, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('displays the product details correctly', () => {
    render(<Product product={product} loadCart={loadCart} />);

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

  it('adds a product to the cart', async () => {
    render(<Product product={product} loadCart={loadCart} />);

    const user = userEvent.setup();
    const addToCartButton = screen.getByTestId('add-to-cart-button');
    await user.click(addToCartButton);

    expect(cartApi.addItem).toHaveBeenCalledWith({
      productId: 'e43638ce-6aa0-4b85-b27f-e1d07eb678c6',
      quantity: 1,
    });
    expect(loadCart).toHaveBeenCalled();
  });

  it('can select a quantity', () => {
    render(<Product product={product} loadCart={loadCart} />);

    const quantitySelector = screen.getByTestId('quantity-selector');

    expect(quantitySelector).toHaveValue('1');
  });
});