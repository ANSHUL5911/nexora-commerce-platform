# Nexora Commerce Platform
## Implementation Plan v1.0
### Production Implementation Blueprint — Modular Monolith Execution Roadmap
**Date:** September 6, 2026  
**Status:** Approved & Finalized (Authoritative Baseline for Code Execution)  
**Document Identifier:** `docs/06-IMPLEMENTATION-PLAN-v1.0.md`  
**Authors:** Principal System Architect, Senior Full-Stack Lead, Lead PostgreSQL Database Architect, Payment Systems Engineer, Security Architect, Production Reliability Engineer  

---

## 1. Document Control & Executive Summary

### 1.1 Purpose
This document establishes the definitive, dependency-ordered, production-grade technical implementation plan for the Nexora Commerce Platform. It operationalizes and translates the finalized architectural baselines:
- `docs/PRD.md` (Product Requirements Document v2.1)
- `docs/TRD.md` (Technical Requirements Document v1.2.1)
- `docs/03-APP-FLOW-v1.0.md` (Application & State Flow Specification v1.0)
- `docs/04-UI-UX-DESIGN-BRIEF-v1.0.md` (UI/UX Design Brief v1.0)
- `docs/05-BACKEND-SCHEMA-v1.0.md` (Backend Schema Specification v1.0)

This plan provides an exhaustive blueprint enabling senior engineering personnel to construct, verify, and deploy the platform without architectural ambiguity, premature optimization, or uncoordinated design deviations.

### 1.2 Document Control & Versioning
| Version | Release Date | Status | Primary Purpose |
|---|---|---|---|
| **1.0 (Final)** | 2026-09-06 | APPROVED / FINAL | Authoritative production implementation plan covering all 20 implementation phases, legacy migration mappings, API contracts, migration sequences, test gates, security controls, and end-to-end operational flows. |

### 1.3 Strict Architectural Constraints
1. **Architecture Model:** Modular Monolith with strictly decoupled domain boundaries running on Node.js 20 LTS (ES Modules) and Express 4.19+.
2. **Database:** PostgreSQL 15+ using Sequelize 6.35+ CLI migrations and native `pg` driver with row-level locking (`SELECT ... FOR UPDATE`). No SQLite in production or testing.
3. **Session Management:** Opaque, server-side database-backed sessions with `__Host-nexora_sid` secure cookie (`SameSite=Lax`, `HttpOnly=true`, `Secure=true` in production, `Path=/`). Absolute exclusion of JWTs, client-side localStorage auth tokens, and OAuth microservices.
4. **Payment Architecture:** Razorpay Test Mode integration utilizing a $1:N$ `Order` to `PaymentAttempt` model. No cardholder data ingestion; zero raw credentials persisted or logged. In-memory HMAC-SHA256 signature verification.
5. **Inventory Invariant:** Available inventory dynamically governed by $\text{available\_quantity} = \text{stock\_quantity} - \text{reserved\_quantity}$. Atomic 2-phase checkout: Phase A commits DB locks and 15-minute reservations strictly *before* Phase B initiates Razorpay external network calls.
6. **Refund vs. Restock Invariant:** $\text{REFUND} \neq \text{RESTOCK}$. Financial refunds via Razorpay update payment/order states to `REFUNDED` but *never* automatically increment product inventory. Physical restock requires explicit, authenticated administrative action.
7. **Scoped Idempotency:** API idempotency keys uniquely constrained per endpoint path `(idempotency_key, request_path)` with SHA-256 payload validation.
8. **No Code Rule:** Phase 06 is documentation-only. No application source code, migrations, or dependencies are executed or modified in this phase.

---

## 2. Current Codebase Inspection & Legacy Migration Assessment

An exhaustive structural and architectural audit of the existing repository (`ecommerce-backend` and `ecommerce-project`) was conducted to evaluate the legacy demo codebase against the approved production specification.

### 2.1 Current System State vs. Target Production State
| Architectural Dimension | Existing Legacy Codebase | Target Production Architecture (v1.0) | Assessment / Action |
|---|---|---|---|
| **Database Engine** | SQLite (`database.sqlite`) via Sequelize | PostgreSQL 15+ with native `gen_random_uuid()` & row-level locking | **REPLACE**: Drop SQLite completely. Implement 11 PostgreSQL migrations. |
| **Data Normalization** | Denormalized JSON `Order.products` string blob | Relational `order_items` table with immutable price/name snapshots | **REPLACE**: Migrate schema to normalized relational entities. |
| **Authentication** | None (hardcoded demo user / unauthenticated) | Server-side PostgreSQL sessions (`sessions` table) with `__Host-` cookies (`SameSite=Lax`) | **REPLACE**: Implement Argon2id hashing, secure session store, RBAC middleware. |
| **Cart Ownership** | Single global cart table (`CartItem` table without user scoping) | Scoped `carts` ($1:1$ per User/Guest session) & `cart_items` with composite uniqueness | **REPLACE**: Implement tenant/session-isolated cart domain. |
| **Inventory Control** | Static decrement on order placement; zero concurrency protection | Dynamic reservation counter (`reserved_quantity`), `SELECT FOR UPDATE`, 15-min TTL | **REPLACE**: Implement transactional 2-phase inventory reservation engine. |
| **Checkout & Payments** | Fake client-side dummy form; synchronous mock order write | 2-Phase Checkout, Razorpay Orders API, $1:N$ `PaymentAttempt`, Webhook reconciliation | **REPLACE**: Implement Razorpay SDK, webhook HMAC-SHA256 processor, retry engine. |
| **Payment Retry** | None (failed transaction loses state) | Multi-attempt retry referencing same ecommerce `Order` with new `PaymentAttempt` | **CREATE**: Implement retry endpoint `/api/checkout/:orderId/retry`. |
| **Late Payment Handling**| None (causes data corruption or unhandled error) | Decoupled financial capture (`SUCCESS` on attempt, `EXPIRED` on order, `REQUIRES_REFUND`) | **CREATE**: Implement reconciliation & refund workflow. |
| **Guest Security** | None | Cryptographic 256-bit token, SHA-256 at rest, `X-Guest-Order-Token` header auth | **CREATE**: Implement secure guest lookup and Anti-IDOR middleware. |
| **API Idempotency** | None | Scoped `(idempotency_key, request_path)` table with cached response replay | **CREATE**: Implement enterprise idempotency middleware. |
| **Refund & Restock** | None | Decoupled admin refund and physical restock logging (`stock_restock_logs`) | **CREATE**: Implement separate administrative workflows with audit trails. |
| **Frontend Framework** | React 18 with Vite, ad-hoc CSS, unstructured fetch calls | React 18+ with Vite, Architectural Editorial CSS Design System, robust ApiClient | **REFACTOR / REPLACE**: Redesign UI according to Design Brief v1.0. |

### 2.2 Legacy Module Disposition Matrix (KEEP / REFACTOR / REPLACE / REMOVE)
```
LEGACY CODEBASE DISPOSITION:
├── backend/
│   ├── database.sqlite                      --> REMOVE (Prohibited in production)
│   ├── server.js                            --> REPLACE (Implement production Express app with security middleware)
│   ├── models/
│   │   ├── CartItem.js                      --> REMOVE (Replaced by normalized Cart & CartItem models)
│   │   ├── DeliveryOption.js                --> REMOVE (Delivery rules integrated into domain logic)
│   │   ├── Order.js                         --> REPLACE (Replace JSON-based order with relational schema)
│   │   ├── Product.js                       --> REPLACE (Replace with normalized Product schema + reservation columns)
│   │   └── index.js                         --> REPLACE (Initialize PostgreSQL Sequelize instance)
│   ├── routes/
│   │   ├── cartItems.js                     --> REMOVE (Replaced by modules/cart/cart.routes.js)
│   │   ├── deliveryOptions.js               --> REMOVE (Replaced by shipping domain)
│   │   ├── orders.js                        --> REMOVE (Replaced by modules/orders/orders.routes.js)
│   │   ├── paymentSummary.js                --> REMOVE (Replaced by server-side authoritative cart calculation)
│   │   ├── payments.js                      --> REMOVE (Replaced by modules/payments & webhooks)
│   │   ├── products.js                      --> REMOVE (Replaced by modules/products/products.routes.js)
│   │   ├── reset.js                         --> REMOVE (Prohibited in production)
│   │   └── tracking.js                      --> REMOVE (Replaced by guest/order tracking routes)
│   └── images/                              --> KEEP (Retain curated product static assets for seeding)
└── frontend/
    ├── src/
    │   ├── App.jsx                          --> REFACTOR (Implement global AuthProvider, CartProvider, ToastProvider)
    │   ├── index.css                        --> REPLACE (Implement Nexora Warm Neutral Design System tokens & typography)
    │   ├── pages/
    │   │   ├── home/                        --> REFACTOR (Implement Architectural Editorial Hero, Grid, Filters)
    │   │   ├── checkout/                    --> REPLACE (Implement 2-Phase Checkout, Razorpay Modal, Address Step)
    │   │   ├── orders/                      --> REFACTOR (Implement Order History, Order Details, Tracking)
    │   │   ├── payment/                     --> REPLACE (Integrated into Razorpay Modal & Webhook feedback)
    │   │   └── TrackingPage.jsx             --> REFACTOR (Implement secure Guest Order Tracking with token header)
    │   └── utils/money.js                   --> REFACTOR (Align with Paise-to-Rupee formatting: 1 INR = 100 Paise)
```

---

## 3. Dependency Graph & Implementation Strategy

Implementation adheres strictly to a dependency-first topological execution sequence. No higher-level domain is constructed until its underlying data structures, transactional boundaries, and security primitives are fully verified.

```mermaid
graph TD
    P01[Phase 06.1: Repo & Environment Foundation] --> P02[Phase 06.2: PostgreSQL & Migrations]
    P02 --> P03[Phase 06.3: Auth, Sessions & RBAC]
    P02 --> P04[Phase 06.4: Product & Catalog Domain]
    P03 --> P05[Phase 06.5: Cart Domain]
    P04 --> P05
    P05 --> P06[Phase 06.6: Inventory Reservation Engine]
    P06 --> P07[Phase 06.7: Order Lifecycle Engine]
    P07 --> P08[Phase 06.8: Razorpay Integration]
    P08 --> P09[Phase 06.9: Payment Attempt & Retry Engine]
    P09 --> P10[Phase 06.10: Webhook Reconciliation Engine]
    P10 --> P11[Phase 06.11: Late Payment Handling]
    P03 --> P12[Phase 06.12: API Idempotency Engine]
    P07 --> P13[Phase 06.13: Guest Security & Anti-IDOR]
    P08 --> P14[Phase 06.14: Refund & Restock Subsystems]
    P03 --> P15[Phase 06.15: Admin Operations & Audit]
    P14 --> P15
    P01 --> P16[Phase 06.16: Frontend Architecture & Client]
    P16 --> P17[Phase 06.17: UI/UX Editorial Design System]
    P10 --> P18[Phase 06.18: Observability & Logging]
    P18 --> P19[Phase 06.19: Test Suite & Concurrency Gates]
    P19 --> P20[Phase 06.20: Deployment Readiness]
```

### 3.1 Rationale for Topological Sequencing
1. **Environment & Infrastructure (06.1) $\rightarrow$ Migrations (06.2):** PostgreSQL connection pooling, UUID utilities, and configuration schemas must precede DDL execution.
2. **Migrations (06.2) $\rightarrow$ Auth (06.3) & Products (06.4):** User, session, and product models establish foreign keys for carts and inventory.
3. **Products (06.4) + Auth (06.3) $\rightarrow$ Cart (06.5):** Scoped carts require authenticated user UUIDs or guest session IDs, referencing active product rows.
4. **Cart (06.5) $\rightarrow$ Inventory Reservation (06.6) $\rightarrow$ Order Lifecycle (06.7):** Checkout initiation atomically locks products and transforms cart lines into immutable order items.
5. **Order Lifecycle (06.7) $\rightarrow$ Razorpay Integration (06.8) $\rightarrow$ Retries (06.9) $\rightarrow$ Webhooks (06.10):** Payment attempts require existing orders; webhooks process asynchronously to settle payment attempts and order states.
6. **Core Engine Complete $\rightarrow$ Frontend (06.16, 06.17):** The client interface binds against validated, authoritative REST contracts.
7. **End-to-End Verification (06.19) $\rightarrow$ Deployment Readiness (06.20):** Concurrency, security, and WCAG gates must pass before finalizing deployment artifacts.

---

## 4. Comprehensive Implementation Sequence

---

### Phase 06.1 — Repository & Environment Foundation

#### Objectives
Establish a modular monolithic repository structure, strict environment variable parsing and validation using Zod/Joi, structured JSON logging with correlation IDs, centralized error handling, and robust database connection pooling.

#### Technical Specifications
1. **Module System:** Strict ECMAScript Modules (`"type": "module"` in `package.json`).
2. **Configuration Validation:** Configuration loader (`src/config/env.js`) validates all environment variables upon process boot:
   - `PORT`: Network port (default `5000`).
   - `NODE_ENV`: `development` | `test` | `production`.
   - `DATABASE_URL`: PostgreSQL connection URI (`postgres://user:pass@host:5432/nexora_db`).
   - `DB_POOL_MIN` / `DB_POOL_MAX`: Integer bounds (min 2, max 20).
   - `SESSION_SECRET`: 256-bit cryptographically secure string for session signing.
   - `RAZORPAY_KEY_ID`: Razorpay Test Key (`rzp_test_...`).
   - `RAZORPAY_KEY_SECRET`: Razorpay Test Secret.
   - `RAZORPAY_WEBHOOK_SECRET`: HMAC-SHA256 Webhook signing secret.
   - `CORS_ORIGIN`: Allowed client origin URI (`http://localhost:5173` or production domain).
