# Current System Audit

**Audit Date:** September 5, 2026
**Auditor:** AI Code Review
**Branch:** upgrade/production-commerce

---

## 1. Executive Summary

This is a **learning/demo e-commerce application** with a React frontend and Express backend. The system provides basic shopping cart functionality, order management, and a simulated payment system. It is **NOT production-ready** and lacks critical features required for a real e-commerce platform including authentication, real payment processing, inventory management, security hardening, and proper error handling.

**Key Finding:** This appears to be an educational project (based on exercise-solutions folder and documentation style) designed to teach full-stack development concepts, not a production commerce system.

---

## 2. Technology Stack

### Frontend
- **Framework:** React 19.1.0
- **Build Tool:** Vite 6.3.5
- **Routing:** react-router 7.8.0
- **HTTP Client:** axios 1.8.4
- **Date Handling:** dayjs 1.11.13
- **Testing:** vitest 3.1.2, @testing-library/react 16.3.0

**Reference:** `ecommerce-project/package.json`

### Backend
- **Runtime:** Node.js (ESM modules)
- **Framework:** Express 4.21.2
- **ORM:** Sequelize 6.6.5
- **Database Support:** SQLite (via sql.js), MySQL, PostgreSQL
- **CORS:** cors 2.8.5
- **Development:** nodemon 3.1.9

**Reference:** `ecommerce-backend/package.json`

### Database
- **Default:** SQLite (in-memory with file persistence via sql.js)
- **Production Option:** MySQL or PostgreSQL via RDS environment variables

**Reference:** `ecommerce-backend/models/index.js:5-41`

---

## 3. Repository Structure

```
Ecommerce-project/
├── ecommerce-backend/           # Express API server
│   ├── backend/                 # JSON data files (unused, legacy)
│   ├── defaultData/             # Seed data for database
│   ├── models/                  # Sequelize models
│   ├── routes/                  # Express route handlers
│   ├── images/                  # Static product images
│   ├── server.js                # Application entry point
│   └── database.sqlite          # SQLite database file
│
├── ecommerce-project/           # React frontend
│   ├── src/
│   │   ├── components/          # Shared components (Header)
│   │   ├── pages/               # Page components
│   │   │   ├── home/            # Product listing
│   │   │   ├── checkout/        # Cart and checkout
│   │   │   ├── orders/          # Order history
│   │   │   ├── payment/         # Payment form
│   │   │   └── not_found/       # 404 page
│   │   ├── utils/               # Utility functions
│   │   ├── App.jsx              # Main app component
│   │   └── main.jsx             # React entry point
│   ├── public/                  # Static assets
│   └── dist/                    # Build output
│
└── docs/                        # Documentation
```

**Note:** Both projects have separate package.json files and node_modules - they are independent applications.

---

## 4. Frontend Architecture

### 4.1 Application Structure

**Entry Point:** `main.jsx` uses React 19's createRoot with StrictMode and BrowserRouter.

**Reference:** `ecommerce-project/src/main.jsx:7-15`

### 4.2 Routing

Routes defined in `App.jsx`:
- `/` - HomePage (product listing)
- `/checkout` - CheckoutPage (cart management)
- `/orders` - OrdersPage (order history)
- `/tracking/:orderId/:productId` - TrackingPage (delivery tracking)
- `/payment` - PaymentPage (payment form)
- `*` - NotFoundPage

**Reference:** `ecommerce-project/src/App.jsx:27-34`

### 4.3 State Management

**No global state management library.** State is managed via:
- **Local component state** with useState
- **Prop drilling** for cart state (passed from App.jsx to all pages)
- **Server state** fetched via axios on each page load

**Cart State Pattern:**
```javascript
const [cart, setCart] = useState([]);
const loadCart = async () => {
  const cartResponse = await axios.get('/api/cart-items?expand=product')
  setCart(cartResponse.data);
};
```

