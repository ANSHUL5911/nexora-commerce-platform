# Phase 07.26E — Nexora Homepage / Catalog Separation Report

**Status:** COMPLETE / VERIFIED / FROZEN  
**Date:** 2026-09-21  
**Scope:** Frontend Customer Experience Architecture (`HomePage.jsx`, `CatalogPage.jsx`, `Header.jsx`, `App.jsx`, `CustomerRoute.jsx`, and corresponding test suites)

---

## 1. Previous Behavior vs. New Routing Model

### Previous Problem
Prior to Phase 07.26E, Nexora lacked a dedicated customer-facing brand homepage. The root path (`/`) directly rendered the product catalog grid with filters, search, and catalog controls:
```text
Guest / Customer
       ↓
       /
       ↓
  Product Catalog
```
This created an incomplete commerce experience with no brand landing, narrative introduction, or architectural editorial presence.

### New Routing Model
Phase 07.26E separates the brand editorial experience from the commerce catalog while preserving all existing commerce operations, product detail routing, cart, orders, and strict administrative isolation:

```text
/                    → Nexora Brand Editorial Homepage
/catalog             → Commerce Product Catalog (Grid, Categories, Search, Filters)
/product/:productId  → Product Detail Page
/products/:productId → Product Detail Page (Canonical Alias)
/products/*          → Product Detail Page (Alias Wildcard)
/cart                → Cart
/checkout            → Checkout
/orders              → Orders
/tracking/:id/:pid   → Shipment Tracking
/payment             → Payment Handling
/admin/*             → Admin Console
```

---

## 2. Dedicated Brand Homepage Implementation (`src/pages/home/`)

A dedicated customer-facing homepage was implemented in `src/pages/home/HomePage.jsx` styled with `src/pages/home/HomePage.css`.

### Design Philosophy
- **Architectural Editorial Language**: Influenced by Apple, Aesop, COS, and Linear.
- **Restrained & Typographic**: Utilizes `Newsreader` (`var(--font-display)`) for editorial titles, `Inter` (`var(--font-body)`) for UI/body copy, and `JetBrains Mono` (`var(--font-mono)`) for taxonomy indexes and meta identifiers.
- **Clean Aesthetic**: Neutral palette, subtle borders (`var(--color-border-subtle)`), spacious layout, no gradients, no neon, no generic AI cards, and no distracting dashboard metrics.
- **Motion Restraint**: Micro-transitions only; full `@media (prefers-reduced-motion: reduce)` support.

### Homepage Architecture & Sections
1. **Header**: Renders `<Header>` with `NEXORA` wordmark pointing to `/` and `Catalog` pointing to `/catalog`.
2. **Editorial Hero Section**:
   - Eyebrow: `AUTUMN / WINTER EDITION`
   - Headline: *"Architectural essentials, engineered for enduring utility."*
   - Subtitle: *"A restrained collection of everyday objects, footwear, and apparel crafted with disciplined material standards and uncompromising craft."*
   - Primary Action: `Explore Collection` button linking directly to `/catalog`.
   - Secondary Action: `Brand Editorial` jump-link.
3. **Editorial Showcase Block**:
   - Narrative on material permanence over novelty.
   - Architectural meta grid (Philosophy: Architectural, Standard: Uncompromising, Lifetime: Enduring).
   - Card linking to `/catalog`.
4. **Shop by Category Section**:
   - Four taxonomy cards: **Apparel** (`01`), **Living** (`02`), **Footwear** (`03`), and **Accessories** (`04`).
   - Cards link directly to `/catalog?category=APPAREL`, `/catalog?category=LIVING`, etc., seamlessly applying existing catalog filtering.
5. **Selected Products Section**:
   - Fetches a curated subset of real products from the backend via `productsApi.listProducts({ limit: 6 })`.
   - Displays loading skeletons during fetch.
   - Handles network errors gracefully with retry button without crashing the homepage.
   - Products link to canonical product details.
   - Includes secondary CTA: `View All Products` linking to `/catalog`.
6. **Nexora Philosophy Section**:
   - Brand statement: *"Design is not an embellishment; it is the discipline of stripping away until only purpose remains."*

---

## 3. Canonical Catalog Route Migration (`/catalog`)

The existing commerce catalog experience was extracted into `src/pages/catalog/CatalogPage.jsx` and `src/pages/catalog/CatalogPage.css` without duplicate logic or feature loss.

### Preserved Features
- Full product grid with responsive breakpoints (4 cols desktop, 3 cols tablet, 2 cols mobile).
- Category filtering tabs (`ALL`, `APPAREL`, `LIVING`, `FOOTWEAR`, `ACCESSORIES`).
- URL query parameter synchronization (`/catalog?category=APPAREL`, `/catalog?search=socks`).
- Out-of-stock and low-stock badges.
- Accessible loading skeletons and error states with retry.
- Empty states with one-click category reset.
- Quantity selectors and immediate Add to Cart flow.

### Re-exports and Component Preservation
To prevent import churn across existing test suites and administrative views:
- `Product.jsx` and `ProductsGrid.jsx` remain in `src/pages/home/` as canonical implementations.
- Clean re-exports were established in `src/pages/catalog/Product.jsx` and `src/pages/catalog/ProductsGrid.jsx`.

---

## 4. Header & Navigation Updates (`src/components/Header.jsx`)

