# PRD Review

**Target Document:** [`docs/PRD.md`](file:///c:/Users/ANSHUL%20SINGH%20JADON/Desktop/Ecommerce-project/docs/PRD.md)  
**Baseline Audit:** [`docs/CURRENT_SYSTEM_AUDIT.md`](file:///c:/Users/ANSHUL%20SINGH%20JADON/Desktop/Ecommerce-project/docs/CURRENT_SYSTEM_AUDIT.md)  
**Review Date:** September 5, 2026  
**Reviewers:** Product Engineer, Senior Full-Stack Engineer, Security Engineer, Product/UX Designer  

---

## 1. Overall Assessment

The Product Requirements Document (PRD) for the Nexora Commerce Platform establishes a strong, ambitious vision to elevate the codebase from a basic educational exercise into a portfolio-grade, production-oriented e-commerce application. The focus on interview value, security by design, and end-to-end commerce loops is commendable and well-aligned with senior engineering standards.

However, the PRD in its current form contains **critical architectural contradictions, fatal concurrency flaws in inventory/payment coupling, security vulnerabilities in guest workflows, and scope ambiguities**. While the document successfully identifies high-level non-goals, key technical mechanics—such as order state transitions, Razorpay webhook processing, database relational structures, and inventory locking—are either contradictory or underspecified.

To ensure the project remains realistically implementable, secure, and technically impressive without ballooning in scope, the PRD requires targeted revisions before technical design and implementation begin.

---

## 2. Critical Problems

### 2.1 Contradictory Order Creation and Payment Verification Lifecycle
* **Conflicting Requirements:**
  * Section 9.3 (`F-027`): *"System shall create order ONLY AFTER payment success (MUST HAVE)"*.
  * Section 7.5 & Section 9.4 (`P-010`): *"Order Created with 'Payment Pending' Status... System shall preserve order with Payment Pending status"*.
  * Section 9.4 (`P-009` / `P-046`): *"System shall allow retry payment for failed attempts"*.
* **Impact:** If an order is only created *after* payment succeeds, a payment failure cannot produce a "Payment Pending" order, nor can a user retry payment against an existing `orderId`. Conversely, if the order is created before payment, `F-027` is violated.
* **Resolution Required:** Define a unified order lifecycle. Orders should be created in a `PENDING_PAYMENT` state when the checkout session initiates (server-side Razorpay order generation), transition to `PAID` / `PROCESSING` via verified webhooks/signatures, and transition to `CANCELLED` upon payment failure or 15-minute expiration.

### 2.2 Inventory Deduction Race Condition & Denial-of-Inventory (DoS) Flaw
* **Conflicting Requirements:**
  * Section 9.3 (`F-029`): *"System shall deduct inventory atomically on order creation"*.
  * Section 10.2: *"Inventory must be validated and deducted atomically during order creation to prevent race conditions and overselling"*.
* **Impact:**
  * If inventory is deducted when the initial `PENDING_PAYMENT` order is generated (before payment completion), a malicious user could initiate 100 checkout sessions without paying, locking up all inventory and causing a **Denial of Inventory** for real buyers.
  * If inventory is deducted *only after* payment verification (as implied by `F-027`), two buyers could simultaneously complete Razorpay payments for the last remaining stock item, resulting in a paid order for out-of-stock inventory.
* **Resolution Required:** Implement a temporary **Inventory Hold / Reservation mechanism with a Time-To-Live (TTL)** (e.g., 10–15 minutes). Hard stock deduction occurs upon payment verification; if the TTL expires without payment confirmation, reserved stock is automatically released back to the available pool.

### 2.3 Guest Checkout Authentication & Data Isolation Conflict
* **Conflicting Requirements:**
  * Section 11.6 (`S-005` / `A-026`): *"All API routes must verify authentication. API shall return 403 Forbidden for unauthorized access"*.
  * Section 9.3 (`F-034`) & Section 5.1: *"System shall support guest checkout without account creation"*.
* **Impact:** Enforcing strict mandatory authentication on *all* API routes breaks the guest checkout pipeline (`POST /api/checkout/guest`, `POST /api/payments/verify`, `GET /api/orders/guest/:id`).
* **Resolution Required:** Explicitly specify public vs. protected endpoints in the PRD, and define a secure session mechanism (e.g., signed guest tokens) for guest checkout interactions.

---

## 3. Missing Requirements

1. **Razorpay Asynchronous Webhooks (`POST /api/webhooks/razorpay`)**
   * *Gap:* Section 12 relies primarily on synchronous client-side callback signature verification (`P-005`).
   * *Why it's needed:* If a user completes payment via UPI or NetBanking but closes their browser before returning to the frontend, synchronous callbacks fail. Server-to-server Razorpay webhooks are mandatory to guarantee order state accuracy.
2. **Relational Data Schema Specification (`OrderItems` Table)**
   * *Gap:* The current system stores order items as a raw JSON blob (`products: JSON` in `Order.js`), which the PRD does not explicitly mandate replacing.
   * *Why it's needed:* JSON arrays in SQLite/SQL break foreign keys, relational integrity, atomic inventory joins, per-item status tracking, and database indexing. The PRD must mandate a relational `OrderItems` entity.
3. **Signed Guest Tracking Access Tokens**
   * *Gap:* Section 9.5 (`F-055`) allows guests to track orders by `orderId` + `email`, but does not specify access authorization.
   * *Why it's needed:* Querying orders by raw UUID and email without a cryptographically signed token (e.g., HMAC guest token issued at checkout) exposes customer shipping addresses and order details to IDOR / enumeration attacks.
4. **Mandatory Database Upgrade (PostgreSQL for MVP)**
   * *Gap:* Section 29.1 mentions *"Migrate to PostgreSQL early"* under technical risks, but MVP requirements do not mandate PostgreSQL over SQLite.
   * *Why it's needed:* SQLite (even with file persistence) lacks row-level locking, leading to `database locked` errors during concurrent inventory reservations. PostgreSQL must be specified as an MVP baseline requirement.
5. **Formal Order & Payment State Machine**
   * *Gap:* Order states (`Pending`, `Processing`, `Shipped`, `Delivered`, `Cancelled`) and payment states (`Pending`, `Success`, `Failed`, `Cancelled`) are listed informally in text tables without explicit valid transition rules.

---

## 4. Scope Problems

The following requirements add unnecessary implementation overhead without contributing proportional portfolio or interview value:

| Requirement ID | Feature | Problem / Scope Risk | Recommendation |
|----------------|---------|---------------------|----------------|
| `AD-021` – `AD-024` | Category CRUD UI in Admin | Over-complicates admin interface for a small catalog (~36 products). | **Remove from MVP.** Use static category tags in product model. |
| `A-015` – `A-018` | Password Reset via Email | PRD Non-Goals (Section 4) states real email delivery is out of scope. Implementing password reset with console-logged tokens creates a confusing user experience. | **Defer to Phase 3** or replace with simple admin-assisted password reset. |
| `F-062` – `F-063` | Multiple Saved Addresses per User | Managing address books (default selection, editing, deletion) adds UI complexity without demonstrating new backend patterns beyond single address storage. | **Simplify to Single Saved Address** per user profile. |
| `F-018` | Per-Item Delivery Option Selection | Allowing different shipping speeds per cart item complicates total cost calculations, tax breakdowns, and shipping timeline visualization. | **Simplify to Order-Level Delivery Option.** |
| `F-077` – `F-081` | Product Reviews & Ratings | Requires UGC submission, review verification, moderation, and aggregation logic. | **Keep in Phase 2** as currently specified; ensure no code is written in MVP. |

---

## 5. Security Problems

1. **Insecure Guest Order Access (IDOR Vulnerability)**
   * *Issue:* `F-055` allows guest tracking via Order ID and Email. If the API endpoint accepts simple GET params without token validation, attackers can iterate UUIDs or query common emails to harvest personal address data.
   * *Mitigation:* Require a cryptographically signed `guest_token` in the tracking URL generated upon order completion.
2. **Missing Webhook Raw Body Verification**
   * *Issue:* `P-005` specifies signature verification, but does not detail body parsing requirements. Standard body parsers (`express.json()`) mutate request body formatting, breaking Razorpay HMAC signature checks.
   * *Mitigation:* Explicitly require raw request body capture for `/api/webhooks/razorpay`.
3. **Password Reset Token Security Anti-Pattern**
   * *Issue:* `A-018` states password reset invalidates all existing sessions, but without real email infrastructure, tokens will be written to server logs (`stdout`). If logs are accessible in free-tier APM or hosting consoles, this creates a fake-security anti-pattern.
4. **CORS vs. Cookie Auth Ambiguity**
   * *Issue:* PRD mentions both JWT and Session cookies, alongside CORS restriction (`S-009`). If cookie-based sessions are used across separate frontend/backend domains, CSRF vulnerabilities and browser `SameSite` restrictions must be explicitly addressed.

---

## 6. UX Problems

1. **Broken Payment Failure Retry Flow**
   * *Issue:* User Journey 7.5 states that when Razorpay payment fails, the user is redirected to an "Order Details" page to retry payment.
   * *UX Defect:* Disrupting the checkout context by navigating away from the checkout modal causes drop-offs.
   * *Fix:* Payment retries should occur **in-line within the checkout flow/modal** before navigating away.
2. **Conflicting Delivery Estimates**
   * *Issue:* `F-018` allows selecting separate shipping speeds for each cart item (e.g., 3-day for Item A, 7-day for Item B).
   * *UX Defect:* Displays fragmented delivery dates on checkout summaries and tracking pages, confusing users regarding total shipping fees.
   * *Fix:* Standardize delivery option selection at the order level.
3. **Lack of Optimistic UI / Immediate Cart Feedback Specifications**
   * *Issue:* Section 17.5 specifies spinners for operations > 200ms, but doesn't define behavior during network lag when adding items to cart or updating quantities.
   * *Fix:* Mandate optimistic local cart updates with rollback on API failure.

---

## 7. AI/ML Problems

* **Verdict:** **Unnecessary and Over-Engineered for Product Scale.**
* **Analysis:**
  * Section 1.0 lists *"Meaningful AI/ML functionality"* as a headline vision item, and Section 13 details complex features including Collaborative Filtering (`13.2.1`), Vector Semantic Search (`13.2.2`), and Embedding Similarities (`13.2.4`).
  * With a catalog of only **36 products** and zero historical user traffic, collaborative filtering matrices are mathematically sparse and meaningless.
  * Adding vector embeddings (OpenAI/Pinecone/pgvector) for 36 items introduces external API costs, latency, and third-party dependencies for problem spaces easily solved by standard SQL full-text search (`tsvector` / ILIKE).
* **Recommendation:**
  * Section 13.4 correctly defers AI/ML out of MVP. However, Section 1.0 and Section 27 (Priority Matrix) must be updated to **completely remove AI/ML as a core platform requirement**.
  * Keep AI/ML strictly as an optional, standalone extension in Phase 3, avoiding any architectural coupling in the core MVP backend.

---

## 8. Engineering Concerns

1. **Requirements That Cannot Be Objectively Tested:**
   * `UX-003`: *"Brand shall feel premium and intentional"* (Subjective design opinion).
   * `UX-004`: *"Design shall NOT use generic AI aesthetics"* (Non-quantifiable).
   * `PF-011`: *"Mobile pages shall load within 3 seconds on 3G"* (Highly variable depending on network emulation runner).
   * `AC-034`: *"Screen reader compatibility shall be tested"* (Manual process unless paired with automated `axe-core` assertions).
2. **Backend Testing Strategy Missing:**
   * Section 19 lists unit, integration, and security tests, but fails to define test database lifecycle strategy (e.g., isolated test DB containers or transaction rollback per test).
3. **Database Performance & N+1 Query Risks:**
   * `CURRENT_SYSTEM_AUDIT.md` highlighted severe N+1 query patterns in `paymentSummary.js` and `orders.js`. The PRD does not explicitly mandate ORM eager loading (`include: [OrderItem, Product]`) or query budget benchmarks.

---

## 9. Recommended Changes

To transform the PRD into an bulletproof execution plan, apply the following modifications:

1. **Re-architect Order & Payment Flow:**
   * Order creation must occur when checkout is initiated, placing the order in `PENDING_PAYMENT` status with a 15-minute expiration timestamp.
   * Reserve inventory atomically upon `PENDING_PAYMENT` creation using a TTL lock.
   * Update order status to `PAID` / `PROCESSING` via server-side **Razorpay Webhook** (`POST /api/webhooks/razorpay`) or signed client verification.
   * If payment fails or times out, transition order to `CANCELLED` and release reserved stock.
2. **Mandate Relational Database Schema:**
   * Explicitly define required tables: `Users`, `Products`, `Categories`, `Carts`, `CartItems`, `Orders`, `OrderItems`, `Addresses`, `Payments`.
   * Prohibit JSON blob storage for order items (`OrderItems` must be a proper join table).
3. **Enforce PostgreSQL for MVP:**
   * Replace SQLite requirement with PostgreSQL to ensure row-level locking (`SELECT ... FOR UPDATE`) during atomic inventory reservation.
4. **Secure Guest Checkout:**
   * Implement HMAC-signed `guest_token` included in tracking links to eliminate IDOR risks on guest order endpoints.
5. **Trim MVP Scope:**
   * Remove Category Management Admin CRUD, Password Reset via Email, and Multiple Saved Addresses from MVP.
   * Simplify shipping options to Order-level delivery selection.
6. **Clarify Auth Mechanics:**
   * Select a single authentication standard (HTTP-only JWT cookies recommended for frontend/backend decoupling) and document exact token expiration and refresh handling.

---

## 10. Final Approval Status

**REQUIRES_REVISION**

*(The PRD presents an excellent overall direction, but cannot be approved for technical implementation until the order lifecycle contradictions, inventory race conditions, security gaps in guest tracking, and database schema requirements are explicitly resolved.)*
