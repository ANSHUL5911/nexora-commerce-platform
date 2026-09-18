/**
 * Guest Cart Storage Layer (Phase 07.15 / Local QA Fix)
 * Manages unauthenticated client-side cart items in localStorage under 'nexora_guest_cart'.
 *
 * Invariants:
 * - Storage stores minimal untrusted { productId, quantity } records only.
 * - Zero storage of sensitive tokens, session IDs, passwords, or payment info.
 * - In-memory product metadata cache eliminates frontend N+1 request waterfalls.
 * - Final authority on price, active status, and inventory remains with the backend.
 */

export const GUEST_CART_STORAGE_KEY = 'nexora_guest_cart';

// In-memory catalog/product metadata cache to prevent N+1 GET requests
const productMetadataCache = new Map();

/**
 * Cache product display metadata in memory.
 * @param {object} product - Product view model or DTO
 */
export function cacheProductMetadata(product) {
  if (!product || !product.id) return;
  productMetadataCache.set(product.id, {
    id: product.id,
    name: product.name ?? '',
    image: product.image ?? product.imageUrl ?? product.image_url ?? '',
    imageUrl: product.imageUrl ?? product.image_url ?? product.image ?? '',
    pricePaise: Number(product.pricePaise ?? product.price_paise ?? product.priceCents ?? 0),
    availableQuantity: product.availableQuantity ?? product.available_quantity,
  });
}

/**
 * Bulk cache products from catalog responses.
 * @param {Array<object>} products
 */
export function bulkCacheProductMetadata(products) {
  if (!Array.isArray(products)) return;
  products.forEach(cacheProductMetadata);
}

/**
 * Get cached product metadata by ID.
 * @param {string} productId
 * @returns {object|null}
 */
export function getCachedProductMetadata(productId) {
  return productMetadataCache.get(productId) || null;
}

/**
 * Validate UUID string format.
 * @param {string} id
 * @returns {boolean}
 */
export function isValidProductId(id) {
  if (typeof id !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id.trim());
}

/**
 * Retrieve raw guest cart items safely from localStorage.
 * Sanitizes and discards malformed or corrupt entries.
 *
 * @returns {Array<{ productId: string, quantity: number }>}
 */
export function getGuestCart() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(GUEST_CART_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      window.localStorage.removeItem(GUEST_CART_STORAGE_KEY);
      return [];
    }

    // Sanitize items: discard corrupted records
    return parsed
      .filter((item) => item && typeof item === 'object' && isValidProductId(item.productId))
      .map((item) => {
        const qty = parseInt(item.quantity, 10);
        return {
          productId: item.productId,
          quantity: isNaN(qty) || qty < 1 ? 1 : Math.min(10, qty),
        };
      });
  } catch {
    // Malformed JSON: reset corrupted storage safely
    try {
      window.localStorage.removeItem(GUEST_CART_STORAGE_KEY);
    } catch {
      // Ignore storage access errors
    }
    return [];
  }
}

/**
 * Save raw guest cart items safely to localStorage.
 *
 * @param {Array<{ productId: string, quantity: number }>} items
 */
function saveGuestCart(items) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(GUEST_CART_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Ignore quota/access errors gracefully
  }
}

/**
 * Add or increment quantity of a product in the guest cart.
 *
 * @param {string} productId - Valid UUID
 * @param {number} quantity - Integer quantity >= 1
 * @param {number} [maxAvailable] - Optional client availability boundary
 * @param {object} [productMetadata] - Optional product view-model to cache
 * @returns {{ success: boolean, cart: Array<{ productId: string, quantity: number }> }}
 */
