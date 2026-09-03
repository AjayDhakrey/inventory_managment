import { Supplier } from '../models/Supplier.js'
import { createCrudService } from './crudService.js'
import { ApiError } from '../utils/ApiError.js'
import { requireFields, assert, isEmail } from '../validators/assert.js'

const base = createCrudService(Supplier, {
  searchFields: ['supplierName', 'contactPerson', 'email', 'city'],
  label: 'Supplier',
})

const PHONE = /^[+\d][\d\s()-]{6,}$/

function validate(payload, { partial } = {}) {
  if (!partial) requireFields(payload, ['supplierName', 'phone'])
  if (payload.phone !== undefined && payload.phone !== '') assert(PHONE.test(payload.phone), 'Enter a valid supplier phone number.')
  if (payload.email) assert(isEmail(payload.email), 'Enter a valid supplier email address.')
}

async function create(businessId, payload) {
  validate(payload)
  if (payload.email) {
    const dupe = await Supplier.findOne({ business: base.scoped(businessId).business, email: String(payload.email).toLowerCase() })
    if (dupe) throw ApiError.conflict('A supplier with this email already exists.')
  }
  return base.create(businessId, payload)
}

async function update(businessId, id, payload) {
  validate(payload, { partial: true })
  return base.update(businessId, id, payload)
}

async function archive(businessId, id) {
  return base.update(businessId, id, { status: 'archived' })
}

export const supplierService = { ...base, create, update, archive }
