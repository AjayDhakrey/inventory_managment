import { Business } from '../models/Business.js'
import { Role, DEFAULT_ROLES } from '../models/Role.js'
import { Member } from '../models/Member.js'
import { User } from '../models/User.js'
import { ApiError } from '../utils/ApiError.js'
import { signToken } from '../middleware/auth.js'
import mongoose from 'mongoose'
import { requireFields, assert, isEmail } from '../validators/assert.js'
import { normalizeConfigValue, resolveBusinessCapabilities } from '../../shared/industryConfig.js'

function presentBusiness(business) {
  const data = business.toJSON()
  return { ...data, capabilities: resolveBusinessCapabilities(data) }
}

export async function createBusiness(user, payload = {}) {
  if (user.business) {
    const existing = await Business.findById(user.business)
    if (existing && user.role === 'owner' && user.onboarding?.status !== 'completed') return { token: signToken(user), business: presentBusiness(existing), user: user.toJSON(), account: user.toJSON() }
    throw ApiError.conflict('This account already has a business workspace.')
  }
  requireFields(payload, ['name', 'industry', 'businessType', 'city', 'country', 'currency'])
  assert(!payload.email || isEmail(payload.email), 'Enter a valid business email.')

  const business = await Business.create({
    name: payload.name.trim(),
    industry: normalizeConfigValue(payload.industry),
    businessType: normalizeConfigValue(payload.businessType),
    phone: payload.phone?.trim() || '',
    email: payload.email?.trim().toLowerCase() || '',
    address: payload.address?.trim() || '',
    city: payload.city.trim(),
    state: payload.state?.trim() || '',
    country: payload.country,
    currency: payload.currency,
    gstin: payload.gstin?.trim().toUpperCase() || '',
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
  if (user.onboarding) {
    user.onboarding.status = 'in_progress'
    user.onboarding.currentStep = Math.max(4, user.onboarding.currentStep || 1)
  }
  await user.save()

  return { token: signToken(user), business: presentBusiness(business), user: user.toJSON(), account: user.toJSON() }
}

export async function getBusiness(businessId) {
  const business = await Business.findById(businessId)
  if (!business) throw ApiError.notFound('Business not found.')
  return presentBusiness(business)
}

export async function updateBusiness(businessId, payload = {}) {
  const business = await Business.findById(businessId)
  if (!business) throw ApiError.notFound('Business not found.')
  const fields = ['name', 'industry', 'businessType', 'phone', 'email', 'address', 'city', 'state', 'country', 'currency', 'gstin', 'enabledModules']
  for (const field of fields) {
    if (payload[field] !== undefined) business[field] = ['industry', 'businessType'].includes(field) ? normalizeConfigValue(payload[field]) : typeof payload[field] === 'string' ? payload[field].trim() : payload[field]
  }
  if (payload.settings && typeof payload.settings === 'object') {
    const existing = business.settings?.toObject?.() || business.settings || {}
    business.settings = { ...existing, ...payload.settings }
  }
  await business.save()
  return presentBusiness(business)
}

export async function deleteBusiness(businessId, user) {
  const business = await Business.findById(businessId)
  if (!business) throw ApiError.notFound('Business not found.')
  if (String(business.owner) !== String(user._id)) throw ApiError.forbidden('Only the business owner can delete this workspace.')

  const scopedModels = mongoose.modelNames()
    .filter((name) => !['Business', 'User'].includes(name))
    .map((name) => mongoose.model(name))
    .filter((Model) => Model.schema.path('business'))
  await Promise.all(scopedModels.map((Model) => Model.deleteMany({ business: business._id })))
  await User.updateMany({ business: business._id }, { $set: { business: null } })
  await Business.deleteOne({ _id: business._id })
  return { deleted: true }
}

export { User }
