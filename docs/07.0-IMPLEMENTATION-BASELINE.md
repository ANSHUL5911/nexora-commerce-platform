# Nexora Commerce Platform — Implementation Baseline
**Document Version:** 1.0  
**Phase:** PHASE 07.0 — Repository & Environment Preparation  
**Date:** September 6, 2026  
**Status:** Approved Baseline  
**Author:** Principal Software Architect & Lead Full-Stack Engineer  

---

## 1. Executive Summary

This document establishes the technical baseline for the **Nexora Commerce Platform** repository prior to active implementation. It captures the state of the legacy codebase, inspects dependencies, records baseline test and build outputs, audits security vulnerabilities, and maps legacy structures directly to the authoritative Nexora architecture specifications defined in `01-PRD-v2.1`, `02-TRD-v1.2.1`, `03-APP-FLOW-v1.0`, `04-UI-UX-DESIGN-BRIEF-v1.0`, `05-BACKEND-SCHEMA-v1.0`, and `06-IMPLEMENTATION-PLAN-v1.0`.

> [!IMPORTANT]
> `07-IMPLEMENTATION-BASELINE.md` is a descriptive implementation baseline only. The frozen architecture documents 01–06 remain authoritative. If this baseline conflicts with any frozen architecture document, documents 01–06 take precedence.

---

## 2. Repository Structure & Locations

The repository is structured as a two-tier monorepo containing the frontend and backend applications, alongside architectural documentation:

```
Ecommerce-project/
├── .git/                                # Git version control metadata
├── .gitignore                           # Root Git ignore configuration [NEW]
├── docs/                                # Architecture & Planning Specifications
│   ├── PRD.md                           # 01-PRD-v2.1.md (Product Requirements Document)
│   ├── TRD.md                           # 02-TRD-v1.2.1.md (Technical Requirements Document)
│   ├── 03-APP-FLOW-v1.0.md              # Application Flow Specification
│   ├── 04-UI-UX-DESIGN-BRIEF-v1.0.md    # UI/UX Design System Brief
│   ├── 05-BACKEND-SCHEMA-v1.0.md        # Database Schema Specification
│   ├── 06-IMPLEMENTATION-PLAN-v1.0.md   # Implementation Plan & Phase Milestones
│   ├── 07-IMPLEMENTATION-BASELINE.md    # Implementation Baseline (This Document)
│   ├── CURRENT_SYSTEM_AUDIT.md          # Architectural audit of legacy system
│   └── CURRENT_UX_AUDIT.md              # UX/UI audit of legacy system
├── ecommerce-backend/                   # Backend Node.js / Express Application
│   ├── .env.example                     # Backend environment configuration template [NEW]
│   ├── .eslintrc.json                   # ESLint backend rules
│   ├── .gitignore                       # Backend Git ignore
│   ├── backend/                         # Legacy JSON seed data snapshots
│   ├── database.sqlite                  # Legacy SQLite database file
│   ├── defaultData/                     # Default dataset fixtures (JS)
│   ├── exercise-solutions/              # Legacy exercise markdown files
│   ├── images/                          # Static product & rating images
│   ├── models/                          # Legacy Sequelize models (Product, CartItem, DeliveryOption, Order)
│   ├── routes/                          # Express route handlers
│   ├── package.json                     # Backend npm package definition
│   ├── package-lock.json                # Backend dependency lockfile
│   └── server.js                        # Backend entrypoint
└── ecommerce-project/                   # Frontend React / Vite Application
    ├── .env.example                     # Frontend environment configuration template [NEW]
    ├── .gitignore                       # Frontend Git ignore
    ├── eslint.config.js                 # Frontend ESLint configuration
    ├── index.html                       # Single Page Application HTML entrypoint
    ├── package.json                     # Frontend npm package definition
    ├── package-lock.json                # Frontend dependency lockfile
    ├── public/                          # Public static assets
    ├── setupTests.js                    # Vitest setup script
    ├── src/                             # React application source code
    │   ├── App.css                      # App layout stylesheet
    │   ├── App.jsx                      # App route definitions & root component
    │   ├── assets/                      # Static assets & icons
    │   ├── components/                  # Shared UI components
    │   ├── index.css                    # Global CSS styles
    │   ├── main.jsx                     # React DOM bootstrap
    │   ├── pages/                       # Route page components (home, checkout, orders, tracking, payment)
    │   └── utils/                       # Frontend utilities (money formatting, etc.)
    ├── starting-code/                   # Legacy starter files
    ├── vite.config.js                   # Vite configuration
    └── vitest.config.js                 # Vitest test runner configuration
```

