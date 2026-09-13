import { useState } from 'react';
import { formatMoney } from '../../utils/money';

export function PaymentSummary({
    cart = [],
    selectedShippingMethod = 'STANDARD',
    orderTotalPaise,
}) {
    const [isMobileSummaryOpen, setIsMobileSummaryOpen] = useState(false);

    const totalItems = cart.reduce((sum, item) => sum + (item.quantity || 0), 0);
    const subtotalPaise = cart.reduce((sum, item) => {
        const itemPrice = item.pricePaise ?? item.product?.pricePaise ?? item.product?.priceCents ?? 0;
        return sum + (itemPrice * (item.quantity || 1));
    }, 0);

    const shippingFeePaise = selectedShippingMethod === 'OVERNIGHT'
        ? 30000
        : (selectedShippingMethod === 'EXPRESS' ? 10000 : 0);

    const calculatedTotalPaise = subtotalPaise + shippingFeePaise;
    const finalTotalPaise = orderTotalPaise ?? calculatedTotalPaise;

    return (
        <aside className="payment-summary-sidebar" aria-label="Order Cost Summary">
            {/* Mobile Collapsible Summary Control */}
            <div className="mobile-summary-toggle-bar">
                <button
                    type="button"
                    className="mobile-summary-toggle-btn"
                    onClick={() => setIsMobileSummaryOpen(!isMobileSummaryOpen)}
                    aria-expanded={isMobileSummaryOpen}
                    aria-controls="mobile-summary-details"
                >
                    <span className="toggle-left">
                        <svg className={`chevron-icon ${isMobileSummaryOpen ? 'is-open' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                        <span>{isMobileSummaryOpen ? 'Hide order summary' : 'Show order summary'}</span>
                    </span>
                    <span className="toggle-total">{formatMoney(finalTotalPaise)}</span>
                </button>
            </div>

            {/* Main Summary Container (Always visible on desktop; toggleable on mobile) */}
            <div
                id="mobile-summary-details"
                className={`summary-card-body ${isMobileSummaryOpen ? 'is-mobile-open' : ''}`}
            >
                <h2 className="summary-title">Summary</h2>

                <div className="summary-row">
                    <span className="summary-label">Items ({totalItems})</span>
                    <span className="summary-value">{formatMoney(subtotalPaise)}</span>
                </div>

                <div className="summary-row">
                    <span className="summary-label">Shipping &amp; handling</span>
                    <span className="summary-value">
                        {shippingFeePaise === 0 ? 'FREE' : formatMoney(shippingFeePaise)}
                    </span>
                </div>

                <div className="summary-divider" role="separator"></div>

                <div className="summary-row total-row">
                    <span className="total-label">Order total</span>
                    <span className="total-value">{formatMoney(finalTotalPaise)}</span>
                </div>

                <div className="summary-trust-section">
                    <div className="trust-item">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                        </svg>
                        <span>256-Bit SSL Encrypted Checkout</span>
                    </div>
                    <div className="trust-item">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                        </svg>
                        <span>Powered by Razorpay Secure</span>
                    </div>
                </div>
            </div>
        </aside>
    );
}