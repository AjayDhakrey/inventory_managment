# Stockroom API

Express + Mongoose REST API. MongoDB is the source of truth.

## Layout

```text
server/
├── server.js          bootstrap: connect DB, start HTTP
├── app.js             express app (helmet, cors, json, routes, errors)
├── config/
│   ├── env.js          loads server/.env (+ root .env fallback)
│   └── db.js           mongoose connection + withTransaction() helper
├── models/            User, Business, Member, Role, Product, Supplier, Customer,
│                      PurchaseOrder, Receiving, SalesOrder, Payment,
│                      StockTransaction, Return
├── routes/            one router per resource, mounted in routes/index.js
├── controllers/       parse request -> call service -> send envelope
├── services/          business logic, validation, inventory transactions
├── middleware/        auth.js (JWT), errorHandler.js
├── validators/        assert.js (shared input checks)
└── scripts/seed.js    db.json migration + optional demo data
```

Request flow: `route → auth middleware → controller → service → Mongoose model → MongoDB`.

## Auth

- `POST /api/auth/register` `{ email, password, role }` → `{ token, user, business }`
- `POST /api/auth/login` `{ email, password }` → `{ token, user, business }`
- `GET  /api/auth/me` (Bearer) → `{ token, user, business }`

Passwords are hashed with bcrypt. Protected routes need `Authorization: Bearer <token>`.
The business id is taken from the token — never from the request body — so every
query is isolated to the caller's business.

## Resources (all require Bearer token + a created business)

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/businesses` | create workspace (also seeds default roles) |
| GET/PATCH | `/api/businesses/me` | current business + `settings` |
| CRUD | `/api/products` | `?search=&page=&limit=` |
| CRUD | `/api/suppliers` | `PATCH /:id/archive` |
| CRUD | `/api/customers` | `PATCH /:id/archive` |
| GET/POST/PUT | `/api/purchase-orders` | `PATCH /:id/status`; totals computed server-side |
| GET/POST/PUT | `/api/sales-orders` | `PATCH /:id/complete` (stock-out), `/:id/cancel` |
| GET | `/api/receiving/pending-orders` | open POs + already-received per line |
| POST | `/api/receiving` | adds accepted stock, closes PO when complete |
| GET/POST | `/api/payments` | updates order `paymentStatus` |
| GET | `/api/inventory/transactions` | stock history |
| POST | `/api/inventory/operations` | Stock In / Out / Adjustment |
| GET/POST | `/api/returns` | adjusts inventory by return type |
| GET/POST/PUT | `/api/users` | team members; `/users/roles/*` for roles |
| GET | `/api/reports/summary` | dashboard/report figures |

## Responses

```jsonc
{ "success": true, "data": {} , "message": "..." }   // 2xx
{ "success": false, "message": "...", "errors": {} }  // 4xx / 5xx
```

## Inventory integrity

Stock is only ever changed by backend services (`inventoryService.applyStockChange`),
which write the product and a `StockTransaction` together. Multi-write flows
(sale completion, receiving, returns) run inside `withTransaction()` — a real
MongoDB transaction on a replica set / Atlas, falling back to sequential writes
on a standalone `mongod`.

## Migration

`server/data/db.json` is no longer used at runtime. `npm run seed` imports any
records it still contains into MongoDB; `npm run seed -- --demo` adds a sample
workspace; `-- --fresh` wipes collections first.
