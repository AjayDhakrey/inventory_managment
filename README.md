# Stockroom (IMB)

Inventory & small-business management app. **MERN stack:**

```
React + Vite  →  REST API (Express)  →  MongoDB (Mongoose)  →  API  →  React UI
```

MongoDB is the single source of truth for all persistent data. The browser holds
no token — the session is an httpOnly cookie (`sr_session`) with a companion
readable CSRF token (`sr_csrf`); API/integration callers use `Authorization:
Bearer` instead.

## Prerequisites

- Node.js 18+
- A MongoDB database — [MongoDB Atlas](https://www.mongodb.com/atlas) (free tier)
  or a local `mongod`. Put its connection string in `server/.env`.

## Setup

```powershell
npm install
copy .env.example .env                 # frontend: VITE_API_URL
copy server\.env.example server\.env    # backend: MONGODB_URI, JWT_SECRET, ...
```

Edit `server/.env` and set at least `MONGODB_URI` and `JWT_SECRET`.

## Run

```powershell
npm run dev:all      # starts API (nodemon) + Vite together
```

or in two terminals:

```powershell
npm run server       # API at http://localhost:4000
npm run dev          # Vite at http://localhost:5173
```

Optional demo data:

```powershell
npm run seed -- --demo    # creates demo@stockroom.test / demo12345 with sample records
```

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server (frontend) |
| `npm run server` | Express API |
| `npm run server:dev` | Express API with nodemon reload |
| `npm run dev:all` | Both, via `concurrently` |
| `npm run seed` | Migrate `server/data/db.json` into MongoDB (`-- --demo`, `-- --fresh`) |
| `npm run build` / `npm run preview` | Production build / preview |
| `npm run lint` | oxlint |

## Environment

**Frontend – `.env`**

| Var | Default |
| --- | --- |
| `VITE_API_URL` | `http://localhost:4000/api` |

**Backend – `server/.env`**

| Var | Default |
| --- | --- |
| `PORT` | `4000` |
| `NODE_ENV` | `development` |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/inventory_app` |
| `JWT_SECRET` | _(required in production; must be ≥ 32 chars there)_ |
| `JWT_EXPIRES_IN` | `12h` (idle timeout; the cookie renews on activity) |
| `CLIENT_URL` | `http://localhost:5173` (CORS allow-list, comma-separated) |
| `TRUST_PROXY` | `false` — set to `1` (hop count) behind a reverse proxy |
| `SECURE_COOKIES` | on when `NODE_ENV=production`; set `1` to force HTTPS-only cookies |
| `COOKIE_SAMESITE` | `lax` — use `none` (with HTTPS) for cross-site frontend/API |
| `COOKIE_DOMAIN` | _(unset)_ — e.g. `.example.com` to share across subdomains |

## Structure

MERN monorepo — one Vite frontend (`src/`) and one Express API (`server/`), sharing
a single `package.json` and a small `shared/` folder.

```text
IMB/
├── src/            React frontend (Vite) — see below
├── server/         Express + Mongoose API — see below
├── shared/         code needed by both sides
│   └── industryConfig.js   per-industry module/field config (drives IndustryModule.jsx & backend validation)
├── public/         static assets served as-is (favicon.svg)
├── index.html      Vite entry HTML
├── vite.config.js  Vite config
├── vercel.json / render.yaml   deploy config (Vercel = frontend, Render = API)
├── .env / .env.example         frontend env (VITE_API_URL)
├── artifacts/      reference screenshots used while redesigning the UI (git-ignored)
└── dist/           production build output of `npm run build` (git-ignored)
```

### `src/` — frontend

```text
src/
├── main.jsx          React entry point
├── App.jsx           auth, routing, dashboard shell + sidebar
├── App.css, index.css   global styles
│
├── api/              thin fetch wrapper, one module per REST resource
│   └── client.js         shared fetch() + session cookie + CSRF header + errors
│                          (auth, business, clothing, color, customer, inventory,
│                          notification, payment, pos, product, productImport,
│                          purchaseOrder, receiving, report, return, salesOrder,
│                          supplier, user)Api.js
│
├── hooks/
│   └── useResource.js    loading / error / refetch wrapper around an api call
│
├── constants/
│   └── navigation.js     sidebar nav item config
│
├── components/        one file per feature screen
│   ├── AsyncBoundary.jsx      loading/error boundary used by every screen
│   ├── BusinessSetup.jsx      onboarding wizard
│   │
│   ├── Inventory & catalog
│   │   InventoryOperations, CategoriesView, StockInView, StockAdjustmentView,
│   │   StockHistoryView, Products, ProductImport, IndustryModule (variants/
│   │   attributes), ColorManagement, BulkPricing
│   │
│   ├── Sales & POS
│   │   POS, PosDashboardStats, SalesOrders, SalesReturns, OrderDetails,
│   │   CreditSalesList
│   │
│   ├── Purchasing
│   │   PurchaseOrders, Receiving, Suppliers
│   │
│   ├── People & money
│   │   Customers, UserManagement, Payments, NotificationCenter
│   │
│   ├── ClothingModule.jsx     clothing-industry extras (variant grid,
│   │                          replenishment, promotions, loyalty, coupons,
│   │                          gift cards, cashier shifts, reports)
│   └── RemainingModules.jsx   Reports / BusinessSettings / Settings screens
│
└── styles/            one stylesheet per screen, imported by its component
    ├── ui-system.css      shared tokens (colors, spacing, type)
    ├── app-chrome.css     sidebar / header chrome
    └── <screen>.css       e.g. products-catalog.css, pos-terminal.css,
                            stock-ledger.css, purchase-orders.css, receiving.css,
                            sales-orders.css, credit-sales.css, returns.css, …
```

### `server/` — API

Every resource follows the same four-layer pattern, same base name across folders
(e.g. `product` → `routes/productRoutes.js` → `controllers/*` → `services/productService.js`
→ `models/Product.js`); simpler resources share `controllers/resourceController.js` +
`services/crudService.js` instead of a dedicated controller/service.

```text
server/
├── server.js          process entry point (listen, graceful shutdown)
├── app.js             Express app: middleware + route mounting
├── config/
│   ├── env.js              loads/validates environment variables
│   └── db.js                Mongoose connection
├── routes/             Express routers — one per resource, mounted in routes/index.js
├── controllers/        HTTP request/response layer
├── services/            business logic, transactions, cross-model rules
├── models/               Mongoose schemas (Business, Product, SalesOrder, User, …)
│   └── plugins/serialize.js   shared toJSON/id transform for every schema
├── middleware/
│   ├── auth.js               session verification (cookie or Bearer) + revocation
│   ├── csrf.js               double-submit CSRF guard for cookie sessions
│   ├── database.js           per-request DB/tenant scoping
│   └── errorHandler.js       central error → HTTP response mapping
├── validators/
│   ├── assert.js             request input assertions
│   └── password.js           password strength checks
├── utils/
│   ├── token.js              JWT sign/verify + duration parsing
│   ├── cookies.js            session + CSRF cookie handling
│   ├── ApiError.js           typed HTTP errors
│   └── asyncHandler.js, respond.js   route helpers
├── data/db.json           seed source data
└── scripts/               one-off ops: seed.js, seed-sample.js,
                            seed-wholesale-clothing.js, reset-password.js,
                            db-check.js, integration.test.mjs
```

See [`server/README.md`](server/README.md) for the API reference.
