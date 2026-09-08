import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// Load server/.env first, then the project root .env as a fallback (no overrides).
dotenv.config({ path: [path.join(serverDir, '.env'), path.join(serverDir, '..', '.env')] })

function required(name, fallback) {
  const value = process.env[name] ?? fallback
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

const nodeEnv = process.env.NODE_ENV || 'development'
const isProduction = nodeEnv === 'production'

const jwtSecret = required('JWT_SECRET', isProduction ? undefined : 'dev_only_insecure_secret_change_me')
if (isProduction && jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters in production. Generate one with: openssl rand -base64 48')
}

// `trust proxy` for express-rate-limit / secure cookies behind a reverse proxy.
// Accepts a hop count ("1"), a boolean ("true"/"false"), or a subnet string.
function parseTrustProxy(raw) {
  if (raw === undefined || raw === '') return false
  if (raw === 'true') return true
  if (raw === 'false') return false
  const n = Number(raw)
  return Number.isInteger(n) ? n : raw
}

// A truthy env flag: "1", "true", "yes".
const flag = (raw, fallback) =>
  raw === undefined || raw === '' ? fallback : ['1', 'true', 'yes'].includes(String(raw).toLowerCase())

export const env = {
  nodeEnv,
  port: Number(process.env.PORT) || 4000,
  mongoUri: required('MONGODB_URI', 'mongodb://127.0.0.1:27017/inventory_app'),
  jwtSecret,
  // Short-lived by design: the browser cookie is renewed on activity, and API
  // callers re-authenticate. Long tokens can't be revoked before they expire.
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '45m',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  cookie: {
    name: process.env.SESSION_COOKIE_NAME || 'sr_session',
    csrfName: 'sr_csrf',
    // Secure cookies require HTTPS; default on in production, overridable for
    // staging over plain HTTP.
    secure: flag(process.env.SECURE_COOKIES, isProduction),
    sameSite: process.env.COOKIE_SAMESITE || 'lax',
    domain: process.env.COOKIE_DOMAIN || undefined,
  },
}

export { isProduction }
