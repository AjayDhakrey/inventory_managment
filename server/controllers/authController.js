import { asyncHandler } from '../utils/asyncHandler.js'
import { ok, created } from '../utils/respond.js'
import { attachSession, clearSessionCookies, newCsrfToken } from '../utils/cookies.js'
import { env } from '../config/env.js'
import { verifyToken } from '../utils/token.js'
import { User } from '../models/User.js'
import * as authService from '../services/authService.js'

/** Adds the httpOnly session cookie + CSRF token to a service session result. */
function withCookies(res, session) {
  const { csrfToken } = attachSession(res, { token: session.token })
  return { ...session, csrfToken }
}

export const registerController = asyncHandler(async (req, res) => {
  const session = await authService.register(req.body)
  // No session cookie is set here — the browser flow sends the user to sign in.
  // API callers still receive a token in the body for convenience.
  created(res, session, 'Account created. Sign in to open your workspace.')
})

export const loginController = asyncHandler(async (req, res) => {
  const session = await authService.login(req.body)
  ok(res, withCookies(res, session), 'Signed in.')
})

export const meController = asyncHandler(async (req, res) => {
  const session = await authService.currentSession(req.user)
  // Make sure a cookie session always has a matching CSRF token to submit.
  const csrfToken = req.cookies?.[env.cookie.csrfName] || newCsrfToken()
  if (!req.cookies?.[env.cookie.csrfName]) {
    attachSession(res, { token: session.token, csrfToken })
  }
  ok(res, { ...session, csrfToken })
})

export const onboardingController = asyncHandler(async (req, res) => {
  const session = await authService.updateOnboarding(req.user, req.body)
  ok(res, withCookies(res, session), req.body.complete ? 'Onboarding completed.' : 'Onboarding progress saved.')
})

export const forgotPasswordController = asyncHandler(async (req, res) => {
  const result = await authService.requestPasswordReset(req.body)
  ok(res, result, result.message)
})

export const resetPasswordController = asyncHandler(async (req, res) => {
  const session = await authService.resetPassword(req.body)
  ok(res, withCookies(res, session), 'Password updated. You are now signed in.')
})

export const logoutController = asyncHandler(async (req, res) => {
  clearSessionCookies(res)
  ok(res, { loggedOut: true }, 'Signed out.')
})

/** Signs the account out of every device by invalidating all issued tokens. */
export const logoutAllController = asyncHandler(async (req, res) => {
  const token = req.cookies?.[env.cookie.name] ||
    (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7).trim() : null)
  if (token) {
    try {
      const payload = verifyToken(token)
      const user = await User.findById(payload.sub)
      if (user) await authService.revokeAllSessions(user)
    } catch {
      /* invalid token - nothing to revoke, still clear the cookie */
    }
  }
  clearSessionCookies(res)
  ok(res, { loggedOut: true }, 'Signed out of all devices.')
})
