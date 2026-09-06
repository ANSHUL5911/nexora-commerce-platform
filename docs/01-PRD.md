# Nexora Commerce Platform — Product Requirements Document

**Version:** 2.1  
**Date:** September 5, 2026  
**Author:** Principal Product Engineer + Senior Full-Stack Engineer + Security Engineer + Product/UX Architect  
**Status:** Approved for TRD  
**Previous Version:** 2.0  

### PRD v2.1 Correction Changelog
- **Refund & Inventory Decoupling:** Clarified that payment refunds (via Razorpay API) update order/payment state to `REFUNDED` but do **NOT** automatically restore inventory. Physical restock requires an explicit, separate restock operation with audit logging.
- **Payment Attempts & Retries:** Explicitly defined the `PaymentAttempt` entity requirement. Payment retries support multiple payment attempts per single ecommerce order without creating duplicate orders.
- **Server-Side Session Authentication:** Standardized MVP authentication on server-side session authentication (HttpOnly, Secure in production, SameSite=Lax cookie with server-stored session state). Removed JWT/refresh token ambiguity.
- **Strengthened Guest Access Security:** Added explicit protections for guest order tokens (prohibited in URLs, logs, and telemetry; rate-limited guest endpoints; constant-time hash comparison; narrowly scoped to specific order; sanitized error messages).
- **Explicit Database Integrity & Indexing:** Added explicit database integrity constraints (quantities, prices, non-negative stock, unique Razorpay IDs, composite cart constraints) and indexes (orders by user/status/created_at, cart/order items, payment events, payment attempts, guest token hash).
- **Measurable Query Performance Requirements:** Replaced rigid "Max 3 SQL queries per request" rule with measurable engineering requirements (N+1 query elimination, eager loading, query profiling, index optimization, retaining p95 latency targets).
- **Authoritative Payment Verification:** Verified consistency across all sections that frontend payment success reports are non-authoritative; only backend Razorpay signature verification / webhook processing transitions an order to `PAID`.

---

## 1. Executive Summary

Nexora is a portfolio-grade, production-oriented e-commerce platform designed to demonstrate modern engineering excellence, secure full-stack architecture, and production-quality commerce workflows suitable for technical presentation at top-tier software engineering interviews.

**Core Principles:**
- **Quality over Feature Count:** Deep, production-grade implementation of core commerce loops rather than shallow feature lists.
- **Security by Default:** Strict trust boundaries, HTTP-only secure cookie authentication, role-based authorization, IDOR prevention, and secret management.
- **Reliable Transactions & Concurrency:** Transactional inventory reservations with 15-minute Time-To-Live (TTL), idempotent payment webhooks, and explicit state machines.
- **Observability & Auditability:** Structured JSON logging, correlation IDs, and detailed audit trails for security and payment operations.
- **Testable Requirements:** Measurable latency, test coverage, and clear acceptance criteria across unit, integration, concurrency, and security test suites.

---

## 2. Product Vision

Nexora demonstrates production engineering excellence by transforming a simple store demo into a robust, high-reliability commerce platform. The system models realistic real-world constraints: concurrent inventory reservation, asynchronous payment reconciliation via webhooks, guest authorization with cryptographically signed tokens, and strict user data isolation.

Every requirement in this document answers the interview question: *"What engineering pattern or architectural principle does this demonstrate?"*

---

## 3. Problem Statement

### 3.1 Current System Deficiencies

The existing baseline implementation is a learning demo with critical operational gaps:

| Feature / Area | Current Baseline Defect | Portfolio & Architectural Risk |
|---|---|---|
| **Authentication** | None (all API routes public) | Fails to demonstrate authentication fundamentals and access control. |
| **User Data Isolation** | Global cart shared across all users | Critical privacy violation; lacks data boundaries. |
| **Payments** | Simulated fake payment endpoint logging card CVV | Insecure anti-pattern; fails to demonstrate real payment processing. |
| **Inventory** | No stock management or reservation mechanism | Susceptible to overselling and race conditions under concurrency. |
| **Order Schema** | Products stored as raw JSON blobs in `Order` model | Breaks relational integrity, indexing, joins, and per-item tracking. |
| **Guest Workflows** | No guest order authorization or guest token handling | Exposes customer order data to IDOR and enumeration attacks. |
| **Observability** | Unstructured console output; database reset endpoint public | High vulnerability to DoS and untraceable production failures. |

---

## 4. Current System Gaps

Based on the baseline audit (`docs/CURRENT_SYSTEM_AUDIT.md`), the following architectural gaps are explicitly addressed in this revised PRD:

1. **Database & ORM:** SQLite in-memory persistence lacks row-level locking (`SELECT ... FOR UPDATE`). MVP mandates PostgreSQL with full relational schemas.
2. **Payment Verification:** Client-side callback validation alone fails when browser sessions drop. Server-to-server Razorpay webhooks (`POST /api/webhooks/razorpay`) are mandatory.
3. **Cart Persistence:** Lack of separation between unauthenticated browser carts and authenticated user carts.
4. **Order State Management:** Absence of a formal state machine governing order, payment, and inventory states.

---

## 5. Goals

### 5.1 Primary Goals

