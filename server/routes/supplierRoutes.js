import { Router } from 'express'
import { supplierService } from '../services/supplierService.js'
import { resourceController } from '../controllers/resourceController.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { ok } from '../utils/respond.js'
import { requirePermission } from '../middleware/auth.js'

const controller = resourceController(supplierService, {
  messages: { created: 'Supplier added.', updated: 'Supplier updated.', removed: 'Supplier removed.' },
})

export const supplierRoutes = Router()
supplierRoutes.use(requirePermission('view_inventory'))

supplierRoutes.get('/', controller.list)
supplierRoutes.post('/', controller.create)
supplierRoutes.get('/:id', controller.get)
supplierRoutes.put('/:id', controller.update)
supplierRoutes.patch('/:id', controller.update)
supplierRoutes.patch('/:id/archive', asyncHandler(async (req, res) => {
  ok(res, await supplierService.archive(req.businessId, req.params.id), 'Supplier archived.')
}))
supplierRoutes.delete('/:id', controller.remove)