3. **Structured Logger (`src/utils/logger.js`):** Pino/Winston structured JSON logger with timestamp, log level, request correlation ID (`reqId`), and strict sensitive-data redaction.
4. **Correlation & Request ID Middleware (`src/middleware/requestId.js`):** Ingests `X-Request-ID` or generates a UUIDv4 via `crypto.randomUUID()`, attaching it to `req.id` and all downstream log contexts and response headers.
5. **Centralized Error Handling Architecture:**
   - Custom error hierarchy: `AppError`, `NotFoundError`, `ValidationError`, `ConflictError` (HTTP 409), `UnauthorizedError` (HTTP 401), `ForbiddenError` (HTTP 403), `IdempotencyConflictError` (HTTP 409/422).
   - Global Error Handler (`src/middleware/errorHandler.js`): Intercepts all unhandled rejections, sanitizes internal database/stack traces in non-development modes, and returns consistent JSON errors:
     ```json
     {
       "success": false,
       "error": {
         "code": "INSUFFICIENT_STOCK",
         "message": "One or more items in your cart are no longer available in the requested quantity.",
         "details": []
       },
       "requestId": "e4b1a8a2-2d1b-4f9e-a89c-3e1b7f8c9d0a"
     }
     ```

#### Verification & Exit Gate
- Application boots successfully under `NODE_ENV=development` and fails fast with clear error output when mandatory variables are missing.
- Structured logger outputs valid single-line JSON strings containing `requestId`.

---

### Phase 06.2 — PostgreSQL & Migration Foundation

#### Objectives
Construct and execute 11 deterministic, version-controlled Sequelize CLI SQL migrations defining the complete 14-table relational schema specified in `docs/05-BACKEND-SCHEMA-v1.0.md`.

> [!NOTE]
> The approved schema contains 14 logical tables/entities; the implementation migration sequence uses 11 migrations, with some migrations creating multiple related tables (e.g., `users` & `sessions`, `carts` & `cart_items`, `orders` & `order_items`, `audit_logs` & `stock_restock_logs`). Primary keys utilize standard UUIDv4 generated at the application tier via Node.js `crypto.randomUUID()` and native PostgreSQL `gen_random_uuid()` (built-in in PostgreSQL 13+).

#### Migration Execution Sequence
| Migration Number | Migration File Name | Affected Tables | Key Entities & Constraints |
|---|---|---|---|
| **001** | `001_initialize_schema.js` | Database Initialization | Verify PostgreSQL native UUID functions and create initial schema metadata. |
| **002** | `002_create_users_and_sessions.js` | `users`, `sessions` | Users table (UUID PK, unique email, role enum: `CUSTOMER`, `ADMIN`); Sessions table (opaque `VARCHAR(255)` PK, FK to Users ON DELETE CASCADE, `expires_at` index). |
| **003** | `003_create_products.js` | `products` | UUID PK, `stock_quantity`, `reserved_quantity`, `CHECK (reserved_quantity <= stock_quantity)`, `CHECK (stock_quantity >= 0)`, `CHECK (reserved_quantity >= 0)`, soft-delete `is_active` partial index. |
| **004** | `004_create_carts_and_cart_items.js` | `carts`, `cart_items` | `carts` (UUID PK, nullable `user_id`, `guest_session_id`, `CHECK ((user_id IS NOT NULL) OR (guest_session_id IS NOT NULL))`); `cart_items` (composite unique `(cart_id, product_id)`). |
| **005** | `005_create_addresses.js` | `addresses` | UUID PK, nullable `user_id`, normalized address fields (street, city, state, postal code, country, phone). |
| **006** | `006_create_orders_and_order_items.js` | `orders`, `order_items` | `orders` (UUID PK, order_number, status enum, `guest_token_hash`, payment_status, total_amount BIGINT); `order_items` (UUID PK, immutable `unit_price`, `product_name_snapshot`). |
| **007** | `007_create_inventory_reservations.js` | `inventory_reservations` | UUID PK, composite unique `(order_id, product_id)`, `expires_at`, status enum (`ACTIVE`, `CONVERTED`, `RELEASED`), index on `(status, expires_at)`. |
| **008** | `008_create_payment_attempts.js` | `payment_attempts` | UUID PK, `order_id` FK, `attempt_number`, `razorpay_order_id`, `razorpay_payment_id`, status enum (`INITIATED`, `SUCCESS`, `FAILED`, `REFUNDED`), partial unique index `uq_one_success_payment_per_order` WHERE `status = 'SUCCESS'`. |
| **009** | `009_create_payment_events.js` | `payment_events` | UUID PK, `event_id` unique (Razorpay Webhook ID), `event_type`, payload JSONB, `processing_status` enum (`RECEIVED`, `PROCESSING`, `PROCESSED`, `FAILED`, `REQUIRES_REFUND`, `IGNORED_DUPLICATE`). |
| **010** | `010_create_idempotency_records.js` | `idempotency_records` | UUID PK, composite unique `(idempotency_key, request_path)`, `request_payload_hash`, `status` (`IN_PROGRESS`, `COMPLETED`, `FAILED_RETRYABLE`), `response_body` JSONB, `expires_at`. |
| **011** | `011_create_audit_and_restock_logs.js` | `audit_logs`, `stock_restock_logs` | `audit_logs` (UUID PK, `action_type`, `entity_type`, `entity_id`, `actor_user_id`, `diff_payload` JSONB); `stock_restock_logs` (UUID PK, `product_id`, `quantity_added`, `restocked_by`, `reason`). |

#### Verification & Exit Gate
- Migrations apply cleanly (`npx sequelize-cli db:migrate`) and reverse cleanly (`npx sequelize-cli db:migrate:undo:all`) on PostgreSQL 15+.
- Check constraints reject negative stock and invalid reservations.

---

### Phase 06.3 — Authentication, Authorization & Session Management

#### Objectives
Implement enterprise-grade, stateful server-side session authentication with secure HTTP-only cookies (`__Host-nexora_sid`), Argon2id password hashing, explicit CSRF protection, and Role-Based Access Control (RBAC).

#### Technical Specifications
1. **Password Security (`src/modules/auth/auth.service.js`):**
   - Hashing: Argon2id (memory cost: 64MB, time cost: 3 iterations, parallelism: 1).
   - Password policy: Minimum 8 characters, at least 1 uppercase, 1 lowercase, 1 number, and 1 special character.
2. **Session Lifecycle (`src/modules/auth/session.store.js`):**
   - Session Key: 256-bit opaque crypto string (`crypto.randomBytes(32).toString('hex')`).
   - Storage: Direct PostgreSQL `sessions` table lookup.
   - Lifetime: Rolling 7-day expiration with idle refresh upon active authenticated requests.
   - Cookie Flags: `Name: __Host-nexora_sid`, `HttpOnly: true`, `Secure: true` (in production/HTTPS), `SameSite: Lax`, `Path: /`.
3. **Session Invalidation:**
   - Explicit logout permanently deletes session row from `sessions` table and clears client cookie.
   - Password reset/change invalidates all active sessions for that `user_id`.
4. **Explicit CSRF Defense Architecture (`src/middleware/csrf.js`):**
   - State-changing authenticated browser requests (`POST`, `PUT`, `PATCH`, `DELETE`) require:
     1. **Server-Generated CSRF Token:** Generated upon session initialization and refreshed periodically.
     2. **Non-HttpOnly CSRF Cookie (`nexora_csrf`):** Readable by client-side JavaScript (`SameSite=Lax`, `Secure=true` in production, `Path=/`).
     3. **Mandatory Header Verification:** Client reads `nexora_csrf` cookie and sends it via `X-CSRF-Token` header on state-mutating requests.
     4. **Backend Timing-Safe Comparison:** Compares header value with expected token in session context using `crypto.timingSafeEqual`.
     5. **Defense-in-Depth:** Complemented by `SameSite=Lax` on session cookies. The CSRF token is not a secret equivalent to the session identifier, while the session cookie remains strictly `HttpOnly`.
5. **Authorization Middleware (`src/middleware/auth.js`):**
   - `requireAuth`: Validates session validity and injects `req.user`.
   - `requireRole(role)`: Validates `req.user.role === 'ADMIN'` for administrative endpoints.
   - Sanitized Error Handling: Unauthenticated requests return generic HTTP 401 `{"error": "AUTHENTICATION_REQUIRED"}` without leaking user enumeration data.

#### Verification & Exit Gate
- Integration tests confirm session creation on login, rolling expiry update, 401 on expired session, and immediate invalidation on logout.
- Cookie headers verified for `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`.
- CSRF middleware rejects mutating requests missing `X-CSRF-Token` header.

---

### Phase 06.4 — Product & Catalog Domain

#### Objectives
Implement high-performance, paginated product catalog querying, category filtering, search, dynamic stock availability computation, and administrative CRUD operations meeting the approved performance requirements.

#### Technical Specifications
1. **Domain Model (`src/modules/products/product.model.js`):**
   - Fields: `id` (UUID), `sku`, `name`, `slug`, `description`, `price` (BIGINT in Paise), `category`, `stock_quantity`, `reserved_quantity`, `is_active`, `image_url`, `metadata`.
   - Virtual/Computed Property: `available_quantity = stock_quantity - reserved_quantity`.
2. **Public Catalog Query Engine (`src/modules/products/products.service.js`):**
   - Endpoint: `GET /api/products`.
   - Filters: `category`, `search` (trigram / `ILIKE` on name/description), `in_stock_only` (filters `(stock_quantity - reserved_quantity) > 0`).
   - Sorting: `price_asc`, `price_desc`, `newest`, `relevance`.
   - Pagination: Cursor-based or indexed offset-limit with hard cap (max 50 per page).
   - Partial Index Utilization: Queries hit `idx_products_active_category` for instant index scans.
   - Query Discipline: Zero N+1 queries. Eager loading and joins utilized where appropriate; query counts measured on critical endpoints.
3. **Product Detail Engine (`GET /api/products/:id` or `:slug`):**
   - Returns full product entity with real-time available stock count.
4. **Admin Product Management:**
   - `POST /api/admin/products`: Creates product with initial stock.
   - `PUT /api/admin/products/:id`: Updates product details (SKU, title, price, category).
   - `DELETE /api/admin/products/:id`: Performs soft-delete (`is_active = false`), ensuring existing historical order items referencing the product retain foreign key integrity.

#### Verification & Exit Gate
- Catalog queries measured to meet PRD target ($p95 < 200\text{ms}$ at 100 concurrent VUs).
- Soft-deleted products disappear from public catalog but remain intact in historical order queries.

---

### Phase 06.5 — Cart Domain

#### Objectives
Implement isolated, server-side authoritative shopping carts for both authenticated users and guest sessions, enforcing dynamic stock validation and server-computed monetary totals.

#### Technical Specifications
1. **Cart Ownership & Scoping (`src/modules/cart/cart.service.js`):**
   - Authenticated User: Cart bound to `user_id` ($1:1$).
   - Guest Session: Cart bound to `guest_session_id` ($1:1$).
   - Guest-to-User Merge: Upon user login, items in the guest cart are merged into the user's permanent cart, deduplicating line items by updating quantities up to available stock.
2. **Cart Endpoints:**
   - `GET /api/cart`: Retrieves active cart, computes line subtotals and authoritative grand total in Paise.
   - `POST /api/cart/items`: Adds product to cart. Validates `quantity <= available_quantity`. Returns updated cart.
   - `PATCH /api/cart/items/:itemId`: Updates line quantity. Re-evaluates stock limit.
   - `DELETE /api/cart/items/:itemId`: Removes item from cart.
   - `POST /api/cart/clear`: Flushes all items in cart.
3. **Authoritative Calculation Invariant:**
   - Subtotals and Grand Totals are strictly computed on the server from current `products.price`. Client-submitted totals are ignored.

#### Verification & Exit Gate
- Automated tests verify user/guest cart isolation, quantity update limits, and guest-to-user cart merging.

---

### Phase 06.6 — Inventory Reservation System & Concurrency Control

#### Objectives
Implement the mission-critical, ACID-compliant 2-phase checkout initiation engine (`POST /api/checkout/initiate`). Eliminate race conditions, ensure zero overselling, strictly isolate database locks from external network calls, and define comprehensive recovery semantics for gateway failures post-commit.

