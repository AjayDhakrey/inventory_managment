import { Router } from 'express'
import * as controller from '../controllers/salesOrderController.js'
import { requirePermission } from '../middleware/auth.js'

export const salesOrderRoutes = Router()
salesOrderRoutes.use(requirePermission('create_order'))

salesOrderRoutes.get('/', controller.listController)
salesOrderRoutes.post('/', controller.createController)
salesOrderRoutes.get('/:id', controller.getController)
salesOrderRoutes.put('/:id', controller.updateController)
salesOrderRoutes.patch('/:id', controller.updateController)
salesOrderRoutes.patch('/:id/complete', controller.completeController)
salesOrderRoutes.patch('/:id/cancel', controller.cancelController)
