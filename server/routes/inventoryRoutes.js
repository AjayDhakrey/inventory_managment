import { Router } from 'express'
import * as controller from '../controllers/inventoryController.js'
import { requirePermission } from '../middleware/auth.js'

export const inventoryRoutes = Router()

inventoryRoutes.get('/transactions', requirePermission('view_inventory'), controller.listTransactionsController)
inventoryRoutes.post('/operations', (req, res, next) => requirePermission(req.body.section === 'Stock In' ? 'stock_in' : req.body.section === 'Stock Out' ? 'stock_out' : 'edit_product')(req, res, next), controller.recordOperationController)