1. **End-to-End Core Commerce Loop:** Seamless discovery → user/guest cart → order-level delivery → inventory reservation → Razorpay payment → asynchronous webhook confirmation → fulfillment tracking.
2. **Transaction Integrity & Concurrency:** PostgreSQL-backed transactional inventory locks with a 15-minute TTL to prevent overselling and inventory Denial-of-Service (DoS).
3. **Security Engineering:** HTTP-only cookie authentication, RBAC, HMAC-signed guest access tokens, CSRF protection, and zero raw card data ingestion.
4. **Production Observability:** Structured JSON logging with `requestId` propagation and audit logging for security and payment state changes.
5. **Comprehensive Test Coverage:** > 80% test coverage spanning unit, integration, concurrency race condition, security, and accessibility tests.

---

## 6. Non-Goals

The following features are explicitly out of scope for the MVP:

| Feature / Area | Exclusion Rationale |
|---|---|
| **Multi-Currency & Internationalization** | INR currency and English language only. |
| **Real Email Infrastructure** | Real SMTP delivery is deferred; email payloads are logged to audit logs in development/demo environments. |
| **Product Reviews & UGC** | Deferred to Phase 2 to keep MVP focused on core commerce loop. |
| **Category Management Admin UI** | Product categories use static enum/tags in MVP; admin CRUD UI deferred. |
| **Multiple Saved Addresses** | Users support a single saved default shipping address in MVP. |
| **Per-Item Delivery Speed Selection** | Delivery option is selected at the order level. |
| **AI/ML Infrastructure** | AI features (semantic search, recommendations) are strictly deferred to Phase 3. Core commerce must operate 100% independently of AI services. |
| **Microservices / GraphQL** | RESTful modular monolith architecture is sufficient. |

---

## 7. Personas

### 7.1 Guest Customer
- **Description:** First-time or transient buyer seeking friction-free checkout without account registration.
- **Key Needs:** Transparent pricing, order-level shipping choices, secure Razorpay payment, and secure tracking via signed guest tokens.
- **Security Constraint:** Must be restricted from accessing other guests' or users' order details.

### 7.2 Registered Customer
- **Description:** Authenticated user with account credentials.
- **Key Needs:** Persisted cart across browser sessions, quick checkout with saved shipping address, order history access, and order cancellation within allowed windows.

### 7.3 Administrator
- **Description:** Store manager operating the administration console.
- **Key Needs:** Catalog management (create/update/soft-delete products), stock updates, order status management, processing refunds via Razorpay API, and viewing security audit logs.

---

## 8. User Journeys

### 8.1 Registered Customer Happy Path

```
[Landing / Browse] 
      │
      ▼
[Add Product to Cart] ── (Optimistic UI Update)
      │
      ▼
[Proceed to Checkout]
      │
      ▼
[Initiate Checkout] ──► Server creates Order (PENDING_PAYMENT),
      │                 reserves stock (15-min TTL lock),
      │                 generates Razorpay Order ID.
      ▼
[Razorpay Payment Modal] ── (Customer completes payment)
      │
      ▼
[Server Webhook Verification] ──► Razorpay sends POST /api/webhooks/razorpay,
      │                           server verifies signature, updates Payment to SUCCESS,
      │                           converts stock reservation to PERMANENT_DEDUCTION,
      │                           transitions Order to PAID.
      ▼
[Order Confirmation & History]
```

### 8.2 Payment Failure & In-Line Retry Path

```
[Razorpay Payment Modal] ── (Payment Attempt 1 Fails / Cancelled by User)
      │
      ▼
[Inline Error Display] ──► Order remains PENDING_PAYMENT (Attempt 1 recorded as FAILED),
      │                    stock reservation maintained (within 15-min TTL).
      ▼
[Click Retry Payment] ──► Server creates new PaymentAttempt (Attempt 2) for existing Order.
      │                    (Does NOT create a duplicate ecommerce Order)
      ▼
[Razorpay Payment Modal] ── (Payment Attempt 2 Succeeds)
      │
      ▼
[Server Webhook Verification] ──► Razorpay webhook / backend verification validates Attempt 2,
                                  transitions Order to PAID.
```

### 8.3 Inventory Reservation Expiry Path (Timeout)

```
[Initiate Checkout] ──► Order PENDING_PAYMENT, Stock Reserved (TTL = 15 min).
      │
      ▼
[User Abandons Tab] ──► 15 Minutes Elapse.
      │
      ▼
[Background Cleanup Job / Lazy Check] ──► Order transitions to EXPIRED,
                                          stock reservation RELEASED back to available pool.
```

---

## 9. Product Experience

### 9.1 Cart Management & Optimistic UI Updates
- **Optimistic Cart Mutation:** When a user updates an item quantity or removes an item, the frontend immediately updates local state and renders the new UI.
- **Rollback on Failure:** An asynchronous API call is dispatched. If the server returns an error (e.g., stock unavailable, network error), the frontend automatically rolls back the cart state to the previous snapshot and displays an accessible toast error message.
- **Cart Isolation:** Guest cart items are persisted in `localStorage`. Upon successful authentication, guest cart items are merged server-side with the user's stored cart.

### 9.2 Checkout & Payment Experience
- **Order-Level Shipping Selection:** Customers select shipping speed (Standard, Express, Overnight) for the entire order during checkout.
- **In-Line Payment Retry:** If Razorpay Checkout returns a payment failure or is dismissed by the user, the application remains on the checkout page, displaying a clear failure banner with a "Retry Payment" button. Retrying creates a new `PaymentAttempt` linked to the existing ecommerce `Order` (preserving `PENDING_PAYMENT` state and stock reservation within TTL); it MUST NOT create a second ecommerce `Order`.
- **Authoritative Payment Confirmation:** Frontend payment completion callbacks update UI state only. Order status is updated to `PAID` strictly upon server-side Razorpay webhook or API verification.