**Reference:** `ecommerce-project/src/App.jsx:15-24`

**Issue:** Cart is re-fetched on every page navigation, not cached.

### 4.4 Component Architecture

**Page Components:**
- HomePage - Product grid with search
- CheckoutPage - Cart review with delivery options
- PaymentPage - Payment form with validation
- OrdersPage - Order history grid
- TrackingPage - Delivery tracking visualization

**Shared Components:**
- Header - Navigation, search, cart icon
- Product - Individual product card with add-to-cart
- ProductsGrid - Product listing layout
- OrdersGrid - Order history layout

### 4.5 Data Fetching Pattern

All pages use useEffect + axios pattern:

```javascript
useEffect(() => {
  const fetchData = async () => {
    const response = await axios.get('/api/endpoint');
    setData(response.data);
  };
  fetchData();
}, [dependencies]);
```

**Issues:**
- No loading states in most components
- No error handling for failed requests
- No request cancellation on unmount
- No caching of responses

**Reference:** `ecommerce-project/src/pages/home/HomePage.jsx:14-22`

---

## 5. Backend Architecture

### 5.1 Server Setup

**Entry Point:** `server.js`
- Express app with CORS enabled (open to all origins)
- JSON body parser
- Static file serving for images and frontend dist
- Database sync on startup with seed data

**Reference:** `ecommerce-backend/server.js:24-110`

### 5.2 API Structure

All routes prefixed with `/api`:
- `/api/products` - Product listing
- `/api/delivery-options` - Shipping options
- `/api/cart-items` - Cart CRUD
- `/api/orders` - Order management
- `/api/payment-summary` - Cost calculation
- `/api/payments` - Payment processing
- `/api/tracking` - Order tracking
- `/api/reset` - Database reset

**Reference:** `ecommerce-backend/server.js:36-44`

### 5.3 Middleware Stack

```javascript
app.use(cors());              // No origin restrictions
app.use(express.json());      // Body parsing
app.use('/images', ...);      // Static images
app.use(express.static(...)); // Frontend dist
```

**Reference:** `ecommerce-backend/server.js:29-47`

**Critical Gap:** No authentication, authorization, rate limiting, or request validation middleware.

---

## 6. Database Architecture

### 6.1 Database Connection

**Flexible Connection:** Supports SQLite (default), MySQL, or PostgreSQL based on environment variables.

```javascript
const isUsingRDS = process.env.RDS_HOSTNAME && 
                   process.env.RDS_USERNAME && 
                   process.env.RDS_PASSWORD;
```

**Reference:** `ecommerce-backend/models/index.js:5-41`

### 6.2 SQLite Persistence

SQLite runs in-memory but persists to `database.sqlite` file via Sequelize hooks:
- afterCreate, afterDestroy, afterUpdate, afterSave, afterUpsert
- afterBulkCreate, afterBulkDestroy, afterBulkUpdate

**Reference:** `ecommerce-backend/models/index.js:33-48`

**Warning:** This persistence mechanism is fragile and not suitable for production.

### 6.3 Data Models

#### Product Model
```javascript
{
  id: UUID (primary key),
  image: STRING,
  name: STRING,
  rating: JSON ({ stars: number, count: number }),
  priceCents: INTEGER,
  keywords: STRING (comma-separated, with getter/setter),
  createdAt: DATE(3),
  updatedAt: DATE(3)
}
```

**Reference:** `ecommerce-backend/models/Product.js`

#### CartItem Model
```javascript
{
  productId: UUID (foreign key to Product),
  quantity: INTEGER,
  deliveryOptionId: STRING (foreign key to DeliveryOption),
  createdAt: DATE(3),
  updatedAt: DATE(3)
}
```

**Note:** No primary key defined - Sequelize will create a default `id` field.

**Reference:** `ecommerce-backend/models/CartItem.js`

