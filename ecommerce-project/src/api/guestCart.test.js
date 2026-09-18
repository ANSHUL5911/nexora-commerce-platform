import { it, expect, describe, beforeEach, vi } from 'vitest';
import {
  GUEST_CART_STORAGE_KEY,
  getGuestCart,
  addGuestCartItem,
  updateGuestCartItem,
  removeGuestCartItem,
  clearGuestCart,
  getGuestCartCount,
  cacheProductMetadata,
  hydrateGuestCartItems,
} from './guestCart.js';

describe('guestCart Storage Layer', () => {
  const prodA = 'd0000000-0000-4000-8000-000000000001';
  const prodB = 'd0000000-0000-4000-8000-000000000002';

  beforeEach(() => {
    localStorage.clear();
  });

  it('starts with an empty guest cart', () => {
    expect(getGuestCart()).toEqual([]);
    expect(getGuestCartCount()).toBe(0);
  });

  it('adds item with quantity 1', () => {
    addGuestCartItem(prodA, 1);
    const cart = getGuestCart();
    expect(cart).toEqual([{ productId: prodA, quantity: 1 }]);
    expect(getGuestCartCount()).toBe(1);
  });

  it('adds item with quantity 3 when availability allows', () => {
    addGuestCartItem(prodA, 3, 5);
    const cart = getGuestCart();
    expect(cart).toEqual([{ productId: prodA, quantity: 3 }]);
    expect(getGuestCartCount()).toBe(3);
  });

  it('increments existing item quantity without creating duplicate entries', () => {
    addGuestCartItem(prodA, 2);
    addGuestCartItem(prodA, 3);
    const cart = getGuestCart();
    expect(cart).toHaveLength(1);
    expect(cart[0]).toEqual({ productId: prodA, quantity: 5 });
    expect(getGuestCartCount()).toBe(5);
  });

  it('caps quantity at 10 maximum', () => {
    addGuestCartItem(prodA, 8);
    addGuestCartItem(prodA, 5); // 8 + 5 = 13 -> capped at 10
    const cart = getGuestCart();
    expect(cart[0].quantity).toBe(10);
  });

  it('caps quantity at maxAvailable if specified', () => {
    addGuestCartItem(prodA, 2, 2);
    addGuestCartItem(prodA, 2, 2);
    const cart = getGuestCart();
    expect(cart[0].quantity).toBe(2);
  });

  it('rejects invalid product IDs and non-positive quantities', () => {
    expect(() => addGuestCartItem('not-a-uuid', 1)).toThrow('Invalid product ID format.');
    expect(() => addGuestCartItem(prodA, 0)).toThrow('Quantity must be at least 1.');
    expect(() => addGuestCartItem(prodA, -2)).toThrow('Quantity must be at least 1.');
  });

  it('updates quantity of an existing item', () => {
    addGuestCartItem(prodA, 2);
    updateGuestCartItem(prodA, 4);
    const cart = getGuestCart();
    expect(cart[0].quantity).toBe(4);
  });

  it('removes a specific item from the guest cart', () => {
    addGuestCartItem(prodA, 1);
    addGuestCartItem(prodB, 2);
    expect(getGuestCartCount()).toBe(3);

    removeGuestCartItem(prodA);
    const cart = getGuestCart();
    expect(cart).toEqual([{ productId: prodB, quantity: 2 }]);
    expect(getGuestCartCount()).toBe(2);
  });

  it('clears the entire guest cart', () => {
    addGuestCartItem(prodA, 2);
    addGuestCartItem(prodB, 3);
    clearGuestCart();
    expect(getGuestCart()).toEqual([]);
    expect(getGuestCartCount()).toBe(0);
  });

  it('handles corrupted or non-JSON localStorage safely without throwing', () => {
    localStorage.setItem(GUEST_CART_STORAGE_KEY, '{"corrupted": true}');
    expect(getGuestCart()).toEqual([]);

    localStorage.setItem(GUEST_CART_STORAGE_KEY, 'invalid json {{{');
    expect(getGuestCart()).toEqual([]);
    expect(getGuestCartCount()).toBe(0);
  });

  it('hydrates guest cart items using in-memory cache without N+1 fetch waterfalls', async () => {
    cacheProductMetadata({
      id: prodA,
      name: 'Monolith Architectural Coat',
      pricePaise: 1899900,
      image: 'images/coat.jpg',
      availableQuantity: 1,
    });

    addGuestCartItem(prodA, 1);
    const mockFetcher = vi.fn();

    const hydrated = await hydrateGuestCartItems(getGuestCart(), mockFetcher);
    expect(hydrated).toHaveLength(1);
    expect(hydrated[0]).toMatchObject({
      productId: prodA,
      name: 'Monolith Architectural Coat',
      pricePaise: 1899900,
      quantity: 1,
      lineTotalPaise: 1899900,
      availableQuantity: 1,
    });
    // Cached in memory, so no network fetch was needed!
    expect(mockFetcher).not.toHaveBeenCalled();
  });
});