---

## 10. Functional Requirements

### 10.1 Product Catalog & Discovery

| ID | Requirement | Classification | Priority |
|---|---|---|---|
| **F-001** | System shall display products in a responsive grid layout with pagination support (default 12 items/page). | Functional | MUST HAVE |
| **F-002** | System shall support product search by name and keywords using case-insensitive PostgreSQL full-text search. | Functional | MUST HAVE |
| **F-003** | System shall display product details: name, description, price (in INR cents), rating, image gallery, and real-time stock availability. | Functional | MUST HAVE |
| **F-004** | System shall support filtering products by static categories and sorting by price (asc/desc) and creation date. | Functional | MUST HAVE |
| **F-005** | System shall display an "Out of Stock" badge when available inventory (`stock_quantity - reserved_quantity`) is 0. | Functional | MUST HAVE |

### 10.2 Cart Management

| ID | Requirement | Classification | Priority |
|---|---|---|---|
| **F-006** | System shall allow adding products to cart, updating quantity (1 to 10 per item), and removing items. | Functional | MUST HAVE |
| **F-007** | Frontend shall execute optimistic UI state updates for cart mutations and roll back state on API failure. | UX / Functional | MUST HAVE |
| **F-008** | System shall maintain guest cart in browser `localStorage` and merge it with the user cart upon login. | Functional | MUST HAVE |
| **F-009** | System shall validate cart item availability against database inventory when viewing the cart and at checkout initiation. | Functional | MUST HAVE |

### 10.3 Checkout & Orders

| ID | Requirement | Classification | Priority |
|---|---|---|---|
| **F-010** | System shall collect shipping address (Full Name, Address Line 1, City, State, Pincode, Phone) prior to payment initiation. | Functional | MUST HAVE |
| **F-011** | System shall create an order in `PENDING_PAYMENT` state and lock inventory via reservation when checkout is initiated. | Functional | MUST HAVE |
| **F-012** | System shall apply delivery costs based on order-level shipping speed selection (Standard: ₹0, Express: ₹100, Overnight: ₹300). | Functional | MUST HAVE |
| **F-013** | System shall issue a cryptographically signed `guest_token` for guest checkouts to authorize order confirmation and tracking access. | Security / Functional | MUST HAVE |

---

## 11. Order Lifecycle

The order lifecycle is governed by an explicit state machine with strict, valid state transitions.

```
                  ┌──────────────────┐
                  │ PENDING_PAYMENT  │
                  └────────┬─────────┘
                           │
         ┌─────────────────┼──────────────────┐
         │ (Payment Rec'd) │                  │ (Timeout 15m /
         ▼                 │                  │  Failed Payment)
     ┌───────┐             │                  ▼
     │ PAID  │             │           ┌──────────────┐
     └───┬───┘             │           │  CANCELLED / │
         │                 │           │   EXPIRED    │
         ▼                 │           └──────────────┘
  ┌────────────┐           │
  │ PROCESSING │           │
  └───┬────────┘           │
      │                    │
      ▼                    │
  ┌─────────┐              │
  │ SHIPPED │              │
  └───┬─────┘              │
      │                    │
      ▼                    │
 ┌───────────┐             │
 │ DELIVERED │             │
 └───────────┘             │
      │                    │
      ▼ (Admin Refund)     │
 ┌───────────┐             │
 │ REFUNDED  │ ◄───────────┘
 └───────────┘
```

### 11.1 Valid Order State Transitions

| Initial State | Allowed Target State | Triggering Event / Action |
|---|---|---|
| `PENDING_PAYMENT` | `PAID` | Verified Razorpay payment webhook or server signature check. |
| `PENDING_PAYMENT` | `CANCELLED` | Explicit payment cancellation by customer or admin. |
| `PENDING_PAYMENT` | `EXPIRED` | 15-minute reservation TTL expiration without payment. |
| `PAID` | `PROCESSING` | System/Admin acknowledgment of paid order. |
| `PROCESSING` | `SHIPPED` | Admin inputs tracking details and marks order as shipped. |
| `SHIPPED` | `DELIVERED` | Order delivery confirmed. |
| `PAID` / `PROCESSING` | `REFUNDED` | Admin issues full refund via Razorpay integration. |

> **Important (Refund vs. Inventory Restock):** Transitioning an order to `REFUNDED` (via Razorpay API refund) updates the payment and order state, but **MUST NOT** automatically restore product inventory. Restocking physical inventory is a separate business operation executed via an explicit restock action that creates an auditable record (documenting who/what initiated restock, timestamp, and quantity). If a future returns workflow is introduced, it can explicitly trigger inventory restoration.

---

## 12. Payment Lifecycle

### 12.1 Payment States & PaymentAttempt Model

An ecommerce `Order` supports multiple payment attempts over its lifecycle before settlement:

```
Order (PENDING_PAYMENT)
  └── PaymentAttempt 1 → FAILED (Attempt #1, rzp_order_id_1)
  └── PaymentAttempt 2 → SUCCESS (Attempt #2, rzp_order_id_2)
```