#### Detailed Transactional Execution Algorithm
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE A: DATABASE TRANSACTION BOUNDARY (Strictly Isolated, Fast Execution)   │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. BEGIN TRANSACTION (PostgreSQL Isolation: READ COMMITTED / REPEATABLE READ)│
│ 2. Extract item list from Cart or Checkout Payload.                        │
│ 3. Sort Product IDs deterministically (prevents DB deadlocks).              │
│ 4. Execute Row-Level Lock:                                                 │
│    SELECT id, stock_quantity, reserved_quantity, price, is_active, name      │
│    FROM products                                                            │
│    WHERE id IN (:sortedProductIds)                                          │
│    FOR UPDATE;                                                              │
│ 5. Validate Product State:                                                  │
│    - All products must exist and have is_active = true.                      │
│    - For every item: requested_quantity <= (stock_quantity - reserved_quantity)│
│    - If ANY item fails: ROLLBACK TRANSACTION & return HTTP 409 Conflict:     │
│      {"code": "INSUFFICIENT_STOCK", "productId": "...", "available": N}     │
│ 6. Apply Inventory Reservations:                                            │
│    UPDATE products                                                          │
│    SET reserved_quantity = reserved_quantity + :qty                         │
│    WHERE id = :productId;                                                  │
│ 7. Create Order:                                                            │
│    INSERT INTO orders (id, user_id, status, payment_status, total_amount,     │
│                        guest_token_hash, shipping_address_id)               │
│    VALUES (..., 'PENDING_PAYMENT', 'UNPAID', :calculatedTotal, ...);        │
│ 8. Create Order Items (Immutable Snapshots):                                │
│    INSERT INTO order_items (order_id, product_id, product_name_snapshot,    │
│                            unit_price, quantity, subtotal)                  │
│    VALUES (...);                                                            │
│ 9. Create Inventory Reservation Records:                                    │
│    INSERT INTO inventory_reservations (order_id, product_id, quantity,      │
│                                       status, expires_at)                   │
│    VALUES (:orderId, :productId, :qty, 'ACTIVE', NOW() + INTERVAL '15 MIN');│
│ 10. Create Initial PaymentAttempt Record:                                   │
│    INSERT INTO payment_attempts (order_id, attempt_number, status)          │
│    VALUES (:orderId, 1, 'INITIATED');                                       │
│ 11. COMMIT TRANSACTION (Releases row-level locks immediately, <10ms hold)   │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ (Transaction Committed & Locks Released)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE B: EXTERNAL GATEWAY CALL (Post-Commit Network Execution)              │
├─────────────────────────────────────────────────────────────────────────────┤
│ 12. Call Razorpay API:                                                      │
│     razorpay.orders.create({                                                │
│       amount: order.total_amount, // in Paise                               │
│       currency: "INR",                                                      │
│       receipt: order.id.toString(),                                         │
│       notes: { orderId: order.id }                                          │
│     })                                                                      │
│ 13. Update PaymentAttempt:                                                  │
│     UPDATE payment_attempts                                                 │
│     SET razorpay_order_id = :razorpayOrderId                                │
│     WHERE id = :paymentAttemptId;                                           │
│ 14. Return HTTP 201 Response to Client:                                     │
│     {                                                                       │
│       "orderId": "...",                                                     │
│       "orderNumber": "NEX-...",                                             │
│       "razorpayOrderId": "order_xyz123",                                    │
│       "amount": 299900,                                                     │
│       "currency": "INR",                                                    │
│       "reservationExpiresAt": "2026-09-06T11:15:00Z",                      │
│       "guestOrderToken": "raw_256bit_token" // (if guest checkout)          │
│     }                                                                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Gateway Failure & Timeout Recovery Post-Commit
When the external Razorpay Order creation API fails, returns an error, or times out AFTER the database transaction has committed:
1. **Order State:** The ecommerce `Order` remains in `PENDING_PAYMENT` state.
2. **Payment Attempt State:** The `PaymentAttempt` remains in `INITIATED` status (with a `null` or unconfirmed `razorpay_order_id`).
3. **Inventory Reservation:** The inventory reservation remains `ACTIVE` until its normal 15-minute TTL expires, unless explicitly released via an approved cancellation endpoint.
4. **Observability:** The network failure or gateway timeout is safely recorded in structured application logs with `requestId` and `orderId`, without logging secrets or payment credentials.
5. **Client Recovery & Retry:** The client receives an appropriate recoverable error (`GATEWAY_TIMEOUT` or `PAYMENT_INITIALIZATION_FAILED`) and can initiate a payment retry via `POST /api/checkout/:orderId/retry`.
6. **Retry Semantics:** A retry creates a **NEW** `PaymentAttempt` (attempt #2) and a **NEW** Razorpay Order ID while preserving the **SAME** ecommerce `Order`.
7. **Gateway Ambiguity Defense:** For ambiguous gateway timeouts, the system does not blindly create uncontrolled duplicate attempts; retries are governed by scoped idempotency keys.
8. **Authority Invariant:** The backend never marks an order as `PAID` based on frontend callbacks; payment authority rests strictly on verified webhook capture or authoritative backend reconciliation.

#### Concurrency Guarantee & Invariant Enforcement
- **Deadlock Prevention:** All product rows are locked in strict lexicographical UUID sort order (`ORDER BY id ASC`).
- **Zero Overselling Invariant:** Row-level `FOR UPDATE` serializes concurrent checkout requests. Under 10 simultaneous checkout requests for a single remaining stock item (`stock=1`), exactly 1 succeeds, and 9 receive HTTP 409.
- **Reservation Expiry Worker (`src/modules/inventory/reservation.worker.js`):** Periodic cleanup task executing atomic release:
  ```sql
  WITH expired_reservations AS (
    UPDATE inventory_reservations
    SET status = 'RELEASED'
    WHERE status = 'ACTIVE' AND expires_at < NOW()
    RETURNING order_id, product_id, quantity
  ),
  updated_products AS (
    UPDATE products p
    SET reserved_quantity = p.reserved_quantity - er.quantity
    FROM expired_reservations er
    WHERE p.id = er.product_id
  )
  UPDATE orders o
  SET status = 'EXPIRED'
  FROM expired_reservations er
  WHERE o.id = er.order_id AND o.status = 'PENDING_PAYMENT';
  ```

#### Verification & Exit Gate
- Mandatory concurrency test suite: 10 parallel threads attempting checkout on a single inventory unit (`stock = 1`). Expected result: 1 HTTP 201 Created, 9 HTTP 409 Conflict.
- Checkout initiation latency verified against PRD target ($p95 < 300\text{ms}$).

---

### Phase 06.7 — Order Lifecycle Engine

#### Objectives
Implement the finite state machine governing order transitions, immutable order item snapshots, customer order history retrieval, and audit logging.

#### Order Finite State Machine (FSM)
```mermaid
stateDiagram-v2
    [*] --> PENDING_PAYMENT : Checkout Initiated (15m TTL)
    PENDING_PAYMENT --> PAID : Authoritative Payment Capture
    PENDING_PAYMENT --> CANCELLED : Customer / Admin Cancellation
    PENDING_PAYMENT --> EXPIRED : 15m Reservation TTL Expired
    
    PAID --> PROCESSING : Fulfillment Initiated (Separate System Step)
    PROCESSING --> SHIPPED : Fulfillment Dispatched
    SHIPPED --> DELIVERED : Delivery Confirmed
    
    PAID --> REFUNDED : Admin Full Refund
    PROCESSING --> REFUNDED : Admin Full Refund
    SHIPPED --> REFUNDED : Admin Full Refund (Returned Item)
    
    EXPIRED --> [*]
    CANCELLED --> [*]
    DELIVERED --> [*]
    REFUNDED --> [*]
```

#### State Transition Matrix & Side Effects
| From State | To State | Permitted Actor | Required Side Effect / Action |
|---|---|---|---|
| `PENDING_PAYMENT` | `PAID` | Webhook / Reconciliation | Set `payment_status = 'PAID'`. Convert `inventory_reservations` to `CONVERTED`. Decrement `products.stock_quantity` and `products.reserved_quantity` atomically. |
| `PENDING_PAYMENT` | `EXPIRED` | System Worker | Set `inventory_reservations = 'RELEASED'`. Decrement `products.reserved_quantity`. |
| `PENDING_PAYMENT` | `CANCELLED` | Customer / Admin | Set `inventory_reservations = 'RELEASED'`. Decrement `products.reserved_quantity`. |
| `PAID` | `PROCESSING` | Admin / Fulfillment | Initiate warehouse picking and packaging (distinct fulfillment transition). |
| `PROCESSING` | `SHIPPED` | Admin | Assign tracking carrier and tracking number. |
| `SHIPPED` | `DELIVERED` | Admin / Carrier | Record delivery timestamp. |
| `PAID` / `PROCESSING` | `REFUNDED` | Admin | Call Razorpay Refund API. Set `orders.status = 'REFUNDED'`, `payment_attempts.status = 'REFUNDED'`. **DO NOT modify product stock.** |

#### Verification & Exit Gate
- State machine validator rejects illegal transitions (e.g., `EXPIRED` $\rightarrow$ `SHIPPED` throws `InvalidStateTransitionError`).
- Order item queries return immutable price snapshots regardless of subsequent product price modifications.

---

### Phase 06.8 — Razorpay Test-Mode Integration

#### Objectives
Integrate the official Razorpay Node.js SDK for backend order creation and signature verification. Connect frontend Razorpay Checkout modal without handling raw card credentials.

#### Technical Specifications
1. **Server-Side Credentials Management:**
   - `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` loaded exclusively into server memory via `env.js`.
   - Client receives *only* the public `keyId` in checkout configuration payloads.
2. **Payment Verification Service (`src/modules/payments/payments.service.js`):**
   - Signature Verification Algorithm:
     $$\text{expectedSignature} = \text{HMAC-SHA256}(\text{razorpay\_order\_id} + "|" + \text{razorpay\_payment\_id}, \text{RAZORPAY\_KEY\_SECRET})$$
   - Timing-Safe Comparison: Evaluated via `crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(receivedSignature))`.
3. **Data Minimization & PCI DSS Compliance:**
   - Nexora backend and frontend NEVER ingest or store card numbers, expiration dates, CVVs, or UPI PINs.
   - Signatures are verified in-memory and discarded.

#### Verification & Exit Gate
- Automated tests verify valid HMAC signature acceptance and invalid signature rejection using timing-safe comparisons.

---

### Phase 06.9 — Payment Attempt & Retry Architecture

#### Objectives
Implement the $1:N$ `Order` to `PaymentAttempt` architecture, enabling seamless payment retries on existing orders with new Razorpay orders while enforcing single-success constraints.

#### Technical Specifications
1. **Retry Endpoint Execution Sequence (`POST /api/checkout/:orderId/retry`):**
   ```
   1. BEGIN DB Transaction
   2. Validate existing ecommerce Order:
      - Order must exist and have status = 'PENDING_PAYMENT'.
      - Assert zero existing PaymentAttempts on this order have status = 'SUCCESS'.
   3. Validate active inventory reservation:
      - Assert NOW() < inventory_reservations.expires_at.
   4. Create new PaymentAttempt record:
      - attempt_number = max(attempt_number) + 1
      - status = 'INITIATED'
      - order_id = order.id
   5. COMMIT DB Transaction (Releases DB locks immediately)
   6. Call Razorpay API externally:
      - razorpay.orders.create({ amount: order.total_amount, currency: "INR", ... })
   7. Update PaymentAttempt:
      - UPDATE payment_attempts SET razorpay_order_id = :newRazorpayOrderId WHERE id = :attemptId
   8. Return new payment initialization data to frontend
   ```
2. **Critical Architectural Invariant:**
   $$\text{NEW PaymentAttempt} + \text{NEW Razorpay Order} + \text{SAME Ecommerce Order}$$
3. **Partial Unique Constraint Invariant:**
   - PostgreSQL partial index `uq_one_success_payment_per_order` (`CREATE UNIQUE INDEX uq_one_success_payment_per_order ON payment_attempts (order_id) WHERE status = 'SUCCESS';`) guarantees at the database engine level that no order can ever have multiple successful payment attempts.

#### Verification & Exit Gate
- Retry test suite verifies multiple `PaymentAttempt` rows linked to a single `order_id`. Second successful payment attempt on the same order triggers a database unique constraint violation.

---

### Phase 06.10 — Razorpay Webhook Reconciliation

#### Objectives
Implement an enterprise-grade, idempotent webhook processing pipeline (`POST /api/webhooks/razorpay`) with raw body signature verification and strict state transition handling.

#### Technical Specifications
1. **Raw Request Body Ingestion (`src/middleware/rawBody.js`):**
   - Capture `req.rawBody` buffer before JSON body parser modifies or normalizes payload formatting.
2. **Webhook Signature Verification:**
   - Compute `HMAC-SHA256(req.rawBody, RAZORPAY_WEBHOOK_SECRET)`.
   - Verify against `x-razorpay-signature` using `crypto.timingSafeEqual`. Reject mismatches with HTTP 400.
3. **Webhook Event Processing Pipeline:**
   ```mermaid
   graph TD
       A[POST /api/webhooks/razorpay] --> B{HMAC-SHA256 Signature Valid?}
       B -- No --> C[HTTP 400 Bad Request & Log Warning]
       B -- Yes --> D[Check event_id in payment_events]
       D -- Exists & PROCESSED --> E[HTTP 200 OK - IGNORED_DUPLICATE]
       D -- New Event --> F[Insert payment_events with status = 'RECEIVED']
       F --> G[Update status = 'PROCESSING']
       G --> H{Event Type}
       H -- payment.captured --> I[Reconcile Payment & Order: Set Order PAID]
       H -- payment.failed --> J[Mark PaymentAttempt FAILED]
       H -- refund.processed --> K[Mark PaymentAttempt & Order REFUNDED]
       I --> L[Update status = 'PROCESSED' & Commit]
       L --> M[HTTP 200 OK Response]
   ```
4. **Deduplication Invariant:**
   - Webhook `event_id` is unique in `payment_events`. Duplicate webhooks return HTTP 200 immediately with zero redundant business logic execution.

#### Verification & Exit Gate
- Duplicate webhook test sends identical `payment.captured` payload 3 times; only first execution modifies order/inventory, subsequent 2 return HTTP 200 `IGNORED_DUPLICATE`.
- Webhook processing latency verified against PRD target ($p95 < 150\text{ms}$).

---

### Phase 06.11 — Late Payment Reconciliation

#### Objectives
Implement the specialized financial reconciliation workflow handling late captured payments arriving after order reservation expiration without corrupting inventory or order state.

#### Detailed Late Capture Reconciliation Flow
```
SCENARIO: Customer completes payment on Razorpay gateway after 15-minute reservation expires.
1. System reservation worker has already marked order = EXPIRED and released reserved stock.
2. Razorpay webhook arrives: event = 'payment.captured'.
3. Webhook handler finds order.status === 'EXPIRED'.
4. EXECUTION RULES:
   a. UPDATE payment_attempts SET status = 'SUCCESS', razorpay_payment_id = :paymentId.
   b. DO NOT change order.status (Order remains 'EXPIRED').
   c. DO NOT decrement product stock_quantity (Inventory remains untouched).
   d. UPDATE payment_events SET processing_status = 'REQUIRES_REFUND'.
   e. INSERT INTO audit_logs (action_type: 'LATE_PAYMENT_CAPTURED', details: { orderId, amount, paymentId }).
5. Reconciliation & Refund Workflow:
   - Late capture is flagged for reconciliation.
   - Verified refund execution dispatches Razorpay Refund API call:
     razorpay.payments.refund(paymentId, { amount, notes: { reason: "Order expired before capture" } })
   - Upon confirmation: UPDATE payment_attempts SET status = 'REFUNDED'.
   - UPDATE payment_events SET processing_status = 'PROCESSED'.
```

#### Verification & Exit Gate
- Late capture test simulates `payment.captured` on `EXPIRED` order: verifies `payment_attempts.status === 'SUCCESS'`, `orders.status === 'EXPIRED'`, inventory count unchanged, and `payment_events.processing_status === 'REQUIRES_REFUND'`.

---

### Phase 06.12 — API Idempotency Engine

#### Objectives
Implement enterprise API idempotency middleware (`src/middleware/idempotency.js`) scoped strictly by `(idempotency_key, request_path)` to ensure safe client retries on mutating endpoints (`POST /api/checkout/initiate`, `POST /api/checkout/:orderId/retry`, `POST /api/admin/refunds`).

#### Technical Specifications
1. **Header Identification:** `Idempotency-Key` (UUIDv4 or client string, max 255 chars).
2. **Storage Entity (`idempotency_records`):**
   - Columns: `id`, `idempotency_key`, `request_path`, `request_payload_hash` (SHA-256 of request body), `status` (`IN_PROGRESS`, `COMPLETED`, `FAILED_RETRYABLE`), `response_status_code`, `response_body` (JSONB), `expires_at` (NOW() + 24 hours).
   - Uniqueness: `UNIQUE (idempotency_key, request_path)`.
3. **Execution Semantics:**
   - `IN_PROGRESS` detected: Return HTTP 409 Conflict (`"Request with this idempotency key is currently processing"`).
   - `COMPLETED` detected with matching hash: Replay cached HTTP status code and response payload with header `X-Cache: Idempotency-Hit`.
   - `COMPLETED` detected with differing hash: Return HTTP 422 Unprocessable Entity (`"Idempotency key reused with different request payload"`).

#### Verification & Exit Gate
- Idempotent request test verifies exact response replay on identical retry and 422 rejection on payload mismatch.

---

### Phase 06.13 — Guest Order Security & Anti-IDOR Subsystem

#### Objectives
Implement zero-trust security controls for guest checkout orders, preventing Insecure Direct Object References (IDOR) and guest token harvesting.

#### Technical Specifications
1. **Cryptographic Token Architecture:**
   - Generation: 256-bit cryptographically secure random token (`crypto.randomBytes(32).toString('hex')`).
   - Storage at Rest: SHA-256 hash of token stored in `orders.guest_token_hash`. The plaintext token is NEVER stored in database or logged.
   - Delivery: Returned *once* in response body of `POST /api/checkout/initiate`.
2. **Guest Order Access Middleware (`src/middleware/guestAuth.js`):**
   - Header Requirement: `X-Guest-Order-Token: <raw_256bit_token>`.
   - Verification Algorithm:
     ```javascript
     const incomingHash = crypto.createHash('sha256').update(rawToken).digest('hex');
     const isValid = crypto.timingSafeEqual(
       Buffer.from(incomingHash, 'utf8'),
       Buffer.from(order.guest_token_hash, 'utf8')
     );
     if (!isValid) throw new UnauthorizedError('INVALID_GUEST_ORDER_TOKEN');
     ```
3. **Anti-IDOR Enforcement:**
   - `GET /api/orders/:orderId`:
     - If authenticated: Asserts `order.user_id === req.user.id` or `req.user.role === 'ADMIN'`.
     - If guest: Asserts valid `X-Guest-Order-Token` matching `order.guest_token_hash`.
     - Unauthorized access returns generic HTTP 404 Not Found (prevents order existence enumeration).

#### Verification & Exit Gate
- IDOR penetration test asserts HTTP 404 when querying another user's or guest's order ID without valid credentials.

---

### Phase 06.14 — Refund & Restock Subsystems

#### Objectives
Implement administrative refund processing via Razorpay API and explicit physical restock tracking, strictly enforcing the $\text{REFUND} \neq \text{RESTOCK}$ domain invariant.

#### Technical Specifications
1. **Administrative Refund Endpoint (`POST /api/admin/orders/:orderId/refund`):**
   - Validates `order.status IN ('PAID', 'PROCESSING', 'SHIPPED')` and `payment_status = 'PAID'`.
   - Calls Razorpay Refund API: `razorpay.payments.refund(paymentAttempt.razorpay_payment_id, { amount })`.
   - Updates `payment_attempts.status = 'REFUNDED'`, `orders.status = 'REFUNDED'`, `orders.payment_status = 'REFUNDED'`.
   - Logs audit event to `audit_logs`.
   - **STRICT INVARIANT:** Product `stock_quantity` is NOT incremented.
2. **Explicit Restock Endpoint (`POST /api/admin/inventory/restock`):**
   - Used when physical returned merchandise is inspected and approved for resale.
   - Payload: `{ "productId": "...", "quantity": N, "reason": "CUSTOMER_RETURN_INSPECTED" }`.
   - Atomically increments `products.stock_quantity = stock_quantity + N`.
   - Creates immutable entry in `stock_restock_logs`.

#### Verification & Exit Gate
- Refund test asserts order marked `REFUNDED` while product `stock_quantity` remains unchanged. Restock test asserts stock increment accompanied by `stock_restock_logs` row.

---

### Phase 06.15 — Admin Operations & RBAC

#### Objectives
Implement secure administrative management endpoints for catalog control, order fulfillment, refund execution, and audit log inspection protected by strict role-based access control.

#### Technical Specifications
1. **RBAC Guard (`src/middleware/rbac.js`):**
   - Asserts `req.user && req.user.role === 'ADMIN'`. Unauthorized requests return HTTP 403 Forbidden.
2. **Admin Endpoints:**
   - `GET /api/admin/orders`: Paginated list of all system orders with multi-parameter filtering (status, date range, customer).
   - `PATCH /api/admin/orders/:orderId/status`: Advances order state (`PROCESSING` $\rightarrow$ `SHIPPED` $\rightarrow$ `DELIVERED`).
   - `POST /api/admin/orders/:orderId/refund`: Executes full/partial refund.
   - `POST /api/admin/inventory/restock`: Restocks inventory with audit trail.
   - `GET /api/admin/audit-logs`: Queries immutable operational audit log trail.

#### Verification & Exit Gate
- Security test confirms standard `CUSTOMER` accounts receive HTTP 403 on all `/api/admin/*` routes.

---

### Phase 06.16 — Frontend Architecture & Client Integration

#### Objectives
Construct the production React 18+ SPA using Vite, organized around clean domain feature modules, robust centralized API client with CSRF/session handling, global state providers, and error boundary protection meeting the $<200\text{KB}$ gzipped initial bundle target.

#### Frontend Architecture Directory Structure
```
frontend/src/
├── app/
│   ├── App.jsx                     # Root application component with Providers
│   ├── routes.jsx                  # Declarative React Router DOM v6 route tree
│   └── main.jsx                    # Application bootstrapping & DOM mounting
├── assets/                         # Static icons, logos, brand typography assets
├── components/                     # Shared Atomic Design System UI components
│   ├── Button/                     # Accessible button with loading/variant states
│   ├── Input/                      # Form inputs with validation and error states
│   ├── Modal/                      # Focus-trapped, accessible modal dialogs
│   ├── Toast/                      # Non-intrusive notification toast queue
│   ├── Skeleton/                   # Content placeholder skeletons for loading states
│   └── Layout/                     # Navigation header, footer, container grid
├── context/                        # Global Context Providers
│   ├── AuthContext.jsx             # Session bootstrap, user profile, login/logout
│   ├── CartContext.jsx             # Cart items, optimistic updates, drawer state
│   └── ToastContext.jsx            # System notification dispatch and queue
├── features/                       # Domain-Driven Feature Modules
│   ├── auth/                       # Login modal, registration form, password rules
│   ├── catalog/                    # Product grid, filters, sorting, search bar
│   ├── product-detail/             # PDP gallery, stock availability badge, add-to-cart
│   ├── cart/                       # Cart drawer, quantity modifiers, line item pricing
│   ├── checkout/                   # Address step, 2-phase checkout, Razorpay launcher
│   ├── orders/                     # Order confirmation, history, detail view
│   ├── guest-tracking/             # Guest order tracking form with header auth
│   └── admin/                      # Admin dashboard, order fulfillment, restock tool
├── hooks/                          # Custom React Hooks
│   ├── useAuth.js                  # Auth state consumer hook
│   ├── useCart.js                  # Cart state consumer hook
│   ├── useDebounce.js              # Input search debounce hook
│   └── useRazorpay.js              # Razorpay Checkout SDK loader & modal trigger
├── lib/
│   ├── apiClient.js                # Centralized Axios/Fetch client with interceptors
│   └── formatters.js               # INR currency (Paise / 100) & date formatters
└── styles/
    ├── tokens.css                  # CSS custom properties (color, spacing, typography)
    ├── typography.css              # Editorial font scales & font-face imports
    └── global.css                  # Base resets, focus outlines, animations
```

#### Verification & Exit Gate
- Frontend builds with zero TypeScript/ESLint warnings (`npm run build`). Initial JS bundle verified $<200\text{KB}$ gzipped. Clean route transitions with zero layout shift.

---

### Phase 06.17 — UI/UX Implementation (Architectural Editorial Design System)

#### Objectives
Translate `docs/04-UI-UX-DESIGN-BRIEF-v1.0.md` into concrete, accessible Vanilla CSS design tokens and component styles adhering strictly to the Warm Neutral Architectural Editorial Commerce direction.

#### Design Tokens (`src/styles/tokens.css`)
```css
:root {
  /* Color Palette - Warm Neutral Editorial */
  --color-canvas-primary: #F8F5F0;    /* Warm Alabaster Canvas */
  --color-canvas-secondary: #EFEBE4;  /* Warm Sand Surface */
  --color-surface-card: #FFFFFF;      /* Clean Elevated Card */
  --color-text-primary: #1A1918;      /* Deep Onyx Charcoal */
  --color-text-secondary: #5C5852;    /* Warm Muted Olive/Gray */
  --color-border-subtle: #D8D2C7;     /* Architectural Border */
  --color-accent-terracotta: #A84B2C; /* Editorial Terracotta Accent */
  --color-status-success: #2D5A3C;    /* Forest Green */
  --color-status-error: #8B2522;      /* Brick Red */
  --color-status-warning: #9A6818;    /* Warm Amber */

  /* Typography */
  --font-serif-display: "Playfair Display", Georgia, serif;
  --font-sans-body: "Plus Jakarta Sans", -apple-system, sans-serif;
  --font-mono-data: "JetBrains Mono", monospace;

  /* Spacing & Grid (8pt Grid) */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
  --space-16: 64px;

  /* Motion & Transitions */
  --ease-editorial: cubic-bezier(0.16, 1, 0.3, 1);
  --duration-fast: 150ms;
  --duration-medium: 300ms;
}
```

#### Accessibility Standards & Invariants
- **WCAG 2.1 AA Compliance:** Minimum 4.5:1 text-to-background contrast ratio across all elements.
- **Keyboard Navigation:** High-visibility focus indicators (`outline: 2px solid var(--color-accent-terracotta); outline-offset: 2px`).
- **Touch Target Size:** Minimum $44 \times 44\text{px}$ touch targets on all mobile interactive controls.
- **Reduced Motion Support:** `@media (prefers-reduced-motion: reduce)` disables non-essential animations.

#### Verification & Exit Gate
- Automated Axe accessibility scan must pass with zero critical/serious violations on all primary views.

---

### Phase 06.18 — Observability, Logging & Auditing

#### Objectives
Establish structured JSON logging, metrics instrumentation, correlation ID propagation, and an immutable security audit trail while enforcing strict sensitive-data redaction and PII minimization.

#### Technical Specifications
1. **Sensitive Data Redaction Blacklist (`src/utils/redact.js`):**
   - The logger automatically redacts the following keys from all logs:
     `password`, `sessionSecret`, `cookie`, `__Host-nexora_sid`, `guestToken`, `guest_token_hash`, `razorpay_key_secret`, `razorpay_signature`, `x-razorpay-signature`, `cvv`, `cardNumber`, `pin`.
2. **Authentication Failure PII Minimization:**
   - Authentication failure logs must avoid plaintext email PII; use a normalized non-reversible identifier/hash only when correlation is operationally necessary.
3. **Operational Metrics Collection:**
   - `http_request_duration_ms`: Latency histogram partitioned by method, route, and status.
   - `db_query_duration_ms`: Sequelize execution timer.
   - `inventory_conflict_count`: Counter incremented on HTTP 409 checkout failures.
   - `webhook_processing_duration_ms`: Duration of webhook handler execution.
4. **Audit Log Architecture (`audit_logs` table):**
   - Records every administrative state change, refund, restock, and security violation with actor ID, timestamp, entity reference, and JSON diff payload.

#### Verification & Exit Gate
- Log inspection verification confirms that authorization headers, cookies, passwords, and webhook signatures are masked as `[REDACTED]`, with zero plaintext email addresses in auth failure logs.

---

### Phase 06.19 — Testing Strategy & Verification Suite

#### Objectives
Execute a rigorous multi-tier test suite validating domain logic, concurrency safety, payment flows, webhook deduplication, security boundaries, and performance targets.

#### Planned Test Verification Matrix
```
TEST SUITE MATRIX (Execution Targets for Phase 07+)
├── Unit Tests (Jest / Vitest)
│   ├── [REQUIRED] Money representation calculations (Paise integrity)
│   ├── [REQUIRED] Inventory availability arithmetic (stock - reserved)
│   ├── [REQUIRED] Password hashing & validation rules (Argon2id)
│   ├── [REQUIRED] Guest token SHA-256 generation & timing-safe equality
│   └── [REQUIRED] Idempotency payload hashing & validation
├── Integration Tests (Supertest + Real PostgreSQL)
│   ├── [REQUIRED] User registration, session creation, rolling expiry, logout
│   ├── [REQUIRED] Product catalog querying, category filtering, search (no N+1)
│   ├── [REQUIRED] Cart scoping, line updates, guest cart merging
│   ├── [REQUIRED] 2-Phase checkout initiation (Phase A commit + Phase B mock)
│   ├── [REQUIRED] Payment retry on existing order with new attempt
│   ├── [REQUIRED] Webhook signature verification & event deduplication
│   ├── [REQUIRED] Late payment capture handling (Attempt SUCCESS, Order EXPIRED, REQUIRES_REFUND)
│   ├── [REQUIRED] Admin refund without stock increase & separate physical restock
│   └── [REQUIRED] Guest order lookup with X-Guest-Order-Token header
├── Concurrency Test (Mandatory Gate)
│   └── [REQUIRED] 10 concurrent requests for 1 stock unit -> Exactly 1 HTTP 201, Exactly 9 HTTP 409
├── Security Penetration Suite
│   ├── [REQUIRED] Anti-IDOR: Cross-user order lookup returns 404
│   ├── [REQUIRED] RBAC: Non-admin rejected from /api/admin/* with 403
│   ├── [REQUIRED] CSRF: Mutating requests without valid X-CSRF-Token rejected
│   └── [REQUIRED] SQL Injection: Parameterized Sequelize queries reject payloads
└── Accessibility & Performance
    ├── [REQUIRED] Axe Core automated WCAG 2.1 AA scan
    └── [REQUIRED] Autocannon load test: Products p95 < 200ms @ 100 VUs, Checkout p95 < 300ms, Webhook p95 < 150ms
```

#### Verification & Exit Gate
- Implementation must achieve 100% pass across all unit, integration, concurrency, security, and performance test suites.

---

### Phase 06.20 — Deployment Readiness & Production Configuration

#### Objectives
Establish containerized deployment assets, production process management, health check endpoints, automated migration runners, and production environment validation.

#### Technical Specifications
1. **Health Check Endpoints (`src/routes/health.routes.js`):**
   - `GET /api/health/liveness`: Returns HTTP 200 `{"status": "ok"}` indicating Node.js event loop responsiveness.
   - `GET /api/health/readiness`: Executes `SELECT 1;` on PostgreSQL connection pool. Returns HTTP 200 if database is healthy, HTTP 503 if unreachable.
2. **Process Management & Graceful Shutdown:**
   - Intercepts `SIGTERM` and `SIGINT`.
   - Stops accepting new HTTP connections, waits up to 10s for in-flight requests to complete, drains Sequelize connection pool, and exits with code 0.
3. **Database Migration Runner (`scripts/migrate.js`):**
   - Production entrypoint runs `sequelize-cli db:migrate` prior to initiating Express listener.
4. **HTTPS & Security Header Hardening:**
   - Helmet.js configured with strict Content-Security-Policy (CSP), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security: max-age=31536000; includeSubDomains`.

#### Verification & Exit Gate
- Container builds cleanly. Liveness and readiness endpoints respond with HTTP 200 in staging environment.

---

## 5. File-Level Implementation Map

The following proposed project file tree designates the exact operational status (`CREATE`, `MODIFY`, `REPLACE`, `REMOVE`, `KEEP`) for every module across the repository.

```
REPO ROOT /
├── backend/
│   ├── package.json                         --> MODIFY (Update dependencies: pg, sequelize, argon2, razorpay, pino)
│   ├── .env.example                         --> CREATE (Template of all required production environment variables)
│   ├── src/
│   │   ├── app.js                           --> REPLACE (Express app initialization with Helmet, CORS, Middleware)
│   │   ├── server.js                        --> REPLACE (HTTP server listener with graceful shutdown logic)
│   │   ├── config/
│   │   │   ├── env.js                       --> CREATE (Zod/Joi environment variable validation loader)
│   │   │   ├── database.js                  --> CREATE (Sequelize PostgreSQL configuration & connection pool)
│   │   │   └── razorpay.js                  --> CREATE (Razorpay SDK client instance initialization)
│   │   ├── db/
│   │   │   ├── index.js                     --> CREATE (Sequelize instance & model association registry)
│   │   │   ├── migrations/                  --> CREATE (11 versioned Sequelize CLI migration files)
│   │   │   │   ├── 001_initialize_schema.js
│   │   │   │   ├── 002_create_users_and_sessions.js
│   │   │   │   ├── 003_create_products.js
│   │   │   │   ├── 004_create_carts_and_cart_items.js
│   │   │   │   ├── 005_create_addresses.js
│   │   │   │   ├── 006_create_orders_and_order_items.js
│   │   │   │   ├── 007_create_inventory_reservations.js
│   │   │   │   ├── 008_create_payment_attempts.js
│   │   │   │   ├── 009_create_payment_events.js
│   │   │   │   ├── 010_create_idempotency_records.js
│   │   │   │   └── 011_create_audit_and_restock_logs.js
│   │   │   └── seeders/
│   │   │       └── 20260906_initial_products_and_admin.js --> CREATE (Seeder for catalog & admin account)
│   │   ├── middleware/
│   │   │   ├── auth.js                      --> CREATE (Session validation & req.user injection)
│   │   │   ├── rbac.js                      --> CREATE (Role-based access control guard)
│   │   │   ├── guestAuth.js                 --> CREATE (X-Guest-Order-Token SHA-256 header validation)
│   │   │   ├── csrf.js                      --> CREATE (Double-submit cookie + X-CSRF-Token verification)
│   │   │   ├── idempotency.js               --> CREATE (Scoped idempotency caching & replay middleware)
│   │   │   ├── rateLimiter.js               --> CREATE (Express-rate-limit configuration for public/auth routes)
│   │   │   ├── rawBody.js                   --> CREATE (Raw buffer capture for webhook HMAC verification)
│   │   │   ├── requestId.js                 --> CREATE (UUIDv4 correlation ID injection)
│   │   │   └── errorHandler.js              --> CREATE (Centralized error handler & JSON response sanitizer)
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   │   ├── auth.controller.js       --> CREATE (Register, login, logout, get current session)
│   │   │   │   ├── auth.service.js          --> CREATE (Argon2id hashing, session creation & invalidation)
│   │   │   │   ├── auth.routes.js           --> CREATE (Authentication Express router)
│   │   │   │   └── user.model.js            --> CREATE (User Sequelize model)
│   │   │   ├── products/
│   │   │   │   ├── products.controller.js   --> CREATE (Catalog list, PDP, admin CRUD)
│   │   │   │   ├── products.service.js      --> CREATE (Filtered search, availability calculations, no N+1)
│   │   │   │   ├── products.routes.js       --> CREATE (Product Express router)
│   │   │   │   └── product.model.js         --> REPLACE (Product model with reserved_quantity & checks)
│   │   │   ├── cart/
│   │   │   │   ├── cart.controller.js       --> CREATE (Get cart, add, update, remove items)
│   │   │   │   ├── cart.service.js          --> CREATE (Authoritative totals, stock checks, guest merge)
│   │   │   │   ├── cart.routes.js           --> CREATE (Cart Express router)
│   │   │   │   ├── cart.model.js            --> CREATE (Cart Sequelize model)
│   │   │   │   └── cartItem.model.js        --> REPLACE (CartItem model with composite uniqueness)
│   │   │   ├── inventory/
│   │   │   │   ├── reservation.service.js   --> CREATE (2-Phase lock, reserve, release, convert engine)
│   │   │   │   ├── reservation.worker.js    --> CREATE (Periodic cleanup releasing expired 15-min reservations)
│   │   │   │   └── reservation.model.js     --> CREATE (InventoryReservation Sequelize model)
│   │   │   ├── orders/
│   │   │   │   ├── orders.controller.js     --> CREATE (Checkout initiation, order retrieval, guest lookup)
│   │   │   │   ├── orders.service.js        --> CREATE (Order creation, FSM transitions, immutable snapshots)
│   │   │   │   ├── orders.routes.js         --> REPLACE (Order Express router)
│   │   │   │   ├── order.model.js           --> REPLACE (Relational Order model)
│   │   │   │   └── orderItem.model.js       --> CREATE (OrderItem model with immutable price snapshots)
│   │   │   ├── payments/
│   │   │   │   ├── payments.controller.js   --> CREATE (Payment retry, manual reconciliation)
│   │   │   │   ├── payments.service.js      --> CREATE (Razorpay SDK wrapper, signature verifier)
│   │   │   │   ├── payments.routes.js       --> REPLACE (Payments Express router)
│   │   │   │   └── paymentAttempt.model.js  --> CREATE (PaymentAttempt Sequelize model)
│   │   │   ├── webhooks/
│   │   │   │   ├── webhooks.controller.js   --> CREATE (Razorpay webhook endpoint handler)
│   │   │   │   ├── webhooks.service.js      --> CREATE (HMAC verification, event deduplication, late capture)
│   │   │   │   ├── webhooks.routes.js       --> CREATE (Webhook Express router with rawBody middleware)
│   │   │   │   └── paymentEvent.model.js    --> CREATE (PaymentEvent Sequelize model)
│   │   │   └── admin/
│   │   │       ├── admin.controller.js      --> CREATE (Admin order management, refund, restock)
│   │   │       ├── admin.service.js         --> CREATE (Razorpay refund dispatch, restock log creation)
│   │   │       ├── admin.routes.js          --> CREATE (Protected Admin Express router)
│   │   │       ├── auditLog.model.js        --> CREATE (AuditLog Sequelize model)
│   │   │       └── stockRestockLog.model.js --> CREATE (StockRestockLog Sequelize model)
│   │   └── utils/
│   │       ├── logger.js                    --> CREATE (Pino structured logger with redaction & PII minimization)
│   │       ├── errors.js                    --> CREATE (Custom HTTP AppError classes)
│   │       └── money.js                     --> CREATE (Paise-to-Rupee utility functions)
│   └── tests/
│       ├── unit/                            --> CREATE (Unit test suites for models & utils)
│       ├── integration/                     --> CREATE (Integration test suites for API routes)
│       └── concurrency/                     --> CREATE (10-to-1 concurrency test script)
└── frontend/
    ├── package.json                         --> MODIFY (Update dependencies: lucide-react, axios)
    ├── vite.config.js                       --> MODIFY (Configure API proxy & build optimization)
    ├── index.html                           --> MODIFY (Set editorial typography & meta viewport)
    └── src/
        ├── app/
        │   ├── App.jsx                      --> REFACTOR (Global providers & layout shell)
        │   ├── routes.jsx                   --> CREATE (React Router configuration)
        │   └── main.jsx                     --> MODIFY (Bootstrap React 18 createRoot)
        ├── styles/
        │   ├── tokens.css                   --> CREATE (Nexora Warm Neutral design tokens)
        │   ├── typography.css               --> CREATE (Playfair Display & Plus Jakarta Sans rules)
        │   └── global.css                   --> REPLACE (Base resets & accessibility styles)
        ├── components/
        │   ├── Button/                      --> CREATE (Accessible button component)
        │   ├── Input/                       --> CREATE (Form inputs with validation feedback)
        │   ├── Modal/                       --> CREATE (Focus-trapped accessible dialogs)
        │   ├── Toast/                       --> CREATE (Toast container & alerts)
        │   └── Layout/                      # Header, Footer, Navigation Drawer
        ├── context/
        │   ├── AuthContext.jsx              --> CREATE (Session state, login, logout)
        │   ├── CartContext.jsx              --> CREATE (Cart items, optimistic updates, drawer open)
        │   └── ToastContext.jsx             --> CREATE (Notification toast dispatcher)
        ├── features/
        │   ├── auth/                        --> CREATE (Login & Registration modal components)
        │   ├── catalog/                     --> REFACTOR (Product grid, category filters, sorting)
        │   ├── product-detail/              --> CREATE (PDP gallery, availability badge, add to cart)
        │   ├── cart/                        --> CREATE (Slide-out cart drawer, line price calculations)
        │   ├── checkout/                    --> REPLACE (2-Phase checkout wizard, Razorpay SDK trigger)
        │   ├── orders/                      --> REFACTOR (Order confirmation & order history views)
        │   ├── guest-tracking/              --> REFACTOR (Guest order tracking with X-Guest-Order-Token)
        │   └── admin/                       --> CREATE (Admin console for fulfillment, refund & restock)
        └── lib/
            ├── apiClient.js                 --> CREATE (Axios instance with CSRF & credential headers)
            └── formatters.js                --> CREATE (INR currency & date formatters)
```

---

## 6. API Implementation Matrix

| Method | Path | Purpose | Auth / RBAC | Request Body | Headers | Response (Success) | Error Codes | Rate Limit | Idempotency | Transaction | Tables Affected | Audit Log | Security / Constraints |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `POST` | `/api/auth/register` | Register new customer | Public | `{ email, password, name }` | - | `201 Created` `{ user: { id, email, name, role } }` | `400`, `409` (Email exists) | 5 req / min | No | Yes | `users`, `sessions` | Yes | Argon2id hash, sets `__Host-nexora_sid` cookie (`SameSite=Lax`) |
| `POST` | `/api/auth/login` | Authenticate & create session | Public | `{ email, password }` | - | `200 OK` `{ user: { id, email, name, role } }` | `401` (Invalid credentials) | 5 req / min | No | Yes | `users`, `sessions` | Yes | Constant-time verify, sanitized error, no plaintext email logging |
| `POST` | `/api/auth/logout` | Invalidate current session | Authenticated | Empty | `X-CSRF-Token` | `200 OK` `{ success: true }` | `401` | 30 req / min | No | Yes | `sessions` | Yes | Deletes session row, clears cookie |
| `GET` | `/api/auth/session` | Get current session user | Authenticated | Empty | - | `200 OK` `{ user: { id, email, name, role } }` | `401` | 60 req / min | No | No | `sessions`, `users` | No | Rolling expiry refreshed |
| `GET` | `/api/products` | Paginated catalog list | Public | Empty | - | `200 OK` `{ products: [...], pagination: { ... } }` | `400` | 120 req / min | No | No | `products` | No | Computes dynamic available quantity, index-backed, no N+1 |
| `GET` | `/api/products/:id` | Product detail view | Public | Empty | - | `200 OK` `{ product: { ... } }` | `404` | 120 req / min | No | No | `products` | No | Shows real-time availability |
| `POST` | `/api/admin/products` | Create catalog product | Admin Only | `{ sku, name, price, stock_quantity, ... }` | `X-CSRF-Token` | `201 Created` `{ product: { ... } }` | `400`, `403` | 30 req / min | No | Yes | `products` | Yes | RBAC verified, price in Paise |
| `PUT` | `/api/admin/products/:id` | Update product details | Admin Only | `{ sku, name, price, category, ... }` | `X-CSRF-Token` | `200 OK` `{ product: { ... } }` | `400`, `403`, `404` | 30 req / min | No | Yes | `products` | Yes | RBAC verified |
| `DELETE` | `/api/admin/products/:id` | Soft-delete product | Admin Only | Empty | `X-CSRF-Token` | `200 OK` `{ success: true }` | `403`, `404` | 30 req / min | No | Yes | `products` | Yes | Sets `is_active = false` |
| `GET` | `/api/cart` | Retrieve active cart | User / Guest | Empty | - | `200 OK` `{ items: [...], totalAmount: N }` | - | 60 req / min | No | No | `carts`, `cart_items`, `products` | No | Authoritative server-side pricing |
| `POST` | `/api/cart/items` | Add product to cart | User / Guest | `{ productId, quantity }` | `X-CSRF-Token` | `200 OK` `{ cart: { ... } }` | `400`, `409` (Stock limit) | 60 req / min | No | Yes | `carts`, `cart_items` | No | Validates available stock limit |
| `PATCH` | `/api/cart/items/:itemId` | Update cart item quantity | User / Guest | `{ quantity }` | `X-CSRF-Token` | `200 OK` `{ cart: { ... } }` | `400`, `409` | 60 req / min | No | Yes | `cart_items` | No | Enforces stock boundaries |
| `DELETE` | `/api/cart/items/:itemId` | Remove item from cart | User / Guest | Empty | `X-CSRF-Token` | `200 OK` `{ cart: { ... } }` | `404` | 60 req / min | No | Yes | `cart_items` | No | Scoped to active cart |
| `POST` | `/api/checkout/initiate` | 2-Phase Checkout Initiation | User / Guest | `{ shippingAddress, email, name, ... }` | `Idempotency-Key`, `X-CSRF-Token` | `201 Created` `{ orderId, razorpayOrderId, guestOrderToken, ... }` | `400`, `409` (Out of stock) | 10 req / min | **Mandatory** | **Phase A (DB)** | `products`, `orders`, `order_items`, `inventory_reservations`, `payment_attempts`, `idempotency_records` | Yes | Row-level locking `FOR UPDATE`, 15m TTL reservation, Razorpay API called post-commit |
| `POST` | `/api/checkout/:orderId/retry` | Retry payment on existing order | User / Guest | Empty | `Idempotency-Key`, `X-Guest-Order-Token` (if guest) | `200 OK` `{ paymentAttemptId, razorpayOrderId }` | `400`, `404`, `409` (Expired/Paid) | 10 req / min | **Mandatory** | Yes | `payment_attempts`, `orders`, `inventory_reservations` | Yes | Attaches new `PaymentAttempt` (status `INITIATED`) without creating new Order |
| `POST` | `/api/webhooks/razorpay` | Razorpay Webhook Ingestion | System / Gateway | Raw Webhook JSON | `x-razorpay-signature` | `200 OK` `{ received: true }` | `400` (Invalid signature) | Unrestricted | **Internal (event_id)**| Yes | `payment_events`, `payment_attempts`, `orders`, `products`, `inventory_reservations` | Yes | Raw HMAC-SHA256 verification, timing-safe compare, atomic deduplication |
| `GET` | `/api/orders` | Customer order history | Authenticated | Empty | - | `200 OK` `{ orders: [...] }` | `401` | 30 req / min | No | No | `orders`, `order_items` | No | Scoped strictly to `req.user.id` |
| `GET` | `/api/orders/:id` | Order details (User/Guest) | User / Guest | Empty | `X-Guest-Order-Token` (if guest) | `200 OK` `{ order: { ... } }` | `401`, `404` | 30 req / min | No | No | `orders`, `order_items`, `addresses` | No | Anti-IDOR: Validates user ownership or SHA-256 guest token |
| `POST` | `/api/admin/orders/:id/refund` | Admin refund execution | Admin Only | `{ reason, amount }` | `Idempotency-Key`, `X-CSRF-Token` | `200 OK` `{ success: true, refundId: "..." }` | `400`, `403`, `404` | 10 req / min | **Mandatory** | Yes | `orders`, `payment_attempts`, `audit_logs` | Yes | Razorpay Refund API dispatch; **Does NOT restock inventory** |
| `POST` | `/api/admin/inventory/restock` | Explicit physical restock | Admin Only | `{ productId, quantity, reason }` | `Idempotency-Key`, `X-CSRF-Token` | `200 OK` `{ product: { ... } }` | `400`, `403`, `404` | 10 req / min | **Mandatory** | Yes | `products`, `stock_restock_logs`, `audit_logs` | Yes | Increments `stock_quantity`, creates immutable restock log |
| `GET` | `/api/admin/orders` | Admin order management list | Admin Only | Empty | - | `200 OK` `{ orders: [...], pagination: { ... } }` | `403` | 60 req / min | No | No | `orders`, `users`, `payment_attempts` | No | Multi-parameter filtering & pagination |
| `PATCH` | `/api/admin/orders/:id/status` | Advance fulfillment status | Admin Only | `{ status: "SHIPPED", trackingNumber: "..." }` | `X-CSRF-Token` | `200 OK` `{ order: { ... } }` | `400`, `403`, `404` | 30 req / min | No | Yes | `orders`, `audit_logs` | Yes | Validates FSM transition rules |

---

## 7. Database Migration Order & Rollback Strategy

The database schema migrations must execute in strict dependency sequence. Every migration file supports deterministic forward application (`up`) and complete reverse rollback (`down`).

```
MIGRATION SEQUENCE & DEPENDENCY GRAPH:
001_initialize_schema.js
  └── 002_create_users_and_sessions.js
        ├── 003_create_products.js
        │     └── 004_create_carts_and_cart_items.js
        └── 005_create_addresses.js
              └── 006_create_orders_and_order_items.js
                    ├── 007_create_inventory_reservations.js
                    ├── 008_create_payment_attempts.js
                    ├── 009_create_payment_events.js
                    ├── 010_create_idempotency_records.js
                    └── 011_create_audit_and_restock_logs.js
```

### 7.1 Detailed Migration Execution Table
| Sequence | File Name | Tables / Objects Created | Rollback Action (`down`) | Data Loss Risk |
|---|---|---|---|---|
| **001** | `001_initialize_schema.js` | Schema initialization metadata | Drop schema initialization metadata | Low (None if empty) |
| **002** | `002_create_users_and_sessions.js` | `users`, `sessions` tables, `idx_sessions_expires_at` | `DROP TABLE IF EXISTS sessions CASCADE; DROP TABLE IF EXISTS users CASCADE;` | High (User & Session data) |
| **003** | `003_create_products.js` | `products` table, checks (`stock >= 0`, `reserved <= stock`), `idx_products_active_category` | `DROP TABLE IF EXISTS products CASCADE;` | High (Catalog data) |
| **004** | `004_create_carts_and_cart_items.js` | `carts`, `cart_items` tables, composite unique `(cart_id, product_id)` | `DROP TABLE IF EXISTS cart_items CASCADE; DROP TABLE IF EXISTS carts CASCADE;` | Medium (Active carts) |
| **005** | `005_create_addresses.js` | `addresses` table, `idx_addresses_user_id` | `DROP TABLE IF EXISTS addresses CASCADE;` | Medium (User addresses) |
| **006** | `006_create_orders_and_order_items.js` | `orders`, `order_items` tables, `idx_orders_status`, `idx_orders_guest_token_hash` | `DROP TABLE IF EXISTS order_items CASCADE; DROP TABLE IF EXISTS orders CASCADE;` | Critical (Order history) |
| **007** | `007_create_inventory_reservations.js` | `inventory_reservations` table, `idx_reservations_status_expires_at` | `DROP TABLE IF EXISTS inventory_reservations CASCADE;` | High (Active checkout locks) |
| **008** | `008_create_payment_attempts.js` | `payment_attempts` table, partial unique index `uq_one_success_payment_per_order` | `DROP TABLE IF EXISTS payment_attempts CASCADE;` | Critical (Payment records) |
| **009** | `009_create_payment_events.js` | `payment_events` table, unique index on `event_id` | `DROP TABLE IF EXISTS payment_events CASCADE;` | Critical (Webhook audit) |
| **010** | `010_create_idempotency_records.js` | `idempotency_records` table, unique index `(idempotency_key, request_path)` | `DROP TABLE IF EXISTS idempotency_records CASCADE;` | Low (Replay cache) |
| **011** | `011_create_audit_and_restock_logs.js` | `audit_logs`, `stock_restock_logs` tables, indexes on `(entity_type, entity_id)` | `DROP TABLE IF EXISTS stock_restock_logs CASCADE; DROP TABLE IF EXISTS audit_logs CASCADE;` | Critical (Compliance audit) |

---

## 8. Security Implementation Checklist

| Phase | Security Domain | Specific Control Requirement | Implementation File / Location | Verification Method |
|---|---|---|---|---|
| **06.1** | Secret Management | Zero secrets committed in repo; strict validation via Zod/Joi | `backend/src/config/env.js` | Process boot test with missing/invalid env |
| **06.1** | Log Minimization | Automatic redaction of credentials, cookies, and secrets | `backend/src/utils/logger.js` | Log inspection test checking `[REDACTED]` tokens |
| **06.3** | Password Hashing | Argon2id (64MB RAM, 3 iterations, 1 thread) | `backend/src/modules/auth/auth.service.js` | Unit test verifying hash cost parameters |
| **06.3** | Session Security | `__Host-nexora_sid` cookie, `HttpOnly`, `Secure`, `SameSite=Lax` | `backend/src/modules/auth/session.store.js` | HTTP response header inspection test |
| **06.3** | CSRF Defense | Server token + Non-HttpOnly cookie + `X-CSRF-Token` header | `backend/src/middleware/csrf.js` | Reject mutating requests missing CSRF header |
| **06.3** | Rate Limiting | IP & user rate limiting (5 req/min on login/register) | `backend/src/middleware/rateLimiter.js` | 6th request receives HTTP 429 Too Many Requests |
| **06.6** | Concurrency Safety | Row-level locking `SELECT ... FOR UPDATE` in UUID order | `backend/src/modules/inventory/reservation.service.js` | 10-to-1 concurrency load test suite |
| **06.8** | Payment Invariant | Zero cardholder data ingestion; public key only on client | `backend/src/modules/payments/payments.service.js` | Codebase scan confirming zero raw card fields |
| **06.8** | Signature Verify | Timing-safe HMAC-SHA256 signature verification | `backend/src/modules/payments/payments.service.js` | Unit test with valid/tampered signatures |
| **06.10**| Webhook Security | Raw body capture before JSON parse; timing-safe HMAC | `backend/src/middleware/rawBody.js` | Automated webhook signature test |
| **06.12**| Idempotency | Scoped `(idempotency_key, request_path)` + SHA-256 payload hash | `backend/src/middleware/idempotency.js` | Replay test & payload mismatch rejection |
| **06.13**| Anti-IDOR | 256-bit crypto token; SHA-256 at rest; `X-Guest-Order-Token` | `backend/src/middleware/guestAuth.js` | Direct object reference penetration test |
| **06.14**| Restock Decouple | Refund never modifies inventory; restock requires admin log | `backend/src/modules/admin/admin.service.js` | Refund test asserting stock count unchanged |
| **06.15**| RBAC Protection | Admin role enforcement on `/api/admin/*` endpoints | `backend/src/middleware/rbac.js` | Customer session receives HTTP 403 Forbidden |
| **06.17**| Web Security | Helmet.js headers (CSP, HSTS, X-Content-Type-Options) | `backend/src/app.js` | Header security test via Supertest |

---

## 9. Observability Implementation Map

### 9.1 Logging & Event Telemetry Standard
- **Format:** Single-line JSON emitted to `stdout`.
- **Mandatory Fields:** `timestamp` (ISO-8601 UTC), `level` (`info`, `warn`, `error`, `debug`), `reqId` (Correlation UUID), `module`, `action`, `duration_ms` (for timing events).

### 9.2 Event Logging Catalog
| Event Category | Logged Action | Emitted Context Fields | Security / Redaction Rule |
|---|---|---|---|
| **Authentication** | `AUTH_LOGIN_SUCCESS` | `userId`, `ip`, `userAgent` | Password NEVER logged |
| **Authentication** | `AUTH_LOGIN_FAILURE` | `ip`, `reason`, `reqId` (normalized non-reversible hash only if needed) | Plaintext email NEVER logged; zero credentials logged |
| **Checkout** | `CHECKOUT_INITIATED` | `orderId`, `totalAmount`, `itemCount`, `isGuest` | Guest plaintext token NEVER logged |
| **Checkout** | `CHECKOUT_STOCK_CONFLICT`| `requestedProductId`, `requestedQty`, `availableQty`| Logged at `warn` level with duration |
| **Payments** | `PAYMENT_RETRY_INITIATED`| `orderId`, `attemptNumber`, `newRazorpayOrderId` | Secrets NEVER logged |
| **Webhooks** | `WEBHOOK_RECEIVED` | `eventId`, `eventType`, `razorpayOrderId` | Raw signature NEVER logged |
| **Webhooks** | `WEBHOOK_PROCESSED` | `eventId`, `processingStatus`, `durationMs` | Full audit trail preserved in DB |
| **Reconciliation**| `LATE_PAYMENT_DETECTED` | `orderId`, `razorpayPaymentId`, `amount` | Emits reconciliation event for refund workflow |
| **Admin Operations**| `ADMIN_REFUND_EXECUTED`| `orderId`, `adminUserId`, `amount`, `refundId` | Full diff written to `audit_logs` |
| **Admin Operations**| `INVENTORY_RESTOCKED` | `productId`, `adminUserId`, `quantityAdded` | Recorded in `stock_restock_logs` |

---

## 10. Phase Test Gates

Every implementation phase terminates in an explicit, automated test gate. No subsequent phase may commence until all prior exit criteria are satisfied.

```
PHASE EXIT GATES:
├── GATE 06.1: Repository & Environment Foundation
│   └── Boot succeeds with valid env; fails immediately with missing vars; structured JSON logs contain reqId.
├── GATE 06.2: PostgreSQL & Migration Foundation
│   └── 11 migrations execute up & down cleanly; check constraints reject negative stock & invalid reservations.
├── GATE 06.3: Authentication, Authorization & Sessions
│   └── Session created on login; cookie verified (__Host-, HttpOnly, Secure, SameSite=Lax); 401 on invalid/expired session; CSRF verified.
├── GATE 06.4: Product & Catalog Domain
│   └── Paginated query measured against PRD (p95 < 200ms @ 100 VUs); dynamic available_quantity correct; no N+1 queries.
├── GATE 06.5: Cart Domain
│   └── Cart isolation verified; stock limit enforced on add/update; guest cart cleanly merges on login.
├── GATE 06.6: Inventory Reservation & Concurrency (MANDATORY)
│   └── 10 concurrent requests for 1 stock item -> Exactly 1 HTTP 201 Created, Exactly 9 HTTP 409 Conflict. Checkout p95 < 300ms.
├── GATE 06.7: Order Lifecycle Engine
│   └── FSM rejects illegal transitions; OrderItems store immutable price/name snapshots; 15m TTL expiration releases stock.
├── GATE 06.8: Razorpay Test-Mode Integration
│   └── Razorpay order created; HMAC-SHA256 signature verified in-memory with timing-safe comparison.
├── GATE 06.9: Payment Attempt & Retries
│   └── Retry attaches new PaymentAttempt (INITIATED) to same Order; partial unique index blocks duplicate successful payments.
├── GATE 06.10: Webhook Reconciliation
│   └── Signature verified; duplicate webhooks return 200 IGNORED_DUPLICATE; webhook p95 < 150ms.
├── GATE 06.11: Late Payment Reconciliation
│   └── Late payment marks Attempt SUCCESS, Order EXPIRED, Stock unchanged, Event REQUIRES_REFUND.
├── GATE 06.12: API Idempotency
│   └── Identical retry returns cached replay; payload mismatch returns HTTP 422.
├── GATE 06.13: Guest Order Security
│   └── Guest token verified via SHA-256 constant-time comparison; cross-guest IDOR query returns HTTP 404.
├── GATE 06.14: Refund & Restock Subsystems
│   └── Admin refund marks order REFUNDED without modifying stock; restock tool updates stock and logs audit row.
├── GATE 06.15: Admin Operations & RBAC
│   └── Non-admin accounts receive HTTP 403 on all /api/admin/* endpoints; audit trail records all mutations.
├── GATE 06.16: Frontend Architecture & Client
│   └── Client builds with zero errors; initial JS bundle < 200KB gzipped; ApiClient handles session & CSRF automatically.
├── GATE 06.17: UI/UX Implementation
│   └── Warm Neutral design system rendered; Axe Core automated scan passes WCAG 2.1 AA with zero critical errors.
├── GATE 06.18: Observability & Logging
│   └── Logs verified for single-line JSON format; sensitive fields confirmed [REDACTED]; no plaintext email PII in auth failure logs.
├── GATE 06.19: Complete Verification Suite
│   └── Must achieve 100% pass across all unit, integration, concurrency, security, and performance test suites.
└── GATE 06.20: Deployment Readiness
    └── Health checks /api/health/liveness and /readiness return 200; graceful shutdown drains connections.
```

---

## 11. Critical End-to-End Implementation Flows

### Flow A — Registered User Checkout
```
User Login -> Cart -> Checkout Initiation
  -> Phase A (DB Transaction):
     1. Lock Product Rows (SELECT FOR UPDATE in UUID order)
     2. Validate Available Stock (stock - reserved >= qty)
     3. Increment reserved_quantity
     4. Create Order (status: PENDING_PAYMENT)
     5. Create OrderItems (Immutable Snapshots)
     6. Create InventoryReservation (15m TTL)
     7. Create PaymentAttempt #1 (status: INITIATED)
     8. COMMIT Transaction (Locks Released, <10ms hold)
  -> Phase B (External API):
     9. Call Razorpay API (razorpay.orders.create)
     10. Update PaymentAttempt #1 (razorpay_order_id)
     11. Return response to Frontend
  -> Frontend:
     12. Launch Razorpay Checkout Modal
     13. User completes payment on Gateway
  -> Webhook Processing:
     14. Razorpay sends payment.captured webhook
     15. Verify HMAC-SHA256 signature in-memory
     16. Insert payment_events (status: RECEIVED -> PROCESSING)
     17. Atomically transition:
         - orders.status = 'PAID'
         - orders.payment_status = 'PAID'
         - payment_attempts.status = 'SUCCESS'
         - inventory_reservations.status = 'CONVERTED'
         - UPDATE products: stock_quantity = stock_quantity - qty,
                            reserved_quantity = reserved_quantity - qty
     18. Update payment_events (status: PROCESSED)
     19. Return HTTP 200 OK
  -> Fulfillment (Distinct System/Admin Transition):
     20. Later transition: orders.status = 'PROCESSING' -> 'SHIPPED' -> 'DELIVERED'
```

### Flow B — Guest Checkout & Secure Tracking
```
Guest User -> Cart -> Checkout Initiation
  -> Generate 256-bit crypto token (rawToken)
  -> Compute SHA-256 hash (guestTokenHash)
  -> Phase A (DB Transaction):
     1. Create Order with guest_token_hash = guestTokenHash
     2. Create OrderItems & InventoryReservation
     3. Create PaymentAttempt #1 (status: INITIATED)
     4. COMMIT Transaction
  -> Phase B:
     5. Create Razorpay Order
     6. Return response to Client with rawToken (Returned ONCE only)
  -> Frontend:
     7. Store rawToken in memory / local state
     8. Launch Razorpay Modal & Complete Payment
  -> Subsequent Guest Order Lookup:
     9. GET /api/orders/:orderId with Header: X-Guest-Order-Token: <rawToken>
     10. Backend hashes incoming rawToken with SHA-256
     11. crypto.timingSafeEqual(incomingHash, order.guest_token_hash)
     12. If Valid: Return Order details; If Invalid: Return HTTP 404
```

### Flow C — Failed Payment Retry
```
Order in PENDING_PAYMENT -> PaymentAttempt #1 fails on Gateway
  -> User clicks "Retry Payment" in UI
  -> POST /api/checkout/:orderId/retry (with Idempotency-Key)
  -> Backend DB Transaction:
     1. Verify order.status === 'PENDING_PAYMENT'
     2. Verify NOW() < inventory_reservations.expires_at
     3. Verify zero successful PaymentAttempts exist
     4. Set attemptNumber = 2
     5. Insert new PaymentAttempt (attempt_number: 2, status: 'INITIATED')
     6. COMMIT DB Transaction
  -> External Gateway Call:
     7. Call Razorpay API: razorpay.orders.create(...)
     8. Update PaymentAttempt #2 with razorpay_order_id
     9. Return new razorpayOrderId to Frontend
  -> Frontend launches Razorpay Modal with new Razorpay Order ID for SAME ecommerce Order
```

### Flow D — Duplicate Webhook Ingestion
```
Razorpay sends payment.captured webhook (event_id: "evt_12345")
  -> Backend receives POST /api/webhooks/razorpay
  -> Verify raw HMAC-SHA256 signature
  -> Check payment_events WHERE event_id = 'evt_12345'
  -> Case 1 (First Arrival):
     - Insert payment_events (status: 'RECEIVED')
     - Execute business reconciliation & set status = 'PROCESSED'
     - Return HTTP 200 OK
  -> Case 2 (Duplicate Arrival):
     - Record found with status = 'PROCESSED'
     - Log: "Duplicate webhook event evt_12345 ignored"
     - Return HTTP 200 OK immediately (Zero duplicate DB writes)
```

### Flow E — Late Captured Payment Reconciliation
```
Order in PENDING_PAYMENT -> 15m passes without payment
  -> Periodic reservation cleanup marks:
     - inventory_reservations.status = 'RELEASED'
     - products.reserved_quantity = reserved_quantity - qty
     - orders.status = 'EXPIRED'
  -> Customer subsequently completes payment on Gateway
  -> Razorpay sends payment.captured webhook
  -> Backend finds order.status === 'EXPIRED':
     1. UPDATE payment_attempts SET status = 'SUCCESS', razorpay_payment_id = :paymentId
     2. DO NOT modify orders.status (Remains 'EXPIRED')
     3. DO NOT decrement products.stock_quantity (Inventory untouched)
     4. UPDATE payment_events SET processing_status = 'REQUIRES_REFUND'
     5. Emit Audit Log: LATE_PAYMENT_REQUIRES_REFUND
  -> Reconciliation & Refund Workflow:
     6. Verified refund execution calls Razorpay Refund API: razorpay.payments.refund(...)
     7. Upon confirmation: UPDATE payment_attempts SET status = 'REFUNDED'
     8. UPDATE payment_events SET processing_status = 'PROCESSED'
```

### Flow F — Administrative Refund ($\text{REFUND} \neq \text{RESTOCK}$)
```
Admin initiates Refund in Dashboard
  -> POST /api/admin/orders/:orderId/refund (with Idempotency-Key)
  -> Backend verifies req.user.role === 'ADMIN'
  -> Verify order.status IN ('PAID', 'PROCESSING', 'SHIPPED')
  -> Call Razorpay Refund API:
     razorpay.payments.refund(paymentAttempt.razorpay_payment_id, { amount: order.total_amount })
  -> Atomically Update DB:
     1. UPDATE orders SET status = 'REFUNDED', payment_status = 'REFUNDED'
     2. UPDATE payment_attempts SET status = 'REFUNDED'
     3. INSERT INTO audit_logs (action: 'ORDER_REFUNDED', adminUserId, amount)
  -> INVARIANT CHECK: products.stock_quantity is NOT modified.
  -> Return HTTP 200 OK to Admin
```

### Flow G — Explicit Physical Restock
```
Returned physical item received and inspected at warehouse
  -> Admin navigates to Restock Management in Dashboard
  -> POST /api/admin/inventory/restock (with Idempotency-Key)
  -> Payload: { productId: "...", quantity: 1, reason: "CUSTOMER_RETURN_INSPECTED" }
  -> Backend verifies req.user.role === 'ADMIN'
  -> Atomically Update DB:
     1. UPDATE products SET stock_quantity = stock_quantity + 1 WHERE id = :productId
     2. INSERT INTO stock_restock_logs (product_id, quantity_added: 1, restocked_by, reason)
     3. INSERT INTO audit_logs (action: 'INVENTORY_RESTOCKED', adminUserId, quantity: 1)
  -> Return HTTP 200 OK with updated stock count
```

---

## 12. Legacy Migration Plan

### 12.1 Transition Strategy from Learning Codebase to Production Architecture
The original codebase served as an educational prototype. The production implementation replaces legacy patterns completely without preserving insecure or non-scalable shortcuts.

```
LEGACY MIGRATION OVERVIEW:
┌───────────────────────────┬────────────────────────────────────────────────────────┐
│ Legacy Prototype Pattern  │ Production Implementation Replacement                  │
├───────────────────────────┼────────────────────────────────────────────────────────┤
│ SQLite file store         │ PostgreSQL 15+ relational database with native UUIDs   │
│ Denormalized JSON orders  │ Relational order_items with immutable price snapshots  │
│ Unauthenticated global cart│ Scoped carts (User UUID or Guest Session ID)          │
│ Static inventory overwrite│ 2-Phase atomic reservations (SELECT ... FOR UPDATE)    │
│ Fake client payment form  │ Server-side Razorpay Orders API & Webhook reconciliation│
│ Lost state on payment fail│ 1:N PaymentAttempt retry architecture on same Order    │
│ Zero refund/restock logic │ Decoupled Razorpay refund and audited physical restock │
│ Hardcoded mock user ID    │ Server-side sessions with __Host- secure cookies & RBAC│
└───────────────────────────┴────────────────────────────────────────────────────────┘
```

### 12.2 Prohibited Legacy Anti-Patterns
1. **NO SQLite Migration:** No attempt is made to import or convert `database.sqlite`. A clean PostgreSQL schema is initialized via migrations.
2. **NO JSON Order Preservation:** Historical order querying relies exclusively on the relational `order_items` table.
3. **NO Client-Side Trust:** Client-submitted prices, cart totals, and frontend payment success callbacks are strictly treated as non-authoritative.

---

## 13. Performance Implementation Plan

### 13.1 Authoritative Production Performance Targets (from PRD v2.1)
- **Catalog Browsing (`GET /api/products`):** $p95 < 200\text{ms}$ at 100 concurrent VUs.
- **Checkout Initiation (`POST /api/checkout/initiate`):** $p95 < 300\text{ms}$ (Phase A DB hold $< 10\text{ms}$).
- **Webhook Reconciliation (`POST /api/webhooks/razorpay`):** $p95 < 150\text{ms}$.
- **Initial JavaScript Bundle Size:** $< 200\text{KB}$ gzipped.
- **Database Query Discipline:**
  - Zero N+1 queries across all endpoints.
  - Mandatory use of eager loading, joins, and batching where appropriate.
  - Query counts measured for critical endpoints and queries backed by indexes.
  - Performance targets must be validated through actual automated benchmark measurements.

### 13.2 Optimization Strategies
1. **PostgreSQL Indexing:** Composite and partial indexes for active products, user orders, active reservations, and idempotency lookups.
2. **Eager Loading:** Sequelize queries utilize explicit `include` with indexed foreign keys, eliminating $N+1$ queries.
3. **Database Connection Pool:** Min 2, max 20 connections per instance with 5000ms acquire timeout and 30000ms idle timeout.
4. **Frontend Asset Optimization:** Code-splitting with dynamic `React.lazy()` per route, modern image formats (WebP/AVIF), and preloaded web fonts.

---

## 14. AI/ML Boundary & Decoupling Architecture

### 14.1 Strict MVP Decoupling Invariant
In strict adherence to the architecture baseline, **no artificial intelligence or machine learning components are implemented during the core commerce build**.

### 14.2 Future Extensibility Boundary
Future AI/ML capabilities (such as semantic product search, personalized recommendations, or visual similarity) will integrate strictly as **read-only external consumers** via asynchronous event streams or dedicated query services:
- **Zero Core Dependency:** Checkout, inventory reservation, order settlement, payment processing, and authentication will NEVER depend on AI/ML services or vector database availability.
- **Asynchronous Data Feeds:** Catalog updates and order completion events may emit change-data-capture (CDC) events to external search indexes without impacting core transaction latency.

---

## 15. Traceability Matrix

| PRD v2.1 Requirement | TRD v1.2.1 Section | App Flow v1.0 | Backend Schema v1.0 | Phase | File / Module | Test Suite Gate | Acceptance Criterion |
|---|---|---|---|---|---|---|---|
| **REQ-AUTH-01** (Secure Auth) | Sec 3.1 | Sec 2.1 | `users`, `sessions` | **06.3** | `src/modules/auth/` | Unit + Integration | Argon2id hashing, `__Host-` session cookie (`SameSite=Lax`), rolling expiry |
| **REQ-CAT-01** (Catalog & Stock) | Sec 4.1 | Sec 3.1 | `products` | **06.4** | `src/modules/products/`| Integration | $p95 < 200\text{ms}$ @ 100 VUs, dynamic `available_quantity` calculation, no N+1 |
| **REQ-CART-01** (Scoped Cart) | Sec 4.2 | Sec 4.1 | `carts`, `cart_items` | **06.5** | `src/modules/cart/` | Integration | User/Guest cart isolation, server-computed totals |
| **REQ-CHK-01** (2-Phase Checkout)| Sec 5.1 | Sec 5.1 | `orders`, `reservations` | **06.6** | `src/modules/inventory/`| Concurrency (10-to-1)| $SELECT FOR UPDATE$, 15m TTL, zero overselling, 9x409, $p95 < 300\text{ms}$ |
| **REQ-ORD-01** (Order FSM) | Sec 6.1 | Sec 6.1 | `orders`, `order_items` | **06.7** | `src/modules/orders/` | Integration | FSM enforcement, immutable OrderItem price snapshots |
| **REQ-PAY-01** (Razorpay Gateway) | Sec 7.1 | Sec 7.1 | `payment_attempts` | **06.8** | `src/modules/payments/`| Payment Lifecycle | Server-side secret, in-memory HMAC signature verify |
| **REQ-PAY-02** (Payment Retries) | Sec 7.2 | Sec 7.2 | `payment_attempts` | **06.9** | `src/modules/payments/`| Integration | Multi-attempt retry on same Order, partial unique index |
| **REQ-PAY-03** (Webhook Pipeline) | Sec 8.1 | Sec 8.1 | `payment_events` | **06.10**| `src/modules/webhooks/`| Webhook Idempotency | Raw body HMAC verify, atomic event deduplication, $p95 < 150\text{ms}$ |
| **REQ-PAY-04** (Late Capture) | Sec 8.2 | Sec 8.2 | `payment_events` | **06.11**| `src/modules/webhooks/`| Late Capture Test | Attempt SUCCESS, Order EXPIRED, REQUIRES_REFUND event |
| **REQ-SEC-01** (API Idempotency) | Sec 9.1 | Sec 9.1 | `idempotency_records` | **06.12**| `src/middleware/idempotency`| Integration | Scoped `(key, path)` uniqueness, payload hash match |
| **REQ-SEC-02** (Guest Security) | Sec 9.2 | Sec 9.2 | `orders.guest_token_hash`| **06.13**| `src/middleware/guestAuth` | Security / IDOR | 256-bit crypto token, SHA-256 at rest, `X-Guest-Order-Token` |
| **REQ-ADM-01** (Refund != Restock)| Sec 10.1| Sec 10.1| `audit_logs`, `restock_logs`| **06.14**| `src/modules/admin/` | Integration | Refund does not alter stock; restock requires admin log |
| **REQ-ADM-02** (Admin RBAC) | Sec 10.2| Sec 10.2| `users.role` | **06.15**| `src/middleware/rbac.js` | Security / RBAC | Non-admin accounts receive HTTP 403 on `/api/admin/*` |
| **REQ-UI-01** (Editorial Design) | Sec 11.1| Sec 1.1 | N/A | **06.17**| `src/styles/tokens.css` | Accessibility (WCAG) | Warm Neutral palette, WCAG 2.1 AA, 44px touch targets |
| **REQ-OBS-01** (Observability) | Sec 12.1| Sec 11.1| `audit_logs` | **06.18**| `src/utils/logger.js` | Log Audit Test | Structured JSON, reqId correlation, credential redaction, no email PII in auth logs |

---

## 16. Definition of Done (DoD)

The Nexora Commerce Platform implementation is deemed complete ONLY when all of the following verifiable conditions are satisfied:

1. **Database & Schema:** All 11 Sequelize migrations apply cleanly to PostgreSQL 15+ and reverse cleanly without errors. All check constraints and partial indexes are active across the 14 schema entities.
2. **Authentication & RBAC:** Server-side sessions operational with `__Host-nexora_sid` cookies (`SameSite=Lax`). Argon2id password hashing verified. Admin endpoints reject non-admin users with HTTP 403.
3. **Cart & Pricing:** Carts are isolated per user/guest. Server-side totals are authoritative in INR Paise. Guest cart merges cleanly upon login.
4. **Inventory & Concurrency:** 2-Phase checkout initiation strictly isolates database locks from Razorpay calls. 10 concurrent requests for 1 stock item produce exactly 1 HTTP 201 and 9 HTTP 409s.
5. **Order Lifecycle & Snapshots:** Order FSM rejects invalid transitions. `order_items` retain immutable historical price and name snapshots.
6. **Payment Architecture:** Razorpay Test Mode modal launches via frontend SDK. Signature verification executes in-memory using timing-safe comparisons.
7. **Payment Retries:** Retries attach new `PaymentAttempt` records (`status = 'INITIATED'`) referencing the existing `Order` without generating duplicate orders.
8. **Webhook Pipeline:** Webhooks verify raw HMAC-SHA256 signatures and achieve idempotent deduplication via `payment_events`.
9. **Late Payment Handling:** Late captured payments on expired orders mark `PaymentAttempt = SUCCESS`, `Order = EXPIRED`, stock untouched, and `payment_events = REQUIRES_REFUND`.
10. **Refund & Restock Separation:** Admin refunds via Razorpay API update payment/order states to `REFUNDED` but NEVER increment inventory. Physical restock operates as an independent, audited admin action.
11. **Guest Order Security:** Guest orders authenticated via `X-Guest-Order-Token` validated against SHA-256 hash at rest. Anti-IDOR controls return HTTP 404 on unauthorized access.
12. **API Idempotency:** Mutating endpoints enforce `(idempotency_key, request_path)` scoping and replay cached responses.
13. **Frontend & UX:** Client builds with zero errors. Initial JS bundle verified $<200\text{KB}$ gzipped. Editorial Warm Neutral design system fully applied. WCAG 2.1 AA automated checks pass with zero critical violations.
14. **Observability & Telemetry:** Structured JSON logging active with `reqId` correlation. Redaction blacklist masks all credentials, tokens, and secrets. Auth failure logs omit plaintext email PII.
15. **Test Suite:** Implementation must achieve 100% pass across all unit, integration, concurrency, security, and performance test suites.
16. **Zero Code Rule Compliance:** No application code was executed or modified during Phase 06.

---

## 17. Risk Register & Mitigation Strategy

| Risk ID | Risk Description | Severity | Probability | Affected Component | Mitigation Strategy | Detection / Verification | Fallback / Recovery Plan |
|---|---|---|---|---|---|---|---|
| **RSK-01** | Inventory Race Condition / Overselling | Critical | High | `inventory_reservations`, `products` | Row-level locking `SELECT ... FOR UPDATE` in UUID order inside Phase A transaction | 10-to-1 concurrency load test script | Rollback transaction; return HTTP 409 Conflict |
| **RSK-02** | External Gateway Call inside Open DB Transaction | Critical | Medium | `checkout.service.js` | Strict 2-Phase Checkout boundary: Commit DB Phase A *before* calling Razorpay Phase B | Code review & transaction duration timer ($<10\text{ms}$) | DB connection timeout fails fast if violated |
| **RSK-03** | Duplicate Successful Payments on Same Order | Critical | Medium | `payment_attempts` | PostgreSQL partial unique index `uq_one_success_payment_per_order` WHERE `status = 'SUCCESS'` | Database constraint unit test | Database rejects second write; webhook handles gracefully |
| **RSK-04** | Webhook Delivery Delay / Out-of-Order Delivery | High | High | `webhooks.service.js` | State machine checks; webhook marks `PROCESSED` regardless of order | Out-of-order webhook simulation test | Manual / automated reconciliation task |
| **RSK-05** | Duplicate Webhook Ingestion | High | High | `payment_events` | Atomic insert on unique `event_id`; return HTTP 200 `IGNORED_DUPLICATE` | Replay webhook payload 3x test | Immediate HTTP 200 response with zero DB mutation |
| **RSK-06** | Late Payment on Expired Order | High | Medium | `webhooks.service.js`, `orders` | Record Attempt `SUCCESS`, Order `EXPIRED`, Inventory untouched, Event `REQUIRES_REFUND` | Late capture integration test | Trigger reconciliation & refund workflow |
| **RSK-07** | Insecure Direct Object Reference (IDOR) on Orders | High | Medium | `orders.controller.js`, `guestAuth` | Assert user ID equality or `X-Guest-Order-Token` constant-time SHA-256 match | Anti-IDOR penetration test | Return generic HTTP 404 Not Found |
| **RSK-08** | Inadvertent Inventory Restock on Refund | High | Medium | `admin.service.js` | Architectural invariant: Refund updates order/payment only; restock requires separate endpoint | Refund unit test verifying stock count unchanged | Restock audit log reveals anomalies for correction |
| **RSK-09** | Session Hijacking / XSS Token Theft | High | Low | `session.store.js` | Server-side sessions, `__Host-` prefix, `HttpOnly`, `Secure`, `SameSite=Lax` | Cookie security header inspection | Instant server-side session revocation |
| **RSK-10** | Cross-Site Request Forgery (CSRF) | Medium | Medium | `middleware/csrf.js` | Server token + Non-HttpOnly cookie + `X-CSRF-Token` header validation on mutating routes | Automated CSRF bypass test | Reject request with HTTP 403 Forbidden |
| **RSK-11** | Idempotency Key Collisions across Endpoints | Medium | Medium | `idempotency_records` | Composite uniqueness scoped to `(idempotency_key, request_path)` | Scoped collision integration test | Isolated namespace per endpoint |
| **RSK-12** | Sensitive Data Leakage in Application Logs | High | Medium | `utils/logger.js` | Automated recursive redaction of credentials, cookies, tokens, and secrets; omit email PII in auth failures | Structured log payload audit test | Redaction mask `[REDACTED]` applied prior to output |
| **RSK-13** | Database Deadlocks on Multi-Item Checkout | High | Low | `reservation.service.js` | Lexicographical UUID sorting (`ORDER BY id ASC`) before `FOR UPDATE` lock | Multi-item concurrent checkout test | PostgreSQL deadlock detector kills transaction & retries |
| **RSK-14** | Payment Attempt Race Condition during Retry | Medium | Low | `payments.service.js` | Transactional check asserting zero existing successful payment attempts | Concurrent retry test | Constraint violation prevents duplicate payment |
| **RSK-15** | Database Connection Pool Exhaustion | High | Low | `config/database.js` | Pooled connections (max 20), query timeout (5000ms), fast transaction release | Autocannon load test | Connection queue with circuit breaker |
| **RSK-16** | Unhandled Webhook Payload Format Changes | Medium | Low | `webhooks.controller.js` | Raw body signature verification + defensive JSON schema validation | Webhook schema validation test | Event marked `FAILED` and logged for engineer review |

---

## 18. Implementation Order Summary

The definitive, sequential 20-step execution roadmap for the upcoming implementation phases:

```
================================================================================
NEXORA COMMERCE PLATFORM — 20-STEP IMPLEMENTATION EXECUTION ROADMAP
================================================================================
01. Repository & Environment Foundation    (Node 20 ESM, Zod env validation, Pino logger, Error hierarchy)
02. PostgreSQL & Migration Foundation     (11 Sequelize migrations, check constraints, partial indexes)
03. Authentication, Sessions & RBAC       (Server-side sessions, __Host- cookie SameSite=Lax, Argon2id, CSRF)
04. Product & Catalog Domain              (Product model, dynamic availability, paginated search, no N+1)
05. Cart Domain                           (User/Guest scoped carts, line quantity checks, authoritative totals)
06. Inventory Reservation Engine          (2-Phase checkout boundary, SELECT FOR UPDATE, 15m TTL, 10-to-1 gate)
07. Order Lifecycle Engine                (Relational Order & OrderItems, FSM state transitions, immutable snapshots)
08. Razorpay Test-Mode Integration        (Razorpay Orders API, in-memory HMAC verification, zero raw card handling)
09. Payment Attempt & Retry Engine        (1:N Order to PaymentAttempt, new attempt per retry, single-success index)
10. Webhook Reconciliation Pipeline       (Raw body HMAC-SHA256 verify, atomic event deduplication, event FSM)
11. Late Payment Reconciliation           (Attempt SUCCESS, Order EXPIRED, Stock untouched, REQUIRES_REFUND)
12. API Idempotency Engine                (Scoped (key, path) uniqueness, SHA-256 payload hash, response replay)
13. Guest Security & Anti-IDOR            (256-bit crypto token, SHA-256 at rest, X-Guest-Order-Token header)
14. Refund & Restock Subsystems           (Admin refund via Razorpay, explicit physical restock with audit logs)
15. Admin Operations & RBAC               (Admin catalog management, order fulfillment, restock tool, audit logs)
16. Frontend Architecture & Client        (Vite + React 18, React Router v6, bundle < 200KB, ApiClient with CSRF)
17. UI/UX Editorial Design System         (Warm Neutral tokens, typography, WCAG 2.1 AA, 44px touch targets)
18. Observability & Telemetry             (Structured JSON logging, correlation IDs, metrics, credential redaction)
19. Test Suite & Verification Matrix      (Unit, Integration, Concurrency 10-to-1, Security, Performance p95)
20. Deployment Readiness & Config         (Health checks, graceful shutdown, migration automation, container assets)
================================================================================
```

---

## 19. Architectural Baseline Compliance Confirmation

This implementation plan has been rigorously cross-referenced against all approved source architecture specifications:

1. **`docs/PRD.md` (PRD v2.1):** 100% compliant. All business requirements, authoritative performance targets (Products p95 < 200ms @ 100 VUs, Checkout p95 < 300ms, Webhook p95 < 150ms, JS bundle < 200KB gzipped), and non-functional requirements are mapped to concrete implementation modules and test gates.
2. **`docs/TRD.md` (TRD v1.2.1):** 100% compliant. Technology stack (Node.js 20 LTS, PostgreSQL 15+, Sequelize 6.35+, React 18+, Vite), modular monolith topology, 2-phase checkout, and strict security controls are preserved without modification.
3. **`docs/03-APP-FLOW-v1.0.md` (App Flow v1.0):** 100% compliant. Every user journey, guest flow, retry scenario, late capture edge case, and administrative state transition is fully operationalized.
4. **`docs/04-UI-UX-DESIGN-BRIEF-v1.0.md` (Design Brief v1.0):** 100% compliant. The Warm Neutral Architectural Editorial visual direction, typography scales, spacing grids, and WCAG 2.1 AA accessibility standards are translated into production CSS tokens and component contracts.
5. **`docs/05-BACKEND-SCHEMA-v1.0.md` (Backend Schema v1.0):** 100% compliant. All 14 database tables, 11 migration files, foreign keys, check constraints, partial unique indexes, UUID primary keys, approved PaymentAttempt statuses (`INITIATED`, `SUCCESS`, `FAILED`, `REFUNDED`), and Paise-based monetary representations are strictly reflected.

---

## 20. Document Status & Final Sign-Off

```
================================================================================
DOCUMENT STATUS: FINAL & APPROVED
VERSION: v1.0
AUTHORITATIVE EXECUTION BLUEPRINT: docs/06-IMPLEMENTATION-PLAN-v1.0.md
NO CODE MODIFICATIONS PERMITTED IN PHASE 06.
================================================================================
```