### Path Locations
- **Backend Application Path:** `ecommerce-backend/`
- **Frontend Application Path:** `ecommerce-project/`
- **Documentation Path:** `docs/`

---

## 3. Current Architecture & Runtime Audit

### 3.1 Database & Connection Layer
- **Current Engine:** SQLite running in-memory via `sql.js-as-sqlite3` (WebAssembly-based SQLite wrapper) with hooks that synchronously dump memory to `database.sqlite` via `fs.writeFileSync`.
- **RDS Branch:** `ecommerce-backend/models/index.js` contains an unconfigured branch for RDS MySQL/PostgreSQL, but local runtime defaults entirely to `sqlite`.
- **Initialization & Seeding:** `server.js` calls `await sequelize.sync()`. If `Product.count() === 0`, it loads fixtures from `defaultData/` using `bulkCreate`.
- **Reset Mechanism:** `POST /api/reset` invokes `sequelize.sync({ force: true })` and re-populates default data.

### 3.2 ORM Configuration
- **Current ORM:** Sequelize v6.6.5.
- **Migration Setup:** No database migration framework is configured; models rely on `sequelize.sync()`.
- **Constraints & Indexes:** Minimal. Primary keys exist, but tables lack relational indexing, check constraints for positive inventory, and foreign key cascades.

### 3.3 Authentication & Authorization
- **Current Status:** Completely non-existent.
- **Vulnerabilities:**
  - No user registration, login, or session management.
  - Cart operations (`/api/cart-items`) mutate a single global cart accessible to any anonymous caller.
  - Orders (`/api/orders`) query and create records against a global pool without customer association.
  - No role-based access control (RBAC) exists.

### 3.4 Payment Processing
- **Current Status:** Insecure demo mock at `POST /api/payments`.
- **Vulnerabilities:**
  - Frontend prompts users for raw card number, cardholder name, expiry date, and CVV.
  - Form transmits raw PCI-sensitive card data over unencrypted JSON payload.
  - Backend performs simple regex validation and returns a simulated string `TXN...`.
  - Zero integration with real or test payment gateways (e.g., Razorpay).

### 3.5 Order Management & Tracking
- **Current Status:** Naive JSON blob persistence.
- **Implementation:**
  - `Order.products` is stored as an unindexed `DataTypes.JSON` column.
  - Order creation calculates total price with hardcoded 10% tax multiplier (`Math.round(totalCostCents * 1.1)`).
  - Placing an order wipes the entire `CartItem` table via `CartItem.destroy({ where: {} })`.
  - Tracking status (`/api/tracking/:orderId`) calculates delivery progression dynamically on the fly based on elapsed milliseconds between `orderTimeMs` and `Date.now()`.

### 3.6 Frontend Architecture
- **Framework:** React 19.1.0 with React Router v7.8.0, Vite v6.3.5.
- **Styling:** Ad-hoc vanilla CSS stylesheets per page with hardcoded Amazon-clone styling tokens.
- **API Client:** Axios v1.8.4 using direct relative calls with Vite proxy forwarding `/api` to `http://localhost:3000`.

---

## 4. Legacy → Nexora Migration Map