| Payment Attempt State | Description |
|---|---|
| **INITIATED** | Razorpay Order ID created on backend (`razorpay_order_id` assigned to a `PaymentAttempt`). |
| **SUCCESS** | Server verified payment signature via webhook or server API verification. |
| **FAILED** | Payment attempt failed or declined by issuing bank. |
| **REFUNDED** | Payment fully refunded via Razorpay Refund API. |

**Payment Attempt Rules:**
- A single ecommerce `Order` may have multiple `PaymentAttempt` records.
- Payment retries MUST NOT create a duplicate ecommerce `Order`.
- Each Razorpay payment attempt/order is uniquely identifiable (`razorpay_order_id` per `PaymentAttempt`).
- Failed attempts remain auditable and retain failure lifecycle information.
- Only one successful `PaymentAttempt` can settle and transition the ecommerce `Order` to `PAID`.

### 12.2 Razorpay Integration & Webhook Requirements

| ID | Requirement | Classification |
|---|---|---|
| **P-001** | System shall generate a Razorpay Order ID via backend API (`POST /api/payments/create-razorpay-order`) linked to a `PaymentAttempt` using server secret credentials. | Payment / Security |
| **P-002** | System shall **NEVER** collect, process, store, or log raw card numbers, CVV, or card passwords. All payment inputs occur inside Razorpay Checkout modal. | Security / PCI-DSS |
| **P-003** | System shall expose a dedicated webhook endpoint `POST /api/webhooks/razorpay` to process asynchronous payment events (`payment.authorized`, `payment.failed`). | Payment / Reliability |
| **P-004** | Webhook endpoint must capture raw request body to verify `X-Razorpay-Signature` using HMAC-SHA256 with `RAZORPAY_WEBHOOK_SECRET`. | Security |
| **P-005** | Webhook processing must be idempotent: duplicate webhook events identified by `event_id` must be logged and ignored without re-processing state. | Reliability |
| **P-006** | Razorpay key secret must **NEVER** be exposed to frontend code or client network calls. | Security |
| **P-007** | **Authoritative Payment State:** Frontend payment success notifications are non-authoritative. Order status transitions to `PAID` exclusively via secure server-side Razorpay webhook processing or direct backend Razorpay API verification. | Payment / Security |
| **P-008** | **Payment Retries:** Payment retry attempts create a new `PaymentAttempt` record linked to the existing `PENDING_PAYMENT` order. Retries MUST NOT create duplicate ecommerce orders. | Payment / Data Integrity |

---

## 13. Inventory Lifecycle

### 13.1 Inventory State Machine

Each product stock item exists in one of three logical quantities in PostgreSQL:
1. `stock_quantity`: Total physical stock owned.
2. `reserved_quantity`: Stock held under active 15-minute checkout TTLs.
3. `available_quantity`: Calculated as (`stock_quantity - reserved_quantity`).

```
 Available Stock ──► [Checkout Started] ──► Reserved Stock (TTL = 15m)
                          │                       │
                          │ (Timeout / Cancel)    │ (Payment Verified)
                          ▼                       ▼
                   Available Stock        Permanently Deducted Stock
                                          (stock_quantity decremented,
                                           reserved_quantity decremented)
```

### 13.2 Concurrency & Locking Requirements

| ID | Requirement | Classification |
|---|---|---|
| **I-001** | Stock availability checks and reservations must execute inside a PostgreSQL database transaction using `SELECT ... FOR UPDATE` row-level locks. | Concurrency / Data Integrity |
| **I-002** | Reservation TTL shall be set to exactly 15 minutes upon checkout initiation. | Reliability |
| **I-003** | If available stock is insufficient (`available_quantity < requested_qty`), checkout initiation must fail with HTTP 409 Conflict. | Functional |
| **I-004** | When an order transitions to `PAID`, the system converts the reservation into a permanent stock reduction (`stock_quantity -= qty`, `reserved_quantity -= qty`). | Data Integrity |
| **I-005** | An automated background task or lazy-check cleaner shall release expired reservations (`reserved_quantity -= qty`) and set order state to `EXPIRED`. | Reliability |
| **I-006** | **Decoupled Refund & Restock:** Refunding an order (transitioning payment/order to `REFUNDED`) MUST NOT automatically restore product stock (`stock_quantity`). Physical restocking requires an explicit restock operation that writes an auditable log entry recording who/what initiated restock, timestamp, product ID, quantity, and reason. If a future returns workflow is introduced, it can explicitly trigger inventory restoration. | Business Logic / Auditability |

---

## 14. Authentication & Authorization

### 14.1 Authentication Architecture

The system standardizes on **Server-Side Session Authentication** with opaque session identifiers delivered via secure HTTP-only cookies to protect against XSS, token theft, and session hijacking.

| Attribute | Specification |
|---|---|
| **Authentication Model** | Server-Side Session Authentication |
| **Session Identifier** | Cryptographically secure 256-bit random opaque string |
| **Cookie Attributes** | `HttpOnly`, `Secure` (in production), `SameSite=Lax` |
| **Session State Storage** | Stored server-side in PostgreSQL `Sessions` table |
| **Session Expiration** | Explicit 7-day rolling expiration; logout invalidates server-side session immediately |
| **Password Hashing** | Argon2id or bcrypt (cost factor >= 12) |
| **Authorization** | Server-side session lookup and role verification on every request (`customer` \| `admin`) |
| **CSRF Protection** | `SameSite=Lax` cookie policy + double-submit CSRF token header for state-changing endpoints |
| **No Auth JWTs** | Authentication JWTs and refresh tokens are NOT used for MVP user authentication. |

