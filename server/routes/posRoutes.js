import { Router } from 'express'
import { requirePermission } from '../middleware/auth.js'
import * as controller from '../controllers/posController.js'

export const posRoutes = Router()
posRoutes.get('/catalog', requirePermission('process_pos_sale'), controller.catalog)
posRoutes.get('/customers', requirePermission('process_pos_sale'), controller.customers)
posRoutes.get('/invoices', requirePermission('process_pos_sale'), controller.list)
posRoutes.get('/invoices/:id', requirePermission('process_pos_sale'), controller.get)
posRoutes.post('/checkout', requirePermission('process_pos_sale'), controller.checkout)
