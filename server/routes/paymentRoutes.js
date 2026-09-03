import { Router } from 'express'
import * as controller from '../controllers/paymentController.js'
import { requirePermission } from '../middleware/auth.js'

export const paymentRoutes = Router()
paymentRoutes.use(requirePermission('view_reports'))

paymentRoutes.get('/', controller.listController)
paymentRoutes.post('/', controller.createController)