| Feature / Domain | Legacy Implementation | Future Nexora Production Component |
| :--- | :--- | :--- |
| **Database Engine** | `sql.js-as-sqlite3` / `database.sqlite` | PostgreSQL 16+ with ACID guarantees and row-level locking |
| **Schema Management** | Unmanaged `sequelize.sync()` | Sequelize CLI Migration Scripts + Controlled Seeders |
| **Currency & Monetary Math** | USD Cents (`priceCents`, `totalCostCents`) | INR Paise (`amountPaise`, `totalCostPaise`, `taxAmountPaise`, `shippingFeePaise`) with integer math |
| **Cart Management** | Single global unauthenticated `CartItem` table | User-scoped and session-scoped Cart with `CartItems` table, composite uniqueness, DB constraints |
| **Order Items** | Denormalized JSON blob `products` in `Order` | Relational `Order` and `OrderItem` tables with immutable product price/name snapshots |
| **Order State Machine** | Implicit/instant order creation | Explicit state machine (`PENDING_PAYMENT`, `PAID`, `PROCESSING`, `SHIPPED`, `DELIVERED`, `CANCELLED`, `REFUNDED`) |
| **Checkout Idempotency** | None (duplicate requests create multiple orders) | Idempotency Keys with states (`IN_PROGRESS`, `COMPLETED`, `FAILED_RETRYABLE`) and distributed locking |
| **Payment Gateway** | Fake credit card form + mock `/api/payments` endpoint | Razorpay Payment Gateway (Test Mode / Standard Checkout Modal + Webhook Verification) |
| **Payment Verification** | Client-trusted mock transaction | Backend HMAC SHA-256 signature verification (`/api/payments/verify`) + Webhook processing |
| **Payment Retries** | None | Dedicated `PaymentAttempt` entity linked to orders |
| **Inventory & Stock** | None (infinite stock assumed) | Product inventory fields (`stock_quantity`, `reserved_quantity`, with `available_quantity = stock_quantity - reserved_quantity`) plus transactional row-locking reservation logic (`SELECT ... FOR UPDATE`); explicit restock audit operations |
| **Authentication** | None | 7-day rolling server-side session authentication (`express-session`) with PostgreSQL session store, HttpOnly/Secure/SameSite cookies, Argon2/bcrypt password hashing, RBAC (`CUSTOMER`, `ADMIN`) |
| **Guest Checkout** | Unauthenticated direct cart dump | Secure Guest Checkout with 256-bit cryptographically secure random guest token → SHA-256 hash stored server-side → raw token returned once → `X-Guest-Token` header → timing-safe comparison |
| **Access Control (RBAC)** | None | Role-Based Access Control (`CUSTOMER`, `ADMIN`) with protected routes and middleware |
| **CORS Security** | Wildcard `cors()` (allows all origins) | Strict CORS policy allowing only authorized frontend origins with credentials |
| **Security Headers** | None | Helmet middleware, Content Security Policy (CSP), rate limiting |
| **Frontend UI/UX** | Legacy Amazon-clone theme | High-end Nexora Luxury/Tech Design System (Dark/Warm Luxe theme, refined typography, structured step checkout) |
| **Automated Testing** | Single failing frontend test, no backend tests | Vitest unit/integration tests for backend and frontend with >85% coverage |

---

## 5. Dependency Audit

### 5.1 Backend Dependencies (`ecommerce-backend/package.json`)
- **Current Runtime Dependencies:**
  - `cors` (`^2.8.5`): **Retain** (Requires reconfiguration for strict origin control).
  - `express` (`^4.21.2`): **Retain** (Core server framework).
  - `mysql2` (`^3.14.1`): **Obsolete** for target PostgreSQL architecture (will be removed in cleanup).
  - `patch-package` (`8.0.0`): **Retain** for package patches if required.
  - `pg` (`^8.16.0`): **Retain & Essential** (PostgreSQL driver).
  - `sequelize` (`^6.6.5`): **Retain & Essential** (ORM).
  - `sql.js` (`1.10.3`) & `sql.js-as-sqlite3` (`0.2.1`): **Obsolete** (To be phased out during Phase 07.2 DB migration).
