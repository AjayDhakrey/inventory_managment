import { asyncHandler } from '../utils/asyncHandler.js'
import { ok, created } from '../utils/respond.js'
import * as authService from '../services/authService.js'

export const registerController = asyncHandler(async (req, res) => {
  const session = await authService.register(req.body)
  created(res, session, 'Account created. Sign in to open your workspace.')
})

export const loginController = asyncHandler(async (req, res) => {
  const session = await authService.login(req.body)
  ok(res, session, 'Signed in.')
})

export const meController = asyncHandler(async (req, res) => {
  const session = await authService.currentSession(req.user)
  ok(res, session)
})

export const onboardingController = asyncHandler(async (req, res) => {
  ok(res, await authService.updateOnboarding(req.user, req.body), req.body.complete ? 'Onboarding completed.' : 'Onboarding progress saved.')
})

export const forgotPasswordController = asyncHandler(async (req, res) => {
  const result = await authService.requestPasswordReset(req.body)
  ok(res, result, result.message)
})

export const resetPasswordController = asyncHandler(async (req, res) => {
  const session = await authService.resetPassword(req.body)
  ok(res, session, 'Password updated. You are now signed in.')
})