#### DeliveryOption Model
```javascript
{
  id: STRING (primary key),
  deliveryDays: INTEGER,
  priceCents: INTEGER,
  createdAt: DATE(3),
  updatedAt: DATE(3)
}
```

**Reference:** `ecommerce-backend/models/DeliveryOption.js`

#### Order Model
```javascript
{
  id: UUID (primary key),
  orderTimeMs: BIGINT,
  totalCostCents: INTEGER,
  products: JSON (array of { productId, quantity, estimatedDeliveryTimeMs }),
  createdAt: DATE(3),
  updatedAt: DATE(3)
}
```

**Reference:** `ecommerce-backend/models/Order.js`

### 6.4 Database Relationships

**Defined in models only (not enforced at DB level):**
- CartItem.productId → Product.id
- CartItem.deliveryOptionId → DeliveryOption.id

**Missing Relationships:**
- No Order → Products relationship (stored as JSON)
- No User model or relationships
- No foreign key constraints

### 6.5 Seed Data

Default data loaded on first run:
- 36 products (`defaultProducts.js`)
- 3 delivery options (`defaultDeliveryOptions.js`)
- 2 cart items (`defaultCart.js`)
- 2 sample orders (`defaultOrders.js`)

**Reference:** `ecommerce-backend/defaultData/`

---

## 7. Authentication & Authorization

### 7.1 Current Implementation

**NONE.** There is no authentication or authorization system implemented.

**Evidence:**
- No User model
- No login/register endpoints
- No JWT or session management
- No protected routes
- All API endpoints are publicly accessible

### 7.2 Security Implications

- Any user can access any order by ID
- No user-specific carts (global cart for all users)
- No admin functionality protection
- No rate limiting on sensitive endpoints

---

## 8. Commerce Features

### 8.1 Product Catalog

**Features:**
- Product listing with pagination (via grid layout)
- Search by name or keywords (case-insensitive)
- Product images, ratings, pricing

**Implementation:**
```javascript
// Search filters on name or keywords
products = products.filter(product => {
  const nameMatch = product.name.toLowerCase().includes(lowerCaseSearch);
  const keywordsMatch = product.keywords.some(keyword => 
    keyword.toLowerCase().includes(lowerCaseSearch)
  );
  return nameMatch || keywordsMatch;
});
```

**Reference:** `ecommerce-backend/routes/products.js:6-29`

**Missing:**
- No categories or filtering by category
- No sorting options (sort by price, rating, etc.)
- No pagination (all products returned)
- No inventory/stock tracking
- No product variants (size, color)

### 8.2 Shopping Cart

**Features:**
- Add products to cart
- Update quantity (1-10 limit)
- Update delivery option
- Remove items from cart
- Persisted in database

**Cart Behavior:**
- Adding existing product increments quantity
- Default delivery option: "1" (7-day shipping)
- Quantity limit: 1-10 per product

**Reference:** `ecommerce-backend/routes/cartItems.js:25-46`

**Issues:**
- **Global cart** - All users share the same cart
- No cart expiration
- No maximum cart value/item count
- No validation of product availability

### 8.3 Checkout Process

**Flow:**
1. Review cart on `/checkout` page
2. Select delivery options per item
3. View payment summary
4. Click "Place your order" → redirects to `/payment`
5. Enter payment details
6. Submit payment
7. Order created, cart cleared
8. Redirect to `/orders`

**Reference:** `ecommerce-project/src/pages/checkout/CheckoutPage.jsx`

**Missing:**
- No shipping address collection
- No billing address
- No order confirmation email
- No guest checkout option (because no users exist)

### 8.4 Order Management

**Features:**
- Order history with product details
- Order tracking with delivery status
- "Buy again" button to re-add products to cart

**Order Structure:**
```javascript
{
  id: UUID,
  orderTimeMs: timestamp,
  totalCostCents: number (includes 10% tax),
  products: [
    { productId, quantity, estimatedDeliveryTimeMs }
  ]
}
```

