import { Router } from 'express'
import * as controller from '../controllers/returnController.js'
import { requireAnyPermission, requirePermission } from '../middleware/auth.js'

export const returnRoutes = Router()
returnRoutes.get('/', requireAnyPermission('view_returns', 'create_order'), controller.listController)
returnRoutes.get('/eligible-orders/list', requireAnyPermission('create_returns', 'create_order'), controller.ordersController)
returnRoutes.get('/:id', requireAnyPermission('view_returns', 'create_order'), controller.getController)
returnRoutes.post('/', requireAnyPermission('complete_returns', 'create_order'), controller.createController)
returnRoutes.patch('/:id/cancel', requirePermission('cancel_returns'), controller.cancelController)
returnRoutes.post('/:id/refunds', requirePermission('process_refunds'), controller.refundController)
returnRoutes.patch('/:id/refunds/:refundId', requirePermission('process_refunds'), controller.updateRefundController)
