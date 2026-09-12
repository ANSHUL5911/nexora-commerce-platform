import { AppError } from '../../utils/errors.js';

export class PaymentAttemptNotFoundError extends AppError {
  constructor(message = 'Payment attempt was not found.', details = null) {
    super(message, 404, 'PAYMENT_ATTEMPT_NOT_FOUND', details);
  }
}

export class OrderNotPayableError extends AppError {
  constructor(message = 'Order is not in a payable state.', details = null) {
    super(message, 409, 'ORDER_NOT_PAYABLE', details);
  }
}

export class PaymentVerificationError extends AppError {
  constructor(message = 'Payment verification failed.', details = null) {
    super(message, 400, 'PAYMENT_VERIFICATION_FAILED', details);
  }
}

export class InvalidPaymentSignatureError extends AppError {
  constructor(message = 'Invalid payment signature.', details = null) {
    super(message, 400, 'INVALID_PAYMENT_SIGNATURE', details);
  }
}

export class RazorpayGatewayError extends AppError {
  constructor(message = 'Payment gateway communication error.', details = null) {
    super(message, 502, 'GATEWAY_ERROR', details);
  }
}

export class PaymentConflictError extends AppError {
  constructor(message = 'Payment attempt conflict.', details = null) {
    super(message, 409, 'PAYMENT_CONFLICT', details);
  }
}

export default {
  PaymentAttemptNotFoundError,
  OrderNotPayableError,
  PaymentVerificationError,
  InvalidPaymentSignatureError,
  RazorpayGatewayError,
  PaymentConflictError,
};
