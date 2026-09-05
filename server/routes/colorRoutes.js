import { Router } from 'express'
import { colorService } from '../services/colorService.js'
import { resourceController } from '../controllers/resourceController.js'
import { requirePermission } from '../middleware/auth.js'

const controller = resourceController(colorService, { messages: { created: 'Color added.', updated: 'Color updated.' } })
export const colorRoutes = Router()

colorRoutes.get('/', requirePermission('view_inventory'), controller.list)
colorRoutes.post('/', requirePermission('edit_product'), controller.create)
colorRoutes.patch('/:id', requirePermission('edit_product'), controller.update)
colorRoutes.put('/:id', requirePermission('edit_product'), controller.update)