### 14.2 API Endpoint Classification & Authorization Matrix

| Endpoint Path | Access Level | Authorization Rule |
|---|---|---|
| `GET /api/products` | **PUBLIC** | Unrestricted access. |
| `POST /api/auth/register`, `login` | **PUBLIC** | Rate-limited (5 requests / min per IP). |
| `POST /api/webhooks/razorpay` | **WEBHOOK** | Validated via `X-Razorpay-Signature` HMAC. |
| `GET /api/orders/guest/:id` | **PUBLIC (GUEST)** | Requires valid `X-Guest-Token` header. |
| `GET /api/orders/me`, `GET /api/cart` | **AUTHENTICATED** | Requires valid user auth cookie (`role: customer` or `admin`). |
| `GET /api/admin/*`, `POST /api/admin/*` | **ADMIN** | Requires valid user auth cookie with explicit `role: admin`. |

---

## 15. Guest Checkout

### 15.1 Guest Access Token Architecture

To prevent Insecure Direct Object Reference (IDOR) attacks on guest orders without requiring account registration:

1. **Token Generation:** When a guest creates an order (`POST /api/checkout/guest`), the server generates a cryptographically random, 256-bit token (`guest_access_token`).
2. **Hashing & Storage:** The server hashes the token using SHA-256 and stores the hash in the `Orders` table (`guest_token_hash`). The raw token is returned **once** in the API response body.
3. **Guest Verification:** To view or track the order (`GET /api/orders/guest/:id`), the client must pass the raw token in the `X-Guest-Token` HTTP header. The server hashes the incoming header value and compares it against `guest_token_hash`.
4. **Scope & Expiry:** The token grants read-only access strictly to the matching `orderId` and expires 30 days post-creation. Guest tokens are strictly isolated from authenticated user sessions.

### 15.2 Guest Token Security Controls

| ID | Control Requirement | Standard |
|---|---|---|
| **G-001** | **No URL Exposure:** Guest tokens MUST NEVER appear in URLs, path segments, or query parameters. Raw tokens are exposed solely in the checkout response body and transmitted via `X-Guest-Token` header. | Non-Negotiable |
| **G-002** | **Prohibited Logging:** Guest tokens MUST NOT be written to application logs, system stdout, error logs, or analytics/telemetry payloads. | Non-Negotiable |
| **G-003** | **Narrow Order Scoping:** Guest token validation must be strictly scoped to the specific order associated with `guest_token_hash`. Token possession for Order A grants zero access to Order B. | Non-Negotiable |
| **G-004** | **Constant-Time Verification:** Server token verification must use constant-time comparison algorithms (`crypto.timingSafeEqual`) to prevent timing side-channel attacks. | Non-Negotiable |
| **G-005** | **Sanitized Error Responses:** Failed guest token verification must return standard `401 Unauthorized` or `404 Not Found` without revealing expected hashes, raw tokens, or internal error details. | Non-Negotiable |
| **G-006** | **Rate Limiting:** Guest order tracking endpoints (`GET /api/orders/guest/:id`) must enforce strict IP rate limiting to prevent token enumeration attempts. | Non-Negotiable |

---

## 16. Admin Operations

The Admin interface serves as a commerce operational console focusing on business execution rather than generic visual cards.

### 16.1 Admin Operational Requirements

| ID | Requirement | Classification | Priority |
|---|---|---|---|
| **AD-001** | Admin console shall require explicit `admin` role authentication. Non-admin access attempts return HTTP 403 Forbidden and generate a security audit log. | Security / RBAC | MUST HAVE |
| **AD-002** | Admin shall view a paginated list of all system products with inline inventory editing capabilities. | Admin Operations | MUST HAVE |
| **AD-003** | Admin shall create new products and update details (title, description, price, stock, image URLs, categories). | Admin Operations | MUST HAVE |
| **AD-004** | Admin shall soft-delete products (`is_deleted = true`) to preserve historical order references. | Data Integrity | MUST HAVE |
| **AD-005** | Admin shall view all system orders, filter by status, and update status (`PROCESSING` → `SHIPPED` → `DELIVERED`). | Admin Operations | MUST HAVE |
| **AD-006** | Admin shall initiate full refunds for paid orders via Razorpay API (`POST /api/admin/orders/:id/refund`), updating order/payment status to `REFUNDED`. A refund MUST NOT automatically restore product inventory. | Payment / Operations | MUST HAVE |
| **AD-008** | Admin shall execute physical inventory restocking via dedicated restock endpoint (`POST /api/admin/orders/:id/restock`), generating an auditable log entry (actor, timestamp, product ID, quantity, reason). | Inventory / Auditability | MUST HAVE |
| **AD-007** | Admin console shall display security and payment audit logs (timestamp, actor ID, IP, action, resource). | Observability / Security | MUST HAVE |

---

## 17. Security Requirements

### 17.1 Non-Negotiable Security Controls

