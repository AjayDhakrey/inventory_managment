import { Router } from 'express'
import * as controller from '../controllers/receivingController.js'
import { requirePermission } from '../middleware/auth.js'

export const receivingRoutes = Router()
receivingRoutes.use(requirePermission('stock_in'))

receivingRoutes.get('/', controller.listController)
receivingRoutes.get('/pending-orders', controller.pendingController)
receivingRoutes.post('/', controller.createController)
