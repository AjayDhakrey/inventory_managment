import { asyncHandler } from '../utils/asyncHandler.js'
import { ok, created } from '../utils/respond.js'
import { userService } from '../services/userService.js'
import { notificationEvents } from '../services/notificationEvents.js'

export const listMembersController = asyncHandler(async (req, res) => {
  ok(res, await userService.listMembers(req.businessId))
})
export const createMemberController = asyncHandler(async (req, res) => {
  const member = await userService.createMember(req.businessId, req.body)
  await notificationEvents.member(req.businessId, member, 'created')
  created(res, member, 'Team member added.')
})
export const updateMemberController = asyncHandler(async (req, res) => {
  const member = await userService.updateMember(req.businessId, req.params.id, req.body)
  await notificationEvents.member(req.businessId, member, 'updated')
  ok(res, member, 'User updated.')
})

export const listRolesController = asyncHandler(async (req, res) => {
  ok(res, await userService.listRoles(req.businessId))
})
export const saveRoleController = asyncHandler(async (req, res) => {
  const role = await userService.saveRole(req.businessId, req.body)
  await notificationEvents.role(req.businessId, role, 'saved')
  created(res, role, 'Role saved.')
})
export const updateRolePermissionsController = asyncHandler(async (req, res) => {
  const role = await userService.setRolePermissions(req.businessId, req.params.roleId, req.body.permissions)
  await notificationEvents.role(req.businessId, role, 'permissions')
  ok(res, role, 'Role saved.')
})
