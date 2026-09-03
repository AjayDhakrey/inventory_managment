import { Member } from '../models/Member.js'
import { Role, DEFAULT_ROLES } from '../models/Role.js'
import { ApiError } from '../utils/ApiError.js'
import { toObjectId, requireFields, assert, isEmail } from '../validators/assert.js'

function scoped(businessId, extra = {}) {
  return { business: toObjectId(businessId, 'business'), ...extra }
}

/* ---------- Members (the "Users" screen) ---------- */

export async function listMembers(businessId) {
  const docs = await Member.find(scoped(businessId)).sort('createdAt')
  return docs.map((doc) => doc.toJSON())
}

export async function createMember(businessId, payload) {
  requireFields(payload, ['name', 'email'])
  assert(isEmail(payload.email), 'Enter a valid email address.')
  const roleId = await resolveRoleId(businessId, payload.roleId || payload.role)
  const exists = await Member.findOne(scoped(businessId, { email: String(payload.email).toLowerCase() }))
  if (exists) throw ApiError.conflict('A team member with this email already exists.')
  const doc = await Member.create({ business: scoped(businessId).business, name: payload.name.trim(), email: payload.email.trim().toLowerCase(), roleId, status: 'pending' })
  return doc.toJSON()
}

export async function updateMember(businessId, id, payload) {
  const doc = await Member.findOne(scoped(businessId, { _id: toObjectId(id, 'user id') }))
  if (!doc) throw ApiError.notFound('Team member not found.')
  if (payload.name !== undefined) doc.name = payload.name.trim()
  if (payload.email !== undefined) {
    assert(isEmail(payload.email), 'Enter a valid email address.')
    doc.email = payload.email.trim().toLowerCase()
  }
  if (payload.roleId !== undefined || payload.role !== undefined) doc.roleId = await resolveRoleId(businessId, payload.roleId || payload.role)
  if (payload.status !== undefined) {
    assert(['pending', 'active', 'inactive'].includes(payload.status), 'Invalid status.')
    doc.status = payload.status
  }
  await doc.save()
  return doc.toJSON()
}

async function resolveRoleId(businessId, roleOrId) {
  if (!roleOrId) return 'ROLE-STAFF'
  const roles = await Role.find(scoped(businessId))
  const match = roles.find((role) => role.roleId === roleOrId || role.name === roleOrId)
  return match ? match.roleId : DEFAULT_ROLES.find((role) => role.name === roleOrId)?.roleId || 'ROLE-STAFF'
}

/* ---------- Roles ---------- */

export async function listRoles(businessId) {
  let docs = await Role.find(scoped(businessId)).sort('createdAt')
  if (docs.length === 0) {
    docs = await Role.insertMany(DEFAULT_ROLES.map((role) => ({ ...role, business: scoped(businessId).business })))
  }
  return docs.map((doc) => doc.toJSON())
}

export async function saveRole(businessId, payload) {
  requireFields(payload, ['name'])
  const roleId = payload.roleId || `ROLE-${Date.now()}`
  const doc = await Role.findOneAndUpdate(
    scoped(businessId, { roleId }),
    {
      $set: {
        name: payload.name.trim(),
        description: (payload.description || '').trim(),
        ...(Array.isArray(payload.permissions) ? { permissions: payload.permissions } : {}),
      },
      $setOnInsert: { business: scoped(businessId).business, roleId },
    },
    { returnDocument: 'after', upsert: true },
  )
  return doc.toJSON()
}

export async function setRolePermissions(businessId, roleId, permissions) {
  assert(Array.isArray(permissions), 'permissions must be an array.')
  const doc = await Role.findOneAndUpdate(scoped(businessId, { roleId }), { $set: { permissions } }, { returnDocument: 'after' })
  if (!doc) throw ApiError.notFound('Role not found.')
  return doc.toJSON()
}

export const userService = { listMembers, createMember, updateMember, listRoles, saveRole, setRolePermissions }