**Reference:** `ecommerce-backend/routes/orders.js`

**Missing:**
- No order cancellation
- No order modification
- No refund process
- No order status history

### 8.5 Delivery Tracking

**Implementation:**
- Simulated tracking based on time elapsed
- Three states: Preparing, Shipped, Delivered
- Progress percentage calculated from order time

```javascript
if (currentTime >= estimatedDelivery) {
  status = 'Delivered';
  progress = 100;
} else if (currentTime > orderTime + (estimatedDelivery - orderTime) * 0.3) {
  status = 'Shipped';
  progress = 50;
}
```

**Reference:** `ecommerce-backend/routes/tracking.js:25-38`

**Note:** This is purely time-based simulation, not real tracking.

---

## 9. Payment System

### 9.1 Current Implementation

**FAKE PAYMENT PROCESSOR** - Validates card details but does not process real payments.

**Validation:**
- Card number: 13-19 digits
- CVV: 3-4 digits
- Expiry date: MM/YY format, must not be expired
- All fields required

**Reference:** `ecommerce-backend/routes/payments.js:5-45`

### 9.2 Payment Flow

```javascript
// Frontend
await axios.post('/api/payments', { cardNumber, cardholderName, expiryDate, cvv });
await axios.post('/api/orders');

// Backend
// Validates card details, returns success
// No actual payment processing
```

**Reference:** `ecommerce-project/src/pages/payment/PaymentPage.jsx:113-123`

### 9.3 Security Issues

**CRITICAL:**
- CVV is logged/echoed in error messages
- Card number transmitted without encryption (frontend → backend)
- No PCI DSS compliance
- No real payment gateway integration
- CVV stored in memory (and potentially logged)

**Note:** This is acceptable for a learning project but must be completely replaced for production.

### 9.4 What's Missing

- Real payment gateway (Stripe, PayPal, etc.)
- Payment method storage
- Transaction logging
- Refund capability
- Invoice generation
- Currency support (USD only via cents)

---

## 10. Admin System

**NONE.** There is no admin panel or admin functionality.

**Missing:**
- Product management (CRUD)
- Order management
- User management
- Analytics/dashboard
- Inventory management
- Sales reports

**Note:** There is a `/api/reset` endpoint that resets the database to default state, which is dangerous for production.

**Reference:** `ecommerce-backend/routes/reset.js`

---

## 11. API Inventory

### Products
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/products | List all products (optional ?search=) |

### Delivery Options
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/delivery-options | List delivery options (?expand=estimatedDeliveryTime) |

### Cart
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/cart-items | Get cart items (?expand=product) |
| POST | /api/cart-items | Add item to cart |
| PUT | /api/cart-items/:productId | Update quantity or delivery |
| DELETE | /api/cart-items/:productId | Remove from cart |

### Orders
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/orders | List all orders (?expand=products) |
| POST | /api/orders | Create order from cart |
| GET | /api/orders/:orderId | Get specific order |

### Payment
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/payment-summary | Calculate cart totals |
| POST | /api/payments | Process payment (fake) |

### Tracking
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/tracking/:orderId | Get tracking info |

### Utility
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/reset | Reset database to defaults |

**Reference:** `ecommerce-backend/documentation.md`

---

## 12. Security Assessment

### 12.1 Critical Issues

**No Authentication**
- All endpoints publicly accessible
- No user isolation
- Anyone can view/modify any order

**CORS Wide Open**
```javascript
app.use(cors()); // Allows any origin
```

**Reference:** `ecommerce-backend/server.js:30`

**No Rate Limiting**
- No protection against DoS attacks
- No brute force protection

**No Input Validation Middleware**
- Validation only in route handlers
- No centralized validation

**Payment Data Handling**
- CVV transmitted and processed (should never touch backend)
- No encryption in transit beyond HTTPS
- No PCI compliance