| Control ID | Requirement | Non-Negotiable Standard |
|---|---|---|
| **S-001** | Passwords must be hashed using bcrypt (cost factor 12) or Argon2id before database storage. Plaintext passwords must never be logged. | YES |
| **S-002** | Zero raw card numbers, CVV, or card expiration data shall touch application servers. All payment card input occurs in Razorpay iframe/modal. | YES |
| **S-003** | All state-changing endpoints must validate authorization rules to prevent IDOR (users can only access their own user ID resources). | YES |
| **S-004** | All SQL queries must use parameterized inputs via Sequelize ORM to prevent SQL Injection attacks. | YES |
| **S-005** | API responses must suppress stack traces in production environments (`NODE_ENV=production`). | YES |
| **S-006** | Rate limiting must enforce max 5 attempts/minute on authentication routes and 100 requests/minute on public API routes. | YES |
| **S-007** | CORS must restrict origins strictly to configured frontend domain URLs (no `Access-Control-Allow-Origin: *` in production). | YES |
| **S-008** | Security HTTP headers must be configured via Helmet.js (`Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`). | YES |

---

## 18. Accessibility Requirements

### 18.1 WCAG 2.1 Level AA Compliance Criteria

| ID | Accessibility Acceptance Criterion | Test Method |
|---|---|---|
| **AC-001** | All interactive elements (buttons, links, inputs) must be fully navigable using the `Tab` and `Shift+Tab` keys. | Automated (`axe-core`) + Manual |
| **AC-002** | Active focus indicators must display a high-contrast visual outline (minimum 3:1 contrast ratio against background). | Visual Audit |
| **AC-003** | Text elements must meet minimum contrast ratios: 4.5:1 for standard text, 3:1 for large text (>24px). | Automated (`axe-core`) |
| **AC-004** | All form controls must have associated `<label>` elements or explicit `aria-label` attributes. | Automated (`axe-core`) |
| **AC-005** | Touch target dimensions for buttons and interactive controls must be at least 44 × 44 CSS pixels. | CSS Audit |
| **AC-006** | UI animations must respect system preferences for reduced motion (`prefers-reduced-motion: reduce`). | CSS Audit |

---

## 19. Performance Requirements

### 19.1 Objective Performance Benchmarks

All performance specifications are measurable and testable:

| Metric ID | Endpoint / Page | Target Benchmark | Measurement Environment |
|---|---|---|---|
| **PF-001** | `GET /api/products` | Latency < 200ms (p95) | 100 concurrent virtual users |
| **PF-002** | `POST /api/checkout/initiate` | Latency < 300ms (p95) | Includes inventory lock & DB transaction |
| **PF-003** | `POST /api/webhooks/razorpay` | Latency < 150ms (p95) | Asynchronous webhook processing |
| **PF-004** | DB Query Efficiency | Measurable Query Performance | Elimination of N+1 queries via eager loading/joins. Query counts on critical paths monitored and profiled in dev/test. |

### 19.2 Database Query Efficiency Requirements
- **N+1 Elimination:** All relational fetches must use eager loading (e.g. Sequelize `include`), explicit joins, or batching to eliminate N+1 query patterns.
- **Measured Query Behavior:** Critical endpoints (`GET /api/products`, `POST /api/checkout/initiate`, `POST /api/webhooks/razorpay`) must have query counts measured and profiled in development and automated testing.
- **Index-Backed Access Patterns:** Target access patterns must be supported by database indexes (see Section 23.2).
- **Justification for High Query Counts:** Any critical path exceeding expected query baselines must provide explicit documented engineering justification.
- **Latency Benchmarks as Primary Metric:** System performance is evaluated against defined p95 latency targets under concurrent load.
| **PF-005** | Frontend Bundle Size | Initial JS Bundle < 200KB gzipped | Vite build asset analysis |

---

## 20. Reliability Requirements

1. **Database Resilience:** PostgreSQL connection pool configured with automatic reconnect and 5-second query timeouts.
2. **Graceful Degradation:** If background inventory cleanup fails, inline inventory queries lazily expire stale reservations during checkout checks.
3. **Idempotency:** Payment webhooks and order creation endpoints enforce idempotency keys to prevent double-charging or duplicate order records on network retries.

---

## 21. Observability Requirements

### 21.1 Structured Logging Standard

All application logs must be output in structured JSON format to `stdout`:

```json
{
  "timestamp": "2026-09-05T23:30:00.123Z",
  "level": "INFO",
  "service": "nexora-backend",
  "requestId": "req-c8d9a1f2-3b4e",
  "userId": "usr_99812",
  "action": "PAYMENT_WEBHOOK_VERIFIED",
  "details": {
    "orderId": "ord_77123",
    "razorpayPaymentId": "pay_H8k9123z",
    "amountCents": 4999
  }
}
```

### 21.2 Prohibited Logging Data

The following sensitive data items must **NEVER** appear in log files, stdout, error messages, or telemetry under any circumstances:
- Plaintext passwords
- Server session secrets, cookie keys, or session identifiers (`sid`)
- Credit card numbers, expiration dates, or CVVs
- `RAZORPAY_KEY_SECRET` or `RAZORPAY_WEBHOOK_SECRET`
- Raw unhashed `guest_access_token` values

---

## 22. Testing Requirements

### 22.1 Comprehensive Testing Matrix

The system mandates automated verification across all core architectural pillars:

| Test Suite | Scope & Target | Execution Command / Tool | Minimum Coverage Target |
|---|---|---|---|
| **Unit Tests** | Helper utilities, formatters, state machine transition logic. | Vitest / Jest | > 85% line coverage |
| **Integration Tests** | API endpoints, Sequelize ORM queries, HTTP status codes. | Supertest + Vitest | > 80% line coverage |
| **Concurrency Tests** | Concurrent checkout calls attempting to reserve limited stock (`available = 1`). | Custom concurrency test script | 100% race condition prevention |
| **Security Tests** | Auth bypass attempts, IDOR order access, rate limit verification. | Automated Security Test Suite | Zero high/critical vulnerabilities |
| **Payment Tests** | Razorpay signature verification, webhook processing, duplicate webhook events. | Webhook Mock Test Suite | 100% path coverage |
| **Accessibility Tests** | WCAG 2.1 AA DOM validation. | `@axe-core/react` / `vitest-axe` | Zero automated accessibility failures |

### 22.2 Test Database Lifecycle & Isolation

- Integration and concurrency tests must execute against a dedicated, isolated test PostgreSQL database (`nexora_test`).
- Each test suite run executes database migrations before running and truncates tables between tests to guarantee zero test state contamination.

---

## 23. Database Model

The backend data model relies strictly on relational schemas in PostgreSQL. Raw JSON storage of products inside orders is prohibited.

```
┌─────────────┐       ┌──────────────┐       ┌─────────────┐
│    Users    │1    * │    Orders    │1    * │ OrderItems  │
├─────────────┤───────├──────────────┤───────├─────────────┤
│ id (PK)     │       │ id (PK)      │       │ id (PK)     │
│ email       │       │ user_id (FK) │       │ order_id(FK)│
│ password_hash│      │ status       │       │ product_id  │
│ role        │       │ total_cents  │       │ quantity    │
└──────┬──────┘       │ guest_hash   │       │ unit_price  │
       │1             └──────┬───────┘       └─────────────┘
       │                     │1
       │*                    │
┌──────┴──────┐              │*
│  Sessions   │       ┌──────┴─────────┐
├─────────────┤       │ PaymentAttempts│
│ sid (PK)    │       ├────────────────┤
│ user_id(FK) │       │ id (PK)        │
│ expires_at  │       │ order_id (FK)  │
└─────────────┘       │ attempt_number │
                      │ rzp_order_id   │
                      │ rzp_pay_id     │
                      │ status         │
                      └────────────────┘
```

### 23.1 Relational Schema Definitions

1. **`Users`**: `id` (UUID), `email` (Unique), `password_hash`, `role` (`customer` | `admin`), `full_name`, `created_at`.
2. **`Sessions`**: `sid` (PK / String), `user_id` (FK to Users), `data` (Text), `expires_at` (DateTime), `created_at`.
3. **`Products`**: `id` (UUID), `name`, `description`, `price_cents`, `stock_quantity`, `reserved_quantity`, `category`, `image_url`, `is_deleted`.
4. **`Carts`**: `id` (UUID), `user_id` (Nullable FK for guest session), `created_at`.
5. **`CartItems`**: `id` (UUID), `cart_id` (FK), `product_id` (FK), `quantity`.
6. **`Addresses`**: `id` (UUID), `user_id` (Nullable FK), `full_name`, `address_line1`, `city`, `state`, `pincode`, `phone`.
7. **`Orders`**: `id` (UUID), `user_id` (Nullable FK for guests), `address_id` (FK), `order_status` (`PENDING_PAYMENT`, `PAID`, `PROCESSING`, `SHIPPED`, `DELIVERED`, `CANCELLED`, `EXPIRED`, `REFUNDED`), `total_cost_cents`, `shipping_fee_cents`, `guest_token_hash` (Nullable), `reservation_expires_at`, `created_at`.
8. **`OrderItems`**: `id` (UUID), `order_id` (FK to Orders), `product_id` (FK to Products), `quantity`, `unit_price_cents`.
9. **`PaymentAttempts`**: `id` (UUID), `order_id` (FK to Orders), `attempt_number` (Integer), `razorpay_order_id` (Unique string), `razorpay_payment_id` (Nullable string), `razorpay_signature` (Nullable string), `status` (`INITIATED`, `SUCCESS`, `FAILED`, `REFUNDED`), `failure_reason` (Nullable string), `amount_cents`, `created_at`.
10. **`PaymentEvents` / `AuditLogs`**: `id` (UUID), `event_id` (Razorpay webhook ID for idempotency), `event_type`, `payload_json`, `actor_id` (Nullable), `created_at`.
11. **`StockRestockLogs`**: `id` (UUID), `order_id` (FK to Orders), `product_id` (FK to Products), `quantity_restocked`, `initiated_by` (Admin user_id / system), `reason`, `created_at`.

### 23.2 Database Integrity Constraints & Indexes

#### Mandatory Integrity Constraints:
- **Quantity Positivity:** `OrderItems.quantity > 0`, `CartItems.quantity > 0`.
- **Price Non-Negativity:** `Products.price_cents >= 0`, `OrderItems.unit_price_cents >= 0`, `Orders.total_cost_cents >= 0`.
- **Inventory Non-Negativity:** `Products.stock_quantity >= 0`, `Products.reserved_quantity >= 0`, and `Products.stock_quantity >= Products.reserved_quantity`.
- **Valid Reservation Quantity:** Stock reservation must not exceed total physical stock.
- **Cart Uniqueness:** Composite unique constraint `(cart_id, product_id)` on `CartItems`.
- **Razorpay Unique Identifiers:** Unique constraint on `razorpay_order_id` per payment attempt and `razorpay_payment_id` where applicable.
- **Idempotent Webhook Events:** Unique constraint on `event_id` in `PaymentEvents`.
- **Foreign Keys:** Explicit foreign-key constraints with integrity cascades/restricts across all relations.

