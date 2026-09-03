import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { ApiError } from '../utils/ApiError.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { User } from '../models/User.js'
import { Member } from '../models/Member.js'
import { Role, DEFAULT_PERMISSIONS } from '../models/Role.js'

export function signToken(user) {
  return jwt.sign(
    { sub: String(user._id), businessId: user.business ? String(user.business) : null, role: user.role },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn },
  )
}

/** Verifies the Bearer token and loads the current user onto req.user. */
export const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null
  if (!token) throw ApiError.unauthorized('Authentication token is missing.')

  let payload
  try {
    payload = jwt.verify(token, env.jwtSecret)
  } catch {
    throw ApiError.unauthorized('Your session has expired. Please sign in again.')
  }

  const user = await User.findById(payload.sub)
  if (!user) throw ApiError.unauthorized('Account no longer exists.')

  req.user = user
  let member = null
  let permissions = user.role === 'owner' ? DEFAULT_PERMISSIONS : []
  if (user.business) {
    member = await Member.findOne({ business: user.business, $or: [{ account: user._id }, { email: user.email }] })
    if (user.role === 'team') {
      if (!member || member.status !== 'active') throw ApiError.forbidden('Your team access is inactive. Contact your administrator.')
      const role = await Role.findOne({ business: user.business, roleId: member.roleId })
      permissions = role?.permissions || []
    }
  }
  req.member = member
  req.permissions = permissions
  req.auth = { userId: String(user._id), businessId: user.business ? String(user.business) : null, roleId: member?.roleId || null, permissions }
  next()
})

/** Ensures the authenticated user has completed business setup. */
export function requireBusiness(req, _res, next) {
  if (!req.user?.business) throw ApiError.forbidden('Create your business workspace first.')
  req.businessId = String(req.user.business)
  next()
}

export function requirePermission(permission) {
  return (req, _res, next) => {
    if (!req.permissions?.includes(permission)) throw ApiError.forbidden(`Missing required permission: ${permission}.`)
    next()
  }
}