**SQL Injection Risk: LOW**
- Using Sequelize ORM with parameterized queries

**XSS Risk: LOW**
- React escapes by default
- No user-generated content stored

### 12.2 Medium Issues

**No CSRF Protection**
- No CSRF tokens
- Vulnerable to cross-site request forgery

**No Security Headers**
- Missing Helmet.js or similar
- No CSP, XSS-Protection headers

**No Request Size Limits**
- express.json() without limit option

**Error Messages Leak Information**
```javascript
console.error(err.stack);
res.status(500).json({ error: 'Something went wrong!' });
```

**Reference:** `ecommerce-backend/server.js:61-64`

**Database Reset Endpoint**
```javascript
// Anyone can call this and wipe all data
router.post('/', async (req, res) => {
  await sequelize.sync({ force: true });
  // ...
});
```

**Reference:** `ecommerce-backend/routes/reset.js:14-48`

### 12.3 Low Issues

**No Environment Variable Validation**
- No check if required env vars exist

**Default Data Contains Real-looking Data**
- Could be confused with real products

**No HTTPS Enforcement**
- Relies on reverse proxy or hosting platform

---

## 13. Performance Assessment

### 13.1 Frontend Performance

**Issues:**
- No code splitting (all pages loaded at once)
- No lazy loading of images
- No service worker or caching
- Cart re-fetched on every route change
- No memoization of expensive computations

**Bundle Size:**
- Single JS bundle: ~140KB (from dist/assets/)
- CSS bundle: ~12KB

**Reference:** `ecommerce-project/dist/assets/`

### 13.2 Backend Performance

**N+1 Query Problem:**
```javascript
// For each cart item, makes separate queries
for (const item of cartItems) {
  const product = await Product.findByPk(item.productId);
  const deliveryOption = await DeliveryOption.findByPk(item.deliveryOptionId);
  // ...
}
```

**Reference:** `ecommerce-backend/routes/paymentSummary.js:14-20`

**No Database Indexing:**
- No indexes defined on frequently queried fields
- Search scans all products in memory

**No Caching:**
- Every request hits database
- No Redis or similar cache layer

**No Pagination:**
- All products returned in single response
- All orders returned in single response

**SQLite Limitations:**
- Not suitable for concurrent writes
- File-based persistence has race conditions
- No connection pooling

### 13.3 Image Handling

**Images served directly from filesystem:**
- No CDN
- No image optimization
- No responsive images
- Images stored in repo (should use object storage)

**Reference:** `ecommerce-backend/images/products/`

---

## 14. UI/UX Assessment

### 14.1 Responsive Design

**Implemented:**
- CSS Grid with responsive breakpoints
- Mobile-friendly product grid (8 → 1 columns)

**Reference:** `ecommerce-project/src/pages/home/HomePage.css:5-66`

### 14.2 User Feedback

**Present:**
- "Added to cart" confirmation (2-second display)
- Loading states (PaymentPage only)

**Missing:**
- Loading spinners for most operations
- Error toasts/notifications
- Form validation feedback (PaymentPage has this)
- Empty state messages

### 14.3 Navigation

**Implemented:**
- Header with logo, search, orders, cart
- Breadcrumbs missing
- Back to orders link from tracking

### 14.4 Accessibility

**Issues:**
- Missing alt text on some images
- No skip-to-content link
- No ARIA labels on interactive elements
- Color contrast may be insufficient
- No keyboard navigation testing evident

**Positive:**
- Semantic HTML used
- Labels on form inputs
- Type="password" on CVV field

---

## 15. Testing Assessment

### 15.1 Test Infrastructure

**Setup:**
- Vitest with jsdom environment
- @testing-library/react
- @testing-library/user-event
- jest-dom matchers

**Reference:** `ecommerce-project/vitest.config.js`

### 15.2 Test Coverage