- **Required Future Backend Dependencies:**
  - `express-session`, `connect-session-sequelize` (Session management).
  - `razorpay` (Official payment gateway SDK).
  - `bcrypt` / `argon2` (Secure password hashing).
  - `helmet` (Security headers).
  - `express-rate-limit` (DDoS and brute-force mitigation).
  - `dotenv` (Environment variable loading).
  - `zod` / `joi` (Request payload schema validation).
  - `supertest`, `jest` / `vitest` (Backend automated test framework).

### 5.2 Frontend Dependencies (`ecommerce-project/package.json`)
- **Current Runtime Dependencies:**
  - `axios` (`^1.8.4`): **Retain** (HTTP client).
  - `dayjs` (`^1.11.13`): **Retain** (Date manipulation).
  - `react` (`^19.1.0`): **Retain** (Core UI library).
  - `react-dom` (`^19.1.0`): **Retain** (DOM renderer).
  - `react-router` (`^7.8.0`): **Retain** (Client routing).
- **Current Dev Dependencies:**
  - `@vitejs/plugin-react` (`^4.4.1`): **Retain**.
  - `vite` (`^6.3.5`): **Retain**.
  - `vitest` (`^3.1.2`): **Retain** (Test framework).
  - `@testing-library/react` (`^16.3.0`): **Retain**.
  - `@testing-library/jest-dom` (`^6.6.3`): **Retain**.
  - `@testing-library/user-event` (`^14.6.1`): **Retain**.
  - `eslint` (`^9.25.0`): **Retain**.
  - `jsdom` (`^26.1.0`): **Retain**.
- **Required Future Frontend Dependencies:**
  - Lucide icons or equivalent modern icon set.
  - Razorpay standard checkout script loader (`checkout.js`).

---

## 6. Environment Configuration Baseline

Example environment files have been prepared with placeholders:
- Backend: `ecommerce-backend/.env.example`
- Frontend: `ecommerce-project/.env.example`

### 6.1 Backend Variables (`ecommerce-backend/.env.example`)
```ini
# Application Runtime
NODE_ENV=development # development | test | production
PORT=5000

# Database Configuration (PostgreSQL)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nexora_dev
DB_USER=nexora_user
DB_PASSWORD=your_secure_db_password_here
DB_SSL=false
DB_POOL_MIN=2
DB_POOL_MAX=10

# Security & Session Management
SESSION_SECRET=replace_with_a_secure_random_32_character_string_for_sessions
# 7-day rolling server-side session expiry (7 * 24 * 60 * 60 * 1000 ms)
SESSION_MAX_AGE_MS=604800000
SESSION_SECURE_COOKIE=false
SESSION_SAME_SITE=lax
GUEST_TOKEN_SECRET=replace_with_a_secure_random_32_character_string_for_tokens
GUEST_TOKEN_EXPIRY_DAYS=30

# CORS & Frontend Client
CORS_ORIGIN=http://localhost:5173

# Payment Gateway (Razorpay)
RAZORPAY_KEY_ID=rzp_test_placeholder_key_id
RAZORPAY_KEY_SECRET=placeholder_razorpay_key_secret
RAZORPAY_WEBHOOK_SECRET=placeholder_razorpay_webhook_secret

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_GENERAL=100
# 5 authentication requests/minute/IP
RATE_LIMIT_MAX_AUTH=5
RATE_LIMIT_MAX_CHECKOUT=10
RATE_LIMIT_MAX_GUEST=15
```

### 6.2 Frontend Variables (`ecommerce-project/.env.example`)
```ini
# Backend API Base URL
VITE_API_BASE_URL=/api

# Razorpay Public Key ID (Publicly exposed in browser bundle)
VITE_RAZORPAY_KEY_ID=rzp_test_placeholder_key_id
```

