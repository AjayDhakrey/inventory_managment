# Stockroom (IMB)

Inventory & small-business management app. **MERN stack:**

```
React + Vite  →  REST API (Express)  →  MongoDB (Mongoose)  →  API  →  React UI
```

MongoDB is the single source of truth for all persistent data. The browser keeps
only the JWT and transient UI state.

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
| `JWT_SECRET` | _(required in production)_ |
| `JWT_EXPIRES_IN` | `7d` |
| `CLIENT_URL` | `http://localhost:5173` (CORS allow-list, comma-separated) |

## Structure

```text
src/
├── api/          API client + one module per resource
├── hooks/        useResource (loading / error / refetch)
├── components/   feature screens + AsyncBoundary
├── constants/    navigation config
└── App.jsx       auth, routing, dashboard shell

server/
├── config/       env, db connection
├── models/       Mongoose schemas
├── routes/       Express routers
├── controllers/  HTTP request/response
├── services/     business logic + transactions
├── middleware/   auth (JWT), error handling
├── validators/   input assertions
└── scripts/      seed.js
```

See [`server/README.md`](server/README.md) for the API reference.