**Existing Tests:**
- `money.test.js` - 4 tests for formatMoney utility
- `HomePage.test.jsx` - 1 test for product display
- `Product.test.jsx` - 3 tests for product component

**Reference:** `ecommerce-project/src/utils/money.test.js`, `ecommerce-project/src/pages/home/`

**Test Quality:**
- Tests mock axios appropriately
- Use testing-library best practices
- Test user interactions, not implementation

**Missing Tests:**
- No backend tests
- No integration tests
- No E2E tests
- No tests for:
  - Cart operations
  - Checkout flow
  - Payment validation
  - Order creation
  - API routes

### 15.3 Test Command

```json
"test": "echo \"Error: no test specified\" && exit 1"
```

**Reference:** `ecommerce-backend/package.json:7`

**Backend has no test runner configured.**

---

## 16. Deployment Assessment

### 16.1 Frontend Build

```bash
npm run build  # Creates dist/ folder
npm run preview # Preview production build
```

**Output:** Static files in `dist/` directory

**Reference:** `ecommerce-project/package.json:7-10`

### 16.2 Backend Deployment

```bash
npm start  # Runs node server.js
npm run dev # Runs nodemon server.js
```

**Reference:** `ecommerce-backend/package.json:8-9`

### 16.3 Environment Configuration

**Required Environment Variables (for production database):**
- `RDS_HOSTNAME`
- `RDS_USERNAME`
- `RDS_PASSWORD`
- `RDS_DB_NAME`
- `RDS_PORT` (optional)
- `DB_TYPE` (mysql or postgres)
- `PORT` (optional, default 3000)

**Reference:** `ecommerce-backend/models/index.js:5-24`

### 16.4 Static File Serving

Backend serves:
- `/images/*` → Product images
- `/*` → Frontend dist/ files (SPA fallback)

**Reference:** `ecommerce-backend/server.js:33-57`

### 16.5 Deployment Gaps

**Missing:**
- No Docker configuration
- No CI/CD pipeline
- No process manager (PM2, systemd)
- No health check endpoint
- No monitoring/logging
- No backup strategy
- No deployment documentation
- No environment-specific configs

---

## 17. Technical Debt

### 17.1 Code Quality Issues

**Inconsistent Error Handling:**
- Some routes catch errors, others don't
- No centralized error handling
- Generic error messages

**Prop Drilling:**
- Cart and loadCart passed through multiple component levels
- Should use Context API or state management

**Duplicate Code:**
- Product fetching logic repeated across routes
- Payment summary calculation duplicated

**No TypeScript:**
- No type safety
- No compile-time error detection

**Unused Files:**
- `ecommerce-project/starting-code/` directory (appears to be starter files)
- `ecommerce-backend/backend/*.json` files (legacy, unused)

### 17.2 Architecture Issues

**No Separation of Concerns:**
- Business logic in route handlers
- No service layer
- No repository pattern

**No Input Validation Layer:**
- Validation scattered across routes
- No schema validation (Joi, Yup, Zod)

**No Configuration Management:**
- Hardcoded values (tax rate 10%)
- No environment-based config

### 17.3 Dependency Issues

**Outdated/Patched Dependencies:**
- `sql.js-as-sqlite3` requires patch-package
- Sequelize version 6.6.5 (newer versions available)

**Reference:** `ecommerce-backend/patches/`

---

## 18. Current Strengths

1. **Clean Code Structure** - Well-organized directories, clear separation of pages/components
2. **Modern Tech Stack** - React 19, Vite, ES modules
3. **Responsive Design** - Mobile-first CSS with breakpoints
4. **Basic Test Coverage** - Unit tests for critical components
5. **Flexible Database Support** - Can use SQLite, MySQL, or PostgreSQL
6. **Good Documentation** - API documentation in documentation.md
7. **Simple to Understand** - Good for learning full-stack development
8. **Fast Development** - Hot reload on both frontend and backend

---

## 19. Current Weaknesses

