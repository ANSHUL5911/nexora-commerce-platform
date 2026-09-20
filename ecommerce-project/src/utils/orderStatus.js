/**
 * Centralized Order Status Presentation Mapping
 *
 * Normalizes backend order lifecycle statuses and provides deterministic
 * presentation metadata and action capabilities for the UI.
 *
 * Frozen Order Lifecycle:
 * PENDING_PAYMENT -> PAID -> PROCESSING -> SHIPPED -> DELIVERED
 * Terminal/Alternate: CANCELLED, EXPIRED, REFUNDED
 */

/**
 * @typedef {Object} OrderStatusPresentation
 * @property {string} normalizedStatus - Upper-cased, trimmed canonical status
 * @property {string} headerLabel - Header metadata text (e.g. 'PAYMENT INITIATED', 'ORDER PLACED')
 * @property {boolean} canTrack - Whether fulfillment tracking is applicable
 * @property {boolean} isPaymentPending - Whether payment is awaiting capture
 * @property {boolean} showBuyAgain - Whether "Buy Again" action is appropriate
 * @property {boolean} showTrackPackage - Whether "Track Package" action should be rendered
 * @property {boolean} showCompletePayment - Whether "Complete Payment" action should be rendered
 * @property {string|null} primaryAction - Key identifying the primary user action
 */

/**
 * Returns deterministic presentation properties for a given order status.
 *
 * @param {string|null|undefined} rawStatus
 * @returns {OrderStatusPresentation}
 */
export function getOrderStatusPresentation(rawStatus) {
  const normalizedStatus = String(rawStatus || '').trim().toUpperCase();

  switch (normalizedStatus) {
    case 'PENDING_PAYMENT':
      return {
        normalizedStatus: 'PENDING_PAYMENT',
        headerLabel: 'PAYMENT INITIATED',
        canTrack: false,
        isPaymentPending: true,
        showBuyAgain: false,
        showTrackPackage: false,
        showCompletePayment: true,
        primaryAction: 'COMPLETE_PAYMENT',
      };

    case 'PAID':
      return {
        normalizedStatus: 'PAID',
        headerLabel: 'ORDER PLACED',
        canTrack: true,
        isPaymentPending: false,
        showBuyAgain: true,
        showTrackPackage: true,
        showCompletePayment: false,
        primaryAction: 'TRACK_PACKAGE',
      };

    case 'PROCESSING':
      return {
        normalizedStatus: 'PROCESSING',
        headerLabel: 'ORDER PLACED',
        canTrack: true,
        isPaymentPending: false,
        showBuyAgain: true,
        showTrackPackage: true,
        showCompletePayment: false,
        primaryAction: 'TRACK_PACKAGE',
      };

    case 'SHIPPED':
      return {
        normalizedStatus: 'SHIPPED',
        headerLabel: 'ORDER PLACED',
        canTrack: true,
        isPaymentPending: false,
        showBuyAgain: true,
        showTrackPackage: true,
        showCompletePayment: false,
        primaryAction: 'TRACK_PACKAGE',
      };

    case 'DELIVERED':
      return {
        normalizedStatus: 'DELIVERED',
        headerLabel: 'ORDER PLACED',
        canTrack: true,
        isPaymentPending: false,
        showBuyAgain: true,
        showTrackPackage: true,
        showCompletePayment: false,
        primaryAction: 'BUY_AGAIN',
      };

    case 'CANCELLED':
      return {
        normalizedStatus: 'CANCELLED',
        headerLabel: 'ORDER CANCELLED',
        canTrack: false,
        isPaymentPending: false,
        showBuyAgain: true,
        showTrackPackage: false,
        showCompletePayment: false,
        primaryAction: 'BUY_AGAIN',
      };

    case 'EXPIRED':
      return {
        normalizedStatus: 'EXPIRED',
        headerLabel: 'ORDER EXPIRED',
        canTrack: false,
        isPaymentPending: false,
        showBuyAgain: true,
        showTrackPackage: false,
        showCompletePayment: false,
        primaryAction: 'BUY_AGAIN',
      };

    case 'REFUNDED':
      return {
        normalizedStatus: 'REFUNDED',
        headerLabel: 'ORDER REFUNDED',
        canTrack: false,
        isPaymentPending: false,
        showBuyAgain: true,
        showTrackPackage: false,
        showCompletePayment: false,
        primaryAction: 'BUY_AGAIN',
      };

    default:
      return {
        normalizedStatus: normalizedStatus || 'UNKNOWN',
        headerLabel: 'ORDER STATUS',
        canTrack: false,
        isPaymentPending: false,
        showBuyAgain: false,
        showTrackPackage: false,
        showCompletePayment: false,
        primaryAction: null,
      };
  }
}

/**
 * Determines whether an order is eligible for payment recovery.
 * Backend paymentRecovery object is the authoritative source of truth.
 * Fails closed if paymentRecovery is missing or unavailable.
 *
 * @param {object} order
 * @returns {boolean}
 */
export function isOrderPaymentRecoverable(order) {
  return order?.paymentRecovery?.available === true;
}

/**
 * Determines whether a pending order's reservation is known to be expired.
 * Backend paymentRecovery object is the authoritative source of truth.
 *
 * @param {object} order
 * @returns {boolean}
 */
export function isOrderReservationExpired(order) {
  return order?.paymentRecovery?.reason === 'RESERVATION_EXPIRED';
}

export default {
  getOrderStatusPresentation,
  isOrderPaymentRecoverable,
  isOrderReservationExpired,
};
