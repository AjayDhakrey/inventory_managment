import crypto from 'node:crypto'
import { env } from '../config/env.js'
import { signToken, tokenTimeToLiveMs } from './token.js'

/**
 * Session transport for browser clients:
 *  - `sr_session`  httpOnly JWT  (not readable by JS, so XSS cannot exfiltrate it)
 *  - `sr_csrf`     readable random token, echoed back in a header on writes
 *
 * API/integration callers ignore all of this and keep using `Authorization: Bearer`.
 */

const baseCookie = () => ({
  secure: env.cookie.secure,
  sameSite: env.cookie.sameSite,
  domain: env.cookie.domain,
  path: '/',
})

export function newCsrfToken() {
  return crypto.randomBytes(24).toString('hex')
}

/**
 * Sets the session + CSRF cookies from an already-signed token and returns the
 * CSRF token so the caller can also put it in the response body.
 */
export function attachSession(res, { token, csrfToken = newCsrfToken() }) {
  const maxAge = tokenTimeToLiveMs()
  res.cookie(env.cookie.name, token, { ...baseCookie(), httpOnly: true, maxAge })
  res.cookie(env.cookie.csrfName, csrfToken, { ...baseCookie(), httpOnly: false, maxAge })
  return { token, csrfToken }
}

/** Sliding renewal for an active session: re-issue the JWT and extend the CSRF cookie. */
export function refreshSessionCookie(res, user, csrfToken) {
  const maxAge = tokenTimeToLiveMs()
  res.cookie(env.cookie.name, signToken(user), { ...baseCookie(), httpOnly: true, maxAge })
  if (csrfToken) res.cookie(env.cookie.csrfName, csrfToken, { ...baseCookie(), httpOnly: false, maxAge })
}

export function clearSessionCookies(res) {
  res.clearCookie(env.cookie.name, baseCookie())
  res.clearCookie(env.cookie.csrfName, baseCookie())
}
