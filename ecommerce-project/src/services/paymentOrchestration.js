import { paymentsApi } from '../api/payments.js';

/**
 * Open Razorpay Checkout modal with standardized Nexora parameters and handle client verification.
 * Does NOT manage React state; strictly coordinates gateway interaction and verification.
 *
 * @param {object} params
 * @param {object} params.paymentData - Gateway parameters (razorpayKeyId, amountPaise, razorpayOrderId, currency)
 * @param {string} params.orderId - Ecommerce order ID
 * @param {function} [params.onBeforeVerify] - Optional callback invoked before verification starts (e.g. for reconciliation UI)
 * @param {function} params.onVerified - Callback invoked on successful backend verification
 * @param {function} [params.onDismiss] - Callback invoked when user dismisses the Razorpay modal
 * @param {function} [params.onError] - Callback invoked on failure (SDK missing, gateway error, verification failure)
 */
export function openRazorpayCheckout({
  paymentData,
  orderId,
  onBeforeVerify,
  onVerified,
  onDismiss,
  onError,
}) {
  const razorpayKey = paymentData?.razorpayKeyId || paymentData?.keyId;
  const razorpayAmount = paymentData?.amountPaise ?? paymentData?.amount;
  const razorpayOrderId = paymentData?.razorpayOrderId;
  const currency = paymentData?.currency || 'INR';

  if (
    typeof window === 'undefined' ||
    !window.Razorpay ||
    !razorpayOrderId ||
    !razorpayKey
  ) {
    const error = new Error(
      'Secure payment checkout could not be loaded. Please refresh and try again.'
    );
    if (onError) onError(error);
    return;
  }

  try {
    const rzp = new window.Razorpay({
      key: razorpayKey,
      amount: razorpayAmount,
      currency,
      name: 'Nexora Commerce',
      description: `Order #${orderId.slice(0, 8)}`,
      order_id: razorpayOrderId,
      handler: async function (response) {
        try {
          if (onBeforeVerify) {
            onBeforeVerify();
          }
          const verifyResult = await paymentsApi.verifyPayment({
            orderId,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpayOrderId: response.razorpay_order_id,
            razorpaySignature: response.razorpay_signature,
          });
          if (onVerified) {
            await onVerified(verifyResult);
          }
        } catch (err) {
          if (onError) {
            onError(err);
          }
        }
      },
      modal: {
        ondismiss: function () {
          if (onDismiss) {
            onDismiss();
          }
        },
      },
    });

    rzp.open();
  } catch (err) {
    if (onError) onError(err);
  }
}

/**
 * Execute retry payment flow for an existing PENDING_PAYMENT order:
 * 1. Calls POST /api/payments/retry (authenticated session)
 * 2. Opens Razorpay Checkout modal
 * 3. Handles client-side payment completion and backend verification
 *
 * @param {object} params
 * @param {string} params.orderId - Ecommerce order ID
 * @param {function} [params.onBeforeVerify] - Optional callback before verification
 * @param {function} params.onVerified - Callback on successful verification
 * @param {function} [params.onDismiss] - Callback when modal dismissed
 * @param {function} [params.onError] - Callback on error
 */
export async function retryAndPayOrder({
  orderId,
  onBeforeVerify,
  onVerified,
  onDismiss,
  onError,
}) {
  try {
    const retryResult = await paymentsApi.retryPayment({ orderId });
    const paymentData = retryResult?.data || retryResult;

    openRazorpayCheckout({
      paymentData,
      orderId,
      onBeforeVerify,
      onVerified,
      onDismiss,
      onError,
    });
  } catch (err) {
    if (onError) {
      onError(err);
    }
  }
}

export default {
  openRazorpayCheckout,
  retryAndPayOrder,
};
