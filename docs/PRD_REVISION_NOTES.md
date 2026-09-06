# PRD Revision Notes — Version 2.0

**Document:** [`docs/PRD.md`](file:///c:/Users/ANSHUL%20SINGH%20JADON/Desktop/Ecommerce-project/docs/PRD.md)  
**Date:** September 5, 2026  
**Author:** Principal Product Engineer + Senior Full-Stack Engineer + Security Engineer + Product/UX Architect  
**Baseline Review:** [`docs/PRD_REVIEW.md`](file:///c:/Users/ANSHUL%20SINGH%20JADON/Desktop/Ecommerce-project/docs/PRD_REVIEW.md)  

---

## 1. Critical Issues Fixed

1. **Order & Payment Lifecycle Contradiction Resolved:**
   * *Previous Defect:* PRD v1.0 required orders to be created only after payment success (`F-027`), but also required preserving orders in `Payment Pending` status (`P-010`) and allowing payment retries (`P-009`).
   * *Fix:* Defined an explicit order lifecycle: Checkouts initiate an order in `PENDING_PAYMENT` state with a 15-minute reservation TTL. Verified Razorpay payment webhooks or server signature checks transition the order to `PAID`. Payment failure or timeout transitions the order to `CANCELLED` or `EXPIRED`.
2. **Inventory Concurrency & Overselling Risk:**
   * *Previous Defect:* Inventory deduction timing was ambiguous, creating risks of overselling or inventory locking DoS attacks.
   * *Fix:* Added an explicit transactional **Inventory Reservation System** with a 15-minute Time-To-Live (TTL). Stock availability is checked and reserved using PostgreSQL row-level locks (`SELECT ... FOR UPDATE`).
3. **Relational Database Schema Mandate:**
   * *Previous Defect:* Products inside orders were represented as raw JSON blobs in the database.
   * *Fix:* Explicitly defined relational PostgreSQL schemas: `Users`, `Products`, `Categories`, `Carts`, `CartItems`, `Addresses`, `Orders`, `OrderItems`, `Payments`, `PaymentEvents` / `AuditLogs`.

---

## 2. Security Issues Fixed

1. **Guest Order Tracking IDOR Vulnerability:**
   * *Previous Defect:* Guest tracking relied solely on order ID and email, exposing order history to enumeration attacks.
   * *Fix:* Introduced cryptographically signed `guest_access_token` values. Tokens are hashed (SHA-256) on the backend; guests access order tracking using the raw token in the `X-Guest-Token` header.
2. **Razorpay Webhook Verification:**
   * *Previous Defect:* Relied exclusively on synchronous client-side payment callbacks.
   * *Fix:* Added a formal webhook requirement `POST /api/webhooks/razorpay` with raw body capture for HMAC-SHA256 signature verification (`X-Razorpay-Signature`) and idempotent event handling (`event_id`).
3. **Standardized Authentication Architecture:**
   * *Previous Defect:* Ambiguity between JWT, session cookies, and bearer tokens.
   * *Fix:* Standardized on `HttpOnly`, `Secure`, `SameSite=Lax` cookies containing encrypted session tokens with 15-minute access token lifetimes and 7-day refresh tokens.
4. **Card Data Security Policy:**
   * *Fix:* Mandated zero collection, storage, processing, or logging of raw card numbers, CVVs, or payment credentials.

---

## 3. Architecture Contradictions Resolved

1. **API Endpoint Authorization Matrix:**
   * *Resolution:* Explicitly categorized all API routes into `PUBLIC`, `AUTHENTICATED`, `PUBLIC (GUEST)`, `ADMIN`, and `WEBHOOK` to resolve conflicts between mandatory authentication rules and guest checkout flows.
2. **Database Engine Mandate:**
   * *Resolution:* Mandated PostgreSQL for MVP due to concurrency and locking requirements (`SELECT ... FOR UPDATE`), prohibiting SQLite for production environments.

---

## 4. Scope Reduced

To ensure the MVP remains realistic and focused on core commerce functionality:
* **Category Management Admin UI:** Removed Admin category CRUD (`AD-021`–`AD-024`). Product categories use static tags in MVP.
* **Password Reset Infrastructure:** Deferred email password reset (`A-015`–`A-018`) to Phase 3.
* **Multiple Saved Addresses:** Simplified address management to a single default shipping address per user profile.
* **Per-Item Shipping Speeds:** Simplified shipping speed selection to an order-level choice.
* **AI/ML Requirements:** Completely decoupled AI/ML from MVP core architecture.

---

## 5. New Requirements Added

* **P-003 – P-005:** Razorpay Webhook endpoint (`POST /api/webhooks/razorpay`), raw body signature verification, and idempotent event processing.
* **I-001 – I-005:** Transactional inventory reservations with 15-minute TTL locks and background/lazy cleanup.
* **F-013 & Section 15:** Signed guest access token generation, SHA-256 hashing, and `X-Guest-Token` header authorization.
* **AC-001 – AC-006:** Objective, testable WCAG 2.1 AA accessibility acceptance criteria.
* **PF-001 – PF-005:** Objective p95 latency targets (<200ms catalog, <300ms checkout initiation, <150ms webhook processing) and maximum query budgets.

---

## 6. Requirements Deferred

* **Phase 2:** Product reviews & verified buyer ratings, customer order cancellation, automated restock email notifications.
* **Phase 3:** Semantic vector product search (`pgvector`), content-based recommendation engine, Redis caching layer.

---

## 7. Remaining Open Decisions

1. **Free-Tier Cloud Hosting Provider:** Choice of free-tier cloud host (Render vs. Railway vs. Neon PostgreSQL) will be finalized during the Technical Requirements Document (TRD) phase based on active quota availability.
