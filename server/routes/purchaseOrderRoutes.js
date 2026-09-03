import { Router } from 'express'
import * as controller from '../controllers/purchaseOrderController.js'
import { requirePermission } from '../middleware/auth.js'

export const purchaseOrderRoutes = Router()
purchaseOrderRoutes.use(requirePermission('view_inventory'))

purchaseOrderRoutes.get('/', controller.listController)
purchaseOrderRoutes.post('/', controller.createController)
purchaseOrderRoutes.get('/:id', controller.getController)
purchaseOrderRoutes.put('/:id', controller.updateController)
purchaseOrderRoutes.patch('/:id', controller.updateController)
purchaseOrderRoutes.patch('/:id/status', controller.statusController)
