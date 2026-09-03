import { Router } from 'express'
import * as controller from '../controllers/notificationController.js'
export const notificationRoutes = Router()
notificationRoutes.get('/', controller.list)
notificationRoutes.patch('/read-all', controller.readAll)
notificationRoutes.patch('/:id/read', controller.read)
notificationRoutes.delete('/:id', controller.dismiss)
