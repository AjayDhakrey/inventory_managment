import { Router } from 'express'
import { authenticate, requireBusiness, requirePermission } from '../middleware/auth.js'
import {
  createBusinessController,
  getMyBusinessController,
  updateMyBusinessController,
} from '../controllers/businessController.js'

export const businessRoutes = Router()

businessRoutes.use(authenticate)
businessRoutes.post('/', createBusinessController)
businessRoutes.get('/me', requireBusiness, requirePermission('view_dashboard'), getMyBusinessController)
businessRoutes.patch('/me', requireBusiness, requirePermission('manage_users'), updateMyBusinessController)
businessRoutes.put('/me', requireBusiness, requirePermission('manage_users'), updateMyBusinessController)
