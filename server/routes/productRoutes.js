import { Router } from 'express'
import { productService } from '../services/productService.js'
import { resourceController } from '../controllers/resourceController.js'
import { requirePermission } from '../middleware/auth.js'

const controller = resourceController(productService, {
  messages: { created: 'Product added.', updated: 'Product updated.', removed: 'Product deleted.' },
})

export const productRoutes = Router()

productRoutes.get('/', requirePermission('view_inventory'), controller.list)
productRoutes.post('/', requirePermission('create_product'), controller.create)
productRoutes.get('/:id', requirePermission('view_inventory'), controller.get)
productRoutes.put('/:id', requirePermission('edit_product'), controller.update)
productRoutes.patch('/:id', requirePermission('edit_product'), controller.update)
productRoutes.delete('/:id', requirePermission('delete_product'), controller.remove)
