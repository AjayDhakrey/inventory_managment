import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import {
  registerController,
  loginController,
  meController,
  forgotPasswordController,
  resetPasswordController,
  onboardingController,
} from '../controllers/authController.js'
import { authenticate } from '../middleware/auth.js'

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Try again later.' },
})

export const authRoutes = Router()

authRoutes.post('/register', authLimiter, registerController)
authRoutes.post('/login', authLimiter, loginController)
authRoutes.post('/forgot-password', authLimiter, forgotPasswordController)
authRoutes.post('/reset-password', authLimiter, resetPasswordController)
authRoutes.get('/me', authenticate, meController)
authRoutes.patch('/onboarding', authenticate, onboardingController)
