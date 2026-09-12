import { AppError } from '../../utils/errors.js';

export class OrderNotFoundError extends AppError {
  constructor(message = 'Order was not found.', details = null) {
    super(message, 404, 'ORDER_NOT_FOUND', details);
  }
}

export class EmptyCartError extends AppError {
  constructor(message = 'Shopping cart is empty. Cannot create an order.', details = null) {
    super(message, 400, 'EMPTY_CART', details);
  }
}

export class InvalidOrderStateError extends AppError {
  constructor(message = 'Invalid order status transition.', details = null) {
    super(message, 422, 'INVALID_STATE_TRANSITION', details);
  }
}

export class InvalidShippingMethodError extends AppError {
  constructor(message = 'Invalid shipping method specified.', details = null) {
    super(message, 400, 'INVALID_SHIPPING_METHOD', details);
  }
}

export class ProductUnavailableError extends AppError {
  constructor(message = 'One or more products in your cart are no longer available.', details = null) {
    super(message, 404, 'PRODUCT_UNAVAILABLE', details);
  }
}

export class OrderCreationError extends AppError {
  constructor(message = 'Failed to create order.', details = null) {
    super(message, 500, 'ORDER_CREATION_FAILED', details);
  }
}

export default {
  OrderNotFoundError,
  EmptyCartError,
  InvalidOrderStateError,
  InvalidShippingMethodError,
  ProductUnavailableError,
  OrderCreationError,
};