export function addGuestCartItem(productId, quantity = 1, maxAvailable, productMetadata) {
  if (!isValidProductId(productId)) {
    throw new Error('Invalid product ID format.');
  }

  const intQty = Math.floor(Number(quantity));
  if (isNaN(intQty) || intQty < 1) {
    throw new Error('Quantity must be at least 1.');
  }

  if (productMetadata) {
    cacheProductMetadata(productMetadata);
  }

  const currentCart = getGuestCart();
  const existingIndex = currentCart.findIndex((i) => i.productId === productId);

  const upperLimit = maxAvailable !== undefined && maxAvailable !== null
    ? Math.min(10, Math.max(1, maxAvailable))
    : 10;

  if (existingIndex >= 0) {
    const targetQty = currentCart[existingIndex].quantity + intQty;
    currentCart[existingIndex].quantity = Math.min(upperLimit, targetQty);
  } else {
    currentCart.push({
      productId,
      quantity: Math.min(upperLimit, intQty),
    });
  }

  saveGuestCart(currentCart);
  return { success: true, cart: currentCart };
}

/**
 * Update the quantity of an existing item in the guest cart.
 *
 * @param {string} productId
 * @param {number} quantity
 * @param {number} [maxAvailable]
 * @returns {Array<{ productId: string, quantity: number }>}
 */
export function updateGuestCartItem(productId, quantity, maxAvailable) {
  if (!isValidProductId(productId)) return getGuestCart();

  const intQty = Math.floor(Number(quantity));
  if (isNaN(intQty) || intQty < 1) return getGuestCart();

  const upperLimit = maxAvailable !== undefined && maxAvailable !== null
    ? Math.min(10, Math.max(1, maxAvailable))
    : 10;

  const currentCart = getGuestCart();
  const index = currentCart.findIndex((i) => i.productId === productId);

  if (index >= 0) {
    currentCart[index].quantity = Math.min(upperLimit, intQty);
    saveGuestCart(currentCart);
  }

  return currentCart;
}

/**
 * Remove an item completely from the guest cart.
 *
 * @param {string} productId
 * @returns {Array<{ productId: string, quantity: number }>}
 */
export function removeGuestCartItem(productId) {
  const currentCart = getGuestCart().filter((i) => i.productId !== productId);
  saveGuestCart(currentCart);
  return currentCart;
}

/**
 * Clear the entire guest cart from localStorage.
 */
export function clearGuestCart() {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem(GUEST_CART_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Calculate the total item count across all guest cart items.
 *
 * @returns {number}
 */
export function getGuestCartCount() {
  const items = getGuestCart();
  return items.reduce((sum, item) => sum + (item.quantity || 0), 0);
}

/**
 * Enrich raw guest cart items into component-ready cart item view-models.
 * Uses in-memory cache to prevent N+1 waterfalls.
 *
 * @param {Array<{ productId: string, quantity: number }>} guestItems
 * @param {Function} [fetchProductById] - Fallback fetch function for uncached items
 * @returns {Promise<Array<object>>}
 */
export async function hydrateGuestCartItems(guestItems = getGuestCart(), fetchProductById) {
  const result = [];

  for (const item of guestItems) {
    let meta = getCachedProductMetadata(item.productId);

    if (!meta && typeof fetchProductById === 'function') {
      try {
        const res = await fetchProductById(item.productId);
        const raw = res?.product || res;
        if (raw) {
          cacheProductMetadata(raw);
          meta = getCachedProductMetadata(item.productId);
        }
      } catch {
        // Fallback for missing/network failure
      }
    }

    const unitPrice = Number(meta?.pricePaise ?? 0);
    const qty = Number(item.quantity || 1);

    result.push({
      id: item.productId,
      cartId: 'guest-cart',
      productId: item.productId,
      name: meta?.name || 'Product',
      image: meta?.image || meta?.imageUrl || 'images/products/athletic-cotton-socks-6-pairs.jpg',
      imageUrl: meta?.imageUrl || meta?.image || 'images/products/athletic-cotton-socks-6-pairs.jpg',
      pricePaise: unitPrice,
      quantity: qty,
      lineTotalPaise: unitPrice * qty,
      availableQuantity: meta?.availableQuantity,
    });
  }

  return result;
}

export default {
  GUEST_CART_STORAGE_KEY,
  cacheProductMetadata,
  bulkCacheProductMetadata,
  getCachedProductMetadata,
  isValidProductId,
  getGuestCart,
  addGuestCartItem,
  updateGuestCartItem,
  removeGuestCartItem,
  clearGuestCart,
  getGuestCartCount,
  hydrateGuestCartItems,
};