1. **No Authentication** - Critical for any real application
2. **Global Cart** - All users share the same cart
3. **Fake Payment** - Not integrated with real payment processor
4. **No Admin Panel** - Cannot manage products or orders
5. **No User Accounts** - No personalization, order history per user
6. **Security Gaps** - No CSRF, rate limiting, security headers
7. **Performance Issues** - N+1 queries, no caching, no pagination
8. **No Inventory Management** - Products assumed always available
9. **No Address Collection** - Missing shipping/billing addresses
10. **Limited Test Coverage** - Backend untested, E2E missing

---

## 20. Recommended Improvements

### 20.1 Critical (Must Have for Production)

1. **Implement Authentication System**
   - User registration/login
   - JWT or session-based auth
   - Protected routes and user-specific data

2. **Integrate Real Payment Gateway**
   - Stripe or similar
   - PCI compliance
   - Never handle raw card data

3. **Add User-Specific Carts**
   - Associate carts with user accounts
   - Persist across sessions

4. **Security Hardening**
   - Add Helmet.js for security headers
   - Implement rate limiting
   - Add CSRF protection
   - Input validation middleware
   - HTTPS enforcement

5. **Address Collection**
   - Shipping address form
   - Billing address
   - Address validation

### 20.2 Important (Should Have)

1. **Admin Panel**
   - Product CRUD
   - Order management
   - User management

2. **Performance Optimization**
   - Fix N+1 queries with Sequelize includes
   - Add caching layer (Redis)
   - Implement pagination
   - Add database indexes

3. **Enhanced Commerce Features**
   - Inventory/stock tracking
   - Product categories
   - Product variants (size, color)
   - Order cancellation
   - Refund process

4. **Better Error Handling**
   - Centralized error handling middleware
   - User-friendly error messages
   - Error logging (Sentry, etc.)

5. **State Management**
   - React Context or Redux/Zustand
   - Cache cart state
   - Optimistic updates

### 20.3 Nice to Have

1. **E2E Testing** (Playwright or Cypress)
2. **CI/CD Pipeline** (GitHub Actions)
3. **Docker Configuration**
4. **Monitoring & Logging**
5. **Email Notifications**
6. **Product Reviews**
7. **Wishlist**
8. **Recommendations**
9. **Internationalization**
10. **Analytics Integration**

---

## 21. High-Risk Areas

### 21.1 Database Persistence

**Risk:** SQLite file persistence via hooks is fragile and can corrupt data.

**Files:** `ecommerce-backend/models/index.js:43-48`

**Impact:** Data loss, race conditions

**Recommendation:** Use proper SQLite file mode or migrate to PostgreSQL/MySQL.

### 21.2 Global Cart

**Risk:** Single cart shared by all users allows data corruption and privacy violations.

**Files:** 
- `ecommerce-backend/routes/cartItems.js`
- `ecommerce-backend/models/CartItem.js`

**Impact:** Users can see/modify other users' carts

**Recommendation:** Add User model and associate carts with users.

### 21.3 Payment Endpoint

**Risk:** Handling card data exposes system to PCI compliance requirements and security vulnerabilities.

**Files:** `ecommerce-backend/routes/payments.js`

**Impact:** Security breach, legal liability

**Recommendation:** Use Stripe Elements or similar to tokenize cards client-side.

### 21.4 Database Reset Endpoint

**Risk:** Unauthenticated endpoint that destroys all data.

**Files:** `ecommerce-backend/routes/reset.js`

**Impact:** Data loss attack vector

**Recommendation:** Remove or protect with admin authentication.

### 21.5 Open CORS

**Risk:** Allows any origin to access API.

**Files:** `ecommerce-backend/server.js:30`

**Impact:** CSRF attacks, data theft

**Recommendation:** Restrict to known origins in production.

---

## 22. Questions/Unknowns

1. **Is this meant for production?** Documentation suggests learning project, but branch name suggests upgrade to production.

