import { it, expect, describe } from 'vitest';
import {
  adaptProduct,
  adaptCartItem,
  adaptCart,
  adaptOrderItem,
  adaptOrder,
} from './adapters.js';

describe('Adapters', () => {
  describe('adaptProduct', () => {
    it('adapts backend product DTO with snake_case fields', () => {
      const backendDto = {
        id: 'prod-123',
        name: 'Wireless Mouse',
        description: 'Ergonomic mouse',
        price_paise: 299900,
        category: 'Electronics',
        image_url: 'images/mouse.jpg',
        available_quantity: 15,
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-01T00:00:00Z',
      };

      const adapted = adaptProduct(backendDto);
      expect(adapted.id).toBe('prod-123');
      expect(adapted.name).toBe('Wireless Mouse');
      expect(adapted.pricePaise).toBe(299900);
      expect(adapted.availableQuantity).toBe(15);
      expect(adapted.imageUrl).toBe('images/mouse.jpg');
      expect(adapted.image).toBe('images/mouse.jpg');
    });

    it('handles null product gracefully', () => {
      expect(adaptProduct(null)).toBeNull();
    });
  });

  describe('adaptCartItem', () => {
    it('adapts backend cart item DTO', () => {
      const rawItem = {
        id: 'item-1',
        cart_id: 'cart-1',
        product_id: 'prod-1',
        name: 'Item 1',
        image_url: 'img.jpg',
        price_paise: 50000,
        quantity: 2,
        line_total_paise: 100000,
        available_quantity: 10,
      };

      const adapted = adaptCartItem(rawItem);
      expect(adapted.id).toBe('item-1');
      expect(adapted.productId).toBe('prod-1');
      expect(adapted.pricePaise).toBe(50000);
      expect(adapted.quantity).toBe(2);
      expect(adapted.lineTotalPaise).toBe(100000);
    });
  });

  describe('adaptCart', () => {
    it('adapts complete cart DTO', () => {
      const rawCart = {
        id: 'cart-1',
        user_id: 'user-1',
        items: [
          {
            id: 'item-1',
            product_id: 'p-1',
            price_paise: 10000,
            quantity: 2,
            line_total_paise: 20000,
          },
        ],
        subtotal_paise: 20000,
        item_count: 1,
        total_quantity: 2,
      };

      const adapted = adaptCart(rawCart);
      expect(adapted.id).toBe('cart-1');
      expect(adapted.subtotalPaise).toBe(20000);
      expect(adapted.items).toHaveLength(1);
      expect(adapted.totalQuantity).toBe(2);
    });

    it('handles null cart', () => {
      const adapted = adaptCart(null);
      expect(adapted.items).toEqual([]);
      expect(adapted.subtotalPaise).toBe(0);
    });
  });

  describe('adaptOrderItem', () => {
    it('adapts order item with unitPrice and lineTotal', () => {
      const rawItem = {
        id: 'oi-1',
        order_id: 'ord-1',
        product_id: 'p-1',
        product_name_snapshot: 'Test Snap',
        unit_price_paise: 25000,
        quantity: 2,
        line_total_paise: 50000,
      };

      const adapted = adaptOrderItem(rawItem);
      expect(adapted.id).toBe('oi-1');
      expect(adapted.productName).toBe('Test Snap');
      expect(adapted.unitPricePaise).toBe(25000);
      expect(adapted.quantity).toBe(2);
      expect(adapted.lineTotalPaise).toBe(50000);
    });

    it('handles null order item', () => {
      expect(adaptOrderItem(null)).toBeNull();
    });
  });

  describe('adaptOrder', () => {

    it('adapts OrderDTO with canonical totalPaise and items', () => {
      const rawOrder = {
        id: 'order-99',
        user_id: 'user-1',
        order_status: 'PAID',
        subtotal_paise: 50000,
        shipping_fee_paise: 10000,
        total_cost_paise: 60000,
        items: [
          {
            id: 'oi-1',
            order_id: 'order-99',
            product_id: 'p-1',
            product_name_snapshot: 'Test Product',
            unit_price_paise: 50000,
            quantity: 1,
            line_total_paise: 50000,
          },
        ],
      };

      const adapted = adaptOrder(rawOrder);
      expect(adapted.id).toBe('order-99');
      expect(adapted.status).toBe('PAID');
      expect(adapted.totalPaise).toBe(60000);
      expect(adapted.shippingFeePaise).toBe(10000);
      expect(adapted.subtotalPaise).toBe(50000);
      expect(adapted.items).toHaveLength(1);
      expect(adapted.items[0].productName).toBe('Test Product');
      expect(adapted.items[0].unitPricePaise).toBe(50000);
    });
  });
});
