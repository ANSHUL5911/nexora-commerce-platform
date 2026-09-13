# Nexora Design System — Checkout Page Specification
# Version 1.0 (Phase 07.15 Checkout UX)

## 1. Page Role & North Star
The checkout page (`/checkout`) is a calm, distraction-free transactional environment. It guides the customer through a predictable 4-step linear progression: Delivery Address → Shipping Method → Order Review & Stock Lock → Secure Payment.

---

## 2. Layout & Responsive Grid
- **Desktop (≥ 1024px)**:
  - Container width: `max-width: 1040px`, centered with `padding: 0 24px`.
  - Two-column split: Left transaction column (60%, min 540px), Right sticky order summary (40%, max 380px).
  - Column gap: `32px`.
- **Tablet (768px – 1023px)**:
  - Container width: `100%`, `padding: 0 20px`.
  - Two-column split with stacked summary when width constrains.
- **Mobile (< 768px, 390px, 430px)**:
  - Single-column flow.
  - Collapsible non-intrusive summary bar `[View summary · ₹X,XXX]` at top.
  - Minimum touch target: `44px × 44px`.
  - Zero horizontal overflow.

---

## 3. Linear Stepper Information Architecture

### Stage 1: Delivery Address
- Persistent labels above inputs (`font-size: 13px`, `font-weight: 500`, `color: #121212`).
- Inputs: `padding: 10px 12px`, `border: 1px solid #D1D0CB`, `border-radius: 4px`, `font-size: 15px`.
- Focus state: `outline: 2px solid #121212`, `outline-offset: 1px`.
- Error state: `border-color: #9E1C1C`, inline error text in `#9E1C1C` with `role="alert"` and `id` associated via `aria-describedby`.
- Collapsed state: Shows recipient name, street address, city/state/PIN, phone number, with a subtle text button `[ Edit ]` on the right.

### Stage 2: Shipping Method
- Clean selectable radio options for `STANDARD` (FREE), `EXPRESS` (₹100), `OVERNIGHT` (₹300).
- Selected card: `border-color: #121212`, subtle `#F9F9F8` background tint.
- Display-only estimated delivery dates calculated via `dayjs` (clearly marked as non-authoritative estimates).
- Collapsed state: Shows selected method name and fee with `[ Edit ]` button.

### Stage 3: Order Review & Reservation Lock
- Product line items: 1:1 or 3:4 thumbnail (`80px × 80px`, `object-fit: cover`, `border-radius: 2px`), title (`font-weight: 500`), unit price (`formatMoney`), quantity adjustment controls.
- **Authoritative Stock Lock**: Displays presentation countdown strictly from backend `expires_at`.
- Monetary breakdown:
  - Subtotal (`formatMoney(subtotalPaise)`)
  - Shipping Fee (`formatMoney(shippingFeePaise)`)
  - Total (`formatMoney(totalPaise)`)
  - *No tax calculations or line items*.

### Stage 4: Authoritative Razorpay Payment
- **Presentation State Machine**:
  - `READY_FOR_PAYMENT`: Primary CTA `Pay ₹X,XXX via Razorpay`.
  - `PAYMENT_PROCESSING`: Disabled CTA with inline spinner ("Initializing secure session...").
  - `PAYMENT_RECONCILIATION_PENDING`: "Confirming payment with banking network...".
  - `PAYMENT_SUCCESS`: Navigates to confirmed order route with in-memory `guestToken`.
  - `PAYMENT_FAILED`: Non-sensitive error notice with clear recovery path.
  - `PAYMENT_RETRY_AVAILABLE`: Primary CTA `Retry Payment` against the **same ecommerce Order** (`paymentsApi.retryPayment`).
  - `EXPIRED_RESERVATION`: Notice that the 15-minute stock lock has elapsed, with action to review cart stock.

---

## 4. Accessibility Rules
- WCAG 2.1 AA compliance across all components.
- Contrast ratio: minimum `4.5:1` for body text, `7:1` for headings.
- Keyboard navigation: Full Tab / Shift-Tab and Enter / Space selection.
- Screen readers: Status transitions announced via `aria-live="polite"`.
- `prefers-reduced-motion`: Disables non-essential CSS transitions.