2. **What payment gateway to use?** Stripe, PayPal, Braintree?

3. **What database for production?** MySQL or PostgreSQL? Hosting provider?

4. **User authentication strategy?** JWT, sessions, OAuth?

5. **Deployment target?** AWS, Vercel, Railway, self-hosted?

6. **Regulatory requirements?** GDPR, CCPA, sales tax?

7. **Expected scale?** Concurrent users, transaction volume?

8. **Inventory management needed?** Real-time stock tracking?

9. **Multi-currency support?** Currently USD only.

10. **Mobile app planned?** Need API-first design?

---

## Appendix A: What Should NOT Be Changed

1. **Product UUIDs** - Used as foreign keys throughout system
2. **Database Models Structure** - Adding columns OK, changing types requires migration
3. **API Route Paths** - Frontend depends on these
4. **Money Format** - Cents-based pricing prevents floating point errors
5. **Image Path Structure** - `/images/products/` hardcoded in product data
6. **ES Module Format** - Both projects use ES modules throughout
7. **React 19 Compatibility** - Latest features used
8. **Responsive Breakpoints** - Match design system

---

## Appendix B: What Should Be Refactored

1. **Cart State Management** - Move from prop drilling to Context/Redux
2. **API Route Handlers** - Extract business logic to service layer
3. **Database Persistence** - Replace hook-based file saving
4. **Error Handling** - Centralize in middleware
5. **N+1 Queries** - Use Sequelize `include` for eager loading
6. **Payment Processing** - Replace with payment gateway SDK
7. **Configuration** - Move hardcoded values to config file
8. **Product Search** - Implement database-level search (PostgreSQL full-text or Elasticsearch)

---

## Appendix C: What Should Be Added

1. **User Model & Authentication** - Critical for production
2. **Admin Panel** - Product and order management
3. **Address Model** - Shipping and billing addresses
4. **Payment Gateway Integration** - Stripe recommended
5. **Email Service** - Order confirmations, shipping notifications
6. **Inventory Tracking** - Stock levels, backorders
7. **Rate Limiting Middleware** - express-rate-limit
8. **Security Headers** - Helmet.js
9. **Logging** - Winston or Pino
10. **Monitoring** - Health checks, APM
11. **Test Coverage** - Backend unit tests, integration tests, E2E
12. **CI/CD Pipeline** - Automated testing and deployment
13. **Docker Configuration** - Containerization
14. **Backup System** - Database backups
15. **Analytics** - User behavior tracking

---

## Appendix D: What Should Be Removed

1. **`/api/reset` Endpoint** - Dangerous in production
2. **`ecommerce-project/starting-code/`** - Development artifacts
3. **`ecommerce-backend/backend/*.json`** - Unused legacy data files
4. **`ecommerce-backend/exercise-solutions/`** - Learning materials
5. **Hardcoded Tax Rate** - Should be configurable
6. **Default Cart Data** - Production shouldn't seed cart
7. **Window Axios** - `window.axios = axios` is unnecessary

**Reference:** `ecommerce-project/src/App.jsx:2`

---

## Appendix E: What Should Be Investigated Further

1. **SQL.js Persistence Mechanism** - Understand edge cases and failure modes
2. **Sequelize Version Compatibility** - Check for breaking changes in newer versions
3. **React 19 createRoot Behavior** - Ensure proper cleanup on unmount
4. **Database Migration Strategy** - How to deploy schema changes
5. **Payment Gateway Integration** - Stripe vs. others for this use case
6. **Session Management** - JWT vs. sessions for this application type
7. **Image Storage** - S3/Cloudinary vs. filesystem
8. **Email Service Selection** - SendGrid, Postmark, AWS SES
9. **Hosting Platform** - Best fit for this architecture
10. **Monitoring Solution** - Datadog, New Relic, or self-hosted

---

**End of Audit Report**
