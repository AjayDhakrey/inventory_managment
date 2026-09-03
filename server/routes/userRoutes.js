import { Router } from 'express'
import * as controller from '../controllers/userController.js'
import { requirePermission } from '../middleware/auth.js'

export const userRoutes = Router()
userRoutes.use(requirePermission('manage_users'))

userRoutes.get('/', controller.listMembersController)
userRoutes.post('/', controller.createMemberController)
userRoutes.put('/:id', controller.updateMemberController)
userRoutes.patch('/:id', controller.updateMemberController)

userRoutes.get('/roles/all', controller.listRolesController)
userRoutes.post('/roles', controller.saveRoleController)
userRoutes.patch('/roles/:roleId/permissions', controller.updateRolePermissionsController)
