/**
 * Order Status Lifecycle Constants
 */
export const ORDER_STATUS = Object.freeze({
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  PAID: 'PAID',
  PROCESSING: 'PROCESSING',
  SHIPPED: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
  REFUNDED: 'REFUNDED',
});

export const VALID_ORDER_STATUSES = Object.freeze(Object.values(ORDER_STATUS));

/**
 * Explicit Order State Machine Transitions
 */
export const ALLOWED_STATUS_TRANSITIONS = Object.freeze({
  [ORDER_STATUS.PENDING_PAYMENT]: Object.freeze([
    ORDER_STATUS.PAID,
    ORDER_STATUS.CANCELLED,
    ORDER_STATUS.EXPIRED,
  ]),
  [ORDER_STATUS.PAID]: Object.freeze([
    ORDER_STATUS.PROCESSING,
    ORDER_STATUS.REFUNDED,
  ]),
  [ORDER_STATUS.PROCESSING]: Object.freeze([
    ORDER_STATUS.SHIPPED,
    ORDER_STATUS.REFUNDED,
  ]),
  [ORDER_STATUS.SHIPPED]: Object.freeze([
    ORDER_STATUS.DELIVERED,
  ]),
  [ORDER_STATUS.DELIVERED]: Object.freeze([]),
  [ORDER_STATUS.CANCELLED]: Object.freeze([]),
  [ORDER_STATUS.EXPIRED]: Object.freeze([]),
  [ORDER_STATUS.REFUNDED]: Object.freeze([]),
});

/**
 * Frozen Shipping Method Allowlist & Server-Authoritative Fees in INR Paise
 */
export const SHIPPING_METHODS = Object.freeze({
  STANDARD: 'STANDARD',
  EXPRESS: 'EXPRESS',
  OVERNIGHT: 'OVERNIGHT',
});

export const SHIPPING_FEES_PAISE = Object.freeze({
  [SHIPPING_METHODS.STANDARD]: 0,
  [SHIPPING_METHODS.EXPRESS]: 10000,   // ₹100.00
  [SHIPPING_METHODS.OVERNIGHT]: 30000, // ₹300.00
});

export default {
  ORDER_STATUS,
  VALID_ORDER_STATUSES,
  ALLOWED_STATUS_TRANSITIONS,
  SHIPPING_METHODS,
  SHIPPING_FEES_PAISE,
};
