import { Business } from '../models/Business.js'
import { Role, DEFAULT_ROLES } from '../models/Role.js'
import { Member } from '../models/Member.js'
import { User } from '../models/User.js'
import { ApiError } from '../utils/ApiError.js'
import { signToken } from '../middleware/auth.js'
import { requireFields, assert, isEmail } from '../validators/assert.js'

export async function createBusiness(user, payload = {}) {
  if (user.business) throw ApiError.conflict('This account already has a business workspace.')
  requireFields(payload, ['name', 'industry', 'businessType', 'city', 'country', 'currency'])
  assert(!payload.email || isEmail(payload.email), 'Enter a valid business email.')

  const business = await Business.create({
    name: payload.name.trim(),
    industry: payload.industry,
    businessType: payload.businessType,
    phone: payload.phone?.trim() || '',
    email: payload.email?.trim().toLowerCase() || '',
    address: payload.address?.trim() || '',
    city: payload.city.trim(),
    state: payload.state?.trim() || '',
    country: payload.country,
    currency: payload.currency,
    owner: user._id,
  })

  await Role.insertMany(DEFAULT_ROLES.map((role) => ({ ...role, business: business._id })))
  await Member.create({
    business: business._id,
    account: user._id,
    name: user.name || user.email.split('@')[0],
    email: user.email,
    roleId: 'ROLE-ADMIN',
    status: 'active',
  })

  user.business = business._id
  await user.save()

  return { token: signToken(user), business: business.toJSON(), user: user.toJSON(), account: user.toJSON() }
}

export async function getBusiness(businessId) {
  const business = await Business.findById(businessId)
  if (!business) throw ApiError.notFound('Business not found.')
  return business.toJSON()
}

export async function updateBusiness(businessId, payload = {}) {
  const business = await Business.findById(businessId)
  if (!business) throw ApiError.notFound('Business not found.')
  const fields = ['name', 'industry', 'businessType', 'phone', 'email', 'address', 'city', 'state', 'country', 'currency', 'gstin']
  for (const field of fields) {
    if (payload[field] !== undefined) business[field] = typeof payload[field] === 'string' ? payload[field].trim() : payload[field]
  }
  if (payload.settings && typeof payload.settings === 'object') {
    const existing = business.settings?.toObject?.() || business.settings || {}
    business.settings = { ...existing, ...payload.settings }
  }
  await business.save()
  return business.toJSON()
}

export { User }