#### Mandatory Database Indexes:
- **`Orders`:** Index on `user_id`, index on `order_status`, index on `created_at`, index on `guest_token_hash`.
- **`Products`:** Index on `category`, index on `is_deleted`.
- **`CartItems`:** Index on `cart_id`.
- **`OrderItems`:** Index on `order_id`.
- **`PaymentAttempts`:** Index on `order_id` (payment history per ecommerce order), index on `razorpay_order_id`.
- **`PaymentEvents`:** Index on `event_id`.
- **`Sessions`:** Index on `sid`, index on `expires_at`.

---

## 24. AI/ML Future Roadmap

AI/ML features are **100% decoupled from the MVP core platform**. The core platform operates seamlessly without any AI dependencies.

- **Phase 3 Extension (Optional):**
  - **Semantic Product Search:** Vector embeddings (OpenAI / pgvector) for natural language search queries.
  - **Content-Based Recommendations:** "Similar Products" recommendation engine using cosine similarity over product metadata.

---

## 25. Deployment Requirements

### 25.1 Deployment Architecture

The application is engineered for zero-cost deployment on free-tier cloud platforms while maintaining production capabilities:

```
[ Frontend: Vercel / Netlify ] ── (HTTPS) ──► [ Backend API: Render / Railway ]
                                                        │
                                                        ├──► [ Database: Render PostgreSQL / Neon DB ]
                                                        └──► [ External: Razorpay API (Test Mode) ]
```

### 25.2 Deployment Controls

1. **Environment Variables:** All secrets (`SESSION_SECRET`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `DATABASE_URL`) supplied exclusively via environment variables. Missing variables fail fast during app startup.
2. **Build Outputs:** Frontend builds to static assets (`dist/`). Backend runs via standard `npm start`.

---

## 26. MVP Scope Summary

| Domain | Included in MVP | Excluded from MVP (Deferred) |
|---|---|---|
| **Catalog** | Grid, search, category filter, sorting, product detail page. | Product reviews, category CRUD admin UI. |
| **Cart** | Cart CRUD, optimistic UI, guest cart merging. | Per-item shipping choices. |
| **Checkout** | Single shipping address form, order-level shipping selection. | Multiple saved addresses address book. |
| **Orders** | Relational `OrderItems`, state machine, guest tracking with signed tokens. | Password reset via email. |
| **Inventory** | PostgreSQL row locking, 15-min TTL reservation. | Multi-warehouse routing. |
| **Payments** | Razorpay Checkout, server signature check, `POST /api/webhooks/razorpay`. | Real currency switching (INR only). |
| **Admin** | Product management, stock editing, order status updates, Razorpay refunds. | Complex visual analytics dashboards. |

---

## 27. Phase 2 Roadmap

- Product reviews and verified buyer rating submissions.
- Order cancellation capability for customers prior to shipping.
- Automated restock email notifications.

---

## 28. Phase 3 Roadmap

- Semantic vector product search using `pgvector`.
- Personalized recommendation engine.
- Redis caching layer for product search and catalog endpoints.

---

## 29. Acceptance Criteria

| Area | Acceptance Criteria |
|---|---|
| **Order Concurrency** | Initiating 10 simultaneous checkouts for a product with stock = 1 results in exactly 1 successful reservation and 9 HTTP 409 Conflict responses. |
| **Payment Webhook** | Receiving a valid `payment.authorized` webhook from Razorpay transitions order state to `PAID` and decrements `stock_quantity` permanently. Receiving a duplicate webhook with the same `event_id` returns HTTP 200 OK without re-processing stock. |
| **Payment Retries** | Retrying a failed payment attempt creates a new `PaymentAttempt` with a new Razorpay Order ID under the same ecommerce order without creating a duplicate ecommerce `Order`. |
| **Refund vs Restock** | Issuing a payment refund transitions payment/order to `REFUNDED` but does NOT increase `stock_quantity`. Stock quantity is restored only via an explicit restock API call generating a `StockRestockLogs` entry. |
| **Session Authentication** | Authenticated requests rely on `HttpOnly` session cookie (`SameSite=Lax`). Session invalidation on logout immediately denies access to protected endpoints with HTTP 401 Unauthorized. |
| **Guest IDOR Prevention** | Requesting `GET /api/orders/guest/:id` without a valid `X-Guest-Token` header returns HTTP 401 Unauthorized. Guest token hashes are verified using constant-time comparison. |
| **Cart Optimism** | Updating item quantity immediately changes the UI total. If the network call fails, the UI reverts to the previous quantity and renders an error toast. |

---

## 30. Open Decisions & Assumptions

| # | Item | Assumption / Recommendation | Decision Status |
|---|---|---|---|
| 1 | **Test Payment Gateway** | Using Razorpay Test Mode API keys for portfolio demonstration. | **Finalized** |
| 2 | **Email Delivery in Demo** | Real SMTP server is out of scope; email bodies are written to system audit logs. | **Finalized** |
| 3 | **Free-Tier Host Provider** | Host provider selection (Render vs. Railway vs. Neon) will be finalized in TRD based on current quota limits. | **Deferred to TRD** |
