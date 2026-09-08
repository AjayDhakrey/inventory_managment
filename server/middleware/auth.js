import { env } from '../config/env.js'
import { ApiError } from '../utils/ApiError.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { signToken, verifyToken, tokenTimeToLiveMs } from '../utils/token.js'
import { refreshSessionCookie } from '../utils/cookies.js'
import { User } from '../models/User.js'
import { Member } from '../models/Member.js'
import { Role, DEFAULT_PERMISSIONS } from '../models/Role.js'
import { Business } from '../models/Business.js'
import { hasModule, resolveBusinessCapabilities } from '../../shared/industryConfig.js'

export { signToken }

// Re-issue the browser cookie once the token is more than halfway to expiry so
// an active session never lapses, while an idle one still times out.
const RENEW_AFTER_RATIO = 0.5

function readToken(req) {
  const cookieToken = req.cookies?.[env.cookie.name]
  if (cookieToken) return { token: cookieToken, via: 'cookie' }
  const header = req.headers.authorization || ''
  if (header.startsWith('Bearer ')) return { token: header.slice(7).trim(), via: 'bearer' }
  return { token: null, via: null }
}

/** Verifies the session (cookie or Bearer token) and loads the user onto req.user. */
export const authenticate = asyncHandler(async (req, res, next) => {
  const { token, via } = readToken(req)
  if (!token) throw ApiError.unauthorized('Authentication token is missing.')

  let payload
  try {
    payload = verifyToken(token)
  } catch {
    throw ApiError.unauthorized('Your session has expired. Please sign in again.')
  }

  const user = await User.findById(payload.sub)
  if (!user) throw ApiError.unauthorized('Account no longer exists.')
  if ((payload.tv || 0) !== (user.tokenVersion || 0)) {
    throw ApiError.unauthorized('Your session ended. Please sign in again.')
  }

  req.user = user
  req.authVia = via

  // Sliding renewal for cookie sessions.
  if (via === 'cookie' && typeof payload.exp === 'number') {
    const ttl = tokenTimeToLiveMs()
    const remaining = payload.exp * 1000 - Date.now()
    if (remaining < ttl * RENEW_AFTER_RATIO) refreshSessionCookie(res, user, req.cookies?.[env.cookie.csrfName])
  }

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
  req.business = user.business ? await Business.findById(user.business) : null
  req.capabilities = req.business ? resolveBusinessCapabilities(req.business.toJSON()) : null
  next()
})

/** Ensures the authenticated user has completed business setup. */
export function requireBusiness(req, _res, next) {
  if (!req.user?.business) throw ApiError.forbidden('Create your business workspace first.')
  req.businessId = String(req.user.business)
  next()
}

export function requireModule(module) {
  return (req, _res, next) => {
    if (!req.business || !hasModule(req.business.toJSON(), module)) throw ApiError.forbidden(`The ${module} module is not enabled for this business.`)
    next()
  }
}

export function requirePermission(permission) {
  return (req, _res, next) => {
    if (!req.permissions?.includes(permission)) throw ApiError.forbidden(`Missing required permission: ${permission}.`)
    next()
  }
}

export function requireAnyPermission(...permissions) {
  return (req, _res, next) => {
    if (!permissions.some((permission) => req.permissions?.includes(permission))) throw ApiError.forbidden(`Missing required permission: ${permissions.join(' or ')}.`)
    next()
  }
}
