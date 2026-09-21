import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { formatMoney } from '../../utils/money';
import { Icon } from '../../components/ui/Icon.jsx';
import { RollingNumber } from '../../components/ui/RollingNumber.jsx';

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
                        <Icon name="ChevronDown" size={14} className={`chevron-icon ${isMobileSummaryOpen ? 'is-open' : ''}`} aria-hidden="true" />
                        <span>{isMobileSummaryOpen ? 'Hide order summary' : 'Show order summary'}</span>
                    </span>
                    <span className="toggle-total">
                        <RollingNumber amountPaise={finalTotalPaise} />
                    </span>
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
                    <span className="summary-value">
                        <RollingNumber amountPaise={subtotalPaise} />
                    </span>
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
                    <span className="total-value">
                        <RollingNumber amountPaise={finalTotalPaise} />
                    </span>
                </div>

                <div className="summary-trust-section">
                    <div className="trust-item">
                        <Icon name="ShieldCheck" size={14} aria-hidden="true" />
                        <span>256-Bit SSL Encrypted Checkout</span>
                    </div>
                    <div className="trust-item">
                        <Icon name="Lock" size={14} aria-hidden="true" />
                        <span>Powered by Razorpay Secure</span>
                    </div>
                </div>
            </div>
        </aside>
    );
}