import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import {
  registerController,
  loginController,
  meController,
  forgotPasswordController,
  resetPasswordController,
  onboardingController,
  logoutController,
  logoutAllController,
} from '../controllers/authController.js'
import { authenticate } from '../middleware/auth.js'

// Broad ceiling across all auth endpoints.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Try again later.' },
})

// Tighter, credential-guessing-specific limit on the endpoints that verify a
// secret. Successful requests do not count toward it.
const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Try again in a few minutes.' },
})

export const authRoutes = Router()

authRoutes.post('/register', authLimiter, credentialLimiter, registerController)
authRoutes.post('/login', authLimiter, credentialLimiter, loginController)
authRoutes.post('/forgot-password', authLimiter, credentialLimiter, forgotPasswordController)
authRoutes.post('/reset-password', authLimiter, credentialLimiter, resetPasswordController)
authRoutes.post('/logout', logoutController)
authRoutes.post('/logout-all', logoutAllController)
authRoutes.get('/me', authenticate, meController)
authRoutes.patch('/onboarding', authenticate, onboardingController)