1. **Brand Wordmark Logo (`NEXORA`)**:
   - Guests & Customers: Links to `/` (Brand Homepage).
   - Admins: Links to `/admin` (Admin Console).
2. **Catalog Navigation Link**:
   - Desktop nav link: Targets `/catalog` (highlighted when active).
   - Mobile drawer nav link: Targets `/catalog`.
3. **Search Bar Behavior**:
   - From Homepage (`/`): Submitting or debouncing search navigates to `/catalog?search=<query>`.
   - On Catalog (`/catalog`): Updates search query parameters in-place via `setSearchParams` without full page reloads.
   - Leaving Catalog resets header search input cleanly.

---

## 5. Strict Role Isolation & Authentication Matrix

All customer storefront routes continue to be protected by `<CustomerRoute>` to enforce strict separation:

| Route | Guest | Customer | Admin |
|---|---|---|---|
| `/` | Brand Homepage | Brand Homepage | Redirect to `/admin` |
| `/catalog` | Product Catalog | Product Catalog | Redirect to `/admin` |
| `/product/:id` | Product Detail | Product Detail | Redirect to `/admin` |
| `/cart` | Guest Cart | Customer Cart | Redirect to `/admin` |
| `/orders` | Order Lookup / Login | Order History | Redirect to `/admin` |
| `/admin/*` | Redirect to `/` | 403 Access Denied | Admin Console |

- Admins navigating directly to `/` or `/catalog` are immediately redirected to `/admin`.
- Authenticated customers remain on `/` when visiting the root route (no unwanted redirect to catalog).
- Zero customer cart endpoints are invoked for administrative sessions.

---

## 6. Verification Results

### Automated Test Suite Execution
- **Frontend Test Suite (`npx vitest run`)**:
  - **Test Files**: 30 passed (30 total)
  - **Tests**: 231 passed (231 total)
  - **Duration**: ~25s
- **Frontend ESLint (`npm run lint`)**:
  - Clean (0 errors, 0 warnings).
- **Frontend Production Build (`npm run build`)**:
  - Successful (165 modules transformed, 0 errors).
- **Backend Test Suite (`npm test`)**:
  - **Test Files**: 59 passed (59 total)
  - **Tests**: 509 passed (509 total)
  - All database, inventory concurrency, idempotency, webhook, and RBAC tests green.
- **Backend ESLint (`npm run lint`)**:
  - Clean (0 errors, 0 warnings).

### Manual Browser Verification (`browser_subagent`)
Verified across real browser sessions:
1. **Guest Access to `/`**: Confirmed dedicated brand homepage with hero, narrative, category taxonomy cards, and selected products.
2. **Navigation to `/catalog`**: Clicked "Catalog" in top navigation; verified URL changed to `http://localhost:5173/catalog` and Product Catalog heading rendered with category tabs.
3. **Logo Navigation**: Clicked "NEXORA" wordmark logo; returned immediately to `http://localhost:5173/`.
4. **Category Deep-Linking**: Clicked "Apparel" card on homepage; navigated to `http://localhost:5173/catalog?category=APPAREL` with `APPAREL` tab active and filtered products displayed.
5. **Search Redirection**: Typed `"cotton"` into homepage header search and submitted; navigated directly to `http://localhost:5173/catalog?search=cotton`.
6. **Authenticated Customer Routing Verification**:
   - Registered and authenticated as a real customer (`Customer Test`).
   - Verified that authenticated customer remains on `http://localhost:5173/` (Brand Editorial Homepage) without being forced onto `/catalog`.
   - Verified that clicking `Catalog` navigates to `http://localhost:5173/catalog`.
   - Verified that clicking `NEXORA` logo returns to `http://localhost:5173/` with session active and authenticated menu displayed.

### Performance & Network Observations
- On `/`, only `GET /api/products?limit=6` is requested (14ms execution time).
- No unnecessary full catalog pagination, cart queries, or admin queries occur on the homepage.
- On `/catalog`, full category parameters and search parameters execute with standard pagination.

---

## 7. Defects Discovered & Resolved During Phase

1. **Re-export Syntax in Catalog Shim Files**:
   - *Issue*: Initial re-export in `src/pages/catalog/Product.jsx` triggered `no-undef` in ESLint.
   - *Fix*: Imported `Product` and re-exported named and default explicitly (`export { Product }; export default Product;`).
2. **State Updates in Test Suite**:
   - *Issue*: Background resolution of `productsApi.listProducts({ limit: 6 })` in `HomePage.jsx` triggered unhandled `act(...)` warnings in Vitest.
   - *Fix*: Added `await waitFor(() => expect(productsApi.listProducts).toHaveBeenCalled())` to synchronize asynchronous effects cleanly.

---

## 8. Final Status & Architectural Freeze

```text
PHASE 07.26E
Homepage / Catalog Separation
────────────────────────────────
Implementation        ✅
Routing               ✅
Customer UX           ✅
Admin isolation       ✅
Search                ✅
Category deep links   ✅
API efficiency        ✅
Accessibility         ✅
Frontend tests        ✅ 231/231
Backend tests         ✅ 509/509
Lint                  ✅
Build                 ✅
Browser verification  ✅

STATUS: COMPLETE / VERIFIED / FROZEN
```

Nexora now presents a distinct, disciplined brand editorial homepage at `/` and a commerce catalog at `/catalog`, preserving all existing features, security rules, and architectural integrity.
