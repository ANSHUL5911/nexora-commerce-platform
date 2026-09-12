import { AppError } from '../../utils/errors.js';

export class OrderNotRefundableError extends AppError {
  constructor(message = 'Order is not eligible for refund.', details = null) {
    super(message, 422, 'ORDER_NOT_REFUNDABLE', details);
  }
}

export class AlreadyRefundedError extends AppError {
  constructor(message = 'Order or payment attempt has already been refunded.', details = null) {
    super(message, 409, 'ALREADY_REFUNDED', details);
  }
}

export class NoSettledPaymentError extends AppError {
  constructor(message = 'No settled payment attempt found for this order to refund.', details = null) {
    super(message, 422, 'NO_SETTLED_PAYMENT', details);
  }
}

export class OrderNotRestockableError extends AppError {
  constructor(message = 'Order is not eligible for restocking. Only refunded orders can be restocked.', details = null) {
    super(message, 422, 'ORDER_NOT_RESTOCKABLE', details);
  }
}

export class RestockQuantityExceededError extends AppError {
  constructor(message = 'Restock quantity exceeds remaining eligible quantity for this order.', details = null) {
    super(message, 422, 'RESTOCK_QUANTITY_EXCEEDED', details);
  }
}

export class RestockNotAllowedError extends AppError {
  constructor(message = 'Restock operation is not permitted for the specified items.', details = null) {
    super(message, 400, 'RESTOCK_NOT_ALLOWED', details);
  }
}

export default {
  OrderNotRefundableError,
  AlreadyRefundedError,
  NoSettledPaymentError,
  OrderNotRestockableError,
  RestockQuantityExceededError,
  RestockNotAllowedError,
};