---

## 7. Baseline Test, Lint, and Build Results

### 7.1 Backend Test & Lint Baseline
- **Command:** `npm test` (in `ecommerce-backend`)
  - **Result:** `FAILED (Exit Code 1)`
  - **Output:** `"Error: no test specified"`
  - **Status:** No backend test runner configured.
- **Command:** `npx eslint .` (in `ecommerce-backend`)
  - **Result:** `PASSED (Exit Code 0)`
  - **Output:** Clean, 0 errors, 0 warnings.

### 7.2 Frontend Test, Lint, and Build Baseline
- **Command:** `npm run lint` (in `ecommerce-project`)
  - **Result:** `FAILED (Exit Code 1)`
  - **Output:**
    ```
    C:\Users\ANSHUL SINGH JADON\Desktop\Ecommerce-project\ecommerce-project\src\pages\payment\PaymentPage.jsx
      29:11  error  'totalQuantity' is assigned a value but never used. Allowed unused vars must match /^[A-Z_]/u  no-unused-vars
    ✖ 1 problem (1 error, 0 warnings)
    ```
- **Command:** `npx vitest run --no-color` (in `ecommerce-project`)
  - **Result:** `FAILED (Exit Code 1)`
  - **Test Suites:** 3 total (1 failed, 2 passed)
    - `src/utils/money.test.js`: 4 passed
    - `src/pages/home/Product.test.jsx`: 3 passed
    - `src/pages/home/HomePage.test.jsx`: 1 failed (`displays the products correct` failed on finding product container test id due to mock resolution timing)
  - **Total Tests:** 8 total (7 passed, 1 failed)
- **Command:** `npm run build` (in `ecommerce-project`)
  - **Result:** `PASSED (Exit Code 0)`
  - **Output:**
    ```
    vite v6.4.1 building for production...
    transforming...
    ✓ 117 modules transformed.
    rendering chunks...
    computing gzip size...
    dist/index.html                   0.67 kB │ gzip:  0.39 kB
    dist/assets/index-DTzReXwK.css   15.26 kB │ gzip:  3.05 kB
    dist/assets/index-CluLSyqp.js   289.52 kB │ gzip: 94.14 kB
    ✓ built in 1.82s
    ```

---

## 8. Security Vulnerability & Limitation Audit

1. **Insecure Card Capture:** The legacy application collects raw credit card PAN, CVV, and expiration dates directly on the client and posts them to `/api/payments`. This represents a severe security hazard and PCI-DSS non-compliance. Must be completely eliminated in favor of Razorpay SDK.
2. **Unrestricted CORS:** `app.use(cors())` allows arbitrary domains to execute cross-origin requests with no origin validation.
3. **No Authentication or Session Scoping:** Cart and order endpoints lack user or session separation. Any client can inspect, modify, or clear global state.
4. **No Idempotency Protection:** Checkout and payment endpoints permit duplicate submissions, leading to duplicate orders on network retries.
5. **No Concurrency / Race Condition Defense:** SQLite lacks row-level locking. Simultaneous checkout requests can oversell inventory.
6. **Absence of Rate Limiting & Security Headers:** Express application lacks Helmet headers, CORS policies, or rate limiters, leaving it vulnerable to brute force and DDoS.
7. **Monetary Precision Vulnerabilities:** Floating point arithmetic and reliance on USD cents contradicts PRD/TRD requirements for integer INR Paise calculations.

---

## 9. Next Stage Recommendation

**Recommended Next Stage:** **PHASE 07.1 — Backend Foundation**
- Establish PostgreSQL connection infrastructure with Sequelize.
- Configure environment loader with strict schema validation.
- Implement central error handling, logging, and response standardization.
- Set up security headers (Helmet), strict CORS, and rate limiting middleware.
- Configure server-side session authentication scaffolding.
- Introduce backend test runner suite (Vitest/Jest + Supertest).
