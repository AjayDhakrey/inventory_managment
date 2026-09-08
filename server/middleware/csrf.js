import crypto from 'node:crypto'
import { env } from '../config/env.js'
import { ApiError } from '../utils/ApiError.js'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
// Sign-out must never be blockable (e.g. during a suspected compromise), and a
// forced sign-out is not a meaningful attack.
const EXEMPT_PATHS = new Set(['/api/auth/logout', '/api/auth/logout-all'])

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a))
  const bufB = Buffer.from(String(b))
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

/**
 * Double-submit CSRF guard. Only relevant when the request is authenticated by
 * the browser session cookie: the attacker's forged cross-site request carries
 * that cookie automatically but cannot read `sr_csrf` to echo it in the header.
 * Bearer-token clients send no cookie and are skipped (they are not CSRF-prone).
 */
export function csrfGuard(req, _res, next) {
  if (SAFE_METHODS.has(req.method)) return next()
  if (EXEMPT_PATHS.has(req.path)) return next()
  const sessionCookie = req.cookies?.[env.cookie.name]
  if (!sessionCookie) return next()

  const headerToken = req.get('x-csrf-token')
  const cookieToken = req.cookies?.[env.cookie.csrfName]
  if (!headerToken || !cookieToken || !timingSafeEqual(headerToken, cookieToken)) {
    throw new ApiError(403, 'Invalid or missing CSRF token. Refresh the page and try again.')
  }
  next()
}
