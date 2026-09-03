import { Router } from 'express'
import * as controller from '../controllers/returnController.js'
import { requirePermission } from '../middleware/auth.js'

export const returnRoutes = Router()
returnRoutes.use(requirePermission('create_order'))

returnRoutes.get('/', controller.listController)
returnRoutes.post('/', controller.createController)
