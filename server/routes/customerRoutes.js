import { Router } from 'express'
import { customerService } from '../services/customerService.js'
import { resourceController } from '../controllers/resourceController.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { ok } from '../utils/respond.js'
import { requirePermission } from '../middleware/auth.js'

const controller = resourceController(customerService, {
  messages: { created: 'Customer added.', updated: 'Customer updated.', removed: 'Customer removed.' },
})

export const customerRoutes = Router()
customerRoutes.use(requirePermission('create_order'))

customerRoutes.get('/', controller.list)
customerRoutes.post('/', controller.create)
customerRoutes.get('/:id', controller.get)
customerRoutes.put('/:id', controller.update)
customerRoutes.patch('/:id', controller.update)
customerRoutes.patch('/:id/archive', asyncHandler(async (req, res) => {
  ok(res, await customerService.archive(req.businessId, req.params.id), 'Customer archived.')
}))
customerRoutes.delete('/:id', controller.remove)
